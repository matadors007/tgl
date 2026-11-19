import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../data/AppProvider';
import { ranks, type PlayerStat } from '../domain/model';
import { TeamBadge } from './football';
import { Empty } from './kit';
import { colors, font, radius } from './theme';

/** Classement des joueurs (buteurs / passeurs). */
export function PlayerRanking({ list, value, label }: { list: PlayerStat[]; value: (s: PlayerStat) => number; label: string }) {
  const { playerById, teamById, t } = useApp();
  if (!list.length) return <Empty text={t('common.empty')} />;
  const rk = ranks(list, value);
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.cardAlt }}>
        <Text style={[font.tiny, { width: 28, fontWeight: '700' }]}>#</Text>
        <Text style={[font.tiny, { flex: 1, fontWeight: '700' }]}>{t('st.player')}</Text>
        <Text style={[font.tiny, { width: 56, textAlign: 'center', fontWeight: '700' }]}>{label}</Text>
      </View>
      {list.map((s, i) => {
        const p = playerById.get(s.playerId);
        const team = teamById.get(s.teamId);
        return (
          <Pressable
            key={s.playerId}
            onPress={() => router.push(`/player/${s.playerId}`)}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <Text style={{ width: 28, color: rk[i] <= 3 ? colors.accent : colors.muted, fontWeight: '800' }}>{rk[i]}</Text>
            <TeamBadge team={team} size={22} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
                {p?.name ?? '—'} {s.live ? <Text style={{ color: colors.live, fontSize: 10, fontWeight: '900' }}> LIVE</Text> : null}
              </Text>
              <Text style={font.small} numberOfLines={1}>
                {team?.name}
              </Text>
            </View>
            <Text style={{ width: 56, textAlign: 'center', color: colors.text, fontWeight: '900', fontSize: 16 }}>{value(s)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DisciplineTable({ list }: { list: PlayerStat[] }) {
  const { playerById, teamById, t } = useApp();
  if (!list.length) return <Empty text={t('common.empty')} />;
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.cardAlt, alignItems: 'center' }}>
        <Text style={[font.tiny, { flex: 1, fontWeight: '700' }]}>{t('st.player')}</Text>
        <View style={{ width: 36, alignItems: 'center' }}>
          <View style={{ width: 9, height: 13, borderRadius: 2, backgroundColor: colors.yellow }} />
        </View>
        <View style={{ width: 36, alignItems: 'center' }}>
          <View style={{ width: 9, height: 13, borderRadius: 2, backgroundColor: colors.red }} />
        </View>
      </View>
      {list.map((s) => {
        const p = playerById.get(s.playerId);
        const team = teamById.get(s.teamId);
        return (
          <Pressable
            key={s.playerId}
            onPress={() => router.push(`/player/${s.playerId}`)}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <TeamBadge team={team} size={22} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
                {p?.name ?? '—'}
              </Text>
              {s.suspendedMatches > 0 ? (
                <Text style={{ color: colors.red, fontSize: 12, fontWeight: '700' }}>{t('st.suspendedFor', { n: s.suspendedMatches })}</Text>
              ) : (
                <Text style={font.small}>{team?.name}</Text>
              )}
            </View>
            <Text style={{ width: 36, textAlign: 'center', color: colors.text, fontWeight: '800' }}>{s.yellows}</Text>
            <Text style={{ width: 36, textAlign: 'center', color: colors.text, fontWeight: '800' }}>{s.reds}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
