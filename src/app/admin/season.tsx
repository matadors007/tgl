import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Guard } from '@/ui/Guard';
import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { AppError } from '@/data/services';
import { addDays, CUP_MAX_TEAMS, CUP_MIN_TEAMS, isCup, teamRequestStatus, toDateKey, type ChampionshipCategory, type CupFormat, type Season } from '@/domain/model';
import { generateStartTimes } from '@/domain/model';
import { ask, notify } from '@/ui/dialogs';
import { TeamBadge } from '@/ui/football';
import { Button, Card, ChoiceGrid, Field, MaybeScreen, Pill, Row, Section, Segmented } from '@/ui/kit';
import { DateField, TimeChips } from '@/ui/datepicker';
import { LotDrawModal } from '@/ui/lotDraw';
import { colors, font } from '@/ui/theme';

/** Paramètres d'un championnat : identité, dates, règles, génération du calendrier, réinitialisation, suppression. */
export function ChampionshipSettings({ embedded, onDeleted }: { embedded?: boolean; onDeleted?: () => void } = {}) {
  const { t, season, teams, players, matches, pitches, services, config, can, standings, teamById } = useApp();
  const [name, setName] = useState(season?.name ?? '');
  const [category, setCategory] = useState<ChampionshipCategory>(season?.category ?? 'mixed');
  const [startD, setStartD] = useState<string | null>(season?.startDate ?? null);
  const [deadline, setDeadline] = useState<string | null>(season?.rosterDeadline ?? null);
  const [rules, setRules] = useState<Partial<Season>>({});
  const [cupFormat, setCupFormat] = useState<CupFormat>(season?.cupFormat ?? 'groups');
  const [maxTeams, setMaxTeams] = useState(String(season?.maxTeams ?? 8));
  const [groupCount, setGroupCount] = useState(String(season?.groupCount ?? 2));
  const [startDate, setStartDate] = useState(addDays(toDateKey(new Date()), 7));
  const [startTime, setStartTime] = useState('19:30');
  const [every, setEvery] = useState('7');
  const [calPitches, setCalPitches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /** Équipes du tirage au sort en cours (fenêtre animée ouverte). */
  const [drawIds, setDrawIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!season) return;
    setRules(season);
    setName(season.name);
    setCategory(season.category ?? 'mixed');
    setStartD(season.startDate ?? null);
    setDeadline(season.rosterDeadline ?? null);
    setCupFormat(season.cupFormat ?? 'groups');
    setMaxTeams(String(season.maxTeams ?? 8));
    setGroupCount(String(season.groupCount ?? 2));
  }, [season]);
  useEffect(() => {
    if (!calPitches.length && pitches.length) setCalPitches(pitches.filter((p) => p.active).slice(0, 2).map((p) => p.id));
  }, [pitches, calPitches.length]);

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

  if (!season) return <MaybeScreen embedded={embedded} edges={[]}><Text style={font.small}>{t('st.noSeason')}</Text></MaybeScreen>;

  const saveIdentity = () =>
    guard(async () => {
      if (!name.trim()) throw new Error('name');
      if (startD && deadline && deadline < startD && !(await ask(t('champ.deadline'), t('champ.deadlineBefore'), t('common.confirm'), t('common.cancel')))) return;
      const cup: Partial<Season> = {};
      if (isCup(season)) {
        const n = Number(maxTeams);
        const g = Number(groupCount);
        if (!Number.isInteger(n) || n < CUP_MIN_TEAMS || n > CUP_MAX_TEAMS) return notify(t('cup.errTeams'));
        if (cupFormat === 'groups' && (!Number.isInteger(g) || g < 1 || n / g < 2)) return notify(t('cup.errGroups'));
        Object.assign(cup, { cupFormat, maxTeams: n, groupCount: cupFormat === 'groups' ? g : null });
      }
      await services.updateSeason(season.id, { name: name.trim(), category, startDate: startD, rosterDeadline: deadline, ...cup });
      notify(t('champ.saved'));
    });

  const registration = season.status === 'registration';
  const num = (k: keyof Season) => String(rules[k] ?? '');
  const setNum = (k: keyof Season) => (v: string) => setRules({ ...rules, [k]: Number(v.replace(/[^\d]/g, '')) || 0 });

  const saveRules = () =>
    guard(() =>
      services.updateSeason(season.id, {
        pointsWin: rules.pointsWin,
        pointsDraw: rules.pointsDraw,
        pointsLoss: rules.pointsLoss,
        yellowLimit: rules.yellowLimit,
        redBanMatches: rules.redBanMatches,
        halfMinutes: rules.halfMinutes,
        doubleRound: rules.doubleRound,
      }),
    );

  const generate = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{2}:\d{2}$/.test(startTime)) return notify(t('common.error'));
    if (matches.length && !(await ask(t('season.generate'), t('season.regenerateWarn'), t('common.confirm'), t('common.cancel')))) return;
    guard(async () => {
      const res = await services.generateCalendar(
        { ...season, doubleRound: rules.doubleRound ?? season.doubleRound },
        teams,
        {
          startDate,
          startTime,
          daysBetweenRounds: Math.max(1, Number(every) || 7),
          pitches: pitches.filter((p) => calPitches.includes(p.id)),
          slotMinutes: config.slotMinutes,
        },
        matches,
      );
      notify(
        t('season.generated', { n: res.created }) +
          (res.conflicts.length ? `\n\n${t('season.conflicts', { list: res.conflicts.join(', ') })}` : ''),
      );
    });
  };

  const rounds = teams.length < 2 ? 0 : (teams.length % 2 ? teams.length : teams.length - 1) * (rules.doubleRound ? 2 : 1);

  const editable = can('champ.edit');
  return (
    <MaybeScreen embedded={embedded} edges={[]}>
      <Card>
        <Row>
          <Text style={[font.h2, { flex: 1 }]}>{season.name}</Text>
          <Pill
            label={t(`season.status.${season.status}` as 'season.status.running')}
            color={registration ? colors.orange : season.status === 'running' ? colors.accent : colors.muted}
            bg={registration ? colors.orangeSoft : season.status === 'running' ? colors.accentSoft : undefined}
          />
        </Row>
        <Text style={[font.small, { marginTop: 6 }]}>
          {teams.length} {t('season.teams').toLowerCase()} · {players.length} {t('season.players').toLowerCase()} · {matches.length} {t('tab.matches').toLowerCase()}
        </Text>
      </Card>

      {editable ? (
        <Section title={t('champ.identity')}>
          <Card>
            <Field label={t('season.name')} value={name} onChangeText={setName} />
            <Text style={[font.small, { marginBottom: 6, fontWeight: '600' }]}>{t('champ.category')}</Text>
            <Segmented<ChampionshipCategory>
              value={category}
              onChange={setCategory}
              options={[
                { value: 'mixed', label: t('champ.cat.mixed') },
                { value: 'over35', label: t('champ.cat.over35') },
              ]}
            />
            <View style={{ height: 12 }} />
            {isCup(season) ? (
              <View>
                <Text style={[font.small, { marginBottom: 6, fontWeight: '600' }]}>{t('cup.format')}</Text>
                <Segmented<CupFormat>
                  value={cupFormat}
                  onChange={setCupFormat}
                  options={[
                    { value: 'groups', label: t('cup.format.groups') },
                    { value: 'knockout', label: t('cup.format.knockout') },
                  ]}
                />
                <View style={{ height: 12 }} />
                <Row style={{ gap: 10, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Field label={t('cup.maxTeams')} value={maxTeams} onChangeText={(v) => setMaxTeams(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" />
                  </View>
                  {cupFormat === 'groups' ? (
                    <View style={{ flex: 1 }}>
                      <Field label={t('cup.groupCount')} value={groupCount} onChangeText={(v) => setGroupCount(v.replace(/[^\d]/g, '').slice(0, 1))} keyboardType="number-pad" />
                    </View>
                  ) : null}
                </Row>
                <Text style={[font.tiny, { marginTop: -6, marginBottom: 12 }]}>
                  {t('cup.maxTeamsHint')} {t('cup.teamsOf', { n: teams.filter((x) => teamRequestStatus(x) === 'approved').length, max: maxTeams || '?' })}
                </Text>
              </View>
            ) : null}
            <DateField label={t('champ.startDate')} value={startD} onChange={setStartD} />
            <DateField label={t('champ.deadline')} value={deadline} onChange={setDeadline} />
            <Text style={[font.tiny, { marginTop: -6, marginBottom: 12 }]}>{t('champ.deadlineHint')}</Text>
            {deadline ? <Button small variant="ghost" label={t('champ.noDeadline')} onPress={() => setDeadline(null)} style={{ marginBottom: 10 }} /> : null}
            <Button label={t('common.save')} icon="save" onPress={saveIdentity} loading={busy} />
          </Card>
        </Section>
      ) : null}

      {editable ? (
      <Section title={t('season.rules')}>
        <Card>
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label={t('season.ptsWin')} value={num('pointsWin')} onChangeText={setNum('pointsWin')} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('season.ptsDraw')} value={num('pointsDraw')} onChangeText={setNum('pointsDraw')} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('season.ptsLoss')} value={num('pointsLoss')} onChangeText={setNum('pointsLoss')} keyboardType="number-pad" />
            </View>
          </Row>
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label={t('season.yellowLimit')} value={num('yellowLimit')} onChangeText={setNum('yellowLimit')} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('season.redBan')} value={num('redBanMatches')} onChangeText={setNum('redBanMatches')} keyboardType="number-pad" />
            </View>
          </Row>
          <Field label={t('season.halfMinutes')} value={num('halfMinutes')} onChangeText={setNum('halfMinutes')} keyboardType="number-pad" />
          {!isCup(season) ? (
          <Row style={{ marginBottom: 12 }}>
            <Text style={[font.body, { flex: 1 }]}>{t('season.doubleRound')}</Text>
            <Switch
              value={!!rules.doubleRound}
              disabled={!registration}
              onValueChange={(v) => setRules({ ...rules, doubleRound: v })}
              trackColor={{ true: colors.accent, false: colors.border }}
            />
          </Row>
          ) : null}
          <Button label={t('common.save')} icon="save" variant="secondary" onPress={saveRules} loading={busy} />
        </Card>
      </Section>
      ) : null}

      {editable && (standings.some((r) => r.tieLot) || season.lotOrder?.length) ? (
        <Section title={t('lot.title')}>
          <Card>
            <Text style={[font.small, { marginBottom: 10 }]}>{t('lot.hint')}</Text>
            {season.status !== 'finished' ? (
              <Row style={{ gap: 6, marginBottom: 10 }}>
                <Ionicons name="lock-closed" size={14} color={colors.orange} />
                <Text style={[font.small, { color: colors.orange, flex: 1 }]}>{t('lot.onlyFinished')}</Text>
              </Row>
            ) : null}
            {[...new Set(standings.filter((r) => r.tieLot).map((r) => `${r.points}|${r.goalDiff}|${r.goalsFor}`))].map((k) => {
              const ids = standings.filter((r) => r.tieLot && `${r.points}|${r.goalDiff}|${r.goalsFor}` === k).map((r) => r.teamId);
              return (
                <View key={k} style={{ marginBottom: 10 }}>
                  <Text style={[font.body, { fontWeight: '700', marginBottom: 6 }]}>{ids.map((id) => teamById.get(id)?.name ?? '?').join(' · ')}</Text>
                  <Button
                    small
                    icon="shuffle"
                    label={t('lot.draw')}
                    disabled={season.status !== 'finished' || !!drawIds}
                    onPress={() => setDrawIds(ids)}
                  />
                </View>
              );
            })}
            {drawIds ? (
              <LotDrawModal
                teams={drawIds.map((id) => teamById.get(id)).filter((x): x is NonNullable<typeof x> => !!x)}
                run={() => services.drawLots(season, drawIds)}
                t={t}
                onClose={(e) => {
                  setDrawIds(null);
                  if (e) notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
                }}
              />
            ) : null}
            {season.lotOrder?.length ? (
              <Button small variant="ghost" label={t('lot.reset')} onPress={() => guard(() => services.updateSeason(season.id, { lotOrder: null }))} />
            ) : null}
          </Card>
        </Section>
      ) : null}

      {registration && can('matches.calendar') && !isCup(season) ? (
        <Section title={t('season.calendar')}>
          <Card>
            <Text style={[font.small, { marginBottom: 12 }]}>
              {teams.length} {t('season.teams').toLowerCase()} → {rounds} {t('match.round', { n: '' }).trim().toLowerCase()}s
            </Text>
            <DateField label={t('season.startDate')} value={startDate} onChange={setStartDate} min={toDateKey(new Date())} />
            <Text style={[font.small, { marginBottom: 6, fontWeight: '600' }]}>{t('season.startTime')}</Text>
            <TimeChips value={startTime} onChange={setStartTime} options={generateStartTimes(config.openMinutes, config.closeMinutes, config.slotMinutes)} />
            <View style={{ height: 12 }} />
            <Field label={t('season.every')} value={every} onChangeText={setEvery} keyboardType="number-pad" />
            <Text style={[font.small, { marginBottom: 8, fontWeight: '600' }]}>{t('season.pitches')}</Text>
            <ChoiceGrid
              items={pitches.filter((p) => p.active)}
              keyOf={(p) => p.id}
              labelOf={(p) => p.name}
              sublabelOf={(p) => p.type}
              selected={(p) => calPitches.includes(p.id)}
              onPick={(p) => setCalPitches(calPitches.includes(p.id) ? calPitches.filter((x) => x !== p.id) : [...calPitches, p.id])}
            />
            {matches.length ? <Text style={[font.small, { color: colors.orange, marginTop: 10 }]}>{t('season.regenerateWarn')}</Text> : null}
            <Button label={t('season.generate')} icon="calendar" style={{ marginTop: 12 }} onPress={generate} loading={busy} disabled={teams.length < 2} />
          </Card>
        </Section>
      ) : null}

      {editable || can('champ.delete') ? (
      <Section>
        {editable && season.status === 'running' ? (
          <Button
            label={t('season.finish')}
            variant="ghost"
            icon="flag"
            onPress={async () => {
              if (await ask(t('season.finish'), season.name, t('common.confirm'), t('common.cancel')))
                guard(() => services.updateSeason(season.id, { status: 'finished' }));
            }}
          />
        ) : null}
        {editable ? (
        <>
        <Button
          label={t('season.reset')}
          variant="danger"
          icon="refresh-circle"
          style={{ marginTop: 10 }}
          loading={busy}
          onPress={async () => {
            if (!(await ask(t('season.reset'), t('season.resetWarn'), t('season.reset'), t('common.cancel')))) return;
            guard(async () => {
              const r = await services.resetSeason(season);
              notify(t('season.resetDone', { m: r.matches, t: r.teams, p: r.players }));
            });
          }}
        />
        <Text style={[font.small, { marginTop: 6 }]}>{t('season.resetWarn')}</Text>
        </>
        ) : null}
        {can('champ.delete') ? (
          <>
            <Button
              label={t('champ.delete')}
              variant="danger"
              icon="trash"
              style={{ marginTop: 16 }}
              loading={busy}
              onPress={async () => {
                if (!(await ask(t('champ.deleteQ', { n: season.name }), t('champ.deleteWarn'), t('common.delete'), t('common.cancel')))) return;
                guard(async () => {
                  await services.deleteSeason(season);
                  notify(t('champ.deleted'));
                  onDeleted?.();
                });
              }}
            />
          </>
        ) : null}
      </Section>
      ) : null}
    </MaybeScreen>
  );
}

export default function GuardedSeasonAdmin() {
  return (
    <Guard allow="champ.edit">
      <ChampionshipSettings />
    </Guard>
  );
}
