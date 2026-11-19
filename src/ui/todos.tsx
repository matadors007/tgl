import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TFn } from '@/data/AppProvider';
import { toDateKey, type Lang, type Match, type TodoItem } from '@/domain/model';
import type { StringKey } from '@/i18n/strings';
import { dayLabel, shortDate, timeOf } from './format';
import { Card } from './kit';
import { colors, font } from './theme';

const ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  registerTeam: 'add-circle',
  completeRegistration: 'create',
  teamRejected: 'close-circle',
  setNumbers: 'shirt',
  sendCollective: 'document-attach',
  teamPending: 'hourglass',
  addPlayers: 'person-add',
  submitPlayers: 'paper-plane',
  fixRejected: 'alert-circle',
  waitingValidation: 'hourglass',
  noneApproved: 'alert-circle',
  selectLineup: 'list',
  pendingBookings: 'calendar',
  pendingTeams: 'business',
  pendingPlayers: 'people',
  unfinishedMatches: 'stopwatch',
  matchesWithoutResult: 'help-circle',
  todayWithoutLineup: 'clipboard',
  sheetDue: 'clipboard',
  configureWhatsapp: 'logo-whatsapp',
};

/** Tâches passives (en attente d'un tiers) : affichées en gris. */
const PASSIVE = new Set(['teamPending', 'waitingValidation']);

export function todoText(item: TodoItem, t: TFn, lang: Lang, matches: Match[] = []): string {
  const vars: Record<string, string | number> = { n: item.count ?? 0, ...(item.params ?? {}) };
  if (item.kind === 'selectLineup') {
    const m = matches.find((x) => x.id === item.params?.matchId);
    if (m) vars.date = dayLabel(m.date, lang, t);
    if (item.dueAt) vars.deadline = `${shortDate(toDateKey(new Date(item.dueAt)))} ${timeOf(item.dueAt)}`;
  }
  return t(`todo.${item.kind}` as StringKey, vars);
}

export function TodoList({ items, t, lang, matches, now }: { items: TodoItem[]; t: TFn; lang: Lang; matches?: Match[]; now: number }) {
  if (!items.length) {
    return (
      <Card>
        <Text style={font.small}>{t('todo.none')}</Text>
      </Card>
    );
  }
  return (
    <Card style={{ paddingVertical: 4 }}>
      {items.map((it, i) => {
        const passive = PASSIVE.has(it.kind);
        const urgent = !passive && (it.priority === 0 || (it.dueAt != null && it.dueAt - now < 24 * 3600_000));
        const color = passive ? colors.muted : urgent ? colors.orange : colors.accent;
        return (
          <Pressable
            key={it.id}
            onPress={() => router.push(it.url as never)}
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name={ICON[it.kind] ?? 'ellipse'} size={20} color={color} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={[font.body, { fontWeight: passive ? '500' : '700', color: passive ? colors.muted : colors.text }]}>
                {todoText(it, t, lang, matches)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.faint} />
          </Pressable>
        );
      })}
    </Card>
  );
}

export const TEAM_COLORS = ['#D7AB3E', '#E53935', '#1E88E5', '#43A047', '#8E24AA', '#FB8C00', '#00ACC1', '#F4F4F4', '#3949AB', '#6D4C41'];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
      {TEAM_COLORS.map((c) => (
        <Pressable
          key={c}
          onPress={() => onChange(c)}
          accessibilityLabel={c}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: c,
            borderWidth: value === c ? 3 : 1,
            borderColor: value === c ? colors.text : colors.border,
          }}
        />
      ))}
    </View>
  );
}
