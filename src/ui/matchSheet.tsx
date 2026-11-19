/**
 * Feuille de match (administration) :
 *  1. avant le match : joueurs de chaque équipe, capitaine, entraîneur, délégué, arbitre — obligatoire pour le coup d'envoi ;
 *  2. après le match : récapitulatif (score, buteurs, cartons, remplacements) à valider ;
 *  3. impression à tout moment ; les entreprises des deux équipes sont prévenues.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../data/AppProvider';
import { AppError } from '../data/services';
import { isGoal, maxStarters, scoringTeamId, startersReady, SHEET_MIN_PLAYERS, type Match, type MatchEvent, type Player, type SheetSide, type Team } from '../domain/model';
import { useMatchSheet } from '../print/useMatchSheet';
import { ask, notify } from './dialogs';
import { EventIcon, TeamBadge } from './football';
import { Button, Card, Field, Pill, Row, Section } from './kit';
import { colors, font, radius } from './theme';

function initialSide(team: Team, lineup: string[], saved?: SheetSide): SheetSide {
  return {
    playerIds: saved?.playerIds ?? lineup ?? [],
    starters: saved?.starters ?? (saved ? saved.playerIds : []),
    captainId: saved?.captainId ?? team.captainId ?? null,
    coach: saved?.coach ?? team.coach?.name ?? '',
    delegate: saved?.delegate ?? team.managers?.[0]?.name ?? '',
  };
}

export function MatchSheetPanel({ match, home, away, events }: { match: Match; home: Team; away: Team; events: MatchEvent[] }) {
  const { t, players, playerStats, services, user, notifier } = useApp();
  const printSheet = useMatchSheet();
  const [h, setH] = useState<SheetSide>(() => initialSide(home, match.homeLineup, match.sheet?.home));
  const [a, setA] = useState<SheetSide>(() => initialSide(away, match.awayLineup, match.sheet?.away));
  const [referee, setReferee] = useState(match.sheet?.referee ?? match.referee ?? '');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!match.sheet);
  useEffect(() => {
    // Sélection faite par l'entreprise entre-temps (tant que la feuille n'est pas enregistrée)
    if (match.sheet) return;
    setH((cur) => (cur.playerIds.length ? cur : { ...cur, playerIds: match.homeLineup }));
    setA((cur) => (cur.playerIds.length ? cur : { ...cur, playerIds: match.awayLineup }));
  }, [match.homeLineup, match.awayLineup, match.sheet]);

  const played = match.status === 'finished';
  const started = match.status !== 'scheduled' && match.status !== 'postponed';
  const status = match.sheet?.status;

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error', { n: SHEET_MIN_PLAYERS }) : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    guard(async () => {
      if (!user) return;
      const clean = (x: SheetSide): SheetSide => ({ ...x, coach: x.coach?.trim() || null, delegate: x.delegate?.trim() || null });
      await services.saveSheet(match, { home: clean(h), away: clean(a), referee: referee.trim() || null }, user);
      setEditing(false);
      notify(t('msheet.saved'));
      notifier.sheetNotice('ready', match, home, away);
    });

  const finalize = () =>
    guard(async () => {
      if (!user) return;
      await services.finalizeSheet(match, user);
      notify(t('msheet.finalized'));
      notifier.sheetNotice('final', match, home, away);
    });

  return (
    <View>
      <Card style={{ borderColor: status || match.forfeit ? colors.success : colors.orange }}>
        <Row>
          <Ionicons name={status ? 'checkmark-circle' : 'alert-circle'} size={22} color={status ? colors.success : colors.orange} />
          <Text style={[font.h3, { flex: 1, marginLeft: 8 }]}>
            {status === 'final' ? t('msheet.stFinal') : status === 'ready' ? t('msheet.stReady') : match.forfeit ? t('forfeit.noSheet') : t('msheet.stMissing')}
          </Text>
        </Row>
        <Text style={[font.small, { marginTop: 6 }]}>
          {status === 'final'
            ? t('msheet.finalBy', { n: match.sheet?.finalizedBy ?? '' })
            : status === 'ready'
              ? t('msheet.readyBy', { n: match.sheet?.filledBy ?? '' })
              : t('msheet.missingHint', { n: SHEET_MIN_PLAYERS })}
        </Text>
      </Card>

      <ForfeitCard match={match} home={home} away={away} />

      {/* 1. Avant le match : composition */}
      <Section
        title={t('msheet.step1')}
        right={
          !editing && !played ? <Button small variant="ghost" icon="create" label={t('common.edit')} onPress={() => setEditing(true)} /> : null
        }
      >
        {[
          { team: home, side: h, set: setH },
          { team: away, side: a, set: setA },
        ].map(({ team, side, set }) => (
          <SideEditor
            key={team.id}
            team={team}
            side={side}
            onChange={set}
            squad={players.filter((p) => p.teamId === team.id)}
            suspended={(p) => (playerStats.get(p.id)?.suspendedMatches ?? 0) > 0 && !started}
            editable={editing && !played}
          />
        ))}
        <Card style={{ marginTop: 4 }}>
          {editing && !played ? (
            <Field label={t('live.referee')} value={referee} onChangeText={setReferee} />
          ) : (
            <Text style={font.body}>
              {t('live.referee')} : <Text style={{ fontWeight: '800' }}>{referee || '—'}</Text>
            </Text>
          )}
          {editing && !played ? <Button label={t('msheet.save')} icon="save" onPress={save} loading={busy} /> : null}
        </Card>
      </Section>

      {/* 2. Après le match : ce qui s'est passé */}
      {started ? (
        <Section title={t('msheet.step2')}>
          <Card>
            <Row style={{ justifyContent: 'center', marginBottom: 10 }}>
              <TeamBadge team={home} size={26} />
              <Text style={[font.h2, { marginHorizontal: 12 }]}>
                {match.homeScore} – {match.awayScore}
              </Text>
              <TeamBadge team={away} size={26} />
            </Row>
            <Summary match={match} events={events} home={home} away={away} />
            {played && status !== 'final' ? (
              <Button label={t('msheet.finalize')} icon="checkmark-done" style={{ marginTop: 12 }} onPress={finalize} loading={busy} disabled={!status} />
            ) : null}
            {!played ? <Text style={[font.small, { marginTop: 10 }]}>{t('msheet.afterMatch')}</Text> : null}
          </Card>
        </Section>
      ) : null}

      {/* Impression : en bas de la feuille */}
      <Button label={t('sheet.print')} icon="print" variant="secondary" onPress={() => printSheet(match)} style={{ marginTop: 16 }} />
    </View>
  );
}

