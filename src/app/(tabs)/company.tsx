import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { ChampionshipSwitch } from '@/ui/championship';
import { AppError } from '@/data/services';
import { canCompanyEditLineup, companyTodos, computePlayerStats, computeStandings, isLive, isPlayerApproved, lineupDeadline, teamRequestStatus, topScorers, type Match, type Team } from '@/domain/model';
import { LogoPicker, RegistrationWizard, RequestStatusCard } from '@/ui/registration';
import { notify } from '@/ui/dialogs';
import { dayLabel, shortDate, timeOf } from '@/ui/format';
import { FormBadges, StandingsTable, TeamBadge } from '@/ui/football';
import { Button, Card, Empty, Header, ListItem, Pill, Row, Screen, Section, Segmented } from '@/ui/kit';
import { TodoList } from '@/ui/todos';
import { toDateKey } from '@/domain/model';
import { colors, font, radius } from '@/ui/theme';

/** Espace dédié aux entreprises du championnat : tout sur leur équipe. */
export default function CompanyScreen() {
  const { t, lang, user, myTeam, season, players, allPlayers, matches, standings, playerStats, isCompany, services, notifier } = useApp();
  const now = useNow(60_000);
  const todos = useMemo(
    () =>
      companyTodos({
        team: myTeam,
        seasonOpen: season?.status === 'registration',
        players: allPlayers,
        matches,
        now,
      }),
    [myTeam, season, allPlayers, matches, now],
  );

  const data = useMemo(() => {
    if (!myTeam) return null;
    const mine = matches.filter((m) => m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id);
    const live = mine.filter(isLive);
    const next = mine.find((m) => m.status === 'scheduled' || m.status === 'postponed');
    const results = mine.filter((m) => m.status === 'finished').slice(-3).reverse();
    const squad = players.filter((p) => p.teamId === myTeam.id);
    const row = standings.find((r) => r.teamId === myTeam.id);
    const teamStats = new Map([...playerStats].filter(([, s]) => s.teamId === myTeam.id));
    const scorer = topScorers(teamStats)[0];
    const suspended = [...teamStats.values()].filter((s) => s.suspendedMatches > 0);
    const limit = season?.yellowLimit ?? 3;
    const atRisk = [...teamStats.values()].filter((s) => s.suspendedMatches === 0 && limit > 1 && s.yellowAccum === limit - 1);
    // Extrait du classement autour de l'équipe
    const idx = standings.findIndex((r) => r.teamId === myTeam.id);
    const around = standings.slice(Math.max(0, idx - 2), Math.max(0, idx - 2) + 5);
    return { mine, live, next, results, squad, row, scorer, suspended, atRisk, around };
  }, [myTeam, matches, players, standings, playerStats, season]);

  if (!isCompany) {
    return (
      <Screen>
        <Empty text={t('common.empty')} />
      </Screen>
    );
  }
  const todoSection = (
    <Section title={t('todo.title')}>
      <TodoList items={todos} t={t} lang={lang} matches={matches} now={now} />
    </Section>
  );
  const playersLink = myTeam ? (
    <ListItem icon="people" title={t('company.players')} subtitle={t('company.playersSub')} onPress={() => router.push('/entreprise/joueurs')} />
  ) : null;

  const reqStatus = myTeam ? teamRequestStatus(myTeam) : null;

  // Pas encore d'équipe : assistant d'inscription (pendant la période d'inscription)
  if (!myTeam || !data) {
    return (
      <Screen>
        <Header title={t('company.title')} subtitle={user?.companyName ?? undefined} />
        <ChampionshipSwitch />
        {season?.status === 'registration' && user ? (
          <Section title={`${t('company.register')} · ${season.name}`} style={{ marginTop: 0 }}>
            <RegistrationWizard team={null} />
          </Section>
        ) : (
          <Empty text={season ? t('company.registerClosed') : t('company.noTeam')} icon="business-outline" />
        )}
      </Screen>
    );
  }
  // Inscription en cours (brouillon) ou à corriger : on continue l'assistant
  if (reqStatus === 'draft' || reqStatus === 'rejected') {
    return (
      <Screen>
        <Header title={t('company.title')} subtitle={myTeam.name} />
        <ChampionshipSwitch />
        <RequestStatusCard team={myTeam} />
        <Section title={t('company.register')}>
          <RegistrationWizard team={myTeam} />
        </Section>
      </Screen>
    );
  }
  // Demande envoyée : suivi de la vérification
  if (reqStatus === 'submitted') {
    return (
      <Screen>
        <Header title={t('company.title')} subtitle={season?.name} />
        <ChampionshipSwitch />
        <Card style={{ marginBottom: 12 }}>
          <Row>
            <TeamBadge team={myTeam} size={46} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={font.h3}>{myTeam.name}</Text>
              <Text style={font.small}>{myTeam.company}</Text>
            </View>
          </Row>
        </Card>
        <RequestStatusCard team={myTeam} />
        {todoSection}
        <View style={{ marginTop: 12 }}>{playersLink}</View>
      </Screen>
    );
  }
  return <CompanyHome todos={todos} now={now} />;
}

