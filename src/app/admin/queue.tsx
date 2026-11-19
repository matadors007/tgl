import { Guard } from '@/ui/Guard';
import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { AppError } from '@/data/services';
import { useConfirmedBookings, usePendingBookings } from '@/data/useStaffData';
import { dateTimeToMs, fifoQueue, isLockedByOther, type Booking } from '@/domain/model';
import { notify } from '@/ui/dialogs';
import { dayLabel, phoneLink, relativeMinutes, whatsappLink } from '@/ui/format';
import { Button, Card, Empty, Field, Pill, Row, Screen, Segmented, Sheet, MaybeScreen } from '@/ui/kit';
import { colors, font } from '@/ui/theme';

export function QueueScreen({ embedded, pitchId }: { embedded?: boolean; pitchId?: string } = {}) {
  const { t, lang, user, services, notifier } = useApp();
  const now = useNow(10_000);
  const pendingAll = usePendingBookings();
  const pending = pitchId ? pendingAll.filter((b) => b.pitchId === pitchId) : pendingAll;
  const queue = fifoQueue(pending, now);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<Booking | null>(null);
  const reasons = t('queue.reasons').split('|');
  const [reasonChoice, setReasonChoice] = useState(reasons[0]);
  const [reasonText, setReasonText] = useState('');
  const [tab, setTab] = useState<'pending' | 'confirmed'>('pending');
  const confirmedAll = useConfirmedBookings();
  const upcoming = confirmedAll
    .filter((b) => !pitchId || b.pitchId === pitchId)
    .filter((b) => dateTimeToMs(b.date, b.end) > now)
    .sort((a, b) => dateTimeToMs(a.date, a.start) - dateTimeToMs(b.date, b.start));
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Expire automatiquement les demandes dépassées (libère les créneaux).
  useEffect(() => {
    const overdue = pending.filter((b) => b.expiresAt <= now);
    if (overdue.length) services.expireOverdue(overdue);
  }, [pending, now, services]);

  if (!user) return null;

  const run = async (b: Booking, fn: () => Promise<void>, okMsg?: string) => {
    setBusy(b.id);
    try {
      await fn();
      if (okMsg) notify(okMsg);
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(null);
    }
  };

  const doRefuse = async () => {
    if (!refusing) return;
    const isOther = reasonChoice === reasons[reasons.length - 1];
    const reason = isOther ? reasonText.trim() : reasonChoice;
    if (!reason) return notify(t('queue.reasonRequired'));
    const b = refusing;
    setRefusing(null);
    setReasonText('');
    await run(b, async () => {
      await services.refuseBooking(b.id, user, reason);
      notifier.bookingHandled(b, 'refused', reason);
    }, t('queue.refused'));
  };

  const doCancel = async () => {
    if (!cancelling) return;
    const reason = cancelReason.trim();
    if (!reason) return notify(t('queue.reasonRequired'));
    const b = cancelling;
    setCancelling(null);
    setCancelReason('');
    await run(b, async () => {
      await services.cancelConfirmed(b.id, user, reason);
      notifier.bookingHandled(b, 'cancelled', reason);
    });
  };

  return (
    <MaybeScreen embedded={embedded} edges={[]}>
      <Segmented
        options={[
          { value: 'pending', label: `${t('queue.tabPending')} (${queue.length})` },
          { value: 'confirmed', label: `${t('queue.tabConfirmed')} (${upcoming.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />
      <View style={{ height: 12 }} />
      {tab === 'confirmed' ? (
        <>
          {!upcoming.length ? <Empty text={t('queue.noConfirmed')} icon="calendar-outline" /> : null}
          {upcoming.map((b) => (
            <Card key={b.id} style={{ marginBottom: 10 }}>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={font.h3}>{b.userName}</Text>
                  <Text style={font.small}>{b.manual ? '☎︎ ' : ''}{b.userPhone}</Text>
                </View>
                <Pill label={t('status.confirmed')} color={colors.success} bg={colors.successSoft} />
              </Row>
              <Text style={[font.body, { marginTop: 8, fontWeight: '700' }]}>
                {b.pitchName} · {dayLabel(b.date, lang, t)} · <Text style={{ color: colors.accent }}>{b.start} – {b.end}</Text>
              </Text>
              <Row style={{ gap: 8, marginTop: 12 }}>
                <Button label={t('common.call')} icon="call" variant="secondary" small style={{ flex: 1 }} onPress={() => Linking.openURL(phoneLink(b.userPhone))} />
                <Button
                  label={t('common.cancel')}
                  icon="close-circle"
                  variant="danger"
                  small
                  style={{ flex: 1 }}
                  loading={busy === b.id}
                  onPress={() => setCancelling(b)}
                />
              </Row>
            </Card>
          ))}
        </>
      ) : null}
      {tab === 'pending' && !queue.length ? <Empty text={t('queue.empty')} icon="checkmark-done-outline" /> : null}
      {(tab === 'pending' ? queue : []).map((b, i) => {
        const waited = relativeMinutes(b.createdAt, now);
        const left = Math.max(0, Math.ceil((b.expiresAt - now) / 60000));
        const lockedOther = isLockedByOther(b, user.id, now);
        return (
          <Card
            key={b.id}
            style={[
              { marginBottom: 10 },
              i === 0 && { borderColor: colors.accent, borderWidth: 2 },
              lockedOther && { opacity: 0.6 },
            ]}
          >
            <Row style={{ marginBottom: 6 }}>
              <Text style={{ color: colors.faint, fontWeight: '900', marginRight: 8 }}>#{i + 1}</Text>
              {i === 0 ? <Pill label={t('queue.next')} color={colors.accent} bg={colors.accentSoft} /> : null}
              <View style={{ flex: 1 }} />
              <Pill
                label={waited >= 15 ? t('queue.old') : t('queue.waiting', { n: waited })}
                color={waited >= 15 ? colors.red : colors.muted}
                bg={waited >= 15 ? colors.liveSoft : undefined}
                icon="time"
              />
            </Row>
            <Text style={font.h2}>{b.userName}</Text>
            <Text style={[font.small, { marginTop: 2 }]}>{b.userPhone}</Text>
            <View style={{ marginTop: 10, padding: 10, backgroundColor: colors.bgElevated, borderRadius: 8 }}>
              <Text style={[font.h3]}>
                {b.pitchName} · {dayLabel(b.date, lang, t)}
              </Text>
              <Text style={[font.body, { marginTop: 2, color: colors.accent, fontWeight: '800' }]}>
                {b.start} – {b.end}
              </Text>
              <Text style={[font.tiny, { marginTop: 4 }]}>{t('queue.expires', { n: left })}</Text>
            </View>
            {lockedOther ? (
              <Text style={[font.small, { marginTop: 10, color: colors.orange }]}>{t('queue.lockedBy', { name: b.lockedByName ?? '?' })}</Text>
            ) : (
              <>
                <Row style={{ gap: 8, marginTop: 12 }}>
                  <Button
                    label={t('queue.confirm')}
                    icon="checkmark"
                    style={{ flex: 1 }}
                    loading={busy === b.id}
                    onPress={() =>
                      run(b, async () => {
                        await services.confirmBooking(b.id, user);
                        notifier.bookingHandled(b, 'confirmed');
                      }, t('queue.confirmed'))
                    }
                  />
                  <Button
                    label={t('queue.refuse')}
                    icon="close"
                    variant="danger"
                    style={{ flex: 1 }}
                    disabled={busy === b.id}
                    onPress={() => {
                      services.lockBooking(b.id, user).catch(() => {});
                      setReasonChoice(reasons[0]);
                      setRefusing(b);
                    }}
                  />
                </Row>
                <Row style={{ gap: 8, marginTop: 8 }}>
                  <Button label={t('common.call')} icon="call" variant="secondary" small style={{ flex: 1 }} onPress={() => Linking.openURL(phoneLink(b.userPhone))} />
                  <Button
                    label={t('common.whatsapp')}
                    icon="logo-whatsapp"
                    variant="secondary"
                    small
                    style={{ flex: 1 }}
                    onPress={() => {
                      services.lockBooking(b.id, user).catch(() => {});
                      Linking.openURL(whatsappLink(b.userPhone));
                    }}
                  />
                </Row>
              </>
            )}
          </Card>
        );
      })}

      <Sheet visible={!!refusing} onClose={() => setRefusing(null)} title={t('queue.refuseReason')}>
        <Segmented options={reasons.map((r) => ({ value: r, label: r }))} value={reasonChoice} onChange={setReasonChoice} />
        <View style={{ height: 12 }} />
        {reasonChoice === reasons[reasons.length - 1] ? (
          <Field label={t('queue.refuseReason')} value={reasonText} onChangeText={setReasonText} multiline />
        ) : null}
        <Button label={t('queue.refuse')} variant="danger" icon="close" onPress={doRefuse} />
      </Sheet>

      <Sheet visible={!!cancelling} onClose={() => setCancelling(null)} title={t('plan.cancelBooking')}>
        {cancelling ? (
          <Text style={[font.small, { marginBottom: 10 }]}>
            {cancelling.userName} · {cancelling.pitchName} · {dayLabel(cancelling.date, lang, t)} {cancelling.start}
          </Text>
        ) : null}
        <Field label={t('plan.cancelReason')} value={cancelReason} onChangeText={setCancelReason} multiline />
        <Button label={t('plan.cancelBooking')} variant="danger" icon="close-circle" onPress={doCancel} />
      </Sheet>
    </MaybeScreen>
  );
}

export default function GuardedQueueScreen() {
  return (
    <Guard allow="queue">
      <QueueScreen />
    </Guard>
  );
}
