import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { usePendingBookings, useSlotsByDate } from '@/data/useStaffData';
import { buildDaySlots, fifoQueue, toDateKey, type Pitch } from '@/domain/model';
import { Button, Card, Empty, Header, Pill, Row, Screen, Sheet } from '@/ui/kit';
import { BackButton } from '@/ui/backButton';
import { PitchForm } from '@/ui/pitchForm';
import { imageSource } from '@/ui/showcase';
import { colors, font, radius } from '@/ui/theme';
import { useWideWeb } from '@/ui/web';

/**
 * Rubrique « Terrains » : tous les terrains (ajouter, modifier, supprimer) et, pour chaque terrain,
 * son planning sur 7 jours, ses créneaux et sa file d'attente. La file d'attente générale est ici aussi.
 */
export default function PitchesTab() {
  const { t, canBook, pitches, can } = useApp();
  const now = useNow(30_000);
  const wide = useWideWeb();
  const pending = usePendingBookings();
  const queue = fifoQueue(pending, now);
  const [adding, setAdding] = useState(false);
  if (!canBook) return <Redirect href="/" />;
  return (
    <Screen>
      {/* Rubrique ouverte depuis l'administration : retour à l'administration */}
      <BackButton to="/admin" style={{ marginBottom: 12 }} />
      <Header
        title={t('tab.pitches')}
        subtitle={t('pitch.hubSub', { n: pitches.length })}
        right={can('pitches.manage') ? <Button small icon="add-circle" label={t('pitch.add')} onPress={() => setAdding(true)} /> : undefined}
      />

      {can('queue') ? (
        <Card onPress={() => router.push('/admin/queue')} style={{ marginBottom: 14, borderColor: queue.length ? colors.orange : colors.border }}>
          <Row>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: queue.length ? colors.orangeSoft : colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="list" size={22} color={queue.length ? colors.orange : colors.muted} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={font.h3}>{t('admin.queue')}</Text>
              <Text style={font.small}>{queue.length ? t('pitch.queueN', { n: queue.length }) : t('pitch.queueEmpty')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.faint} />
          </Row>
        </Card>
      ) : null}

      {!pitches.length ? <Empty text={t('pitch.none')} icon="grid-outline" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
        {pitches.map((p, i) => (
          <View key={p.id} style={{ width: wide ? '33.33%' : '100%', padding: 6 }}>
            <PitchCard pitch={p} index={i} pending={queue.filter((b) => b.pitchId === p.id).length} />
          </View>
        ))}
      </View>

      <Sheet visible={adding} onClose={() => setAdding(false)} title={t('pitch.add')}>
        {adding ? <PitchForm onDone={() => setAdding(false)} /> : null}
      </Sheet>
    </Screen>
  );
}

function PitchCard({ pitch, index, pending }: { pitch: Pitch; index: number; pending: number }) {
  const { t, config } = useApp();
  const now = useNow(60_000);
  const today = toDateKey(new Date(now));
  const docs = useSlotsByDate(today);
  const fill = useMemo(() => {
    const s = buildDaySlots(config, pitch.id, today, docs.filter((d) => d.pitchId === pitch.id), now, pitch).filter((x) => !x.past);
    return { free: s.filter((x) => x.status === 'free').length, total: s.length };
  }, [config, pitch, today, docs, now]);
  return (
    <Pressable
      onPress={() => router.push(`/admin/pitch/${pitch.id}`)}
      style={({ pressed }) => ({ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 })}
    >
      <Image source={imageSource(pitch.photo ?? '', index)} style={{ width: '100%', height: 130, opacity: pitch.active ? 1 : 0.4 }} resizeMode="cover" />
      <View style={{ padding: 12 }}>
        <Row>
          <Text style={[font.h3, { flex: 1 }]}>{pitch.name}</Text>
          <Pill label={pitch.type} color={colors.accent} bg={colors.accentSoft} />
        </Row>
        <Row style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
          {!pitch.active ? <Pill label={t('pitch.closed')} color={colors.red} bg={colors.liveSoft} icon="close-circle" /> : null}
          <Pill label={t('pitch.freeToday', { n: fill.free, total: fill.total })} color={colors.success} bg={colors.successSoft} />
          {pending ? <Pill label={t('pitch.pendingN', { n: pending })} color={colors.orange} bg={colors.orangeSoft} /> : null}
        </Row>
      </View>
    </Pressable>
  );
}
