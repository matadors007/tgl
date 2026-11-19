import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { AutoCalendarButton } from '@/ui/autoCalendar';
import { useApp } from '@/data/AppProvider';
import { AppError } from '@/data/services';
import { autoCalendarAvailable, effectiveSlotStatus, groupLetters, hasGroups, isCup, isLive, koRoundsFor, pitchSchedule, slotId, toDateKey, type KoRound, type Match, type Team } from '@/domain/model';
import { cupRoundNumber, koLabel, stageSections } from '@/ui/stage';
import { useSlotsByDate } from '@/data/useStaffData';
import { ask, notify } from '@/ui/dialogs';
import { TeamBadge } from '@/ui/football';
import { dayLabel } from '@/ui/format';
import { Guard } from '@/ui/Guard';
import { Button, Card, Empty, Field, MaybeScreen, Pill, Row, Screen, Segmented, Sheet } from '@/ui/kit';
import { colors, font, radius } from '@/ui/theme';
import { useWideWeb } from '@/ui/web';
import { DateField, TimeChips } from '@/ui/datepicker';

type Filter = 'live' | 'upcoming' | 'postponed' | 'played' | 'all';

interface Draft {
  id: string | null;
  round: string;
  home: string;
  away: string;
  date: string;
  start: string;
  pitchId: string;
  stage: 'group' | 'ko';
  group: string;
  koRound: KoRound;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Calendrier du championnat saisi par l'administrateur :
 * ajout d'un match (journée, équipes, date, heure, terrain), modification de la date / de l'heure,
 * match reporté (créneau libéré, nouvelle date à fixer), suppression.
 */
export function CalendarPanel({ embedded }: { embedded?: boolean } = {}) {
  const { t, lang, season, teams, matches, pitches, config, services, teamById, notifier, can } = useApp();
  const wide = useWideWeb();
  const [filter, setFilter] = useState<Filter>(matches.some(isLive) ? 'live' : 'upcoming');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const activePitches = pitches.filter((p) => p.active);
  const daySlots = useSlotsByDate(draft && DATE_RE.test(draft.date) ? draft.date : '0000-00-00');

  const counts = useMemo(
    () => ({
      live: matches.filter(isLive).length,
      upcoming: matches.filter((m) => m.status === 'scheduled' || isLive(m)).length,
      postponed: matches.filter((m) => m.status === 'postponed').length,
      played: matches.filter((m) => m.status === 'finished').length,
      all: matches.length,
    }),
    [matches],
  );
  const list = useMemo(() => {
    const keep = (m: Match) =>
      filter === 'all' ||
      (filter === 'live' && isLive(m)) ||
      (filter === 'upcoming' && (m.status === 'scheduled' || isLive(m))) ||
      (filter === 'postponed' && m.status === 'postponed') ||
      (filter === 'played' && m.status === 'finished');
    return matches.filter(keep).sort((a, b) => a.round - b.round || a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  }, [matches, filter]);
  const sections = useMemo(() => stageSections(list, t), [list, t]);
  const cup = isCup(season);
  const groups = hasGroups(season) ? groupLetters(season?.groupCount) : [];
  const koRounds = koRoundsFor(season?.maxTeams);
  const nextRound = matches.length ? Math.max(...matches.map((m) => m.round)) : 1;

  if (!season) return <MaybeScreen embedded={embedded} edges={[]}><Empty text={t('st.noSeason')} /></MaybeScreen>;

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const openNew = () => {
    const lastDate = matches.length ? matches.map((m) => m.date).sort().slice(-1)[0] : toDateKey(new Date());
    setDraft({
      id: null,
      round: String(nextRound),
      home: '',
      away: '',
      date: lastDate,
      start: '19:30',
      pitchId: activePitches[0]?.id ?? '',
      stage: groups.length ? 'group' : 'ko',
      group: groups[0] ?? 'A',
      koRound: koRounds[0] ?? 2,
    });
  };
  const openEdit = (m: Match) =>
    setDraft({
      id: m.id,
      round: String(m.round),
      home: m.homeTeamId,
      away: m.awayTeamId,
      date: m.date,
      start: m.start,
      pitchId: m.pitchId ?? activePitches[0]?.id ?? '',
      stage: m.stage === 'group' ? 'group' : 'ko',
      group: m.group ?? groups[0] ?? 'A',
      koRound: m.koRound ?? koRounds[0] ?? 2,
    });

  const save = () => {
    if (!draft) return;
    const pitch = pitches.find((p) => p.id === draft.pitchId);
    if (!draft.home || !draft.away || draft.home === draft.away) return notify(t('cal.errTeams'));
    if (!DATE_RE.test(draft.date) || !TIME_RE.test(draft.start) || !pitch) return notify(t('cal.errDate'));
    const round = cup ? cupRoundNumber(draft.stage, draft.koRound) : Math.max(1, Number(draft.round) || 1);
    const stage = cup ? { stage: draft.stage, group: draft.group, koRound: draft.koRound } : {};
    guard(async () => {
      if (!draft.id) {
        await services.createMatch(season, { round, homeTeamId: draft.home, awayTeamId: draft.away, date: draft.date, start: draft.start, pitch, ...stage }, config.slotMinutes);
        notify(t('cal.added'));
      } else {
        const m = matches.find((x) => x.id === draft.id);
        if (!m) return;
        const stageChanged = cup && (draft.stage !== m.stage || (draft.stage === 'group' ? draft.group !== m.group : draft.koRound !== m.koRound));
        if (round !== m.round || stageChanged || draft.home !== m.homeTeamId || draft.away !== m.awayTeamId)
          await services.editMatchTeams(m, { round, homeTeamId: draft.home, awayTeamId: draft.away, ...stage });
        const moved = draft.date !== m.date || draft.start !== m.start || draft.pitchId !== m.pitchId || m.status === 'postponed';
        if (moved) {
          await services.rescheduleMatch(m, draft.date, draft.start, pitch, config.slotMinutes);
          notifier.matchEvent('rescheduled', { match: { ...m, date: draft.date, start: draft.start }, home: teamById.get(draft.home), away: teamById.get(draft.away) });
        }
        notify(t('cal.saved'));
      }
      setDraft(null);
    });
  };

  const postpone = async (m: Match) => {
    if (!(await ask(t('cal.postponeQ'), t('cal.postponeHint'), t('live.postpone'), t('common.cancel')))) return;
    guard(async () => {
      await services.postponeMatch(m);
      notifier.matchEvent('postponed', { match: m, home: teamById.get(m.homeTeamId), away: teamById.get(m.awayTeamId) });
    });
  };
  const remove = async (m: Match) => {
    if (!(await ask(t('cal.deleteQ'), `${teamById.get(m.homeTeamId)?.name ?? '?'} – ${teamById.get(m.awayTeamId)?.name ?? '?'}`, t('common.delete'), t('common.cancel'))))
      return;
    guard(() => services.deleteMatch(m));
  };

  // Phase de poules : seulement les équipes de la poule choisie (si les poules sont attribuées)
  const pickable = (d: Draft) => (cup && d.stage === 'group' && teams.some((x) => x.group) ? teams.filter((x) => x.group === d.group) : teams);
  const pitch = draft ? pitches.find((p) => p.id === draft.pitchId) : undefined;
  const starts = draft && pitch && DATE_RE.test(draft.date) ? pitchSchedule(config, pitch, draft.date).starts : [];

  return (
    <MaybeScreen embedded={embedded} edges={[]}>
      <Card>
        <Row style={{ flexWrap: 'wrap', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={font.h2}>{t('cal.title')}</Text>
            <Text style={[font.small, { marginTop: 4 }]}>
              {season.name} · {t('cal.summary', { m: matches.length, t: teams.length })}
            </Text>
          </View>
          {can('matches.calendar') ? <Button label={t('cal.add')} icon="add-circle" onPress={openNew} disabled={teams.length < 2 || !activePitches.length} /> : null}
          {/* Générateur automatique : sur le site, pour le championnat +35 */}
          {can('matches.calendar') && Platform.OS === 'web' && autoCalendarAvailable(season) ? <AutoCalendarButton matches={matches} /> : null}
        </Row>
        <Text style={[font.small, { marginTop: 10 }]}>{t('cal.hint')}</Text>
      </Card>

      <View style={{ height: 12 }} />
      <Segmented
        scroll
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'live', label: t('match.live'), badge: counts.live || undefined },
          { value: 'upcoming', label: t('cal.fUpcoming'), badge: undefined },
          { value: 'postponed', label: t('cal.fPostponed'), badge: counts.postponed || undefined },
          { value: 'played', label: t('cal.fPlayed') },
          { value: 'all', label: `${t('cal.fAll')} (${counts.all})` },
        ]}
      />

      {!list.length ? <Empty text={filter === 'postponed' ? t('cal.noPostponed') : t('cal.empty')} icon="calendar-outline" /> : null}

      {sections.map((sec) => (
        <View key={sec.key} style={{ marginTop: 16 }}>
          <Text style={[font.small, { fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }]}>{sec.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
            {sec.matches
              .map((m) => (
                <View key={m.id} style={{ width: wide ? '50%' : '100%', padding: 5 }}>
                  <MatchCard m={m} onOpen={() => router.push(`/admin/live/${m.id}`)} onEdit={can('matches.calendar') ? () => openEdit(m) : undefined} onPostpone={() => postpone(m)} onDelete={() => remove(m)} />
                </View>
              ))}
          </View>
        </View>
      ))}

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.id ? t('cal.edit') : t('cal.add')}>
        {draft ? (
          <View>
            {cup ? (
              <View>
                {groups.length ? (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={[font.small, { marginBottom: 6, fontWeight: '700' }]}>{t('cup.stage')}</Text>
                    <Segmented<'group' | 'ko'>
                      value={draft.stage}
                      onChange={(v) => setDraft({ ...draft, stage: v, home: '', away: '' })}
                      options={[
                        { value: 'group', label: t('cup.stage.group') },
                        { value: 'ko', label: t('cup.stage.ko') },
                      ]}
                    />
                  </View>
                ) : null}
                <Text style={[font.small, { marginBottom: 6, fontWeight: '700' }]}>{draft.stage === 'group' ? t('cup.group') : t('cup.round')}</Text>
                {draft.stage === 'group' ? (
                  <Segmented scroll value={draft.group} onChange={(v) => setDraft({ ...draft, group: v, home: '', away: '' })} options={groups.map((g) => ({ value: g, label: t('cup.groupN', { g }) }))} />
                ) : (
                  <Segmented<string>
                    scroll
                    value={String(draft.koRound)}
                    onChange={(v) => setDraft({ ...draft, koRound: Number(v) as KoRound })}
                    options={koRounds.map((r) => ({ value: String(r), label: koLabel(r, t) }))}
                  />
                )}
                {draft.stage === 'group' && teams.some((x) => x.group) ? (
                  <Text style={[font.tiny, { marginTop: 6 }]}>{t('cup.groupTeamsHint', { g: draft.group })}</Text>
                ) : null}
                <View style={{ height: 12 }} />
              </View>
            ) : (
              <Field label={t('cal.round')} value={draft.round} onChangeText={(v) => setDraft({ ...draft, round: v.replace(/[^\d]/g, '') })} keyboardType="number-pad" />
            )}
            <Text style={[font.small, { marginBottom: 6, fontWeight: '700' }]}>{t('cal.home')}</Text>
            <TeamPicker teams={pickable(draft)} value={draft.home} onChange={(v) => setDraft({ ...draft, home: v, away: draft.away === v ? '' : draft.away })} />
            <Text style={[font.small, { marginTop: 12, marginBottom: 6, fontWeight: '700' }]}>{t('cal.away')}</Text>
            <TeamPicker teams={pickable(draft).filter((x) => x.id !== draft.home)} value={draft.away} onChange={(v) => setDraft({ ...draft, away: v })} />
            {draft.home && draft.away ? (
              <Text style={[font.body, { marginTop: 10, fontWeight: '800', textAlign: 'center' }]}>
                {teamById.get(draft.home)?.name} – {teamById.get(draft.away)?.name}
              </Text>
            ) : null}
            <View style={{ height: 12 }} />
            <DateField label={t('cal.date')} value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} />
            <Text style={[font.small, { marginBottom: 6, fontWeight: '700' }]}>{t('match.pitch')}</Text>
            <Segmented scroll value={draft.pitchId} onChange={(v) => setDraft({ ...draft, pitchId: v })} options={activePitches.map((p) => ({ value: p.id, label: `${p.name} · ${p.type}` }))} />
            <View style={{ height: 12 }} />
            <Text style={[font.small, { marginBottom: 6, fontWeight: '700' }]}>{t('cal.timePick')}</Text>
            <TimeChips
              value={draft.start}
              options={starts}
              onChange={(v) => setDraft({ ...draft, start: v })}
              taken={(v) => {
                const doc = pitch ? daySlots.find((d) => d.id === slotId(pitch.id, draft.date, v)) : undefined;
                return !!doc && doc.matchId !== draft.id && effectiveSlotStatus(doc, Date.now()) !== 'free';
              }}
            />
            <View style={{ height: 12 }} />
            {starts.length ? <Text style={[font.tiny, { marginTop: -6, marginBottom: 10 }]}>{t('cal.takenHint')}</Text> : null}
            {draft.id && matches.find((x) => x.id === draft.id)?.status === 'postponed' ? (
              <Text style={[font.small, { color: colors.orange, marginBottom: 10 }]}>{t('cal.newDateHint')}</Text>
            ) : null}
            <Button label={t('common.save')} icon="save" onPress={save} loading={busy} />
          </View>
        ) : null}
      </Sheet>
    </MaybeScreen>
  );
}

