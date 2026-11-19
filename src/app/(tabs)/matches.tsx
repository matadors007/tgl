import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { ChampionshipSwitch } from '@/ui/championship';
import { isLive, type Match } from '@/domain/model';
import { MatchRow } from '@/ui/football';
import { stageSections } from '@/ui/stage';
import { StandingsPanel } from './standings';
import { OperatorChampionship } from '@/ui/operator';
import { dayLabel } from '@/ui/format';
import { Empty, Header, Screen, Segmented } from '@/ui/kit';
import { colors, font, radius } from '@/ui/theme';

type Filter = 'mine' | 'all' | 'live' | 'finished' | 'upcoming' | 'favorites' | 'standings';

function MatchesScreenInner() {
  const { t, lang, matches, season, followedMatchIds, followedTeamIds, isCompany, myTeams } = useApp();
  const myIds = myTeams.map((x) => x.id);
  const liveCount = matches.filter(isLive).length;
  const [filter, setFilter] = useState<Filter>(liveCount ? 'live' : isCompany && myTeams.length ? 'mine' : 'all');

  const groups = useMemo(() => {
    let list: Match[] = matches;
    if (filter === 'live') list = matches.filter(isLive);
    if (filter === 'finished') list = [...matches.filter((m) => m.status === 'finished')].reverse();
    if (filter === 'upcoming') list = matches.filter((m) => m.status === 'scheduled' || m.status === 'postponed');
    // Favoris : matchs suivis (étoile) et matchs des équipes suivies
    if (filter === 'favorites')
      list = matches.filter((m) => followedMatchIds.includes(m.id) || followedTeamIds.includes(m.homeTeamId) || followedTeamIds.includes(m.awayTeamId));
    if (filter === 'standings') list = [];
    // Entreprise : calendrier de son équipe
    if (filter === 'mine') list = matches.filter((m) => myIds.includes(m.homeTeamId) || myIds.includes(m.awayTeamId));
    return stageSections(list, t, filter === 'finished');
  }, [matches, filter, t, followedMatchIds, followedTeamIds, myTeams]);

  return (
    <Screen>
      <Header title={t('tab.championship')} subtitle={season?.name} />
      <ChampionshipSwitch />
      <Segmented<Filter>
        scroll
        value={filter}
        onChange={setFilter}
        options={[
          ...(isCompany && myTeams.some((x) => x.seasonId === season?.id) ? [{ value: 'mine' as Filter, label: t('tab.company') }] : []),
          { value: 'all', label: t('match.all') },
          { value: 'live', label: t('match.live'), badge: liveCount },
          { value: 'finished', label: t('match.finishedTab') },
          { value: 'upcoming', label: t('match.upcomingTab') },
          { value: 'favorites', label: `★ ${t('match.favorites')}` },
          { value: 'standings', label: t('tab.standings') },
        ]}
      />
      <View style={{ height: 12 }} />
      {filter === 'standings' ? <StandingsPanel /> : null}
      {filter === 'favorites' ? <Text style={[font.small, { marginBottom: 10 }]}>{t('match.favoritesHint')}</Text> : null}
      {!groups.length && filter !== 'standings' ? <Empty text={season ? (filter === 'favorites' ? t('match.noFavorites') : t('common.empty')) : t('st.noSeason')} icon={filter === 'favorites' ? 'star-outline' : undefined} /> : null}
      {groups.map(({ key, label, matches: list }) => {
        const dates = [...new Set(list.map((m) => m.date))];
        return (
          <View key={key} style={{ marginBottom: 14, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            <View style={{ backgroundColor: colors.cardAlt, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row' }}>
              <Text style={[font.h3, { fontSize: 13, flex: 1 }]}>{label}</Text>
              <Text style={font.small}>{dates.map((d) => dayLabel(d, lang, t)).join(' · ')}</Text>
            </View>
            {list.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

export default function MatchesScreen() {
  const { isOperator } = useApp();
  // Opérateur : cartes des championnats, calendrier et console live
  return isOperator ? <OperatorChampionship /> : <MatchesScreenInner />;
}
