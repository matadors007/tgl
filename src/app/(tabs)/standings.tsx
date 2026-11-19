import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { ChampionshipSwitch } from '@/ui/championship';
import { bracketRounds, disciplineTable, fairPlayTable, groupStandings, hasGroups, isCup, isLive, matchWinner, topAssists, topScorers, type FairPlayRow, type Match } from '@/domain/model';
import { dayLabel } from '@/ui/format';
import { koLabel } from '@/ui/stage';
import { useWideWeb } from '@/ui/web';
import { StandingsTable, TeamBadge } from '@/ui/football';
import { Empty, Header, LiveDot, Screen, Segmented } from '@/ui/kit';
import { DisciplineTable, PlayerRanking } from '@/ui/playerTables';
import { colors, font } from '@/ui/theme';

type Tab = 'general' | 'groups' | 'bracket' | 'fairplay' | 'scorers' | 'assists' | 'discipline';

function StandingsScreenInner() {
  const { t, season } = useApp();
  return (
    <Screen>
      <Header title={t('tab.standings')} subtitle={season?.name} />
      <ChampionshipSwitch />
      <StandingsPanel />
    </Screen>
  );
}

/** Classements (général ou poules / tableau, fair-play, buteurs, passeurs, discipline) du championnat choisi. */
export function StandingsPanel() {
  const { t, season, standings, playerStats, matches, teams, events } = useApp();
  const fair = useMemo(() => fairPlayTable(teams, events), [teams, events]);
  const cup = isCup(season);
  const groups = hasGroups(season);
  const first: Tab = cup ? (groups ? 'groups' : 'bracket') : 'general';
  const [tab, setTab] = useState<Tab>(first);
  // Changement de championnat / tournoi : onglet adapté
  useEffect(() => {
    setTab((cur) => (cur === 'general' || cur === 'groups' || cur === 'bracket' ? first : cur));
  }, [first]);
  const anyLive = matches.some(isLive);

  return (
    <View>
      {!season ? (
        <Empty text={t('st.noSeason')} icon="trophy-outline" />
      ) : (
        <>
          <Segmented<Tab>
            scroll
            value={tab}
            onChange={setTab}
            options={[
              ...(cup
                ? [
                    ...(groups ? [{ value: 'groups' as Tab, label: t('cup.groups') }] : []),
                    { value: 'bracket' as Tab, label: t('cup.bracket') },
                  ]
                : [{ value: 'general' as Tab, label: t('st.general') }]),
              { value: 'fairplay', label: t('st.fairplay') },
              { value: 'scorers', label: t('st.scorers') },
              { value: 'assists', label: t('st.assists') },
              { value: 'discipline', label: t('st.discipline') },
            ]}
          />
          <View style={{ height: 12 }} />
          {anyLive && tab !== 'discipline' && tab !== 'fairplay' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <LiveDot />
              <Text style={[font.small, { color: colors.live, flex: 1 }]}>{t('st.liveNote')}</Text>
            </View>
          ) : null}
          {tab === 'general' ? (
            <View>
              <StandingsTable rows={standings} />
              <TieNote rows={standings} />
            </View>
          ) : null}
          {tab === 'groups' ? <Groups /> : null}
          {tab === 'bracket' ? <Bracket matches={matches} /> : null}
          {tab === 'fairplay' ? <FairPlay rows={fair} /> : null}
          {tab === 'scorers' ? <PlayerRanking list={topScorers(playerStats)} value={(s) => s.goals} label={t('st.goals')} /> : null}
          {tab === 'assists' ? <PlayerRanking list={topAssists(playerStats)} value={(s) => s.assists} label={t('st.assistsShort')} /> : null}
          {tab === 'discipline' ? <DisciplineTable list={disciplineTable(playerStats)} /> : null}
        </>
      )}
    </View>
  );
}

export default function StandingsScreen() {
  return <StandingsScreenInner />;
}

