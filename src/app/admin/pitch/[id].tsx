import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { Guard } from '@/ui/Guard';
import { Empty, Screen, Segmented } from '@/ui/kit';
import { PitchForm } from '@/ui/pitchForm';
import { PlanningScreen } from '../planning';
import { QueueScreen } from '../queue';
import { PitchSlots } from '../slots';

type Tab = 'planning' | 'slots' | 'queue' | 'info';

/** Un terrain : planning (7 jours), créneaux (activer / désactiver), file d'attente, informations. */
function PitchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, pitches, can } = useApp();
  const nav = useNavigation();
  const pitch = pitches.find((p) => p.id === id);
  const tabs: { value: Tab; label: string }[] = [
    ...(can('planning') || can('private') ? [{ value: 'planning' as Tab, label: t('pitch.tabPlanning') }] : []),
    ...(can('slots.config') ? [{ value: 'slots' as Tab, label: t('pitch.tabSlots') }] : []),
    ...(can('queue') ? [{ value: 'queue' as Tab, label: t('pitch.tabQueue') }] : []),
    ...(can('pitches.manage') ? [{ value: 'info' as Tab, label: t('pitch.tabInfo') }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]?.value ?? 'planning');
  useEffect(() => {
    if (pitch) nav.setOptions({ title: `${pitch.name} · ${pitch.type}` });
  }, [pitch, nav]);
  if (!pitch) return <Screen edges={[]}><Empty text={t('pitch.none')} /></Screen>;
  return (
    <Screen edges={[]}>
      {tabs.length > 1 ? <Segmented scroll value={tab} onChange={setTab} options={tabs} /> : null}
      <View style={{ height: 14 }} />
      {tab === 'planning' ? <PlanningScreen embedded fixedPitchId={pitch.id} /> : null}
      {tab === 'slots' ? <PitchSlots pitch={pitch} /> : null}
      {tab === 'queue' ? <QueueScreen embedded pitchId={pitch.id} /> : null}
      {tab === 'info' ? <PitchForm key={pitch.id} pitch={pitch} onDone={(r) => r === 'deleted' && router.back()} /> : null}
    </Screen>
  );
}

export default function PitchScreen() {
  return (
    <Guard allow="book">
      <PitchDetail />
    </Guard>
  );
}
