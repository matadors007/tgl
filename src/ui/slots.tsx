import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { TFn } from '../data/AppProvider';
import { addDays, toDateKey, type Lang, type Slot, type SlotStatus } from '../domain/model';
import { shortDay } from './format';
import { colors, radius } from './theme';

export const SLOT_COLORS: Record<SlotStatus | 'past', { bg: string; fg: string; border: string }> = {
  free: { bg: colors.accentSoft, fg: colors.accent, border: colors.accent },
  pending: { bg: colors.orangeSoft, fg: colors.orange, border: colors.orange },
  booked: { bg: 'rgba(255,255,255,0.04)', fg: colors.faint, border: colors.border },
  blocked: { bg: colors.blueSoft, fg: colors.blue, border: colors.border },
  past: { bg: 'transparent', fg: colors.faint, border: colors.border },
};

/** @param showChampionship false (clients) : un créneau du championnat s'affiche simplement « Indisponible ». */
export function slotLabel(s: Slot, t: TFn, showChampionship = true): string {
  if (s.past && s.status === 'free') return t('book.past');
  if (s.doc?.private) return t('book.private');
  if (s.doc?.reason === 'disabled') return t('book.disabled');
  if (s.status === 'blocked') return showChampionship && s.doc?.reason === 'championship' ? t('book.championship') : t('book.blocked');
  return t(`book.${s.status}` as 'book.free');
}

export function DateStrip({
  value,
  onChange,
  lang,
  t,
  days = 14,
  startOffset = 0,
  marked,
}: {
  value: string;
  onChange: (d: string) => void;
  lang: Lang;
  t: TFn;
  days?: number;
  startOffset?: number;
  /** Dates signalées par un point (ex. créneaux spécifiques). */
  marked?: Set<string>;
}) {
  const today = toDateKey(new Date());
  const list = Array.from({ length: days }, (_, i) => addDays(today, i + startOffset));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {list.map((d) => {
        const active = d === value;
        const { dow, day } = shortDay(d, lang);
        return (
          <Pressable
            key={d}
            onPress={() => onChange(d)}
            style={{
              width: 54,
              paddingVertical: 8,
              borderRadius: radius.md,
              alignItems: 'center',
              backgroundColor: active ? colors.accent : colors.card,
              borderWidth: 1,
              borderColor: active ? colors.accent : colors.border,
            }}
          >
            <Text style={{ color: active ? colors.onAccent : colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
              {d === today ? t('common.today').slice(0, 3) + '.' : dow}
            </Text>
            <Text style={{ color: active ? colors.onAccent : colors.text, fontSize: 18, fontWeight: '900' }}>{day}</Text>
            {marked?.has(d) ? (
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 2, backgroundColor: active ? colors.onAccent : colors.accent }} />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SlotGrid({
  slots,
  t,
  onPress,
  enablePast,
  showChampionship = false,
}: {
  slots: Slot[];
  t: TFn;
  onPress: (s: Slot) => void;
  enablePast?: boolean;
  /** Personnel uniquement : affiche « Championnat » au lieu de « Indisponible ». */
  showChampionship?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {slots.map((s) => {
        const key = s.past && s.status === 'free' ? 'past' : s.status;
        const c = SLOT_COLORS[key];
        return (
          <Pressable
            key={s.id}
            onPress={() => onPress(s)}
            disabled={!enablePast && s.past}
            style={({ pressed }) => ({
              width: '31.5%',
              paddingVertical: 12,
              borderRadius: radius.md,
              backgroundColor: c.bg,
              borderWidth: 1,
              borderColor: c.border,
              alignItems: 'center',
              opacity: pressed ? 0.7 : s.past ? 0.5 : 1,
            })}
          >
            <Text style={{ color: key === 'free' ? colors.text : c.fg, fontWeight: '900', fontSize: 16 }}>{s.start}</Text>
            <Text style={{ color: c.fg, fontSize: 11, fontWeight: '700', marginTop: 2 }}>{slotLabel(s, t, showChampionship)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SlotLegend({ t }: { t: TFn }) {
  const items: [SlotStatus, string][] = [
    ['free', t('book.free')],
    ['pending', t('book.pending')],
    ['booked', t('book.booked')],
    ['blocked', t('book.blocked')],
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
      {items.map(([k, l]) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: SLOT_COLORS[k].fg, marginRight: 5 }} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}