/** Données d'une équipe dans son championnat : classement, bilan, buteurs, effectif. */
function useTeamSeason(team: Team | undefined) {
  const { seasons, teamsAll, matchesAll, eventsAll, playersAll } = useApp();
  return useMemo(() => {
    if (!team) return null;
    const season = seasons.find((x) => x.id === team.seasonId);
    if (!season) return null;
    const teams = teamsAll.filter((x) => x.seasonId === season.id && teamRequestStatus(x) === 'approved');
    const matches = matchesAll.filter((m) => m.seasonId === season.id);
    const events = eventsAll.filter((e) => e.seasonId === season.id);
    const standings = computeStandings(season, teams, matches, true, events);
    const players = playersAll.filter((p) => p.seasonId === season.id && (isPlayerApproved(p) || p.status === 'removed'));
    const stats = computePlayerStats(season, players, matches, events);
    const teamStats = new Map([...stats].filter(([, x]) => x.teamId === team.id));
    const scorer = topScorers(teamStats)[0];
    const squad = players.filter((p) => p.teamId === team.id && isPlayerApproved(p)).sort((x, y) => x.name.localeCompare(y.name));
    const mine = matches.filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id);
    const row = standings.find((r) => r.teamId === team.id);
    const limit = season.yellowLimit ?? 3;
    const suspended = [...teamStats.values()].filter((x) => x.suspendedMatches > 0);
    const atRisk = [...teamStats.values()].filter((x) => x.suspendedMatches === 0 && limit > 1 && x.yellowAccum === limit - 1);
    return { season, standings, row, scorer, squad, stats, mine, suspended, atRisk, players };
  }, [team, seasons, teamsAll, matchesAll, eventsAll, playersAll]);
}

/**
 * « Mon équipe » d'une entreprise validée :
 * 1. une carte par championnat (classement, points, bilan, BP / BC, meilleur buteur) ;
 * 2. effectif et statistiques (bouton « Modifier l'effectif ») ;
 * 3. classement complet (boutons des championnats de l'entreprise) ;
 * puis sélections à venir et alertes.
 */
