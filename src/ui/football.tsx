import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp, useNow } from '../data/AppProvider';
import {
  isLive,
  matchWinner,
  liveMinuteLabel,
  scoringTeamId,
  type FormResult,
  type Match,
  type MatchEvent,
  type StandingRow,
  type Team,
} from '../domain/model';
import { dayLabel } from './format';
import { LiveDot } from './kit';
import { colors, font, radius, space, themedStyles } from './theme';

export function TeamBadge({ team, size = 26 }: { team?: Team | null; size?: number }) {
  const color = team?.color ?? colors.grey;
  if (team?.logoUrl)
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)' }}>
        <Image source={{ uri: team.logoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      </View>
    );
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.18)',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.34 }} numberOfLines={1}>
        {(team?.shortName ?? '?').slice(0, 3)}
      </Text>
    </View>
  );
}

/** Colonne gauche d'une ligne de match : heure, minute live ou statut. */
export function MatchClock({ match }: { match: Match }) {
  const { season, t } = useApp();
  const now = useNow(10_000);
  if (isLive(match)) {
    return (
      <View style={{ alignItems: 'center' }}>
        <Text style={[styles.clockLive]}>{liveMinuteLabel(match, season?.halfMinutes ?? 25, now)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
          <LiveDot />
          <Text style={[font.tiny, { color: colors.live, fontWeight: '800' }]}>LIVE</Text>
        </View>
      </View>
    );
  }
  if (match.status === 'finished') return <Text style={styles.clockMuted}>{t('match.finished')}</Text>;
  if (match.status === 'postponed') return <Text style={[styles.clockMuted, { color: colors.orange }]}>{t('match.postponed')}</Text>;
  return <Text style={styles.clock}>{match.start}</Text>;
}

/** Ligne de match style Flashscore. */
export function MatchRow({ match, showDate, onPress }: { match: Match; showDate?: boolean; onPress?: () => void }) {
  const { teamById, lang, t, followedMatchIds, toggleFollowMatch, followedTeamIds, isCompany, myTeams, isOperator } = useApp();
  const mine = isCompany && myTeams.some((x) => x.id === match.homeTeamId || x.id === match.awayTeamId);
  const fav = followedMatchIds.includes(match.id);
  const teamFav = followedTeamIds.includes(match.homeTeamId) || followedTeamIds.includes(match.awayTeamId);
  const home = teamById.get(match.homeTeamId);
  const away = teamById.get(match.awayTeamId);
  const live = isLive(match);
  const played = live || match.status === 'finished';
  const winner = matchWinner(match);
  const homeWin = winner === match.homeTeamId;
  const awayWin = winner === match.awayTeamId;
  const pens = match.homePens != null && match.awayPens != null;
  return (
    <Pressable
      onPress={onPress ?? (() => router.push(`/match/${match.id}`))}
      style={({ pressed }) => [styles.row, mine && { backgroundColor: colors.accentSoft }, live && styles.rowLive, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.clockCol}>
        {showDate && !live ? <Text style={[font.tiny, { marginBottom: 2 }]}>{dayLabel(match.date, lang, t)}</Text> : null}
        <MatchClock match={match} />
        {match.forfeit ? <Text style={[font.tiny, { color: colors.red, fontWeight: '800', marginTop: 2 }]}>{t('forfeit.short')}</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <TeamLine team={home} bold={homeWin} />
        <View style={{ height: 6 }} />
        <TeamLine team={away} bold={awayWin} />
      </View>
      <View style={styles.scoreCol}>
        <Text style={[styles.score, live && { color: colors.live }, homeWin && { color: colors.text }]}>
          {played ? match.homeScore : '-'}
          {pens ? <Text style={font.tiny}> ({match.homePens})</Text> : null}
        </Text>
        <View style={{ height: 6 }} />
        <Text style={[styles.score, live && { color: colors.live }, awayWin && { color: colors.text }]}>
          {played ? match.awayScore : '-'}
          {pens ? <Text style={font.tiny}> ({match.awayPens})</Text> : null}
        </Text>
      </View>
      {/* Favori : notifications de ce match (buts, cartons, coup d'envoi, fin) — pas pour l'opérateur */}
      {isOperator ? null : (
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          toggleFollowMatch(match.id);
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={fav ? t('match.removeFav') : t('match.addFav')}
        style={{ paddingLeft: 12, paddingVertical: 6, justifyContent: 'center' }}
      >
        <Ionicons name={fav ? 'star' : 'star-outline'} size={20} color={fav || teamFav ? colors.accent : colors.faint} />
      </Pressable>
      )}
    </Pressable>
  );
}

function TeamLine({ team, bold }: { team?: Team; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TeamBadge team={team} size={20} />
      <Text style={[styles.teamName, bold && { fontWeight: '800', color: colors.text }]} numberOfLines={1}>
        {team?.name ?? '—'}
      </Text>
    </View>
  );
}

export function FormBadges({ form }: { form: FormResult[] }) {
  const c: Record<FormResult, string> = { W: colors.success, D: colors.grey, L: colors.red };
  const { lang } = useApp();
  const l: Record<FormResult, string> = lang === 'fr' ? { W: 'V', D: 'N', L: 'D' } : { W: 'W', D: 'D', L: 'L' };
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {form.map((f, i) => (
        <View key={i} style={[styles.form, { backgroundColor: c[f] }]}>
          <Text style={styles.formText}>{l[f]}</Text>
        </View>
      ))}
    </View>
  );
}

/** Tableau de classement. `highlight` : équipes à surligner (page match). */
export function StandingsTable({ rows, highlight = [], compact }: { rows: StandingRow[]; highlight?: string[]; compact?: boolean }) {
  const { teamById, t, isCompany, myTeams } = useApp();
  // Entreprise : son équipe est toujours surlignée
  if (isCompany) highlight = [...highlight, ...myTeams.map((x) => x.id)];
  return (
    <View style={styles.table}>
      <View style={[styles.tr, styles.th]}>
        <Text style={[styles.cPos, styles.thText]}>#</Text>
        <Text style={[styles.cTeam, styles.thText]}>{t('st.team')}</Text>
        <Text style={[styles.cNum, styles.thText]}>{t('st.p')}</Text>
        {!compact && <Text style={[styles.cNum, styles.thText]}>{t('st.w')}</Text>}
        {!compact && <Text style={[styles.cNum, styles.thText]}>{t('st.d')}</Text>}
        {!compact && <Text style={[styles.cNum, styles.thText]}>{t('st.l')}</Text>}
        <Text style={[styles.cGd, styles.thText]}>{t('st.gd')}</Text>
        <Text style={[styles.cPts, styles.thText]}>{t('st.pts')}</Text>
      </View>
      {rows.map((r) => {
        const team = teamById.get(r.teamId);
        const hl = highlight.includes(r.teamId);
        return (
          <Pressable
            key={r.teamId}
            onPress={() => router.push(`/team/${r.teamId}`)}
            style={[styles.tr, hl && { backgroundColor: colors.accentSoft }]}
          >
            <View style={[styles.cPos, { flexDirection: 'row', alignItems: 'center' }]}>
              <Text style={[styles.posText, r.position <= 3 && { color: colors.accent }]}>{r.position}</Text>
              {r.liveMove !== 0 ? (
                <Ionicons
                  name={r.liveMove > 0 ? 'caret-up' : 'caret-down'}
                  size={10}
                  color={r.liveMove > 0 ? colors.accent : colors.red}
                />
              ) : null}
            </View>
            <View style={[styles.cTeam, { flexDirection: 'row', alignItems: 'center' }]}>
              <TeamBadge team={team} size={20} />
              <Text style={[styles.tdTeam]} numberOfLines={1}>
                {team?.name ?? '—'}
              </Text>
              {r.live ? (
                <View style={styles.liveTag}>
                  <Text style={styles.liveTagText}>LIVE</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.cNum, styles.td]}>{r.played}</Text>
            {!compact && <Text style={[styles.cNum, styles.td]}>{r.won}</Text>}
            {!compact && <Text style={[styles.cNum, styles.td]}>{r.drawn}</Text>}
            {!compact && <Text style={[styles.cNum, styles.td]}>{r.lost}</Text>}
            <Text style={[styles.cGd, styles.td]}>{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</Text>
            <Text style={[styles.cPts, styles.td, { fontWeight: '900', color: colors.text }]}>{r.points}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EventIcon({ type, size = 16 }: { type: MatchEvent['type']; size?: number }) {
  if (type === 'yellow' || type === 'red')
    return (
      <View
        style={{
          width: size * 0.7,
          height: size,
          borderRadius: 2,
          backgroundColor: type === 'yellow' ? colors.yellow : colors.red,
        }}
      />
    );
  if (type === 'sub') return <Ionicons name="swap-horizontal" size={size} color={colors.blue} />;
  return <Ionicons name="football" size={size} color={type === 'own_goal' ? colors.red : colors.text} />;
}

/** Chronologie d'un match : événements de l'équipe à domicile à gauche, extérieur à droite. */
export function EventTimeline({
  match,
  events,
  onLongPress,
}: {
  match: Match;
  events: MatchEvent[];
  onLongPress?: (e: MatchEvent) => void;
}) {
  const { playerById, t } = useApp();
  const firstHalf = events.filter((e) => e.half === 1);
  const secondHalf = events.filter((e) => e.half === 2);
  const htScore = firstHalf.reduce(
    (acc, e) => {
      if (e.type === 'goal' || e.type === 'penalty_goal' || e.type === 'own_goal') {
        if (scoringTeamId(e, match) === match.homeTeamId) acc[0]++;
        else acc[1]++;
      }
      return acc;
    },
    [0, 0],
  );
  const renderEv = (e: MatchEvent) => {
    const home = e.teamId === match.homeTeamId;
    const p = e.coach ? ({ name: `${t('live.coach')} ${e.personName ?? ''}`.trim() } as { name: string }) : playerById.get(e.playerId);
    let detail = '';
    if (e.type === 'goal' && e.assistId) detail = `${t('match.assist')} : ${playerById.get(e.assistId)?.name ?? ''}`;
    if (e.type === 'penalty_goal') detail = t('match.penalty');
    if (e.type === 'own_goal') detail = t('match.ownGoal');
    if (e.type === 'sub') detail = `↑ ${playerById.get(e.playerInId ?? '')?.name ?? ''}`;
    if (e.type === 'red' && e.secondYellow) detail = '2 × 🟨';
    return (
      <Pressable
        key={e.id}
        onLongPress={onLongPress ? () => onLongPress(e) : undefined}
        style={[styles.evRow, { flexDirection: home ? 'row' : 'row-reverse' }]}
      >
        <Text style={styles.evMin}>{e.minute}'</Text>
        <View style={{ marginHorizontal: 8 }}>
          <EventIcon type={e.type} />
        </View>
        <View style={{ flexShrink: 1, alignItems: home ? 'flex-start' : 'flex-end' }}>
          <Text style={[font.body, { fontWeight: '600' }]} numberOfLines={1}>
            {e.type === 'sub' ? `↓ ${p?.name ?? ''}` : p?.name ?? '—'}
          </Text>
          {detail ? <Text style={font.small}>{detail}</Text> : null}
        </View>
      </Pressable>
    );
  };
  return (
    <View>
      <View style={styles.halfHead}>
        <Text style={styles.halfText}>{t('match.first_half')}</Text>
        {match.status !== 'first_half' && match.status !== 'scheduled' ? (
          <Text style={styles.halfText}>
            {htScore[0]} - {htScore[1]}
          </Text>
        ) : null}
      </View>
      {firstHalf.map(renderEv)}
      {secondHalf.length || match.status === 'second_half' || match.status === 'finished' ? (
        <>
          <View style={styles.halfHead}>
            <Text style={styles.halfText}>{t('match.second_half')}</Text>
          </View>
          {secondHalf.map(renderEv)}
        </>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLive: { borderLeftWidth: 3, borderLeftColor: colors.live },
  clockCol: { width: 62, alignItems: 'center', marginRight: 8 },
  clock: { color: colors.text, fontWeight: '700', fontSize: 13 },
  clockMuted: { color: colors.muted, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  clockLive: { color: colors.live, fontWeight: '900', fontSize: 14 },
  teamName: { color: colors.muted, fontSize: 14, marginLeft: 8, flexShrink: 1, fontWeight: '600' },
  scoreCol: { width: 30, alignItems: 'flex-end' },
  score: { color: colors.muted, fontWeight: '900', fontSize: 15 },
  form: { width: 16, height: 16, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  formText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  table: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { backgroundColor: colors.cardAlt, paddingVertical: 7 },
  thText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  cPos: { width: 30 },
  cTeam: { flex: 1, minWidth: 0 },
  cNum: { width: 24, textAlign: 'center' },
  cGd: { width: 34, textAlign: 'center' },
  cPts: { width: 30, textAlign: 'center' },
  td: { color: colors.muted, fontSize: 13 },
  tdTeam: { color: colors.text, fontSize: 13, marginLeft: 8, fontWeight: '600', flexShrink: 1 },
  posText: { color: colors.muted, fontWeight: '800', fontSize: 13, marginRight: 2 },
  liveTag: { backgroundColor: colors.live, borderRadius: 3, paddingHorizontal: 3, marginLeft: 5 },
  liveTagText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  evRow: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  evMin: { color: colors.muted, fontWeight: '800', width: 34, textAlign: 'center' },
  halfHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.cardAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  halfText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  }),
);
