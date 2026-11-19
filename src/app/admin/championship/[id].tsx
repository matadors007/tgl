import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { groupLetters, hasGroups, isCup, teamRequestStatus, type Team } from '@/domain/model';
import { notify } from '@/ui/dialogs';
import { TeamBadge } from '@/ui/football';
import { Button, Empty, Pill, Row, Screen, Segmented } from '@/ui/kit';
import { colors, font, radius } from '@/ui/theme';
import { useWideWeb } from '@/ui/web';
import { CalendarPanel } from '../calendar';
import { ChampionshipSettings } from '../season';
import { ValidationPanel } from '../validation';

type Tab = 'teams' | 'validation' | 'matches' | 'settings';

/** Un championnat : équipes (et leurs cartes de licence), validation, matchs, paramètres. */
export default function ChampionshipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, championships, season, setChampionship, can, canChamp, allTeams, allPlayers } = useApp();
  const nav = useNavigation();
  const champ = championships.find((c) => c.id === id);
  // Toute la rubrique travaille sur ce championnat
  useEffect(() => {
    if (champ && season?.id !== champ.id) setChampionship(champ.id);
  }, [champ, season?.id, setChampionship]);
  useEffect(() => {
    if (champ) nav.setOptions({ title: champ.name });
  }, [champ, nav]);
  const toValidate = allTeams.filter((x) => teamRequestStatus(x) === 'submitted').length + allPlayers.filter((p) => p.status === 'pending').length;
  const tabs: { value: Tab; label: string; badge?: number }[] = [
    ...(can('licences') || can('teams.validate') || can('champ.edit') ? [{ value: 'teams' as Tab, label: t('champ.tabTeams') }] : []),
    ...(can('teams.validate') ? [{ value: 'validation' as Tab, label: t('champ.tabValidation'), badge: toValidate || undefined }] : []),
    ...(can('matches.calendar') || can('matches.sheet') || can('matches.live') ? [{ value: 'matches' as Tab, label: t('champ.tabMatches') }] : []),
    ...(can('champ.edit') || can('champ.delete') ? [{ value: 'settings' as Tab, label: t('champ.tabSettings') }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]?.value ?? 'teams');
  if (!canChamp) return <Redirect href="/admin" />;
  if (!champ) return <Screen edges={[]}><Empty text={t('champ.none')} /></Screen>;
  const ready = season?.id === champ.id;
  return (
    <Screen edges={[]}>
      {tabs.length > 1 ? <Segmented scroll value={tab} onChange={setTab} options={tabs} /> : null}
      <View style={{ height: 14 }} />
      {!ready ? <Empty text={t('common.loading')} /> : null}
      {ready && tab === 'teams' ? <TeamsTab /> : null}
      {ready && tab === 'validation' ? <ValidationPanel embedded /> : null}
      {ready && tab === 'matches' ? <CalendarPanel embedded /> : null}
      {ready && tab === 'settings' ? <ChampionshipSettings embedded onDeleted={() => router.replace('/admin/championships')} /> : null}
    </Screen>
  );
}

