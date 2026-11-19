import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { usePendingBookings } from '@/data/useStaffData';
import { adminTodos, fifoQueue, type TodoItem } from '@/domain/model';
import { TodoList } from '@/ui/todos';
import { Header, Screen, Section } from '@/ui/kit';
import { colors, font, radius } from '@/ui/theme';
import { useWideWeb } from '@/ui/web';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Administration : rubriques selon les permissions du compte (réglées dans Gestion du personnel). */
export default function AdminHome({ withHeader }: { withHeader?: boolean } = {}) {
  const { t, can, canBook, canChamp, championships } = useApp();
  const wide = useWideWeb();
  const tiles: { show: boolean; icon: IconName; title: string; sub: string; href: string }[] = [
    { show: canBook, icon: 'grid', title: t('tab.pitches'), sub: t('admin.pitchesSub'), href: '/pitches' },
    { show: canChamp, icon: 'trophy', title: t('champ.title'), sub: t('champ.hubSub', { n: championships.length }), href: '/admin/championships' },
    { show: can('staff'), icon: 'people', title: t('staff.title'), sub: t('staff.sub'), href: '/admin/staff' },
    { show: can('showcase'), icon: 'images', title: t('admin.showcase'), sub: t('admin.showcaseSub'), href: '/admin/showcase' },
    { show: can('news'), icon: 'newspaper', title: t('admin.news'), sub: t('admin.newsSub'), href: '/admin/news' },
    { show: can('settings'), icon: 'settings', title: t('admin.settings'), sub: t('admin.settingsSub'), href: '/admin/settings' },
  ];
  return (
    <Screen>
      {withHeader ? <Header title={t('admin.title')} /> : null}
      <AdminTodos />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
        {tiles
          .filter((x) => x.show)
          .map((x) => (
            <View key={x.href} style={{ width: wide ? '33.33%' : '50%', padding: 6 }}>
              <Pressable
                onPress={() => router.push(x.href as never)}
                style={({ pressed }) => ({ minHeight: 132, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 })}
              >
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={x.icon} size={22} color={colors.accent} />
                </View>
                <Text style={[font.h3, { marginTop: 10 }]}>{x.title}</Text>
                <Text style={[font.tiny, { marginTop: 3 }]} numberOfLines={3}>
                  {x.sub}
                </Text>
              </Pressable>
            </View>
          ))}
      </View>
    </Screen>
  );
}

/** Tâches à faire, filtrées selon les permissions. */
function AdminTodos() {
  const { t, lang, teamsAll, playersAll, matchesAll, config, can } = useApp();
  const now = useNow(60_000);
  const pending = usePendingBookings();
  const items = useMemo(() => {
    const all = adminTodos({
      pendingBookings: can('queue') ? fifoQueue(pending, now).length : 0,
      teams: teamsAll,
      players: playersAll,
      matches: matchesAll,
      now,
      whatsappConfigured: !!config.whatsappNumber,
    });
    const allowed = (it: TodoItem) =>
      it.kind === 'pendingBookings'
        ? can('queue')
        : it.kind === 'pendingTeams' || it.kind === 'pendingPlayers'
          ? can('teams.validate')
          : it.kind === 'sheetDue'
            ? can('matches.sheet')
            : it.kind === 'configureWhatsapp'
              ? can('settings')
              : can('matches.live') || can('matches.calendar');
    return all.filter(allowed);
  }, [pending, teamsAll, playersAll, matchesAll, now, config.whatsappNumber, can]);
  if (!items.length) return null;
  return (
    <Section title={t('todo.title')} style={{ marginTop: 0, marginBottom: 12 }}>
      <TodoList items={items} t={t} lang={lang} matches={matchesAll} now={now} />
    </Section>
  );
}