function CompanyHome({ todos, now }: { todos: import('@/domain/model').TodoItem[]; now: number }) {
  const { t, lang, user, myTeams, myTeam, matches } = useApp();
  const teams = myTeams.filter((x) => teamRequestStatus(x) === 'approved');
  const [squadTeamId, setSquadTeamId] = useState<string | null>(myTeam?.id ?? null);
  const [tableTeamId, setTableTeamId] = useState<string | null>(myTeam?.id ?? null);
  const squadTeam = teams.find((x) => x.id === squadTeamId) ?? teams[0];
  const tableTeam = teams.find((x) => x.id === tableTeamId) ?? teams[0];
  const sq = useTeamSeason(squadTeam);
  const tb = useTeamSeason(tableTeam);
  // Seule tâche gardée : pièces administratives à transmettre
  const docs = todos.filter((x) => x.kind === 'sendCollective');
  const switcher = (value: Team | undefined, set: (id: string) => void) =>
    teams.length > 1 && value ? (
      <View style={{ marginBottom: 10 }}>
        <Segmented scroll value={value.id} onChange={set} options={teams.map((x) => ({ value: x.id, label: champName(x.seasonId) }))} />
      </View>
    ) : null;
  const { seasons } = useApp();
  function champName(seasonId: string) {
    return seasons.find((x) => x.id === seasonId)?.name ?? '';
  }
  const upcoming = (sq?.mine ?? []).filter((m) => m.status === 'scheduled' || m.status === 'postponed').slice(0, 4);
  const playerName = (id: string) => sq?.players.find((p) => p.id === id)?.name ?? '—';

  return (
    <Screen>
      <Header title={t('tab.company')} subtitle={user?.companyName ?? undefined} />

      {docs.length ? (
        <View style={{ marginBottom: 12 }}>
          <TodoList items={docs} t={t} lang={lang} matches={matches} now={now} />
        </View>
      ) : null}

      {/* 1. Une carte par championnat */}
      {teams.map((team) => (
        <TeamSummary key={team.id} team={team} champ={champName(team.seasonId)} />
      ))}

      {/* 2. Effectif et statistiques */}
      <Section
        title={t('company.squad')}
        right={<Button small icon="create" label={t('company.editSquad')} onPress={() => router.push('/entreprise/joueurs')} />}
      >
        {switcher(squadTeam, setSquadTeamId)}
        <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          <Row style={{ backgroundColor: colors.cardAlt, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Text style={[font.tiny, { flex: 1, fontWeight: '700' }]}>{t('st.player')}</Text>
            {['MJ', '⚽', 'A', '🟨', '🟥'].map((h) => (
              <Text key={h} style={[font.tiny, { width: 32, textAlign: 'center', fontWeight: '700' }]}>
                {h}
              </Text>
            ))}
          </Row>
          {(sq?.squad ?? []).map((p) => {
            const st = sq?.stats.get(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/player/${p.id}`)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
                    {p.name}
                    {squadTeam?.captainId === p.id ? ' (C)' : ''}
                  </Text>
                  {st && st.suspendedMatches > 0 ? <Text style={{ color: colors.red, fontSize: 11, fontWeight: '700' }}>{t('st.suspended')}</Text> : null}
                </View>
                {[st?.played ?? 0, st?.goals ?? 0, st?.assists ?? 0, st?.yellows ?? 0, st?.reds ?? 0].map((v, i) => (
                  <Text key={i} style={{ width: 32, textAlign: 'center', color: v ? colors.text : colors.faint, fontWeight: '700' }}>
                    {v}
                  </Text>
                ))}
              </Pressable>
            );
          })}
          {!sq?.squad.length ? <Empty text={t('common.empty')} icon="people-outline" /> : null}
        </View>
      </Section>

      {/* 3. Classement complet */}
      <Section title={t('tab.standings')}>
        {switcher(tableTeam, setTableTeamId)}
        {tb?.standings.length ? <StandingsTable rows={tb.standings} /> : <Empty text={t('common.empty')} icon="trophy-outline" />}
      </Section>

      {upcoming.length && squadTeam ? (
        <Section title={t('company.upcoming')}>
          <Card style={{ paddingVertical: 4 }}>
            {upcoming.map((m, i) => (
              <SelectionRow key={m.id} match={m} team={squadTeam} first={i === 0} now={now} />
            ))}
          </Card>
        </Section>
      ) : null}

      {sq && (sq.suspended.length || sq.atRisk.length) ? (
        <Section title={t('company.alerts')}>
          <Card>
            {sq.suspended.map((x) => (
              <Row key={x.playerId} style={{ paddingVertical: 6 }}>
                <View style={{ width: 10, height: 14, borderRadius: 2, backgroundColor: colors.red, marginRight: 10 }} />
                <Text style={[font.body, { flex: 1, fontWeight: '700' }]}>{playerName(x.playerId)}</Text>
                <Pill label={t('st.suspendedFor', { n: x.suspendedMatches })} color={colors.red} bg={colors.liveSoft} />
              </Row>
            ))}
            {sq.atRisk.map((x) => (
              <Row key={x.playerId} style={{ paddingVertical: 6 }}>
                <View style={{ width: 10, height: 14, borderRadius: 2, backgroundColor: colors.yellow, marginRight: 10 }} />
                <Text style={[font.body, { flex: 1, fontWeight: '700' }]}>{playerName(x.playerId)}</Text>
                <Text style={[font.small, { color: colors.orange }]}>{t('company.atRisk', { n: x.yellowAccum })}</Text>
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

/** Carte d'une équipe dans un championnat : classement, points, bilan, BP / BC, meilleur buteur. */
function TeamSummary({ team, champ }: { team: Team; champ: string }) {
  const { t, services } = useApp();
  const d = useTeamSeason(team);
  const [editLogo, setEditLogo] = useState(false);
  const row = d?.row;
  const scorerName = d?.scorer ? d.players.find((p) => p.id === d.scorer!.playerId)?.name ?? '' : '';
  return (
    <Card style={{ borderColor: colors.accent, borderWidth: 1.5, marginBottom: 12 }} onPress={() => setEditLogo(!editLogo)}>
      <Text style={[font.tiny, { color: colors.accent, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8 }]}>{champ}</Text>
      <Row>
        <TeamBadge team={team} size={58} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={font.h2}>{team.name}</Text>
          <Text style={font.small}>{team.company}</Text>
          {row?.form.length ? (
            <View style={{ marginTop: 8 }}>
              <FormBadges form={row.form} />
            </View>
          ) : null}
        </View>
        {row ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: colors.accent, fontSize: 34, fontWeight: '900' }}>{row.position}</Text>
            <Text style={font.tiny}>{t('company.position')}</Text>
          </View>
        ) : null}
      </Row>
      {row ? (
        <View style={{ flexDirection: 'row', marginTop: 14, gap: 8 }}>
          <Tile label={t('st.pts')} value={row.points} />
          <Tile label={t('company.record')} value={`${row.won}-${row.drawn}-${row.lost}`} />
          <Tile label={t('company.goals')} value={`${row.goalsFor}/${row.goalsAgainst}`} />
          <Tile label={t('company.topScorer')} value={d?.scorer ? `${d.scorer.goals}` : '0'} sub={scorerName ? scorerName.split(' ')[0] : undefined} />
        </View>
      ) : null}
      {editLogo ? (
        <View style={{ marginTop: 10 }}>
          <LogoPicker
            value={team.logoUrl}
            color={team.color}
            short={team.shortName}
            onChange={(v) => {
              services.updateOwnTeam(team.id, { logoUrl: v }).catch(() => notify(t('common.error')));
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}

function SelectionRow({ match, team, first, now }: { match: Match; team: Team; first: boolean; now: number }) {
  const { t, lang, teamById } = useApp();
  const home = match.homeTeamId === team.id;
  const opp = teamById.get(home ? match.awayTeamId : match.homeTeamId);
  const lineup = (home ? match.homeLineup : match.awayLineup) ?? [];
  const open = canCompanyEditLineup(match, now);
  const dl = lineupDeadline(match);
  return (
    <Pressable
      onPress={() => router.push(`/entreprise/selection/${match.id}`)}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <TeamBadge team={opp} size={30} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
          {home ? '🏠 ' : '✈️ '}
          {opp?.name ?? '?'}
        </Text>
        <Text style={font.small}>
          {dayLabel(match.date, lang, t)} · {match.start}
        </Text>
        <Text style={[font.tiny, { color: open ? colors.accent : colors.muted }]}>
          {open ? t('company.deadline', { d: `${shortDate(toDateKey(new Date(dl)))} ${timeOf(dl)}` }) : t('company.locked')}
        </Text>
      </View>
      <Pill
        label={t('company.selected', { n: lineup.length })}
        color={lineup.length ? colors.success : open ? colors.orange : colors.muted}
        bg={lineup.length ? colors.successSoft : undefined}
      />
    </Pressable>
  );
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgElevated, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>{value}</Text>
      <Text style={[font.tiny, { textAlign: 'center' }]} numberOfLines={1}>
        {label}
      </Text>
      {sub ? (
        <Text style={[font.tiny, { color: colors.accent }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}
