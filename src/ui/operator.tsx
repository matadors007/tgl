/**
 * Opérateur de match : rubrique « Championnat ».
 * Cartes des championnats (comme l'administration), calendrier du championnat choisi,
 * bouton « Console live » ouvert 5 minutes avant le coup d'envoi, après la feuille de match.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { isLive, matchPlannedAt, sheetReady, type Match } from '@/domain/model';
import { ChampCard } from '@/app/admin/championships';
import { ask } from './dialogs';
import { TeamBadge } from './football';
import { dayLabel } from './format';
import { Button, Card, Empty, Header, Pill, Row, Screen, Segmented } from './kit';
import { stageSections } from './stage';
import { colors, font } from './theme';
import { useWideWeb } from './web';

/** La console live s'ouvre 5 minutes avant l'heure du match. */
export const CONSOLE_OPEN_BEFORE_MS = 5 * 60_000;

type Filter = 'upcoming' | 'live' | 'played' | 'all';

export function OperatorChampionship() {
  const { t, championships, season, setChampionship, matches } = useApp();
  const wide = useWideWeb();
  const [filter, setFilter] = useState<Filter>(matches.some(isLive) ? 'live' : 'upcoming');
  const list = useMemo(() => {
    const keep = (m: Match) =>
      filter === 'all' ||
      (filter === 'live' && isLive(m)) ||
      (filter === 'upcoming' && (m.status === 'scheduled' || m.status === 'postponed' || isLive(m))) ||
      (filter === 'played' && m.status === 'finished');
    return matches.filter(keep).sort((a, b) => matchPlannedAt(a) - matchPlannedAt(b));
  }, [matches, filter]);
  const sections = useMemo(() => stageSections(list, t, filter === 'played'), [list, t, filter]);
  const live = matches.filter(isLive).length;

  return (
    <Screen>
      <Header title={t('tab.championship')} subtitle={t('op.sub')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
        {championships.map((c) => (
          <View key={c.id} style={{ width: wide ? '50%' : '100%', padding: 6 }}>
            <ChampCard c={c} selected={c.id === season?.id} onPress={() => setChampionship(c.id)} />
          </View>
        ))}
      </View>
      {!championships.length ? <Empty text={t('champ.none')} icon="trophy-outline" /> : null}
      {season ? (
        <>
          <Text style={[font.h2, { marginTop: 16, marginBottom: 10 }]}>{t('op.calendar', { name: season.name })}</Text>
          <Segmented<Filter>
            scroll
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'live', label: t('match.live'), badge: live || undefined },
              { value: 'upcoming', label: t('cal.fUpcoming') },
              { value: 'played', label: t('cal.fPlayed') },
              { value: 'all', label: t('cal.fAll') },
            ]}
          />
          {!sections.length ? <Empty text={t('cal.empty')} icon="calendar-outline" /> : null}
          {sections.map((sec) => (
            <View key={sec.key} style={{ marginTop: 16 }}>
              <Text style={[font.small, { fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }]}>{sec.label}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
                {sec.matches.map((m) => (
                  <View key={m.id} style={{ width: wide ? '50%' : '100%', padding: 5 }}>
                    <OperatorMatchCard m={m} />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function OperatorMatchCard({ m }: { m: Match }) {
  const { t, lang, teamById, pitches } = useApp();
  const now = useNow(20_000);
  const home = teamById.get(m.homeTeamId);
  const away = teamById.get(m.awayTeamId);
  const pitch = pitches.find((p) => p.id === m.pitchId);
  const live = isLive(m);
  const started = live || m.status === 'finished';
  const openAt = matchPlannedAt(m) - CONSOLE_OPEN_BEFORE_MS;
  const canOpen = started || (m.status === 'scheduled' && now >= openAt);
  const opensAt = new Date(openAt).toTimeString().slice(0, 5);

  const openConsole = async () => {
    if (!started && !sheetReady(m)) {
      // La console ne démarre qu'avec la feuille de match remplie
      if (await ask(t('op.noSheetTitle'), t('op.noSheet'), t('op.fillSheet'), t('common.cancel'))) router.push(`/admin/live/${m.id}`);
      return;
    }
    router.push(`/admin/live/${m.id}`);
  };

  return (
    <Card style={{ padding: 12, borderColor: live ? colors.live : colors.border }}>
      <Row style={{ marginBottom: 8 }}>
        <Ionicons name="calendar" size={14} color={colors.accent} />
        <Text style={[font.small, { flex: 1, marginLeft: 6, fontWeight: '700' }]}>
          {dayLabel(m.date, lang, t)} · {m.start}
          {pitch ? ` · ${pitch.name}` : ''}
        </Text>
        {live ? <Pill label="LIVE" color={colors.live} bg={colors.liveSoft} /> : m.status === 'finished' ? <Pill label={t('cal.played')} /> : m.status === 'postponed' ? <Pill label={t('match.postponed')} color={colors.orange} bg={colors.orangeSoft} /> : null}
      </Row>
      <Row>
        <TeamBadge team={home} size={28} />
        <Text style={[font.body, { flex: 1, marginLeft: 8, fontWeight: '700' }]} numberOfLines={1}>
          {home?.name ?? '?'}
        </Text>
        <Text style={[font.h3, { marginHorizontal: 8 }]}>{started ? `${m.homeScore} – ${m.awayScore}` : 'vs'}</Text>
        <Text style={[font.body, { flex: 1, marginRight: 8, fontWeight: '700', textAlign: 'right' }]} numberOfLines={1}>
          {away?.name ?? '?'}
        </Text>
        <TeamBadge team={away} size={28} />
      </Row>
      <Row style={{ marginTop: 10, gap: 8 }}>
        {m.status === 'scheduled' ? (
          sheetReady(m) ? (
            <Ionicons name="clipboard" size={18} color={colors.success} accessibilityLabel={t('msheet.stReady')} />
          ) : (
            <Pill label={t('msheet.stMissing')} color={colors.orange} bg={colors.orangeSoft} icon="clipboard" />
          )
        ) : null}
        <View style={{ flex: 1 }} />
        {m.status !== 'postponed' ? (
          <Button
            small
            icon="radio"
            variant={live ? 'danger' : 'primary'}
            label={canOpen ? t('op.console') : t('op.consoleAt', { h: opensAt })}
            disabled={!canOpen}
            onPress={openConsole}
          />
        ) : null}
      </Row>
    </Card>
  );
}
