import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import React from 'react';
import { Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { TeamBadge } from '@/ui/football';
import { Card, Empty, ListItem, Pill, Screen, Section } from '@/ui/kit';
import { colors, font } from '@/ui/theme';

function PlayerScreenInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, playerById, teamById, playerStats } = useApp();
  const p = playerById.get(id);
  if (!p) return <Screen><Empty text={t('common.loading')} /></Screen>;
  const team = teamById.get(p.teamId);
  const s = playerStats.get(p.id);

  const tiles: [string, number, string?][] = [
    [t('player.played'), s?.played ?? 0],
    [t('st.goals'), s?.goals ?? 0],
    [t('st.assistsShort'), s?.assists ?? 0],
    ['🟨', s?.yellows ?? 0, colors.yellow],
    ['🟥', s?.reds ?? 0, colors.red],
  ];

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: p.name }} />
      <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: team?.color ?? colors.grey, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>{p.number}</Text>
        </View>
        <Text style={[font.h1, { marginTop: 10 }]}>{p.name}</Text>
        <Text style={font.small}>{t(`pos.${p.position}`)}</Text>
        {s && s.suspendedMatches > 0 ? (
          <View style={{ marginTop: 10 }}>
            <Pill label={t('st.suspendedFor', { n: s.suspendedMatches })} color={colors.red} bg={colors.liveSoft} icon="ban" />
          </View>
        ) : null}
      </Card>

      <Section title={t('player.stats')}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tiles.map(([label, value]) => (
            <Card key={label} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900' }}>{value}</Text>
              <Text style={[font.tiny, { textAlign: 'center' }]} numberOfLines={1}>
                {label}
              </Text>
            </Card>
          ))}
        </View>
      </Section>

      {team ? (
        <Section title={t('st.team')}>
          <ListItem title={team.name} subtitle={team.company} onPress={() => router.push(`/team/${team.id}`)} right={<TeamBadge team={team} />} />
        </Section>
      ) : null}
    </Screen>
  );
}

export default function PlayerScreen() {
  return (
    <>
      <PlayerScreenInner />
    </>
  );
}
