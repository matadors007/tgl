import { router } from 'expo-router';
import { Guard } from '@/ui/Guard';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMatchSheet } from '@/print/useMatchSheet';
import { useApp } from '@/data/AppProvider';
import { isLive } from '@/domain/model';
import { MatchRow } from '@/ui/football';
import { dayLabel } from '@/ui/format';
import { Button, Empty, Screen, Segmented } from '@/ui/kit';
import { colors, font, radius } from '@/ui/theme';

function AdminMatches() {
  const { t, lang, matches, season, isAdmin } = useApp();
  const printSheet = useMatchSheet();
  const rounds = useMemo(() => [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b), [matches]);
  const defaultRound =
    matches.find(isLive)?.round ?? matches.find((m) => m.status === 'scheduled')?.round ?? rounds[rounds.length - 1] ?? 1;
  const [round, setRound] = useState<number>(defaultRound);
  const list = matches.filter((m) => m.round === round);

  if (!season || !matches.length)
    return (
      <Screen edges={[]}>
        <Empty text={t('st.noSeason')} />
        <Button label={t('admin.season')} onPress={() => router.push('/admin/season')} />
      </Screen>
    );

  return (
    <Screen edges={[]}>
      <Text style={[font.small, { fontWeight: '700', marginBottom: 8 }]}>{t('live.byRound')}</Text>
      <Segmented
        scroll
        value={String(round)}
        onChange={(v) => setRound(Number(v))}
        options={rounds.map((r) => ({
          value: String(r),
          label: `J${r}`,
          badge: matches.filter((m) => m.round === r && isLive(m)).length || undefined,
        }))}
      />
      <View style={{ marginTop: 14, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        <View style={{ backgroundColor: colors.cardAlt, padding: 10 }}>
          <Text style={font.h3}>
            {t('match.round', { n: round })} · {[...new Set(list.map((m) => dayLabel(m.date, lang, t)))].join(' · ')}
          </Text>
        </View>
        {list.map((m) => (
          <View key={m.id}>
            <MatchRow match={m} onPress={() => router.push(`/admin/live/${m.id}`)} />
            {isAdmin ? (
              <Pressable onPress={() => printSheet(m)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.bgElevated }}>
                <Ionicons name="print" size={14} color={colors.accent} />
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700', marginLeft: 6 }}>{t('sheet.short')}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </Screen>
  );
}

export default function GuardedAdminMatches() {
  return (
    <Guard allow="operate">
      <AdminMatches />
    </Guard>
  );
}