function SideEditor({
  team,
  side,
  onChange,
  squad,
  suspended,
  editable,
}: {
  team: Team;
  side: SheetSide;
  onChange: (s: SheetSide) => void;
  squad: Player[];
  suspended: (p: Player) => boolean;
  editable: boolean;
}) {
  const { t } = useApp();
  const byNumber = (x: Player, y: Player) => (x.number || 99) - (y.number || 99) || x.name.localeCompare(y.name);
  const selected = squad.filter((p) => side.playerIds.includes(p.id)).sort(byNumber);
  const available = squad.filter((p) => !side.playerIds.includes(p.id)).sort(byNumber);
  const n = side.playerIds.length;

  const add = (id: string) => onChange({ ...side, playerIds: [...side.playerIds, id] });
  const remove = (id: string) =>
    onChange({
      ...side,
      playerIds: side.playerIds.filter((x) => x !== id),
      starters: (side.starters ?? []).filter((x) => x !== id),
      captainId: side.captainId === id ? null : side.captainId,
    });

  return (
    <Card style={{ marginBottom: 10 }}>
      <Row style={{ marginBottom: 10 }}>
        <TeamBadge team={team} size={26} />
        <Text style={[font.h3, { flex: 1, marginLeft: 8 }]}>{team.name}</Text>
        <Pill label={t('msheet.nPlayers', { n })} color={n >= SHEET_MIN_PLAYERS ? colors.success : colors.orange} bg={n >= SHEET_MIN_PLAYERS ? colors.successSoft : colors.orangeSoft} />
        {editable && squad.length ? (
          <Button
            small
            variant="ghost"
            label={n ? t('msheet.clearAll') : t('msheet.pickAll')}
            onPress={() =>
              onChange(
                n
                  ? { ...side, playerIds: [], starters: [], captainId: null }
                  : { ...side, playerIds: squad.filter((p) => !suspended(p)).map((p) => p.id) },
              )
            }
            style={{ marginLeft: 6 }}
          />
        ) : null}
      </Row>
      {!squad.length ? <Text style={font.small}>{t('msheet.noSquad')}</Text> : null}

      {/* En haut : joueurs à sélectionner (un joueur sélectionné quitte cette liste) */}
      {editable ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={[font.small, { fontWeight: '800', marginBottom: 6 }]}>{t('msheet.available', { n: available.length })}</Text>
          {available.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {available.map((p) => {
                const off = suspended(p);
                return (
                  <Pressable
                    key={p.id}
                    disabled={off}
                    onPress={() => add(p.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, opacity: off ? 0.4 : 1 }}
                  >
                    <Ionicons name="add" size={13} color={colors.accent} style={{ marginRight: 4 }} />
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
                      {p.number ? `${p.number}. ` : ''}
                      {p.name}
                      {off ? ' ⛔' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={font.tiny}>{t('msheet.allPicked')}</Text>
          )}
        </View>
      ) : null}

      {/* En dessous : joueurs présents sur la feuille de match */}
      <Text style={[font.small, { fontWeight: '800', marginBottom: 6, color: n >= SHEET_MIN_PLAYERS ? colors.success : colors.orange }]}>{t('msheet.onSheet', { n })}</Text>
      {selected.map((p) => {
        const cap = side.captainId === p.id;
        return (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: colors.accentSoft, marginBottom: 4 }}>
            <Text style={{ color: colors.accent, fontWeight: '800', width: 26 }}>{p.number || ''}</Text>
            <Text style={{ flex: 1, color: colors.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
              {p.name}
              {cap ? ' (C)' : ''}
            </Text>
            {editable ? (
              <>
                <Pressable onPress={() => onChange({ ...side, captainId: cap ? null : p.id })} hitSlop={6} style={{ paddingHorizontal: 8 }} accessibilityLabel={t('msheet.captain')}>
                  <Ionicons name={cap ? 'star' : 'star-outline'} size={16} color={colors.accent} />
                </Pressable>
                <Pressable onPress={() => remove(p.id)} hitSlop={6} style={{ paddingLeft: 6 }} accessibilityLabel={t('common.delete')}>
                  <Ionicons name="close-circle" size={18} color={colors.red} />
                </Pressable>
              </>
            ) : null}
          </View>
        );
      })}
      {!selected.length ? <Text style={[font.tiny, { marginBottom: 6 }]}>{t('msheet.nonePicked', { n: SHEET_MIN_PLAYERS })}</Text> : null}
      {editable ? <Text style={[font.tiny, { marginTop: 4 }]}>{t('msheet.pickHint2')}</Text> : null}
      <View style={{ height: 10 }} />
      {editable ? (
        <Row style={{ gap: 8, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field label={t('reg.coach')} value={side.coach ?? ''} onChangeText={(v) => onChange({ ...side, coach: v })} />
          </View>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field label={t('sheet.delegate')} value={side.delegate ?? ''} onChangeText={(v) => onChange({ ...side, delegate: v })} />
          </View>
        </Row>
      ) : (
        <Text style={font.small}>
          {t('reg.coach')} : {side.coach || '—'} · {t('sheet.delegate')} : {side.delegate || '—'}
        </Text>
      )}
    </Card>
  );
}

function Summary({ match, events, home, away }: { match: Match; events: MatchEvent[]; home: Team; away: Team }) {
  const { t, playerById } = useApp();
  const name = (e: MatchEvent, id = e.playerId) => (e.coach && id === e.playerId ? `${t('live.coach')} ${e.personName ?? ''}`.trim() : playerById.get(id)?.name ?? '—');
  const rows = useMemo(() => [...events].sort((x, y) => x.half - y.half || x.minute - y.minute), [events]);
  if (!rows.length) return <Text style={[font.small, { textAlign: 'center' }]}>{t('match.noEvents')}</Text>;
  return (
    <View>
      {[home, away].map((team) => {
        const mine = rows.filter((e) => (isGoal(e) ? scoringTeamId(e, match) === team.id : e.teamId === team.id));
        return (
          <View key={team.id} style={{ marginBottom: 10 }}>
            <Text style={[font.small, { fontWeight: '800', marginBottom: 4 }]}>{team.name}</Text>
            {!mine.length ? <Text style={font.tiny}>—</Text> : null}
            {mine.map((e) => (
              <Row key={e.id} style={{ paddingVertical: 3 }}>
                <Text style={[font.small, { width: 34, fontWeight: '800' }]}>{e.minute}'</Text>
                <EventIcon type={e.type} size={14} />
                <Text style={[font.small, { marginLeft: 8, flex: 1, color: colors.text }]}>
                  {name(e)}
                  {e.type === 'own_goal' ? ` (${t('live.ownGoal')})` : ''}
                  {e.type === 'penalty_goal' ? ` (${t('live.penalty')})` : ''}
                  {e.assistId ? ` · ${t('match.assist')} ${playerById.get(e.assistId)?.name ?? ''}` : ''}
                  {e.type === 'sub' ? ` ↑ ${playerById.get(e.playerInId ?? '')?.name ?? ''}` : ''}
                </Text>
              </Row>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Forfait : une équipe a moins de 4 joueurs au coup d'envoi → match perdu 0-2.
 * Les deux équipes incomplètes → le match est reporté.
 */
function ForfeitCard({ match, home, away }: { match: Match; home: Team; away: Team }) {
  const { t, services, notifier, can } = useApp();
  const [busy, setBusy] = useState(false);
  const allowed = can('matches.sheet') || can('matches.live') || can('matches.calendar');
  if (!allowed) return null;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  if (match.forfeit) {
    const loser = match.forfeit === 'home' ? home : away;
    const winner = match.forfeit === 'home' ? away : home;
    return (
      <Card style={{ marginTop: 12, borderColor: colors.red }}>
        <Text style={[font.h3, { color: colors.red }]}>{t('forfeit.declared', { team: loser.name })}</Text>
        <Text style={[font.small, { marginTop: 4 }]}>{t('forfeit.result', { team: winner.name, h: match.homeScore, a: match.awayScore })}</Text>
        <Button
          small
          variant="ghost"
          icon="arrow-undo"
          label={t('forfeit.cancel')}
          loading={busy}
          style={{ marginTop: 10 }}
          onPress={async () => {
            if (!(await ask(t('forfeit.cancel'), t('forfeit.cancelQ'), t('common.confirm'), t('common.cancel')))) return;
            run(() => services.cancelForfeit(match));
          }}
        />
      </Card>
    );
  }
  if (match.status !== 'scheduled') return null;
  const forfeit = async (side: 'home' | 'away') => {
    const team = side === 'home' ? home : away;
    if (!(await ask(t('forfeit.title'), t('forfeit.confirm', { team: team.name, n: SHEET_MIN_PLAYERS }), t('forfeit.declare'), t('common.cancel')))) return;
    run(async () => {
      await services.declareForfeit(match, side);
      const homeScore = side === 'home' ? 0 : 2;
      const awayScore = side === 'away' ? 0 : 2;
      notifier.matchEvent('fulltime', { match: { ...match, homeScore, awayScore, status: 'finished' }, home, away, homeScore, awayScore });
    });
  };
  const both = async () => {
    if (!(await ask(t('forfeit.bothTitle'), t('forfeit.bothConfirm', { n: SHEET_MIN_PLAYERS }), t('live.postpone'), t('common.cancel')))) return;
    run(async () => {
      await services.postponeMatch(match);
      notifier.matchEvent('postponed', { match, home, away });
    });
  };
  return (
    <Card style={{ marginTop: 12 }}>
      <Text style={[font.h3, { marginBottom: 4 }]}>{t('forfeit.title')}</Text>
      <Text style={[font.small, { marginBottom: 10 }]}>{t('forfeit.hint', { n: SHEET_MIN_PLAYERS })}</Text>
      <Row style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button small variant="secondary" icon="flag" label={t('forfeit.of', { team: home.name })} onPress={() => forfeit('home')} loading={busy} />
        <Button small variant="secondary" icon="flag" label={t('forfeit.of', { team: away.name })} onPress={() => forfeit('away')} loading={busy} />
        <Button small variant="ghost" icon="calendar" label={t('forfeit.both')} onPress={both} loading={busy} />
      </Row>
    </Card>
  );
}

/**
 * Avant le coup d'envoi : parmi les joueurs présents sur la feuille, choisir les titulaires
 * (équipe qui commence) ; les autres sont remplaçants.
 */
export function StartersPicker({ match, home, away }: { match: Match; home: Team; away: Team }) {
  const { t, players, pitches, services } = useApp();
  const max = maxStarters(pitches.find((p) => p.id === match.pitchId)?.type);
  const [h, setH] = useState<string[]>(match.sheet?.home.starters ?? []);
  const [a, setA] = useState<string[]>(match.sheet?.away.starters ?? []);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!startersReady(match));
  if (!match.sheet) return null;
  const sheet = match.sheet;
  const save = async () => {
    setBusy(true);
    try {
      await services.saveStarters(match, h, a, max);
      notify(t('starters.saved'));
      setOpen(false);
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error', { n: SHEET_MIN_PLAYERS, max }) : t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  const ready = startersReady(match);
  if (!open)
    return (
      <Card style={{ marginBottom: 12, borderColor: colors.success }}>
        <Row>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={[font.body, { flex: 1, marginLeft: 8, fontWeight: '700' }]}>{t('starters.ready')}</Text>
          <Button small variant="ghost" icon="create" label={t('common.edit')} onPress={() => setOpen(true)} />
        </Row>
      </Card>
    );
  const col = (team: Team, side: SheetSide, sel: string[], set: (x: string[]) => void) => {
    const list = players.filter((p) => side.playerIds.includes(p.id)).sort((x, y) => (x.number || 99) - (y.number || 99) || x.name.localeCompare(y.name));
    const toggle = (id: string) => {
      if (sel.includes(id)) return set(sel.filter((x) => x !== id));
      if (sel.length >= max) return notify(t('msheet.maxStarters', { n: max }));
      set([...sel, id]);
    };
    return (
      <View style={{ flex: 1, minWidth: 260 }}>
        <Row style={{ marginBottom: 8 }}>
          <TeamBadge team={team} size={22} />
          <Text style={[font.h3, { flex: 1, marginLeft: 6 }]} numberOfLines={1}>
            {team.name}
          </Text>
          <Pill
            label={`${sel.length}/${max}`}
            color={sel.length >= SHEET_MIN_PLAYERS ? colors.success : colors.orange}
            bg={sel.length >= SHEET_MIN_PLAYERS ? colors.successSoft : colors.orangeSoft}
          />
        </Row>
        {list.map((p) => {
          const on = sel.includes(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => toggle(p.id)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderRadius: radius.md, marginBottom: 4, borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.bgElevated }}
            >
              <Text style={{ color: colors.accent, fontWeight: '800', width: 26 }}>{p.number || ''}</Text>
              <Text style={{ flex: 1, color: colors.text, fontWeight: on ? '800' : '600', fontSize: 13 }} numberOfLines={1}>
                {p.name}
                {side.captainId === p.id ? ' (C)' : ''}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: on ? colors.accent : colors.muted }}>{on ? t('msheet.starter') : t('msheet.sub')}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };
  return (
    <Card style={{ marginBottom: 12, borderColor: ready ? colors.border : colors.orange }}>
      <Text style={[font.h3, { marginBottom: 4 }]}>{t('starters.title')}</Text>
      <Text style={[font.small, { marginBottom: 12 }]}>{t('starters.hint', { n: SHEET_MIN_PLAYERS, max })}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {col(home, sheet.home, h, setH)}
        {col(away, sheet.away, a, setA)}
      </View>
      <Button label={t('starters.save')} icon="save" onPress={save} loading={busy} style={{ marginTop: 12 }} />
    </Card>
  );
}
