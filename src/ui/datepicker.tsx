/**
 * Sélection d'une date dans un calendrier (au lieu de la taper au clavier).
 *  - CalendarPicker : grille d'un mois, navigation mois / année, aujourd'hui en surbrillance
 *  - DateField : champ qui affiche la date choisie et déroule le calendrier en dessous
 *  - TimeChips : choix de l'heure parmi les créneaux
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../data/AppProvider';
import { pad2, toDateKey, type Lang } from '../domain/model';
import { colors, font, radius, space } from './theme';

const MONTHS: Record<Lang, string[]> = {
  fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const WEEK: Record<Lang, string[]> = {
  fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
};
const DOW: Record<Lang, string[]> = {
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

const isKey = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const keyOf = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/** « samedi 17 octobre 2026 » */
export function longDate(k: string, lang: Lang): string {
  if (!isKey(k)) return '';
  const [y, m, d] = k.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return lang === 'fr' ? `${DOW.fr[dt.getDay()]} ${d} ${MONTHS.fr[m - 1].toLowerCase()} ${y}` : `${DOW.en[dt.getDay()]}, ${MONTHS.en[m - 1]} ${d}, ${y}`;
}

/** Grille du mois (semaines commençant le lundi) : null = case vide. */
export function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1).getDay(); // 0 = dimanche
  const lead = (first + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function CalendarPicker({
  value,
  onChange,
  min,
  max,
  marked,
}: {
  value?: string | null;
  onChange: (key: string) => void;
  min?: string;
  max?: string;
  /** Dates marquées d'un point (ex. jours avec des créneaux personnalisés). */
  marked?: Set<string>;
}) {
  const { lang, t } = useApp();
  const today = toDateKey(new Date());
  const start = isKey(value) ? value! : isKey(max) && max! < today ? max! : isKey(min) && min! > today ? min! : today;
  const [y0, m0] = start.split('-').map(Number);
  const [year, setYear] = useState(y0);
  const [month, setMonth] = useState(m0 - 1);
  const [years, setYears] = useState(false);
  useEffect(() => {
    if (!isKey(value)) return;
    const [y, m] = value!.split('-').map(Number);
    setYear(y);
    setMonth(m - 1);
  }, [value]);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const minY = isKey(min) ? Number(min!.slice(0, 4)) : year - 80;
  const maxY = isKey(max) ? Number(max!.slice(0, 4)) : year + 5;
  const go = (delta: number) => {
    const m = month + delta;
    setYear(year + Math.floor(m / 12));
    setMonth(((m % 12) + 12) % 12);
  };
  const disabled = (k: string) => (isKey(min) && k < min!) || (isKey(max) && k > max!);
  const canPrev = !isKey(min) || keyOf(year, month, 1) > min!;
  const canNext = !isKey(max) || keyOf(year, month, new Date(year, month + 1, 0).getDate()) < max!;

  const navBtn = (icon: 'chevron-back' | 'chevron-forward', on: boolean, delta: number) => (
    <Pressable
      onPress={() => on && go(delta)}
      disabled={!on}
      hitSlop={8}
      accessibilityLabel={delta < 0 ? 'Mois précédent' : 'Mois suivant'}
      style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, opacity: on ? 1 : 0.3 }}
    >
      <Ionicons name={icon} size={18} color={colors.accent} />
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        {navBtn('chevron-back', canPrev && !years, -1)}
        <Pressable onPress={() => setYears(!years)} style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }} accessibilityLabel={t('date.chooseYear')}>
          <Text style={[font.h3]}>
            {MONTHS[lang][month]} {year}
          </Text>
          <Ionicons name={years ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} style={{ marginLeft: 6 }} />
        </Pressable>
        {navBtn('chevron-forward', canNext && !years, 1)}
      </View>

      {years ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: maxY - minY + 1 }, (_, i) => maxY - i).map((yy) => (
            <Pressable
              key={yy}
              onPress={() => {
                setYear(yy);
                setYears(false);
              }}
              style={{ width: '25%', paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm, backgroundColor: yy === year ? colors.accent : 'transparent' }}
            >
              <Text style={{ color: yy === year ? colors.onAccent : colors.text, fontWeight: '700' }}>{yy}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {WEEK[lang].map((w, i) => (
              <Text key={i} style={[font.tiny, { flex: 1, textAlign: 'center', fontWeight: '800', color: i >= 5 ? colors.accent : colors.muted }]}>
                {w}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((d, i) => {
              if (d == null) return <View key={i} style={{ width: `${100 / 7}%`, height: 40 }} />;
              const k = keyOf(year, month, d);
              const sel = k === value;
              const off = disabled(k);
              const isToday = k === today;
              return (
                <View key={i} style={{ width: `${100 / 7}%`, height: 40, padding: 2 }}>
                  <Pressable
                    onPress={() => !off && onChange(k)}
                    disabled={off}
                    accessibilityLabel={longDate(k, lang)}
                    accessibilityState={{ selected: sel, disabled: off }}
                    style={({ pressed }) => ({
                      flex: 1,
                      borderRadius: radius.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: sel ? colors.accent : pressed ? colors.accentSoft : 'transparent',
                      borderWidth: isToday && !sel ? 1 : 0,
                      borderColor: colors.accent,
                      opacity: off ? 0.25 : 1,
                    })}
                  >
                    <Text style={{ color: sel ? colors.onAccent : colors.text, fontWeight: sel || isToday ? '900' : '600', fontSize: 14 }}>{d}</Text>
                    {marked?.has(k) ? <View style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: sel ? colors.onAccent : colors.accent }} /> : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
          {!disabled(today) ? (
            <Pressable onPress={() => onChange(today)} style={{ alignSelf: 'center', marginTop: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
              <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>{t('common.today')}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Champ date : affiche la date choisie ; un appui déroule le calendrier en dessous. */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  marked,
}: {
  label: string;
  value?: string | null;
  onChange: (key: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  marked?: Set<string>;
}) {
  const { lang, t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={[font.small, { marginBottom: 6, fontWeight: '600' }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.bgElevated,
          maxWidth: 420,
          borderWidth: 1,
          borderColor: open ? colors.accent : colors.border,
          borderRadius: radius.sm,
          paddingHorizontal: 12,
          paddingVertical: 11,
        }}
      >
        <Ionicons name="calendar" size={18} color={colors.accent} style={{ marginRight: 10 }} />
        <Text style={{ flex: 1, fontSize: 15, color: isKey(value) ? colors.text : colors.faint }}>
          {isKey(value) ? longDate(value!, lang) : placeholder ?? t('date.choose')}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8, width: '100%', maxWidth: 420 }}>
          <CalendarPicker
            value={value}
            min={min}
            max={max}
            marked={marked}
            onChange={(k) => {
              onChange(k);
              setOpen(false);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Choix de l'heure parmi une liste (créneaux) ; les heures prises peuvent être grisées. */
export function TimeChips({ value, options, onChange, taken }: { value: string; options: string[]; onChange: (v: string) => void; taken?: (v: string) => boolean }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((s) => {
        const off = !!taken?.(s);
        const sel = value === s;
        return (
          <Pressable
            key={s}
            disabled={off}
            onPress={() => onChange(s)}
            accessibilityState={{ selected: sel, disabled: off }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: sel ? colors.accent : colors.border,
              backgroundColor: sel ? colors.accent : colors.card,
              opacity: off ? 0.35 : 1,
            }}
          >
            <Text style={{ color: sel ? colors.onAccent : colors.text, fontWeight: '800', fontSize: 13, textDecorationLine: off ? 'line-through' : 'none' }}>{s}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Lien « Autre date » sous une bande de dates : déroule le calendrier complet. */
export function OtherDate({ value, onChange, marked }: { value: string; onChange: (k: string) => void; marked?: Set<string> }) {
  const { t, lang } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: 8 }}>
      <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 4 }}>
        <Ionicons name="calendar-outline" size={16} color={colors.accent} />
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13, marginLeft: 6 }}>
          {t('date.other')} · {longDate(value, lang)}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} style={{ marginLeft: 4 }} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8, maxWidth: 420 }}>
          <CalendarPicker
            value={value}
            marked={marked}
            onChange={(k) => {
              onChange(k);
              setOpen(false);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
