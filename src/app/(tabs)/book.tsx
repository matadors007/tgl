import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { AppError } from '@/data/services';
import { COL } from '@/data/store';
import {
  bookingWindow,
  buildDaySlots,
  isBookingActivePending,
  pitchSchedule,
  toDateKey,
  type Booking,
  type Pitch,
  type Slot,
  type SlotDoc,
} from '@/domain/model';
import { notify } from '@/ui/dialogs';
import { dayLabel, whatsappLink } from '@/ui/format';
import { Button, Card, Empty, Header, ListItem, Row, Screen, Section, Segmented, Sheet } from '@/ui/kit';
import { DateStrip, SlotGrid, SlotLegend } from '@/ui/slots';
import { colors, font } from '@/ui/theme';

export default function BookScreen() {
  const { t, lang, pitches, config, store, services, user, notifier, canBookPitch, needsVerification, refreshEmailVerified } = useApp();
  const params = useLocalSearchParams<{ pitch?: string }>();
  const now = useNow(20_000);
  const [date, setDate] = useState(toDateKey(new Date()));
  const activePitches = pitches.filter((p) => p.active);
  const [pitchId, setPitchId] = useState<string | null>(params.pitch ?? null);
  useEffect(() => {
    if (params.pitch) setPitchId(params.pitch);
  }, [params.pitch]);
  const pitch: Pitch | undefined = activePitches.find((p) => p.id === pitchId) ?? activePitches[0];
  const [docs, setDocs] = useState<SlotDoc[]>([]);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [sending, setSending] = useState(false);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [sent, setSent] = useState<{ pitch: string; date: string; start: string; auto: boolean } | null>(null);
  const windowDays = Math.max(1, config.bookingWindowDays || 7);
  const allowed = useMemo(() => bookingWindow(now, windowDays), [now, windowDays]);
  // Reste dans la fenêtre glissante (BF05)
  useEffect(() => {
    if (date < allowed[0] || date > allowed[allowed.length - 1]) setDate(allowed[0]);
  }, [allowed, date]);

  useEffect(() => store.watch<SlotDoc>(COL.slots, [['date', date]], setDocs), [store, date]);
  useEffect(() => {
    if (!user) return setMyBookings([]);
    return store.watch<Booking>(COL.bookings, [['userId', user.id]], setMyBookings);
  }, [store, user]);

  const slots = useMemo(
    // Les créneaux fixés en privé par l'administrateur (réservation par téléphone) ne sont pas affichés
    () => (pitch ? buildDaySlots(config, pitch.id, date, docs.filter((d) => d.pitchId === pitch.id), now, pitch).filter((x) => !x.doc?.private) : []),
    [config, pitch, date, docs, now],
  );
  const myPending = myBookings.filter((b) => isBookingActivePending(b, now)).length;
  const price = pitch?.type === '7v7' ? config.price7v7 : config.price6v6;

  const onSlot = (s: Slot) => {
    if (s.status !== 'free' || s.past) return;
    setSelected(s);
  };

  const send = async () => {
    if (!selected || !pitch) return;
    if (!user) {
      setSelected(null);
      router.push('/login');
      return;
    }
    if (needsVerification && !(await refreshEmailVerified())) {
      setSelected(null);
      router.push('/verify-email');
      return;
    }
    setSending(true);
    try {
      await services.requestBooking(user, { pitch, date, start: selected.start, end: selected.end }, config, myPending);
      const info = { pitch: `${pitch.name} (${pitch.type})`, date: dayLabel(date, lang, t), start: selected.start };
      setSelected(null);
      // Notification in-app + push au personnel, et WhatsApp automatique à l'administrateur
      const auto = await notifier.bookingRequested(
        { userName: user.name, userPhone: user.phone, pitchName: pitch.name, date, start: selected.start, end: selected.end } as Booking,
        config.whatsappNumber,
      );
      setSent({ ...info, auto });
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setSending(false);
    }
  };

  if (!canBookPitch) {
    return (
      <Screen>
        <Header title={t('book.title')} />
        <Empty text={t('book.notAllowed')} icon="lock-closed-outline" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={t('book.title')} />
      <ListItem
        icon="receipt-outline"
        title={t('book.mine')}
        subtitle={myPending ? `${myPending} ${t('home.pending')}` : undefined}
        onPress={() => (user ? router.push('/bookings') : router.push('/login'))}
      />

      <Section title={t('book.date')}>
        <DateStrip value={date} onChange={setDate} lang={lang} t={t} days={windowDays} />
        <Text style={[font.small, { marginTop: 6 }]}>{t('book.window', { n: windowDays })}</Text>
      </Section>

      <Section title={t('book.pitch')}>
        {activePitches.length ? (
          <Segmented
            scroll
            options={activePitches.map((p) => ({ value: p.id, label: `${p.name} · ${p.type}` }))}
            value={pitch?.id ?? ''}
            onChange={setPitchId}
          />
        ) : (
          <Empty text={t('common.empty')} />
        )}
      </Section>

      <Section title={dayLabel(date, lang, t)}>
        <SlotGrid slots={slots} t={t} onPress={onSlot} />
        <SlotLegend t={t} />
      </Section>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={t('book.summary')}>
        {selected && pitch ? (
          <View>
            <Card>
              <SummaryLine label={t('book.pitch')} value={`${pitch.name} (${pitch.type})`} />
              <SummaryLine label={t('book.date')} value={dayLabel(date, lang, t)} />
              <SummaryLine label={t('book.duration')} value={`${selected.start} – ${selected.end} (${pitchSchedule(config, pitch).minutes} ${t('common.min')})`} />
              <SummaryLine label={t('book.price')} value={`${price} ${t('common.tnd')} · ${t('book.payOnSite')}`} last />
            </Card>
            <Text style={[font.small, { marginVertical: 12 }]}>{t('book.expiresInfo', { n: config.expiryMinutes })}</Text>
            {!user ? <Text style={[font.small, { color: colors.orange, marginBottom: 8 }]}>{t('book.loginFirst')}</Text> : null}
            <Button label={user ? t('book.send') : t('auth.signin')} icon="paper-plane" onPress={send} loading={sending} />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={!!sent} onClose={() => setSent(null)} title={t('book.whatsappTitle')}>
        {sent ? (
          <View>
            {sent.auto ? (
              <Text style={[font.body, { marginBottom: 12, color: colors.success }]}>✅ {t('book.waSent')}</Text>
            ) : null}
            <Text style={[font.body, { marginBottom: 12 }]}>{config.whatsappNumber && !sent.auto ? t('book.whatsappBody') : t('book.sentInfo')}</Text>
            {config.whatsappNumber && !sent.auto ? (
              <Button
                label={t('book.whatsappBtn')}
                icon="logo-whatsapp"
                onPress={() =>
                  Linking.openURL(
                    `${whatsappLink(config.whatsappNumber)}?text=${encodeURIComponent(
                      t('book.whatsappMsg', { pitch: sent.pitch, date: sent.date, start: sent.start, name: user?.name ?? '', phone: user?.phone ?? '' }),
                    )}`,
                  ).catch(() => {})
                }
              />
            ) : null}
            <Button
              label={t('book.mine')}
              variant="secondary"
              style={{ marginTop: 10 }}
              onPress={() => {
                setSent(null);
                router.push('/bookings');
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function SummaryLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <Row style={{ paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text style={[font.small, { flex: 1 }]}>{label}</Text>
      <Text style={[font.body, { fontWeight: '700', flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
    </Row>
  );
}
