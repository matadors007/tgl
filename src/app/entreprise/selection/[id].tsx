import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { AppError } from '@/data/services';
import { canCompanyEditLineup, lineupDeadline, toDateKey } from '@/domain/model';
import { notify } from '@/ui/dialogs';
import { dayLabel, shortDate, timeOf } from '@/ui/format';
import { TeamBadge } from '@/ui/football';
import { Button, Card, Empty, Pill, Row, Screen, Section } from '@/ui/kit';
import { colors, font } from '@/ui/theme';

/** BF09 : l'entreprise sélectionne les joueurs du match, au plus tard 12 h avant le coup d'envoi. */
export default function LineupSelectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, matches, myTeam, players, playerStats, teamById, services } = useApp();
  const now = useNow(30_000);
  const match = matches.find((m) => m.id === id);
  const home = match?.homeTeamId === myTeam?.id;
  const current = useMemo(() => (match ? (home ? match.homeLineup : match.awayLineup) ?? [] : []), [match, home]);
  const [picked, setPicked] = useState<Set<string>>(new Set(current));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!dirty) setPicked(new Set(current));
  }, [current, dirty]);

  if (!match || !myTeam || (match.homeTeamId !== myTeam.id && match.awayTeamId !== myTeam.id)) {
    return (
      <Screen>
        <Empty text={t('common.empty')} />
      </Screen>
    );
  }
  const open = canCompanyEditLineup(match, now);
  const deadline = lineupDeadline(match);
  const dl = `${shortDate(toDateKey(new Date(deadline)))} ${timeOf(deadline)}`;
  const opp = teamById.get(home ? match.awayTeamId : match.homeTeamId);
  // Les suspensions s'appliquent au prochain match de l'équipe
  const nextOfTeam = matches.find(
    (m) => (m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id) && (m.status === 'scheduled' || m.status === 'postponed'),
  );
  const suspendedHere = (pid: string) => nextOfTeam?.id === match.id && (playerStats.get(pid)?.suspendedMatches ?? 0) > 0;
  const squad = players.filter((p) => p.teamId === myTeam.id).sort((a, b) => a.number - b.number);

  const toggle = (pid: string) => {
    if (!open || suspendedHere(pid)) return;
    const next = new Set(picked);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    setPicked(next);
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await services.setCompanyLineup(match, myTeam.id, squad.filter((p) => picked.has(p.id)).map((p) => p.id));
      setDirty(false);
      notify(t('selection.saved'));
      if (router.canGoBack()) router.back();
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Card>
        <Row>
          <TeamBadge team={myTeam} size={34} />
          <Text style={[font.h3, { marginHorizontal: 10 }]}>vs</Text>
          <TeamBadge team={opp} size={34} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
              {opp?.name ?? '?'}
            </Text>
            <Text style={font.small}>
              {dayLabel(match.date, lang, t)} · {match.start}
            </Text>
          </View>
        </Row>
        <Text style={[font.small, { marginTop: 12, color: open ? colors.text : colors.orange }]}>
          {open ? t('selection.hint', { d: dl }) : t('selection.lockedInfo')}
        </Text>
      </Card>

      <Section title={t('company.selected', { n: picked.size })}>
        {!squad.length ? <Empty text={t('players.onlyApproved')} icon="people-outline" /> : null}
        {squad.map((p) => {
          const on = picked.has(p.id);
          const susp = suspendedHere(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => toggle(p.id)}
              disabled={!open || susp}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 12,
                  marginBottom: 6,
                  borderRadius: 10,
                  backgroundColor: on ? 'rgba(215,171,62,0.12)' : colors.card,
                  borderWidth: 1,
                  borderColor: on ? colors.accent : colors.border,
                  opacity: susp ? 0.5 : 1,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.accent : colors.faint} />
              <Text style={{ width: 34, marginLeft: 10, color: colors.accent, fontWeight: '900' }}>{p.number}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[font.body, { fontWeight: '700' }]}>{p.name}</Text>
                <Text style={font.tiny}>{t(`pos.${p.position}`)}</Text>
              </View>
              {susp ? <Pill label={t('st.suspended')} color={colors.red} bg={colors.liveSoft} /> : null}
            </Pressable>
          );
        })}
      </Section>

      {open ? <Button label={t('common.save')} icon="checkmark" onPress={save} loading={busy} disabled={!dirty} style={{ marginTop: 8 }} /> : null}
    </Screen>
  );
}
