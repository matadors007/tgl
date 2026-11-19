import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { stageLabel } from '@/ui/stage';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { isLive, liveMinuteLabel, sheetLineup, sortEvents, type Match, type Player, type Team } from '@/domain/model';
import { FacebookPlayer } from '@/ui/FacebookPlayer';
import { FullscreenVideo } from '@/ui/Fullscreen';
import { EventTimeline, MatchRow, StandingsTable, TeamBadge } from '@/ui/football';
import { dayLabel } from '@/ui/format';
import { Button, Card, Empty, LiveDot, Screen, Segmented } from '@/ui/kit';
import { colors, font } from '@/ui/theme';

type Tab = 'summary' | 'lineups' | 'video' | 'table' | 'h2h';

function MatchScreenInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, matches, events, teamById, playerById, standings, season, pitches, canOperate, followedMatchIds, toggleFollowMatch, isOperator } = useApp();
  const now = useNow(10_000);
  const match = matches.find((m) => m.id === id);
  const [tab, setTab] = useState<Tab>(match && isLive(match) && match.fbLiveUrl ? 'video' : 'summary');
  const hasVideoLive = !!match && isLive(match) && !!match.fbLiveUrl;
  useEffect(() => {
    if (hasVideoLive) setTab('video');
  }, [hasVideoLive]);
  const matchEvents = useMemo(() => sortEvents(events.filter((e) => e.matchId === id)), [events, id]);

  if (!match) return <Screen><Empty text={t('common.loading')} /></Screen>;
  const home = teamById.get(match.homeTeamId);
  const away = teamById.get(match.awayTeamId);
  const live = isLive(match);
  const played = live || match.status === 'finished';
  const pitch = pitches.find((p) => p.id === match.pitchId);
  const h2h = matches.filter(
    (m) =>
      m.id !== match.id &&
      m.status === 'finished' &&
      ((m.homeTeamId === match.homeTeamId && m.awayTeamId === match.awayTeamId) ||
        (m.homeTeamId === match.awayTeamId && m.awayTeamId === match.homeTeamId)),
  );

  return (
    <Screen edges={[]}>
      <Stack.Screen
        options={{
          title: stageLabel(match, t),
          // Suivre ce match : notifications buts, cartons, coup d'envoi… (comme Flashscore)
          headerRight: () => (isOperator ? null : (
            <Pressable onPress={() => toggleFollowMatch(match.id)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
              <Ionicons name={followedMatchIds.includes(match.id) ? 'star' : 'star-outline'} size={22} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: '800', marginLeft: 4, fontSize: 12 }}>
                {followedMatchIds.includes(match.id) ? t('match.following') : t('match.follow')}
              </Text>
            </Pressable>
          )),
        }}
      />
      {/* Tableau de score */}
      <Card style={{ paddingVertical: 18 }}>
        <Text style={[font.small, { textAlign: 'center', marginBottom: 12 }]}>
          {dayLabel(match.date, lang, t)} · {match.start}
          {pitch ? ` · ${pitch.name}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TeamSide team={home} />
          <View style={{ alignItems: 'center', minWidth: 110 }}>
            <Text style={{ color: live ? colors.live : colors.text, fontSize: 38, fontWeight: '900', letterSpacing: 2 }}>
              {played ? `${match.homeScore} - ${match.awayScore}` : '– : –'}
            </Text>
            {match.forfeit ? (
              <Text style={[font.small, { fontWeight: '800', color: colors.red }]}>
                {t('forfeit.declared', { team: (match.forfeit === 'home' ? home : away)?.name ?? '?' })}
              </Text>
            ) : null}
            {match.homePens != null && match.awayPens != null ? (
              <Text style={[font.small, { fontWeight: '800' }]}>{t('cup.pensShort', { h: match.homePens, a: match.awayPens })}</Text>
            ) : null}
            {live ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <LiveDot />
                <Text style={{ color: colors.live, fontWeight: '900' }}>{liveMinuteLabel(match, season?.halfMinutes ?? 25, now)}</Text>
              </View>
            ) : (
              <Text style={[font.small, { marginTop: 4, fontWeight: '700' }]}>{t(`match.${match.status}` as 'match.finished')}</Text>
            )}
          </View>
          <TeamSide team={away} />
        </View>
        {canOperate ? (
          <Button
            label={t('live.console')}
            icon="construct"
            small
            variant="secondary"
            style={{ marginTop: 16, alignSelf: 'center' }}
            onPress={() => router.push(`/admin/live/${match.id}`)}
          />
        ) : null}
      </Card>

      <View style={{ marginVertical: 12 }}>
        <Segmented<Tab>
          scroll
          value={tab}
          onChange={setTab}
          options={[
            { value: 'summary', label: t('match.summary') },
            { value: 'lineups', label: t('match.lineups') },
            { value: 'video', label: t('match.video'), badge: live && match.fbLiveUrl ? 1 : undefined },
            { value: 'table', label: t('match.table') },
            { value: 'h2h', label: t('match.h2h') },
          ]}
        />
      </View>

      {tab === 'summary' ? (
        matchEvents.length ? (
          <Card style={{ padding: 8 }}>
            <EventTimeline match={match} events={matchEvents} />
            {match.referee ? <Text style={[font.small, { marginTop: 10, textAlign: 'center' }]}>{t('match.referee')} : {match.referee}</Text> : null}
          </Card>
        ) : (
          <Empty text={t('match.noEvents')} />
        )
      ) : null}

      {tab === 'lineups' ? (
        match.sheet ? (
          // Feuille de match : titulaires, remplaçants, entraîneur ; arbitre sous la liste
          <View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Lineup team={home} {...sheetLineup(match.sheet.home)} coach={match.sheet.home.coach} captainId={match.sheet.home.captainId} playerById={playerById} />
              <Lineup team={away} {...sheetLineup(match.sheet.away)} coach={match.sheet.away.coach} captainId={match.sheet.away.captainId} playerById={playerById} />
            </View>
            <Card style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="flag" size={16} color={colors.accent} />
              <Text style={[font.body, { marginLeft: 8 }]}>
                {t('match.referee')} : <Text style={{ fontWeight: '800' }}>{match.sheet.referee || '—'}</Text>
              </Text>
            </Card>
          </View>
        ) : match.homeLineup.length || match.awayLineup.length ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Lineup team={home} starters={match.homeLineup} chosen={false} playerById={playerById} />
            <Lineup team={away} starters={match.awayLineup} chosen={false} playerById={playerById} />
          </View>
        ) : (
          <Empty text={t('match.noLineup')} icon="people-outline" />
        )
      ) : null}

      {tab === 'video' ? (
        match.fbLiveUrl ? (
          <View>
            <FullscreenVideo render={(fill) => <FacebookPlayer url={match.fbLiveUrl!} fill={fill} />} />
            {live ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
                <LiveDot />
                <Text style={{ color: colors.text, fontWeight: '800' }}>
                  {home?.shortName} {match.homeScore} - {match.awayScore} {away?.shortName} · {liveMinuteLabel(match, season?.halfMinutes ?? 25, now)}
                </Text>
              </View>
            ) : null}
            <Text style={[font.small, { textAlign: 'center', marginTop: 8 }]}>{t('match.videoHint')}</Text>
            <Button
              label={t('match.openFacebook')}
              icon="logo-facebook"
              variant="secondary"
              small
              style={{ marginTop: 10, alignSelf: 'center' }}
              onPress={() => Linking.openURL(match.fbLiveUrl!)}
            />
          </View>
        ) : (
          <Empty text={t('match.noVideo')} icon="videocam-off-outline" />
        )
      ) : null}

      {tab === 'table' ? <StandingsTable rows={standings} highlight={[match.homeTeamId, match.awayTeamId]} compact /> : null}

      {tab === 'h2h' ? (
        h2h.length ? (
          <View style={{ borderRadius: 12, overflow: 'hidden' }}>
            {h2h.map((m: Match) => (
              <MatchRow key={m.id} match={m} showDate />
            ))}
          </View>
        ) : (
          <Empty text={t('match.noH2h')} />
        )
      ) : null}
    </Screen>
  );
}

function TeamSide({ team }: { team?: Team }) {
  return (
    <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => team && router.push(`/team/${team.id}`)}>
      <TeamBadge team={team} size={54} />
      <Text style={[font.h3, { marginTop: 8, textAlign: 'center' }]} numberOfLines={2}>
        {team?.name ?? '—'}
      </Text>
    </Pressable>
  );
}

function Lineup({
  team,
  starters,
  subs = [],
  chosen,
  coach,
  captainId,
  playerById,
}: {
  team?: Team;
  starters: string[];
  subs?: string[];
  /** false : titulaires pas encore choisis (liste des joueurs présents). */
  chosen?: boolean;
  coach?: string | null;
  captainId?: string | null;
  playerById: Map<string, Player>;
}) {
  const { t } = useApp();
  const cap = captainId ?? team?.captainId;
  const rows = (ids: string[]) =>
    ids.map((pid) => {
      const p = playerById.get(pid);
      if (!p) return null;
      return (
        <Pressable key={pid} onPress={() => router.push(`/player/${pid}`)} style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ color: colors.accent, fontWeight: '800', width: 26 }}>{p.number}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[font.body, { fontSize: 13 }]} numberOfLines={1}>
              {p.name}
              {cap === p.id ? ' (C)' : ''}
            </Text>
            <Text style={font.tiny}>{t(`pos.${p.position}`)}</Text>
          </View>
        </Pressable>
      );
    });
  return (
    <Card style={{ flex: 1, padding: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <TeamBadge team={team} size={20} />
        <Text style={[font.h3, { marginLeft: 6, fontSize: 13, flex: 1 }]} numberOfLines={1}>
          {team?.shortName}
        </Text>
      </View>
      <Text style={[font.tiny, { fontWeight: '800', color: colors.accent, textTransform: 'uppercase', marginBottom: 2 }]}>{chosen === false ? t('match.players') : t('match.starters')}</Text>
      {rows(starters)}
      {subs.length ? (
        <>
          <Text style={[font.tiny, { fontWeight: '800', textTransform: 'uppercase', marginTop: 10, marginBottom: 2 }]}>{t('match.subs')}</Text>
          {rows(subs)}
        </>
      ) : null}
      {coach ? (
        <View style={{ marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={font.tiny}>{t('match.coach')}</Text>
          <Text style={[font.body, { fontSize: 13, fontWeight: '700' }]} numberOfLines={1}>
            {coach}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

export default function MatchScreen() {
  return (
    <>
      <MatchScreenInner />
    </>
  );
}