/** Classement du fair-play : 0 point au départ, carton jaune −2, carton rouge −5 (joueurs et entraîneur). */
function FairPlay({ rows }: { rows: FairPlayRow[] }) {
  const { t, teamById } = useApp();
  if (!rows.length) return <Empty text={t('common.empty')} icon="ribbon-outline" />;
  return (
    <View>
      <Text style={[font.small, { marginBottom: 10 }]}>{t('st.fairplayRule')}</Text>
      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardAlt, paddingVertical: 8, paddingHorizontal: 10 }}>
          <Text style={[font.tiny, { width: 26, fontWeight: '800' }]}>#</Text>
          <Text style={[font.tiny, { flex: 1, fontWeight: '800' }]}>{t('st.team')}</Text>
          <Text style={[font.tiny, { width: 34, textAlign: 'center', fontWeight: '800', color: colors.yellow }]}>CJ</Text>
          <Text style={[font.tiny, { width: 34, textAlign: 'center', fontWeight: '800', color: colors.red }]}>CR</Text>
          <Text style={[font.tiny, { width: 46, textAlign: 'right', fontWeight: '800' }]}>{t('st.pts')}</Text>
        </View>
        {rows.map((r, i) => {
          const team = teamById.get(r.teamId);
          return (
            <View key={r.teamId} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingVertical: 9, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={[font.small, { width: 26, fontWeight: '800' }]}>{i + 1}</Text>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                <TeamBadge team={team} size={22} />
                <Text style={[font.body, { marginLeft: 8, fontWeight: '600', flexShrink: 1 }]} numberOfLines={1}>
                  {team?.name ?? '?'}
                </Text>
                {r.coachCards ? <Text style={[font.tiny, { marginLeft: 6 }]}>({t('st.coachCards', { n: r.coachCards })})</Text> : null}
              </View>
              <Text style={[font.small, { width: 34, textAlign: 'center' }]}>{r.yellows}</Text>
              <Text style={[font.small, { width: 34, textAlign: 'center' }]}>{r.reds}</Text>
              <Text style={{ width: 46, textAlign: 'right', fontWeight: '900', color: r.points === 0 ? colors.success : r.points > -10 ? colors.orange : colors.red }}>{r.points}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Tournoi : un classement par poule. */
function Groups() {
  const { t, season, teams, matches, events } = useApp();
  const tables = useMemo(() => (season ? groupStandings(season, teams, matches, events) : []), [season, teams, matches, events]);
  if (!teams.some((x) => x.group)) return <Empty text={t('common.empty')} icon="grid-outline" />;
  return (
    <View>
      <Text style={[font.small, { marginBottom: 10 }]}>{t('cup.groupTables')}</Text>
      {tables.map(({ group, rows }) => (
        <View key={group} style={{ marginBottom: 16 }}>
          <Text style={[font.h3, { marginBottom: 6 }]}>{t('cup.groupN', { g: group })}</Text>
          {rows.length ? <StandingsTable rows={rows} /> : <Text style={font.small}>{t('common.empty')}</Text>}
          {rows.some((r) => r.tieLot) ? <TieNote rows={rows} /> : null}
        </View>
      ))}
    </View>
  );
}

/** Tournoi : tableau à élimination, tour par tour, jusqu'à la finale. */
function Bracket({ matches }: { matches: Match[] }) {
  const { t, teamById } = useApp();
  const wide = useWideWeb();
  const rounds = useMemo(() => bracketRounds(matches), [matches]);
  const final = rounds.find((r) => r.round === 2)?.matches[0];
  const champion = final ? matchWinner(final) : null;
  if (!rounds.length) return <Empty text={t('cup.noBracket')} icon="git-network-outline" />;
  const cols = rounds.map((r) => (
    <View key={r.round} style={{ width: wide ? 260 : undefined, marginRight: wide ? 12 : 0, marginBottom: 14 }}>
      <Text style={[font.small, { fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }]}>{koLabel(r.round, t)}</Text>
      {r.matches.map((m) => (
        <BracketMatch key={m.id} m={m} />
      ))}
    </View>
  ));
  return (
    <View>
      {champion ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent, marginBottom: 14 }}>
          <Ionicons name="trophy" size={26} color={colors.accent} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={[font.tiny, { color: colors.accent, fontWeight: '800', textTransform: 'uppercase' }]}>{t('cup.winner')}</Text>
            <Text style={font.h3}>{teamById.get(champion)?.name ?? '?'}</Text>
          </View>
          <TeamBadge team={teamById.get(champion)} size={40} />
        </View>
      ) : null}
      {wide ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {cols}
        </ScrollView>
      ) : (
        cols
      )}
    </View>
  );
}

function BracketMatch({ m }: { m: Match }) {
  const { t, lang, teamById } = useApp();
  const winner = matchWinner(m);
  const played = m.status === 'finished' || isLive(m);
  const pens = m.homePens != null && m.awayPens != null;
  const line = (teamId: string, score: number, pen: number | null | undefined) => {
    const team = teamById.get(teamId);
    const won = winner === teamId;
    const lost = !!winner && !won;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, opacity: lost ? 0.55 : 1 }}>
        <TeamBadge team={team} size={20} />
        <Text style={[font.body, { flex: 1, marginLeft: 8, fontWeight: won ? '900' : '600' }]} numberOfLines={1}>
          {team?.name ?? '?'}
        </Text>
        {pens ? <Text style={[font.tiny, { marginRight: 6 }]}>({pen})</Text> : null}
        <Text style={{ fontWeight: '900', color: isLive(m) ? colors.live : colors.text, width: 18, textAlign: 'right' }}>{played ? score : ''}</Text>
      </View>
    );
  };
  return (
    <Pressable
      onPress={() => router.push(`/match/${m.id}`)}
      style={({ pressed }) => ({ padding: 10, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: isLive(m) ? colors.live : colors.border, marginBottom: 8, opacity: pressed ? 0.8 : 1 })}
    >
      {line(m.homeTeamId, m.homeScore, m.homePens)}
      {line(m.awayTeamId, m.awayScore, m.awayPens)}
      <Text style={[font.tiny, { marginTop: 4 }]}>
        {m.status === 'postponed' ? t('match.postponed') : `${dayLabel(m.date, lang, t)} · ${m.start}`}
      </Text>
    </Pressable>
  );
}

/** Règle de départage et égalités parfaites à trancher par tirage au sort. */
export function TieNote({ rows }: { rows: import('@/domain/model').StandingRow[] }) {
  const { t, teamById } = useApp();
  const groups = new Map<string, string[]>();
  for (const r of rows.filter((x) => x.tieLot)) {
    const k = `${r.points}|${r.goalDiff}|${r.goalsFor}`;
    groups.set(k, [...(groups.get(k) ?? []), teamById.get(r.teamId)?.name ?? '?']);
  }
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={font.tiny}>{t('st.tieRule')}</Text>
      {[...groups.values()].map((names) => (
        <Text key={names.join()} style={[font.small, { color: colors.orange, marginTop: 6 }]}>
          {t('st.tieLot', { teams: names.join(', ') })}
        </Text>
      ))}
    </View>
  );
}
