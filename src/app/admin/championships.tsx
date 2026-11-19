import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { AppError } from '@/data/services';
import { CUP_MAX_TEAMS, CUP_MIN_TEAMS, isCup, isLive, teamRequestStatus, type ChampionshipCategory, type CompetitionKind, type CupFormat, type Season } from '@/domain/model';
import { DateField } from '@/ui/datepicker';
import { notify } from '@/ui/dialogs';
import { Button, Empty, Field, Header, Pill, Row, Screen, Segmented, Sheet } from '@/ui/kit';
import { colors, font, radius } from '@/ui/theme';
import { useWideWeb } from '@/ui/web';
import { Redirect } from 'expo-router';

/** Rubrique « Championnats » : liste, création (mixte, +35…), accès à chaque championnat. */
export default function ChampionshipsScreen() {
  const { t, championships, canChamp, can, services } = useApp();
  const wide = useWideWeb();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ChampionshipCategory>('mixed');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [kind, setKind] = useState<CompetitionKind>('league');
  const [cupFormat, setCupFormat] = useState<CupFormat>('groups');
  const [maxTeams, setMaxTeams] = useState('8');
  const [groupCount, setGroupCount] = useState('2');
  const [busy, setBusy] = useState(false);
  if (!canChamp) return <Redirect href="/admin" />;

  const create = async () => {
    if (!name.trim()) return notify(t('auth.errFields'));
    const n = Number(maxTeams);
    const g = Number(groupCount);
    if (kind === 'cup') {
      if (!Number.isInteger(n) || n < CUP_MIN_TEAMS || n > CUP_MAX_TEAMS) return notify(t('cup.errTeams'));
      if (cupFormat === 'groups' && (!Number.isInteger(g) || g < 1 || n / g < 2)) return notify(t('cup.errGroups'));
    }
    setBusy(true);
    try {
      const id = await services.createSeason(name.trim(), {
        category,
        startDate,
        rosterDeadline: deadline,
        kind,
        ...(kind === 'cup' ? { cupFormat, maxTeams: n, groupCount: cupFormat === 'groups' ? g : null } : {}),
      });
      setCreating(false);
      setName('');
      router.push(`/admin/championship/${id}`);
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <Header
        title={t('champ.title')}
        subtitle={t('champ.listSub')}
        right={can('champ.create') ? <Button small icon="add-circle" label={t('champ.create')} onPress={() => setCreating(true)} /> : undefined}
      />
      {!championships.length ? <Empty text={t('champ.none')} icon="trophy-outline" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
        {championships.map((c) => (
          <View key={c.id} style={{ width: wide ? '50%' : '100%', padding: 6 }}>
            <ChampCard c={c} />
          </View>
        ))}
      </View>

      <Sheet visible={creating} onClose={() => setCreating(false)} title={t('champ.createAny')}>
        <Text style={[font.small, { marginBottom: 6, fontWeight: '600' }]}>{t('cup.kind')}</Text>
        <Segmented<CompetitionKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'league', label: t('cup.kind.league') },
            { value: 'cup', label: t('cup.kind.cup') },
          ]}
        />
        <View style={{ height: 12 }} />
        <Field label={t('season.name')} value={name} onChangeText={setName} placeholder={kind === 'cup' ? t('cup.namePh') : category === 'over35' ? 'Tunisia Silver League' : 'Tunisia Golden League'} />
        <Text style={[font.small, { marginBottom: 6, fontWeight: '600' }]}>{t('champ.category')}</Text>
        <Segmented<ChampionshipCategory>
          value={category}
          onChange={(v) => {
            setCategory(v);
            if (!name.trim() && kind === 'league') setName(v === 'over35' ? 'Tunisia Silver League' : 'Tunisia Golden League');
          }}
          options={[
            { value: 'mixed', label: t('champ.cat.mixed') },
            { value: 'over35', label: t('champ.cat.over35') },
          ]}
        />
        <View style={{ height: 12 }} />
        {kind === 'cup' ? (
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
            <Text style={[font.tiny, { marginTop: 6, marginBottom: 12 }]}>{t(`cup.formatHint.${cupFormat}` as 'cup.formatHint.groups')}</Text>
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
            <Text style={[font.tiny, { marginTop: -6, marginBottom: 12 }]}>{t('cup.maxTeamsHint')}</Text>
          </View>
        ) : null}
        <DateField label={t('champ.startDate')} value={startDate} onChange={setStartDate} />
        <DateField label={t('champ.deadline')} value={deadline} onChange={setDeadline} />
        <Text style={[font.tiny, { marginTop: -6, marginBottom: 12 }]}>{t('champ.deadlineHint')}</Text>
        <Button label={kind === 'cup' ? t('cup.create') : t('champ.create')} icon="add-circle" onPress={create} loading={busy} />
      </Sheet>
    </Screen>
  );
}

export function ChampCard({ c, onPress, selected }: { c: Season; onPress?: () => void; selected?: boolean }) {
  const { t, teamsAll, matchesAll, playersAll , isOperator } = useApp();
  const teams = teamsAll.filter((x) => x.seasonId === c.id);
  const approved = teams.filter((x) => teamRequestStatus(x) === 'approved');
  const toValidate = teams.filter((x) => teamRequestStatus(x) === 'submitted').length + playersAll.filter((p) => p.seasonId === c.id && p.status === 'pending').length;
  const matches = matchesAll.filter((m) => m.seasonId === c.id);
  const live = matches.filter(isLive).length;
  const st = c.status === 'registration' ? { c: colors.orange, bg: colors.orangeSoft } : c.status === 'running' ? { c: colors.accent, bg: colors.accentSoft } : { c: colors.muted, bg: undefined };
  return (
    <Pressable
      onPress={onPress ?? (() => router.push(`/admin/championship/${c.id}`))}
      style={({ pressed }) => ({
        padding: 16,
        borderRadius: radius.lg,
        backgroundColor: selected ? colors.accentSoft : colors.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.accent : colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Row>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={isCup(c) ? 'git-network' : 'trophy'} size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={font.h3}>{c.name}</Text>
          <Text style={font.small}>
            {isCup(c) ? `${t('cup.kind.cup')} · ${t(`cup.format.${c.cupFormat ?? 'groups'}` as 'cup.format.groups')} · ` : ''}
            {t(`champ.cat.${c.category ?? 'mixed'}` as 'champ.cat.mixed')}
          </Text>
        </View>
        <Pill label={t(`season.status.${c.status}` as 'season.status.running')} color={st.c} bg={st.bg} />
      </Row>
      <Row style={{ marginTop: 12, gap: 6, flexWrap: 'wrap' }}>
        <Pill
          label={isCup(c) && c.maxTeams ? t('cup.teamsOf', { n: approved.length, max: c.maxTeams }) : t('champ.nTeams', { n: approved.length })}
          icon="shield"
          color={isCup(c) && c.maxTeams && approved.length >= c.maxTeams ? colors.accent : undefined}
        />
        <Pill label={t('champ.nMatches', { n: matches.length })} icon="football" />
        {toValidate && !isOperator ? <Pill label={t('champ.toValidate', { n: toValidate })} color={colors.orange} bg={colors.orangeSoft} icon="alert-circle" /> : null}
        {live ? <Pill label={`LIVE ${live}`} color={colors.live} bg={colors.liveSoft} /> : null}
        {c.rosterDeadline ? <Pill label={t('champ.deadlineShort', { d: c.rosterDeadline.split('-').reverse().join('/') })} icon="time" /> : null}
      </Row>
    </Pressable>
  );
}
