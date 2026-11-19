import { useMatchSheet } from '@/print/useMatchSheet';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Guard } from '@/ui/Guard';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { AppError } from '@/data/services';
import {
  coachPlayerId,
  sheetReady,
  startersReady,
  matchPlannedAt,
  currentMinute,
  isFacebookUrl,
  isLive,
  liveMinuteLabel,
  sortEvents,
  type EventType,
  type Match,
  type MatchEvent,
  type Player,
  type Team,
} from '@/domain/model';
import { pitchSchedule } from '@/domain/model';
import { ask, notify } from '@/ui/dialogs';
import { EventIcon, TeamBadge } from '@/ui/football';
import { Button, Card, ChoiceGrid, Empty, Field, LiveDot, Row, Screen, Section, Segmented, Sheet } from '@/ui/kit';
import { DateField, TimeChips } from '@/ui/datepicker';
import { colors, font, radius } from '@/ui/theme';
import { MatchSheetPanel, StartersPicker } from '@/ui/matchSheet';
import { CONSOLE_OPEN_BEFORE_MS } from '@/ui/operator';

type GoalKind = 'goal' | 'penalty_goal' | 'own_goal';
type Flow =
  | { kind: 'goal'; teamId: string; step: 'scorer' | 'assist'; goalKind: GoalKind; scorerId?: string }
  | { kind: 'card'; step: 'team' | 'player' | 'color'; teamId?: string; playerId?: string; coach?: string }
  | { kind: 'sub'; step: 'team' | 'out' | 'in'; teamId?: string; outId?: string };

