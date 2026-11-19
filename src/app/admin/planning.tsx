import { router } from 'expo-router';
import { Guard } from '@/ui/Guard';
import { stageLabel } from '@/ui/stage';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { AppError } from '@/data/services';
import { useBookingsByDate, useSlotsByDate } from '@/data/useStaffData';
import { bookingAmount, buildDaySlots, displayBookingStatus, addDays, toDateKey, weekdayOf, type Booking, type Slot } from '@/domain/model';
import { notify } from '@/ui/dialogs';
import { dayLabel, phoneLink } from '@/ui/format';
import { Button, Card, Row, Field, Pill, Screen, Section, Segmented, Sheet, MaybeScreen } from '@/ui/kit';
import { DateStrip, SlotGrid, SlotLegend, slotLabel } from '@/ui/slots';
import { STATUS_COLORS } from '@/ui/status';
import { colors, font } from '@/ui/theme';

/** Planning d'un terrain : 7 jours (aujourd'hui + 6), réservation manuelle ou privée, blocage. */
export function PlanningScreen({ embedded, fixedPitchId }: { embedded?: boolean; fixedPitchId?: string } = {}) {
  const { t, lang, pitches, config, services, user, matches, teamById, notifier, can } = useApp();
  const isAdmin = can('private');
  const canPlan = can('planning');
  const now = useNow(20_000);
  // Planning à la semaine, du lundi au dimanche ; le dimanche, on prépare la semaine suivante
  const today = toDateKey(new Date());
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const [week, setWeek] = useState<'this' | 'next'>(weekdayOf(today) === 0 ? 'next' : 'this');
  const weekStart = week === 'this' ? monday : addDays(monday, 7);
  const [date, setDate] = useState(weekdayOf(today) === 0 ? addDays(monday, 7) : today);
  const [pitchId, setPitchId] = useState<string | null>(null);
  const pitch = pitches.find((p) => p.id === (fixedPitchId ?? pitchId)) ?? pitches[0];
  const docs = useSlotsByDate(date);
  const bookings = useBookingsByDate(date);
  const [sel, setSel] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [busy, setBusy] = useState(false);
  // Les créneaux du championnat sont masqués par défaut (inutiles pour gérer les réservations)
  const [showChamp, setShowChamp] = useState(false);
  // Réservation privée (administrateur) : client au téléphone, invisible pour les particuliers
  const [pAmount, setPAmount] = useState('');
  const [pNote, setPNote] = useState('');
  const [pWeeks, setPWeeks] = useState('1');
  const [priv, setPriv] = useState<Booking | null>(null);
  useEffect(() => {
    setPriv(null);
    if (!isAdmin || !sel?.doc?.private || !sel.doc.bookingId) return;
    let alive = true;
    services.getPrivateBooking(sel.doc.bookingId).then((b) => alive && setPriv(b)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [sel, isAdmin, services]);

  const slots = useMemo(
    () =>
      (pitch ? buildDaySlots(config, pitch.id, date, docs.filter((d) => d.pitchId === pitch.id), now, pitch) : []).filter(
        (s) => showChamp || (s.doc?.reason !== 'championship' && !s.doc?.matchId),
      ),
    [config, pitch, date, docs, now, showChamp],
  );
  if (!user || !pitch) return null;

  const booking = sel?.doc?.bookingId ? bookings.find((b) => b.id === sel.doc!.bookingId) : undefined;
  const match = sel?.doc?.matchId ? matches.find((m) => m.id === sel.doc!.matchId) : undefined;
  const ref = sel ? { pitch, date, start: sel.start, end: sel.end } : null;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setSel(null);
      setReason('');
      setClientName('');
      setClientPhone('');
      setPAmount('');
      setPNote('');
      setPWeeks('1');
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MaybeScreen embedded={embedded} edges={[]}>
      <Segmented<'this' | 'next'>
        value={week}
        onChange={(w) => {
          setWeek(w);
          const start = w === 'this' ? monday : addDays(monday, 7);
          setDate(w === 'this' ? today : start);
        }}
        options={[
          { value: 'this', label: `${t('plan.thisWeek')} · ${shortDate(monday)} – ${shortDate(addDays(monday, 6))}` },
          { value: 'next', label: `${t('plan.nextWeek')} · ${shortDate(addDays(monday, 7))} – ${shortDate(addDays(monday, 13))}` },
        ]}
      />
      <View style={{ height: 8 }} />
      <DateStrip value={date} onChange={setDate} lang={lang} t={t} days={7} startOffset={daysBetween(today, weekStart)} />
      <View style={{ height: 12 }} />
      {fixedPitchId ? null : (
        <Segmented scroll options={pitches.map((p) => ({ value: p.id, label: `${p.name} · ${p.type}` }))} value={pitch.id} onChange={setPitchId} />
      )}
      <Section title={dayLabel(date, lang, t)}>
        <Row style={{ marginBottom: 10 }}>
          <Text style={[font.small, { flex: 1 }]}>{t('plan.showChamp')}</Text>
          <Switch value={showChamp} onValueChange={setShowChamp} trackColor={{ true: colors.accent, false: colors.border }} />
        </Row>
        <SlotGrid slots={slots} t={t} onPress={setSel} enablePast showChampionship />
        <SlotLegend t={t} />
      </Section>

      <Sheet visible={!!sel} onClose={() => setSel(null)} title={sel ? `${pitch.name} · ${sel.start} – ${sel.end}` : ''}>
        {sel && ref ? (
          <View>
            <Text style={[font.small, { marginBottom: 12 }]}>
              {dayLabel(date, lang, t)} · {slotLabel(sel, t)}
            </Text>

            {sel.status === 'free' && isAdmin ? (
              <Card style={{ marginBottom: 12, borderColor: colors.accent }}>
                <Text style={[font.h3, { marginBottom: 4 }]}>{t('priv.title')}</Text>
                <Text style={[font.small, { marginBottom: 10 }]}>{t('priv.hint')}</Text>
                <Field label={t('plan.clientName')} value={clientName} onChangeText={setClientName} />
                <Field label={t('plan.clientPhone')} value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
                <Field
                  label={t('priv.amount')}
                  value={pAmount}
                  onChangeText={(v) => setPAmount(v.replace(/[^\d]/g, ''))}
                  keyboardType="number-pad"
                  placeholder={String(pitch.type === '7v7' ? config.price7v7 : config.price6v6)}
                />
                <Text style={[font.small, { marginBottom: 6 }]}>{t('priv.repeat')}</Text>
                <Segmented
                  value={pWeeks}
                  onChange={setPWeeks}
                  options={[
                    { value: '1', label: t('priv.once') },
                    { value: '4', label: t('priv.weeks', { n: 4 }) },
                    { value: '8', label: t('priv.weeks', { n: 8 }) },
                    { value: '12', label: t('priv.weeks', { n: 12 }) },
                  ]}
                />
                <View style={{ height: 10 }} />
                <Field label={t('priv.note')} value={pNote} onChangeText={setPNote} />
                <Button
                  label={t('priv.save')}
                  icon="lock-closed"
                  loading={busy}
                  disabled={!clientName || !clientPhone}
                  onPress={() =>
                    act(async () => {
                      const r = await services.createPrivateBooking(
                        user,
                        ref,
                        { name: clientName.trim(), phone: clientPhone.trim(), amount: pAmount ? Number(pAmount) : null, note: pNote.trim() },
                        Number(pWeeks),
                      );
                      notify(
                        t('priv.done', { n: r.created.length }) + (r.conflicts.length ? `\n\n${t('priv.conflicts', { list: r.conflicts.join(', ') })}` : ''),
                      );
                    })
                  }
                />
              </Card>
            ) : null}

            {sel.status === 'free' && canPlan ? (
              <>
                <Card style={{ marginBottom: 12 }}>
                  <Text style={[font.h3, { marginBottom: 10 }]}>{t('plan.manual')}</Text>
                  <Field label={t('plan.clientName')} value={clientName} onChangeText={setClientName} />
                  <Field label={t('plan.clientPhone')} value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
                  <Button
                    label={t('common.confirm')}
                    icon="checkmark"
                    loading={busy}
                    disabled={!clientName || !clientPhone}
                    onPress={() => act(() => services.createManualBooking(user, ref, clientName.trim(), clientPhone.trim()))}
                  />
                </Card>
                <Card>
                  <Field label={t('plan.blockReason')} value={reason} onChangeText={setReason} />
                  <Button
                    label={t('plan.block')}
                    icon="lock-closed"
                    variant="secondary"
                    disabled={!reason}
                    loading={busy}
                    onPress={() => act(() => services.setSlotBlocked(ref, true, reason.trim()))}
                  />
                </Card>
              </>
            ) : null}

            {sel.status === 'blocked' && !match ? (
              <Card>
                <Text style={[font.body, { marginBottom: 12 }]}>{sel.doc?.reason}</Text>
                <Button label={t('plan.unblock')} icon="lock-open" loading={busy} onPress={() => act(() => services.setSlotBlocked(ref, false, ''))} />
              </Card>
            ) : null}

            {match ? (
              <Card onPress={() => { setSel(null); router.push(`/match/${match.id}`); }}>
                <Text style={font.small}>{stageLabel(match, t)}</Text>
                <Text style={[font.h3, { marginTop: 4 }]}>
                  {teamById.get(match.homeTeamId)?.name} – {teamById.get(match.awayTeamId)?.name}
                </Text>
              </Card>
            ) : null}

            {sel.doc?.private && !isAdmin ? (
              <Card>
                <Text style={font.h3}>{t('priv.taken')}</Text>
                <Text style={[font.small, { marginTop: 4 }]}>{t('priv.takenHint')}</Text>
              </Card>
            ) : null}

            {sel.doc?.private && isAdmin && priv ? (
              <Card style={{ borderColor: colors.accent }}>
                <Row>
                  <Text style={[font.h2, { flex: 1 }]}>{priv.userName}</Text>
                  <Pill label={t('priv.badge')} color={colors.accent} bg={colors.accentSoft} icon="lock-closed" />
                </Row>
                <Text style={[font.small, { marginTop: 4 }]}>{priv.userPhone}</Text>
                <Text style={[font.body, { marginTop: 8, fontWeight: '700' }]}>
                  {bookingAmount(priv, pitch, config)} DT{priv.seriesId ? ` · ${t('priv.series')}` : ''}
                </Text>
                {priv.note ? <Text style={[font.small, { marginTop: 4 }]}>{priv.note}</Text> : null}
                <Text style={[font.tiny, { marginTop: 4 }]}>✓ {priv.handledByName}</Text>
                <Button label={t('common.call')} icon="call" variant="secondary" small style={{ marginTop: 12 }} onPress={() => Linking.openURL(phoneLink(priv.userPhone))} />
                {priv.status === 'confirmed' ? (
                  <Row style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <Button label={t('priv.cancel')} variant="danger" icon="trash" small loading={busy} onPress={() => act(async () => void (await services.cancelPrivateBooking(priv, user)))} />
                    {priv.seriesId ? (
                      <Button
                        label={t('priv.cancelSeries')}
                        variant="ghost"
                        icon="close-circle"
                        small
                        loading={busy}
                        onPress={() => act(async () => notify(t('priv.cancelled', { n: await services.cancelPrivateBooking(priv, user, true) })))}
                      />
                    ) : null}
                  </Row>
                ) : null}
              </Card>
            ) : null}

            {booking ? (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[font.h2, { flex: 1 }]}>{booking.userName}</Text>
                  <Pill
                    label={t(`status.${displayBookingStatus(booking, now)}` as 'status.pending')}
                    color={STATUS_COLORS[displayBookingStatus(booking, now)].fg}
                    bg={STATUS_COLORS[displayBookingStatus(booking, now)].bg}
                  />
                </View>
                <Text style={[font.small, { marginTop: 4 }]}>{booking.userPhone}</Text>
                {booking.handledByName ? <Text style={[font.tiny, { marginTop: 4 }]}>✓ {booking.handledByName}</Text> : null}
                <Button
                  label={t('common.call')}
                  icon="call"
                  variant="secondary"
                  small
                  style={{ marginTop: 12 }}
                  onPress={() => Linking.openURL(phoneLink(booking.userPhone))}
                />
                {booking.status === 'pending' ? (
                  <Button label={t('admin.queue')} icon="list" small style={{ marginTop: 8 }} onPress={() => { setSel(null); router.push('/admin/queue'); }} />
                ) : null}
                {booking.status === 'confirmed' && canPlan ? (
                  <View style={{ marginTop: 12 }}>
                    <Field label={t('plan.cancelReason')} value={reason} onChangeText={setReason} />
                    <Button
                      label={t('plan.cancelBooking')}
                      variant="danger"
                      icon="trash"
                      disabled={!reason}
                      loading={busy}
                      onPress={() =>
                        act(async () => {
                          await services.cancelConfirmed(booking.id, user, reason.trim());
                          notifier.bookingHandled(booking, 'cancelled', reason.trim());
                        })
                      }
                    />
                  </View>
                ) : null}
              </Card>
            ) : null}
            {!booking && !sel.doc?.private && (sel.status === 'booked' || sel.status === 'pending') ? (
              <Text style={[font.small, { color: colors.muted }]}>{t('common.loading')}</Text>
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </MaybeScreen>
  );
}

export default function GuardedPlanningScreen() {
  return (
    <Guard allow="book">
      <PlanningScreen />
    </Guard>
  );
}

const shortDate = (k: string) => k.split('-').reverse().slice(0, 2).join('/');
/** Nombre de jours entre deux dates AAAA-MM-JJ. */
function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
