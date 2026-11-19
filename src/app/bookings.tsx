import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { AppError } from '@/data/services';
import { COL } from '@/data/store';
import { displayBookingStatus, type Booking } from '@/domain/model';
import { STATUS_COLORS } from '@/ui/status';
import { ask, notify } from '@/ui/dialogs';
import { dayLabel, phoneLink, timeOf } from '@/ui/format';
import { Button, Card, Empty, Pill, Row, Screen } from '@/ui/kit';
import { colors, font } from '@/ui/theme';


export default function MyBookingsScreen() {
  const { t, lang, user, store, services, config } = useApp();
  const now = useNow(15_000);
  const [list, setList] = useState<Booking[]>([]);
  useEffect(() => {
    if (!user) return;
    return store.watch<Booking>(COL.bookings, [['userId', user.id]], (r) => setList(r.sort((a, b) => b.createdAt - a.createdAt)));
  }, [store, user]);

  const cancel = async (b: Booking) => {
    if (!(await ask(t('book.cancelRequest'), `${b.pitchName} · ${dayLabel(b.date, lang, t)} ${b.start}`, t('common.yes'), t('common.no')))) return;
    try {
      await services.cancelMyBooking(b.id);
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    }
  };

  return (
    <Screen edges={[]}>
      {!list.length ? <Empty text={t('book.noneMine')} icon="calendar-outline" /> : null}
      {list.map((b) => {
        const st = displayBookingStatus(b, now);
        const c = STATUS_COLORS[st];
        return (
          <Card key={b.id} style={{ marginBottom: 10 }}>
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>
                  {dayLabel(b.date, lang, t)} · {b.start} – {b.end}
                </Text>
                <Text style={[font.small, { marginTop: 2 }]}>{b.pitchName}</Text>
              </View>
              <Pill label={t(`status.${st}` as 'status.pending')} color={c.fg} bg={c.bg} />
            </Row>
            {st === 'pending' ? (
              <Text style={[font.small, { marginTop: 8 }]}>{t('book.expiresAt', { t: timeOf(b.expiresAt) })}</Text>
            ) : null}
            {st === 'refused' && b.reason ? <Text style={[font.small, { marginTop: 8, color: colors.red }]}>{b.reason}</Text> : null}
            {st === 'pending' ? (
              <Button label={t('book.cancelRequest')} variant="ghost" small onPress={() => cancel(b)} style={{ marginTop: 10 }} />
            ) : null}
            {st === 'confirmed' ? (
              <View style={{ marginTop: 10 }}>
                <Text style={font.small}>{t('book.cancelConfirmedInfo')}</Text>
                <Button
                  label={`${t('common.call')} ${config.contactPhone}`}
                  icon="call"
                  variant="secondary"
                  small
                  style={{ marginTop: 8 }}
                  onPress={() => Linking.openURL(phoneLink(config.contactPhone))}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