function LiveConsole() {
  const printSheet = useMatchSheet();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, matches, events, teamById, players, season, services, pitches, config, notifier, can } = useApp();
  const [tab, setTab] = useState<'sheet' | 'live'>(can('matches.live') ? 'live' : 'sheet');
  const now = useNow(5_000);
  const match = matches.find((m) => m.id === id);
  const matchEvents = useMemo(() => sortEvents(events.filter((e) => e.matchId === id)), [events, id]);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [minute, setMinute] = useState(1);
  const [busy, setBusy] = useState(false);
  const [fbUrl, setFbUrl] = useState('');
  const [referee, setReferee] = useState('');
  const [resched, setResched] = useState(false);
  const [rDate, setRDate] = useState('');
  const [rTime, setRTime] = useState('');
  const [rPitch, setRPitch] = useState('');

  useEffect(() => {
    if (match) {
      setFbUrl(match.fbLiveUrl ?? '');
      setReferee(match.referee ?? '');
      setRDate(match.date);
      setRTime(match.start);
      setRPitch(match.pitchId ?? pitches[0]?.id ?? '');
      // Feuille de match pas encore remplie : on commence par elle
      if (!sheetReady(match) && match.status === 'scheduled' && can('matches.sheet')) setTab('sheet');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id]);

  if (!match || !season) return <Screen><Empty text={t('common.loading')} /></Screen>;
  const home = teamById.get(match.homeTeamId)!;
  const away = teamById.get(match.awayTeamId)!;
  const live = isLive(match);
  const half = season.halfMinutes;

  const squad = (teamId: string) => players.filter((p) => p.teamId === teamId);
  const lineupOf = (teamId: string) => (teamId === match.homeTeamId ? match.homeLineup : match.awayLineup);
  /** Joueurs sélectionnables : ceux de la feuille de match, sinon tout l'effectif. */
  const onSheet = (teamId: string) => {
    const ids = lineupOf(teamId);
    const list = squad(teamId);
    return ids.length ? list.filter((p) => ids.includes(p.id)) : list;
  };
  const other = (teamId: string) => (teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId);
  const sentOff = new Set(matchEvents.filter((e) => e.type === 'red').map((e) => e.playerId));

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const open = (f: Flow) => {
    setMinute(currentMinute(match, half, Date.now()).minute);
    setFlow(f);
  };

  const record = async (type: EventType, teamId: string, playerId: string, extra: Partial<MatchEvent> = {}) => {
    const h: 1 | 2 =
      match.status === 'second_half' ? 2 : match.status === 'first_half' || match.status === 'half_time' ? 1 : minute > half ? 2 : 1;
    setFlow(null);
    await guard(async () => {
      const res = await services.addEvent(match, matchEvents, { type, teamId, playerId, minute, half: h, assistId: null, ...extra });
      const pname = (id?: string | null) => (id && id === playerId && extra.coach ? `${t('live.coach')} ${extra.personName ?? ''}`.trim() : players.find((x) => x.id === id)?.name);
      const base = { match, home, away, homeScore: res.homeScore, awayScore: res.awayScore, minute, playerName: pname(playerId), teamName: teamById.get(teamId)?.name };
      if (type === 'goal' || type === 'penalty_goal' || type === 'own_goal')
        notifier.matchEvent('goal', { ...base, assistName: pname(extra.assistId ?? null) });
      else if (type === 'yellow') notifier.matchEvent(res.autoRed ? 'red' : 'yellow', base);
      else if (type === 'red') notifier.matchEvent('red', base);
      if (res.autoRed) notify(t('live.autoRed'));
    });
  };

  const phase = async () => {
    if (match.status === 'scheduled' || match.status === 'postponed') {
      // Coup d'envoi impossible tant que la feuille de match n'est pas remplie
      if (!sheetReady(match)) {
        notify(t('err.sheetMissing'));
        if (can('matches.sheet')) setTab('sheet');
        return;
      }
      if (!startersReady(match)) return notify(t('err.startersMissing'));
      // Coup d'envoi possible au plus tôt 5 minutes avant l'heure du match
      if (Date.now() < matchPlannedAt(match) - CONSOLE_OPEN_BEFORE_MS)
        return notify(t('op.tooEarly', { h: new Date(matchPlannedAt(match) - CONSOLE_OPEN_BEFORE_MS).toTimeString().slice(0, 5) }));
      return guard(async () => {
        await services.startMatch(match, season);
        notifier.matchEvent('kickoff', { match, home, away });
      });
    }
    if (match.status === 'first_half')
      return guard(async () => {
        await services.halfTime(match);
        notifier.matchEvent('halftime', { match, home, away });
      });
    if (match.status === 'half_time')
      return guard(async () => {
        await services.startSecondHalf(match);
        notifier.matchEvent('second_half', { match, home, away });
      });
    if (match.status === 'second_half') {
      if (await ask(t('live.finish'), t('live.confirmFinish'), t('common.confirm'), t('common.cancel')))
        return guard(async () => {
          await services.finishMatch(match);
          notifier.matchEvent('fulltime', { match, home, away });
        });
      return;
    }
    if (match.status === 'finished') return guard(() => services.reopenMatch(match));
  };
  const phaseLabel: Record<Match['status'], string> = {
    scheduled: t('live.start'),
    postponed: t('live.start'),
    first_half: t('live.halfTime'),
    half_time: t('live.secondHalf'),
    second_half: t('live.finish'),
    finished: t('live.reopen'),
  };

  const removeEvent = async (e: MatchEvent) => {
    if (await ask(t('common.delete'), t('live.deleteEvent'), t('common.delete'), t('common.cancel')))
      guard(() => services.deleteEvent(match, matchEvents, e));
  };
  const undo = () => {
    const last = [...matchEvents].sort((a, b) => b.createdAt - a.createdAt).find((e) => !e.secondYellow);
    if (last) removeEvent(last);
  };

  const coachOf = (teamId: string) => {
    const side = teamId === match.homeTeamId ? match.sheet?.home : match.sheet?.away;
    return side?.coach || teamById.get(teamId)?.coach?.name || '';
  };

  const saveInfo = () => {
    if (fbUrl && !isFacebookUrl(fbUrl)) return notify(t('live.fbInvalid'));
    guard(() => services.updateMatch(match.id, { fbLiveUrl: fbUrl.trim() || null, referee: referee.trim() || null }));
  };

  const pName = (p: Player) => `${p.number}. ${p.name}`;
  const canEvent = live || match.status === 'finished';

  return (
    <Screen edges={[]}>
      {can('matches.sheet') && can('matches.live') ? (
        <View style={{ marginBottom: 12 }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'sheet', label: `${sheetReady(match) ? '✓ ' : ''}${t('msheet.title')}` },
              { value: 'live', label: t('msheet.live') },
            ]}
          />
        </View>
      ) : null}
      {tab === 'sheet' ? <MatchSheetPanel match={match} home={home} away={away} events={matchEvents} /> : null}
      {tab === 'live' ? (
      <>
      {!sheetReady(match) && (match.status === 'scheduled' || match.status === 'postponed') ? (
        <Card style={{ borderColor: colors.orange, marginBottom: 12 }}>
          <Text style={{ color: colors.orange, fontWeight: '800' }}>{t('err.sheetMissing')}</Text>
        </Card>
      ) : null}
      {/* Avant le coup d'envoi : titulaires / remplaçants parmi les joueurs présents sur la feuille */}
      {sheetReady(match) && (match.status === 'scheduled' || match.status === 'postponed') && (can('matches.sheet') || can('matches.live')) ? (
        <StartersPicker match={match} home={home} away={away} />
      ) : null}
      {/* Score */}
      <Card style={{ paddingVertical: 16 }}>
        <Row>
          <SideName team={home} />
          <View style={{ alignItems: 'center', minWidth: 110 }}>
            <Text style={{ color: live ? colors.live : colors.text, fontSize: 40, fontWeight: '900' }}>
              {match.homeScore} - {match.awayScore}
            </Text>
            {live ? (
              <Row>
                <LiveDot />
                <Text style={{ color: colors.live, fontWeight: '900' }}>{liveMinuteLabel(match, half, now)}</Text>
              </Row>
            ) : (
              <Text style={[font.small, { fontWeight: '700' }]}>{t(`match.${match.status}` as 'match.finished')}</Text>
            )}
          </View>
          <SideName team={away} />
        </Row>
        <Button
          label={phaseLabel[match.status]}
          icon={match.status === 'second_half' ? 'flag' : match.status === 'finished' ? 'refresh' : 'play'}
          variant={match.status === 'second_half' ? 'danger' : match.status === 'finished' ? 'ghost' : 'primary'}
          style={{ marginTop: 14 }}
          loading={busy}
          onPress={phase}
        />
      </Card>

      {/* Tournoi : tirs au but si le match à élimination se termine sur un nul */}
      {match.stage === 'ko' && match.status === 'finished' && match.homeScore === match.awayScore ? (
        <PenaltiesCard match={match} home={home} away={away} />
      ) : null}

      {/* Actions rapides */}
      {canEvent ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Row style={{ gap: 8 }}>
            <BigAction label={`${t('live.goal')} ${home.shortName}`} icon="football" color={colors.accent} onPress={() => open({ kind: 'goal', teamId: home.id, step: 'scorer', goalKind: 'goal' })} />
            <BigAction label={`${t('live.goal')} ${away.shortName}`} icon="football" color={colors.accent} onPress={() => open({ kind: 'goal', teamId: away.id, step: 'scorer', goalKind: 'goal' })} />
          </Row>
          <Row style={{ gap: 8 }}>
            <BigAction label={t('live.card')} icon={<CardsIcon />} color={colors.yellow} onPress={() => open({ kind: 'card', step: 'team' })} />
            <BigAction label={t('live.sub')} icon="swap-horizontal" color={colors.blue} onPress={() => open({ kind: 'sub', step: 'team' })} />
          </Row>
          {matchEvents.length ? <Button label={t('live.undo')} icon="arrow-undo" variant="ghost" small onPress={undo} /> : null}
        </View>
      ) : null}

      {/* Événements */}
      <Section title={t('live.events')}>
        {!matchEvents.length ? <Empty text={t('match.noEvents')} /> : null}
        {matchEvents.map((e) => {
          const p = players.find((x) => x.id === e.playerId);
          const a = e.assistId ? players.find((x) => x.id === e.assistId) : undefined;
          const tm = teamById.get(e.teamId);
          return (
            <Row key={e.id} style={{ backgroundColor: colors.card, borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.muted, fontWeight: '800', width: 36 }}>{e.minute}'</Text>
              <EventIcon type={e.type} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
                  {e.coach ? `${t('live.coach')} ${e.personName ?? ''}` : p?.name ?? '—'} <Text style={font.small}>({tm?.shortName})</Text>
                </Text>
                {a ? <Text style={font.small}>{t('match.assist')} : {a.name}</Text> : null}
                {e.type === 'own_goal' ? <Text style={font.small}>{t('live.ownGoal')}</Text> : null}
                {e.type === 'penalty_goal' ? <Text style={font.small}>{t('live.penalty')}</Text> : null}
                {e.type === 'sub' ? <Text style={font.small}>↑ {players.find((x) => x.id === e.playerInId)?.name}</Text> : null}
              </View>
              {!e.secondYellow ? (
                <Pressable onPress={() => removeEvent(e)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={18} color={colors.red} />
                </Pressable>
              ) : null}
            </Row>
          );
        })}
      </Section>

      {can('matches.live') ? (
        <>

      {/* Infos du match */}
      <Section title={t('match.video')}>
        <Card>
          <Field label={t('live.fbUrl')} value={fbUrl} onChangeText={setFbUrl} autoCapitalize="none" placeholder="https://www.facebook.com/…/videos/…" />
          <Text style={[font.tiny, { marginTop: -6, marginBottom: 12 }]}>{t('live.fbHint')}</Text>
          <Button label={t('common.save')} icon="save" variant="secondary" onPress={saveInfo} loading={busy} />
        </Card>
      </Section>

      {can('matches.calendar') && (match.status === 'scheduled' || match.status === 'postponed') ? (
        <Section>
          <Row style={{ gap: 8 }}>
            <Button label={t('live.reschedule')} icon="calendar" variant="secondary" style={{ flex: 1 }} onPress={() => setResched(true)} />
            {match.status === 'scheduled' ? (
              <Button label={t('live.postpone')} icon="pause" variant="ghost" style={{ flex: 1 }} onPress={() =>
                  guard(async () => {
                    await services.postponeMatch(match);
                    notifier.matchEvent('postponed', { match, home, away });
                  })
                } />
            ) : null}
          </Row>
        </Section>
      ) : null}

        </>
      ) : null}
      </>
      ) : null}

      {/* Feuilles de saisie */}
      <Sheet visible={!!flow} onClose={() => setFlow(null)} title={flowTitle(flow, t)}>
        {flow ? (
          <View>
            <MinutePicker value={minute} onChange={setMinute} label={t('live.minute')} />

            {flow.kind === 'goal' && flow.step === 'scorer' ? (
              <>
                <Segmented<GoalKind>
                  value={flow.goalKind}
                  onChange={(g) => setFlow({ ...flow, goalKind: g })}
                  options={[
                    { value: 'goal', label: t('live.normal') },
                    { value: 'penalty_goal', label: t('live.penalty') },
                    { value: 'own_goal', label: t('live.ownGoal') },
                  ]}
                />
                <Text style={[font.small, { marginVertical: 10 }]}>{t('live.chooseScorer')}</Text>
                <ChoiceGrid
                  items={onSheet(flow.goalKind === 'own_goal' ? other(flow.teamId) : flow.teamId)}
                  keyOf={(p) => p.id}
                  labelOf={pName}
                  onPick={(p) => {
                    if (flow.goalKind === 'goal') setFlow({ ...flow, step: 'assist', scorerId: p.id });
                    else record(flow.goalKind, p.teamId, p.id);
                  }}
                />
              </>
            ) : null}

            {flow.kind === 'goal' && flow.step === 'assist' ? (
              <>
                <Text style={[font.small, { marginBottom: 10 }]}>{t('live.chooseAssist')}</Text>
                <Button label={t('live.noAssist')} variant="secondary" small style={{ marginBottom: 10 }} onPress={() => record('goal', flow.teamId, flow.scorerId!)} />
                <ChoiceGrid
                  items={onSheet(flow.teamId).filter((p) => p.id !== flow.scorerId)}
                  keyOf={(p) => p.id}
                  labelOf={pName}
                  onPick={(p) => record('goal', flow.teamId, flow.scorerId!, { assistId: p.id })}
                />
              </>
            ) : null}

            {(flow.kind === 'card' || flow.kind === 'sub') && flow.step === 'team' ? (
              <Row style={{ gap: 8 }}>
                {[home, away].map((tm) => (
                  <Pressable
                    key={tm.id}
                    onPress={() => setFlow(flow.kind === 'card' ? { ...flow, step: 'player', teamId: tm.id } : { ...flow, step: 'out', teamId: tm.id })}
                    style={{ flex: 1, alignItems: 'center', padding: 16, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}
                  >
                    <TeamBadge team={tm} size={44} />
                    <Text style={[font.h3, { marginTop: 8, textAlign: 'center' }]}>{tm.name}</Text>
                  </Pressable>
                ))}
              </Row>
            ) : null}

            {flow.kind === 'card' && flow.step === 'player' && flow.teamId ? (
              <>
                <Text style={[font.small, { marginBottom: 10 }]}>{t('live.choosePlayer')}</Text>
                {/* Carton à l'entraîneur */}
                <Pressable
                  disabled={sentOff.has(coachPlayerId(flow.teamId))}
                  onPress={() => setFlow({ ...flow, step: 'color', playerId: coachPlayerId(flow.teamId!), coach: coachOf(flow.teamId!) })}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft, opacity: sentOff.has(coachPlayerId(flow.teamId)) ? 0.4 : 1 }}
                >
                  <Ionicons name="clipboard" size={18} color={colors.accent} />
                  <Text style={[font.body, { marginLeft: 8, fontWeight: '800', flex: 1 }]}>
                    {t('live.coach')}
                    {coachOf(flow.teamId) ? ` · ${coachOf(flow.teamId)}` : ''}
                  </Text>
                  <Text style={font.small}>{'🟨'.repeat(matchEvents.filter((e) => e.type === 'yellow' && e.playerId === coachPlayerId(flow.teamId!)).length)}</Text>
                </Pressable>
                <ChoiceGrid
                  items={onSheet(flow.teamId)}
                  keyOf={(p) => p.id}
                  labelOf={pName}
                  disabledOf={(p) => sentOff.has(p.id)}
                  sublabelOf={(p) => {
                    const y = matchEvents.filter((e) => e.type === 'yellow' && e.playerId === p.id).length;
                    return y ? '🟨'.repeat(y) : undefined;
                  }}
                  onPick={(p) => setFlow({ ...flow, step: 'color', playerId: p.id })}
                />
              </>
            ) : null}

            {flow.kind === 'card' && flow.step === 'color' && flow.teamId && flow.playerId ? (
              <Row style={{ gap: 10 }}>
                <Pressable onPress={() => record('yellow', flow.teamId!, flow.playerId!, flow.coach !== undefined ? { coach: true, personName: flow.coach || null } : {})} style={[cardBtn, { backgroundColor: colors.yellow }]}>
                  <Text style={{ fontWeight: '900', color: '#111', fontSize: 16 }}>{t('live.yellow')}</Text>
                </Pressable>
                <Pressable onPress={() => record('red', flow.teamId!, flow.playerId!, flow.coach !== undefined ? { coach: true, personName: flow.coach || null } : {})} style={[cardBtn, { backgroundColor: colors.red }]}>
                  <Text style={{ fontWeight: '900', color: '#fff', fontSize: 16 }}>{t('live.red')}</Text>
                </Pressable>
              </Row>
            ) : null}

            {flow.kind === 'sub' && flow.step === 'out' && flow.teamId ? (
              <>
                <Text style={[font.small, { marginBottom: 10 }]}>{t('live.playerOut')}</Text>
                <ChoiceGrid items={onSheet(flow.teamId)} keyOf={(p) => p.id} labelOf={pName} onPick={(p) => setFlow({ ...flow, step: 'in', outId: p.id })} />
              </>
            ) : null}
            {flow.kind === 'sub' && flow.step === 'in' && flow.teamId && flow.outId ? (
              <>
                <Text style={[font.small, { marginBottom: 10 }]}>{t('live.playerIn')}</Text>
                <ChoiceGrid
                  items={squad(flow.teamId).filter((p) => p.id !== flow.outId)}
                  keyOf={(p) => p.id}
                  labelOf={pName}
                  onPick={(p) => record('sub', flow.teamId!, flow.outId!, { playerInId: p.id })}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={resched} onClose={() => setResched(false)} title={t('live.reschedule')}>
        <DateField label={t('season.startDate')} value={rDate} onChange={setRDate} />
        <Text style={[font.small, { marginBottom: 6 }]}>{t('match.pitch')}</Text>
        <Segmented scroll value={rPitch} onChange={setRPitch} options={pitches.map((p) => ({ value: p.id, label: p.name }))} />
        <Text style={[font.small, { marginTop: 12, marginBottom: 6 }]}>{t('season.startTime')}</Text>
        <TimeChips
          value={rTime}
          onChange={setRTime}
          options={pitchSchedule(config, pitches.find((p) => p.id === rPitch), /^\d{4}-\d{2}-\d{2}$/.test(rDate) ? rDate : undefined).starts}
        />
        <Button
          label={t('common.save')}
          icon="save"
          style={{ marginTop: 16 }}
          loading={busy}
          onPress={() => {
            const pitch = pitches.find((p) => p.id === rPitch);
            if (!pitch || !/^\d{4}-\d{2}-\d{2}$/.test(rDate) || !/^\d{2}:\d{2}$/.test(rTime)) return notify(t('common.error'));
            setResched(false);
            guard(async () => {
              await services.rescheduleMatch(match, rDate, rTime, pitch, config.slotMinutes);
              notifier.matchEvent('rescheduled', { match: { ...match, date: rDate, start: rTime }, home, away });
            });
          }}
        />
      </Sheet>
    </Screen>
  );
}

const cardBtn = { flex: 1, height: 90, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const };

function flowTitle(flow: Flow | null, t: ReturnType<typeof useApp>['t']): string {
  if (!flow) return '';
  if (flow.kind === 'goal') return flow.step === 'assist' ? t('live.chooseAssist') : t('live.goal');
  if (flow.kind === 'card') return flow.step === 'team' ? t('live.chooseTeam') : t('live.card');
  return flow.step === 'team' ? t('live.chooseTeam') : t('live.sub');
}

function SideName({ team }: { team: Team }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <TeamBadge team={team} size={44} />
      <Text style={[font.h3, { marginTop: 6, textAlign: 'center', fontSize: 13 }]} numberOfLines={2}>
        {team.name}
      </Text>
    </View>
  );
}