/** Équipes du championnat : logo, nom, effectif ; « Consulter » ouvre les cartes de licence de l'équipe. */
function TeamsTab() {
  const { t, allTeams, allPlayers, season, can } = useApp();
  const wide = useWideWeb();
  const groups = hasGroups(season) ? groupLetters(season?.groupCount) : null;
  const list = [...allTeams].sort(
    (a, b) =>
      Number(teamRequestStatus(b) === 'approved') - Number(teamRequestStatus(a) === 'approved') ||
      (groups ? (a.group ?? 'Z').localeCompare(b.group ?? 'Z') : 0) ||
      a.name.localeCompare(b.name),
  );
  const approvedN = allTeams.filter((x) => teamRequestStatus(x) === 'approved').length;
  return (
    <View>
      {isCup(season) && season?.maxTeams ? (
        <Row style={{ marginBottom: 8, gap: 6, flexWrap: 'wrap' }}>
          <Pill icon="git-network" label={`${t('cup.kind.cup')} · ${t(`cup.format.${season.cupFormat ?? 'groups'}` as 'cup.format.groups')}`} />
          <Pill
            icon="shield"
            label={t('cup.teamsOf', { n: approvedN, max: season.maxTeams })}
            color={approvedN >= season.maxTeams ? colors.accent : undefined}
          />
          {groups ? groups.map((g) => <Pill key={g} label={`${t('cup.groupN', { g })} : ${allTeams.filter((x) => x.group === g).length}`} />) : null}
        </Row>
      ) : null}
      <Row style={{ marginBottom: 10 }}>
        <Text style={[font.small, { flex: 1 }]}>
          {t('champ.teamsHint')}
          {groups && can('champ.edit') ? ` ${t('cup.assignHint')}` : ''}
        </Text>
        {can('champ.edit') && season?.status === 'registration' ? (
          <Button small icon="add" label={t('common.add')} onPress={() => router.push('/admin/team/new')} />
        ) : null}
      </Row>
      {!list.length ? <Empty text={t('champ.noTeams')} icon="shield-outline" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
        {list.map((tm) => (
          <View key={tm.id} style={{ width: wide ? '50%' : '100%', padding: 5 }}>
            <TeamCard team={tm} groups={groups} count={allPlayers.filter((p) => p.teamId === tm.id && (!p.status || p.status === 'approved')).length} />
          </View>
        ))}
      </View>
    </View>
  );
}

function TeamCard({ team, count, groups }: { team: Team; count: number; groups: string[] | null }) {
  const { t, can, services } = useApp();
  const st = teamRequestStatus(team);
  const approved = st === 'approved';
  // Poule suivante : A → B → … → sans poule → A
  const nextGroup = () => {
    if (!groups) return;
    const i = team.group ? groups.indexOf(team.group) : -1;
    const next = i + 1 < groups.length ? groups[i + 1] : null;
    services.setTeamGroup(team.id, next).catch(() => notify(t('common.error')));
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
      {groups ? (
        <Pressable
          onPress={can('champ.edit') ? nextGroup : undefined}
          accessibilityLabel={`${t('cup.group')} ${team.group ?? '—'}`}
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            marginRight: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: team.group ? colors.accent : colors.bgElevated,
            borderWidth: 1,
            borderColor: team.group ? colors.accent : colors.border,
          }}
        >
          <Text style={{ color: team.group ? colors.onAccent : colors.faint, fontWeight: '900', fontSize: 15 }}>{team.group ?? '—'}</Text>
        </Pressable>
      ) : null}
      <TeamBadge team={team} size={46} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[font.body, { fontWeight: '800' }]} numberOfLines={1}>
          {team.name}
        </Text>
        <Text style={font.tiny} numberOfLines={1}>
          {team.company} · {t('champ.nPlayers', { n: count })}
        </Text>
        {!approved ? (
          <View style={{ marginTop: 4 }}>
            <Pill label={t(`reg.status.${st}` as 'reg.status.submitted')} color={colors.orange} bg={colors.orangeSoft} />
          </View>
        ) : null}
      </View>
      {can('licences') && approved ? (
        <Pressable
          onPress={() => router.push({ pathname: '/admin/licences', params: { team: team.id } })}
          accessibilityLabel={t('champ.consult')}
          style={{ alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.accentSoft }}
        >
          <Ionicons name="card" size={20} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800', marginTop: 2 }}>{t('champ.consult')}</Text>
        </Pressable>
      ) : null}
      {can('champ.edit') ? (
        <Pressable onPress={() => router.push(`/admin/team/${team.id}`)} hitSlop={8} style={{ padding: 8, marginLeft: 4 }} accessibilityLabel={t('common.edit')}>
          <Ionicons name="create-outline" size={20} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