function MatchCard({ m, onOpen, onEdit, onPostpone, onDelete }: { m: Match; onOpen: () => void; onEdit?: () => void; onPostpone: () => void; onDelete: () => void }) {
  const { t, lang, teamById, pitches } = useApp();
  const home = teamById.get(m.homeTeamId);
  const away = teamById.get(m.awayTeamId);
  const pitch = pitches.find((p) => p.id === m.pitchId);
  const editable = !!onEdit && (m.status === 'scheduled' || m.status === 'postponed');
  const st =
    m.status === 'postponed'
      ? { label: t('match.postponed'), color: colors.orange, bg: colors.orangeSoft }
      : m.status === 'finished'
        ? { label: t('cal.played'), color: colors.muted, bg: undefined }
        : isLive(m)
          ? { label: 'LIVE', color: colors.live, bg: colors.liveSoft }
          : { label: t('cal.scheduled'), color: colors.accent, bg: colors.accentSoft };
  return (
    <Card onPress={onOpen} style={{ padding: 12, borderColor: m.status === 'postponed' ? colors.orange : colors.border }}>
      <Row style={{ marginBottom: 8 }}>
        <Ionicons name="calendar" size={14} color={colors.accent} />
        <Text
          style={[
            font.small,
            { flex: 1, marginLeft: 6, fontWeight: '700' },
            m.status === 'postponed' ? { textDecorationLine: 'line-through', color: colors.faint } : null,
          ]}
        >
          {dayLabel(m.date, lang, t)} · {m.start}
          {pitch ? ` · ${pitch.name}` : ''}
        </Text>
        <Pill label={st.label} color={st.color} bg={st.bg} />
      </Row>
      <Row>
        <TeamBadge team={home} size={28} />
        <Text style={[font.body, { flex: 1, marginLeft: 8, fontWeight: '700' }]} numberOfLines={1}>
          {home?.name ?? '?'}
        </Text>
        <View style={{ alignItems: 'center', marginHorizontal: 8 }}>
          <Text style={font.h3}>{m.status === 'finished' || isLive(m) ? `${m.homeScore} – ${m.awayScore}` : 'vs'}</Text>
          {m.homePens != null && m.awayPens != null ? <Text style={font.tiny}>{t('cup.pensShort', { h: m.homePens, a: m.awayPens })}</Text> : null}
          {m.forfeit ? <Text style={[font.tiny, { color: colors.red, fontWeight: '800' }]}>{t('forfeit.short')}</Text> : null}
        </View>
        <Text style={[font.body, { flex: 1, marginRight: 8, fontWeight: '700', textAlign: 'right' }]} numberOfLines={1}>
          {away?.name ?? '?'}
        </Text>
        <TeamBadge team={away} size={28} />
      </Row>
      {m.status === 'postponed' ? <Text style={[font.tiny, { color: colors.orange, marginTop: 8 }]}>{t('cal.toFix')}</Text> : null}
      {/* Feuille de match : à remplir (texte) ; remplie (icône seulement) */}
      {!m.forfeit ? (
        <Row style={{ marginTop: 8, gap: 6 }}>
          {m.sheet ? (
            <View accessibilityLabel={m.sheet.status === 'final' ? t('msheet.stFinal') : t('msheet.stReady')} {...({ title: m.sheet.status === 'final' ? t('msheet.stFinal') : t('msheet.stReady') } as object)}>
              <Ionicons name={m.sheet.status === 'final' ? 'checkmark-done-circle' : 'clipboard'} size={18} color={colors.success} />
            </View>
          ) : m.status === 'scheduled' || m.status === 'postponed' ? (
            <Pill label={t('msheet.stMissing')} color={colors.orange} bg={colors.orangeSoft} icon="clipboard" />
          ) : null}
        </Row>
      ) : null}
      {editable ? (
        <Row style={{ gap: 6, marginTop: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button small variant="secondary" icon="create" label={m.status === 'postponed' ? t('cal.setDate') : t('cal.change')} onPress={onEdit} />
          {m.status === 'scheduled' ? <Button small variant="ghost" icon="pause" label={t('live.postpone')} onPress={onPostpone} /> : null}
          <Button small variant="ghost" icon="trash" label={t('common.delete')} onPress={onDelete} />
        </Row>
      ) : null}
    </Card>
  );
}

/** Choix d'une équipe : logo et nom de toutes les équipes du championnat. */
export function TeamPicker({ teams, value, onChange }: { teams: Team[]; value: string; onChange: (id: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
      {teams.map((tm) => {
        const on = tm.id === value;
        return (
          <View key={tm.id} style={{ width: '50%', padding: 4 }}>
            <Pressable
              onPress={() => onChange(tm.id)}
              accessibilityState={{ selected: on }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 8,
                borderRadius: radius.md,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.accent : colors.border,
                backgroundColor: on ? colors.accentSoft : colors.card,
              }}
            >
              <TeamBadge team={tm} size={30} />
              <Text style={[font.small, { marginLeft: 8, flex: 1, color: colors.text, fontWeight: on ? '800' : '600' }]} numberOfLines={2}>
                {tm.name}
              </Text>
              {on ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} /> : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export default function CalendarScreen() {
  return (
    <Guard allow="matches.calendar">
      <CalendarPanel />
    </Guard>
  );
}