/** Carton jaune et carton rouge côte à côte, légèrement inclinés. */
function CardsIcon() {
  const card = { width: 14, height: 20, borderRadius: 2 } as const;
  return (
    <View style={{ flexDirection: 'row', height: 24, alignItems: 'center' }}>
      <View style={[card, { backgroundColor: colors.yellow, transform: [{ rotate: '-12deg' }] }]} />
      <View style={[card, { backgroundColor: colors.red, marginLeft: -3, transform: [{ rotate: '12deg' }] }]} />
    </View>
  );
}

function BigAction({ label, icon, color, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] | React.ReactElement; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        height: 76,
        borderRadius: radius.md,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {typeof icon === 'string' ? <Ionicons name={icon} size={24} color={color} /> : icon}
      <Text style={{ color: colors.text, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function MinutePicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const btn = (d: number, l: string) => (
    <Pressable onPress={() => onChange(Math.max(1, value + d))} style={{ width: 44, height: 40, borderRadius: 8, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.text, fontWeight: '800' }}>{l}</Text>
    </Pressable>
  );
  return (
    <Row style={{ marginBottom: 14, gap: 8 }}>
      <Text style={[font.small, { flex: 1, fontWeight: '700' }]}>{label}</Text>
      {btn(-5, '-5')}
      {btn(-1, '-1')}
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900', minWidth: 48, textAlign: 'center' }}>{value}'</Text>
      {btn(1, '+1')}
      {btn(5, '+5')}
    </Row>
  );
}

export default function GuardedLiveConsole() {
  return (
    <Guard allow="operate">
      <LiveConsole />
    </Guard>
  );
}

function PenaltiesCard({ match, home, away }: { match: Match; home: Team; away: Team }) {
  const { t, services } = useApp();
  const [h, setH] = useState(match.homePens != null ? String(match.homePens) : '');
  const [a, setA] = useState(match.awayPens != null ? String(match.awayPens) : '');
  const [busy, setBusy] = useState(false);
  const done = match.homePens != null && match.awayPens != null;
  const save = async () => {
    const hn = Number(h);
    const an = Number(a);
    if (h === '' || a === '' || !Number.isInteger(hn) || !Number.isInteger(an)) return notify(t('cup.pensNeeded'));
    setBusy(true);
    try {
      await services.setPenalties(match, hn, an);
      notify(t('cup.pensSaved'));
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ marginTop: 12, borderColor: done ? colors.border : colors.orange }}>
      <Text style={[font.h3, { marginBottom: 4 }]}>{t('cup.pens')}</Text>
      {!done ? <Text style={[font.small, { color: colors.orange, marginBottom: 10 }]}>{t('cup.pensNeeded')}</Text> : null}
      <Row style={{ gap: 10, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field label={home.name} value={h} onChangeText={(v) => setH(v.replace(/[^\d]/g, '').slice(0, 2))} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={away.name} value={a} onChangeText={(v) => setA(v.replace(/[^\d]/g, '').slice(0, 2))} keyboardType="number-pad" />
        </View>
      </Row>
      <Button label={t('common.save')} icon="save" onPress={save} loading={busy} />
    </Card>
  );
}
