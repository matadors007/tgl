/**
 * Générateur automatique du calendrier (site web) : jours, heures et terrains au choix,
 * aperçu modifiable (retirer un match, nouveau tirage), puis création des matchs.
 * Les matchs joués ou en cours sont conservés ; les matchs à venir sont remplacés.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { AppError } from '@/data/services';
import { addDays, generateStartTimes, toDateKey, type Match, type PlannedMatch } from '@/domain/model';
import { DateField } from './datepicker';
import { ask, notify } from './dialogs';
import { TeamBadge } from './football';
import { dayLabel } from './format';
import { Button, Card, Pill, Row, Sheet } from './kit';
import { colors, font, radius } from './theme';

/** Lundi → dimanche (0 = dimanche). */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: on }}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? colors.accent : colors.border,
        backgroundColor: on ? colors.accent : colors.card,
      }}
    >
      <Text style={{ color: on ? colors.onAccent : colors.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function AutoCalendarButton({ matches }: { matches: Match[] }) {
  const { t, lang, season, teams, pitches, config, services, teamById } = useApp();
  const active = pitches.filter((p) => p.active);
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(season?.startDate && season.startDate > toDateKey(new Date()) ? season.startDate : addDays(toDateKey(new Date()), 7));
  const [weekdays, setWeekdays] = useState<number[]>([2, 4]);
  const allTimes = useMemo(() => generateStartTimes(config.openMinutes, config.closeMinutes, config.slotMinutes), [config]);
  const [times, setTimes] = useState<string[]>(allTimes.filter((x) => x >= '18:00').slice(0, 2));
  const [pitchIds, setPitchIds] = useState<string[]>(active.map((p) => p.id));
  const [doubleRound, setDoubleRound] = useState(season?.doubleRound ?? true);
  const [seed, setSeed] = useState(1);
  const [plan, setPlan] = useState<{ matches: PlannedMatch[]; unplaced: [string, string][]; replaced: number; kept: number } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!season) return null;

  const propose = async (nextSeed = seed) => {
    if (!weekdays.length || !times.length || !pitchIds.length) return notify(t('auto.errChoose'));
    setBusy(true);
    try {
      const res = await services.planAutoCalendar(
        teams,
        matches,
        { startDate, weekdays, times, pitches: active.filter((p) => pitchIds.includes(p.id)), doubleRound, seed: nextSeed },
        config,
      );
      setSeed(nextSeed);
      setPlan(res);
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!plan?.matches.length) return;
    if (plan.replaced && !(await ask(t('auto.confirmTitle'), t('auto.confirmReplace', { n: plan.replaced, m: plan.matches.length }), t('common.confirm'), t('common.cancel')))) return;
    setBusy(true);
    try {
      const n = await services.applyCalendarPlan(season, plan.matches, matches, config.slotMinutes, doubleRound);
      notify(t('auto.created', { n }));
      setPlan(null);
      setOpen(false);
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const rounds = plan ? [...new Set(plan.matches.map((m) => m.round))].sort((a, b) => a - b) : [];
  const pitchName = (id: string) => pitches.find((p) => p.id === id)?.name ?? '?';
  const lastDate = plan?.matches.length ? plan.matches.map((m) => m.date).sort().slice(-1)[0] : null;

  return (
    <>
      <Button label={t('auto.open')} icon="sparkles" variant="secondary" onPress={() => setOpen(true)} disabled={teams.length < 2 || !active.length} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('auto.title')}>
        {!plan ? (
          <View>
            <Text style={[font.small, { marginBottom: 12 }]}>{t('auto.hint', { n: teams.length })}</Text>
            <DateField label={t('auto.start')} value={startDate} onChange={setStartDate} min={toDateKey(new Date())} />
            <Text style={[font.small, { marginBottom: 6, fontWeight: '700' }]}>{t('auto.days')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {WEEK.map((d) => (
                <Chip key={d} label={t(`auto.wd${d}` as 'auto.wd1')} on={weekdays.includes(d)} onPress={() => setWeekdays(toggle(weekdays, d))} />
              ))}
            </View>
            <Text style={[font.small, { marginBottom: 6, fontWeight: '700' }]}>{t('auto.times')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {allTimes.map((x) => (
                <Chip key={x} label={x} on={times.includes(x)} onPress={() => setTimes(toggle(times, x))} />
              ))}
            </View>
            <Text style={[font.small, { marginBottom: 6, fontWeight: '700' }]}>{t('auto.pitches')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {active.map((p) => (
                <Chip key={p.id} label={`${p.name} · ${p.type}`} on={pitchIds.includes(p.id)} onPress={() => setPitchIds(toggle(pitchIds, p.id))} />
              ))}
            </View>
            <Row style={{ marginBottom: 14 }}>
              <Text style={[font.body, { flex: 1 }]}>{t('season.doubleRound')}</Text>
              <Switch value={doubleRound} onValueChange={setDoubleRound} trackColor={{ true: colors.accent, false: colors.border }} />
            </Row>
            <Text style={[font.tiny, { marginBottom: 12 }]}>
              {t('auto.capacity', { n: weekdays.length * times.length * pitchIds.length, m: Math.floor(teams.length / 2) })}
            </Text>
            <Button label={t('auto.propose')} icon="sparkles" onPress={() => propose(seed)} loading={busy} />
          </View>
        ) : (
          <View>
            <Card style={{ marginBottom: 12 }}>
              <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                <Pill icon="football" label={t('auto.nMatches', { n: plan.matches.length })} color={colors.accent} bg={colors.accentSoft} />
                <Pill icon="layers" label={t('auto.nRounds', { n: rounds.length })} />
                {lastDate ? <Pill icon="flag" label={t('auto.until', { d: dayLabel(lastDate, lang, t) })} /> : null}
                {plan.kept ? <Pill icon="checkmark-done" label={t('auto.kept', { n: plan.kept })} /> : null}
                {plan.replaced ? <Pill icon="swap-horizontal" label={t('auto.replaced', { n: plan.replaced })} color={colors.orange} bg={colors.orangeSoft} /> : null}
              </Row>
              {plan.unplaced.length ? (
                <Text style={[font.small, { color: colors.orange, marginTop: 10 }]}>{t('auto.unplaced', { n: plan.unplaced.length })}</Text>
              ) : null}
              <Text style={[font.tiny, { marginTop: 8 }]}>{t('auto.previewHint')}</Text>
            </Card>
            {rounds.map((r) => (
              <View key={r} style={{ marginBottom: 12 }}>
                <Text style={[font.small, { fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }]}>{t('match.round', { n: r })}</Text>
                {plan.matches
                  .filter((m) => m.round === r)
                  .map((m) => {
                    const key = `${m.pitchId}|${m.date}|${m.start}`;
                    return (
                      <View
                        key={key}
                        style={{ flexDirection: 'row', alignItems: 'center', padding: 8, marginBottom: 6, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
                      >
                        <View style={{ width: 128 }}>
                          <Text style={[font.tiny, { fontWeight: '700', color: colors.text }]}>{dayLabel(m.date, lang, t)}</Text>
                          <Text style={font.tiny}>
                            {m.start} · {pitchName(m.pitchId)}
                          </Text>
                        </View>
                        <TeamBadge team={teamById.get(m.homeTeamId)} size={22} />
                        <Text style={[font.small, { flex: 1, marginLeft: 6, color: colors.text, fontWeight: '700' }]} numberOfLines={1}>
                          {teamById.get(m.homeTeamId)?.name ?? '?'}
                        </Text>
                        <Text style={[font.tiny, { marginHorizontal: 6 }]}>vs</Text>
                        <Text style={[font.small, { flex: 1, marginRight: 6, color: colors.text, fontWeight: '700', textAlign: 'right' }]} numberOfLines={1}>
                          {teamById.get(m.awayTeamId)?.name ?? '?'}
                        </Text>
                        <TeamBadge team={teamById.get(m.awayTeamId)} size={22} />
                        <Pressable
                          onPress={() => setPlan({ ...plan, matches: plan.matches.filter((x) => x !== m) })}
                          hitSlop={8}
                          style={{ paddingLeft: 10 }}
                          accessibilityLabel={t('common.delete')}
                        >
                          <Ionicons name="close-circle" size={20} color={colors.red} />
                        </Pressable>
                      </View>
                    );
                  })}
              </View>
            ))}
            <Button label={t('auto.save', { n: plan.matches.length })} icon="checkmark-circle" onPress={save} loading={busy} disabled={!plan.matches.length} />
            <Row style={{ gap: 8, marginTop: 10 }}>
              <Button label={t('auto.reroll')} icon="shuffle" variant="secondary" small onPress={() => propose(seed + 1)} loading={busy} style={{ flex: 1 }} />
              <Button label={t('auto.back')} icon="options" variant="ghost" small onPress={() => setPlan(null)} style={{ flex: 1 }} />
            </Row>
          </View>
        )}
      </Sheet>
    </>
  );
}
