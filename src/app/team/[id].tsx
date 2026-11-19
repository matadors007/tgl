import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { FormBadges, MatchRow, TeamBadge } from '@/ui/football';
import { Card, Empty, Screen, Segmented } from '@/ui/kit';
import { colors, font } from '@/ui/theme';

function TeamScreenInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, teamById, players, matches, standings, playerStats, followedTeamIds, toggleFollow, isOperator } = useApp();
  const [tab, setTab] = useState<'squad' | 'matches'>('squad');
  const team = teamById.get(id);
  if (!team) return <Screen><Empty text={t('common.loading')} /></Screen>;
  const row = standings.find((r) => r.teamId === id);
  const squad = players.filter((p) => p.teamId === id);
  const teamMatches = matches.filter((m) => m.homeTeamId === id || m.awayTeamId === id);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: team.name }} />
      <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
        <TeamBadge team={team} size={64} />
        <Text style={[font.h1, { marginTop: 10, textAlign: 'center' }]}>{team.name}</Text>
        <Text style={font.small}>{team.company}</Text>
        {isOperator ? null : (
        <Pressable
          onPress={() => toggleFollow(team.id)}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.accent, backgroundColor: followedTeamIds.includes(team.id) ? colors.accent : 'transparent' }}
        >
          <Ionicons name={followedTeamIds.includes(team.id) ? 'star' : 'star-outline'} size={14} color={followedTeamIds.includes(team.id) ? colors.onAccent : colors.accent} />
          <Text style={{ marginLeft: 6, fontWeight: '800', color: followedTeamIds.includes(team.id) ? colors.onAccent : colors.accent }}>
            {followedTeamIds.includes(team.id) ? t('team.following') : t('team.follow')}
          </Text>
        </Pressable>
        )}
        {row ? (
          <View style={{ flexDirection: 'row', marginTop: 14, gap: 18, alignItems: 'center' }}>
            <Stat label="#" value={row.position} />
            <Stat label={t('st.pts')} value={row.points} />
            <Stat label={t('st.p')} value={row.played} />
            <Stat label={t('st.gd')} value={row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff} />
          </View>
        ) : null}
        {row?.form.length ? (
          <View style={{ marginTop: 12 }}>
            <FormBadges form={row.form} />
          </View>
        ) : null}
      </Card>

      <View style={{ marginVertical: 12 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'squad', label: t('team.squad') },
            { value: 'matches', label: t('team.matches') },
          ]}
        />
      </View>

      {tab === 'squad' ? (
        <Card style={{ padding: 0 }}>
          {squad.map((p) => {
            const s = playerStats.get(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/player/${p.id}`)}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                <Text style={{ width: 30, color: colors.accent, fontWeight: '900' }}>{p.number}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[font.body, { fontWeight: '700' }]}>
                    {p.name}
                    {team.captainId === p.id ? ` · ${t('team.captain')}` : ''}
                  </Text>
                  <Text style={font.small}>
                    {t(`pos.${p.position}`)}
                    {s && s.suspendedMatches > 0 ? ` · ` : ''}
                    {s && s.suspendedMatches > 0 ? <Text style={{ color: colors.red, fontWeight: '700' }}>{t('st.suspended')}</Text> : null}
                  </Text>
                </View>
                {s ? (
                  <Text style={font.small}>
                    ⚽ {s.goals} · 🅰 {s.assists}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          {!squad.length ? <Empty text={t('common.empty')} /> : null}
        </Card>
      ) : (
        <View style={{ borderRadius: 12, overflow: 'hidden' }}>
          {teamMatches.map((m) => (
            <MatchRow key={m.id} match={m} showDate />
          ))}
        </View>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900' }}>{value}</Text>
      <Text style={font.tiny}>{label}</Text>
    </View>
  );
}

export default function TeamScreen() {
  return (
    <>
      <TeamScreenInner />
    </>
  );
}
