import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { generateStartTimes, hhmmToMinutes, minutesToHHmm, pitchSchedule, pruneDateSlots, toDateKey, type Pitch } from '@/domain/model';
import { Guard } from '@/ui/Guard';
import { notify } from '@/ui/dialogs';
import { dayLabel } from '@/ui/format';
import { Button, Card, Field, Pill, Row, Screen, Section, Segmented, MaybeScreen, Sheet } from '@/ui/kit';
import { OtherDate } from '@/ui/datepicker';
import { DateStrip } from '@/ui/slots';
import { colors, font } from '@/ui/theme';

const sorted = (l: string[]) => [...new Set(l)].sort((a, b) => hhmmToMinutes(a) - hhmmToMinutes(b));

/** BF03 : créneaux configurables par terrain — pour tous les jours, ou pour une date précise. */
export function SlotsAdmin({ embedded }: { embedded?: boolean } = {}) {
  const { t, pitches } = useApp();
  const [pitchId, setPitchId] = useState<string | null>(null);
  const [mode, setMode] = useState<'default' | 'date'>('default');
  const pitch = pitches.find((p) => p.id === pitchId) ?? pitches[0];
  return (
    <MaybeScreen embedded={embedded} edges={['bottom']}>
      <Segmented scroll options={pitches.map((p) => ({ value: p.id, label: `${p.name} · ${p.type}` }))} value={pitch?.id ?? ''} onChange={setPitchId} />
      <View style={{ height: 10 }} />
      <Segmented
        options={[
          { value: 'default', label: t('slots.mode.default') },
          { value: 'date', label: t('slots.mode.date') },
        ]}
        value={mode}
        onChange={setMode}
      />
      {pitch ? mode === 'default' ? <DefaultSlots key={pitch.id} pitch={pitch} /> : <DateSlots key={pitch.id} pitch={pitch} /> : null}
    </MaybeScreen>
  );
}

/** Créneaux d'un terrain (rubrique Terrains → terrain) : habituels ou d'une date précise. */
export function PitchSlots({ pitch }: { pitch: Pitch }) {
  const { t } = useApp();
  const [mode, setMode] = useState<'default' | 'date'>('default');
  return (
    <View>
      <Segmented
        options={[
          { value: 'default', label: t('slots.mode.default') },
          { value: 'date', label: t('slots.mode.date') },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'default' ? <DefaultSlots key={pitch.id} pitch={pitch} /> : <DateSlots key={pitch.id} pitch={pitch} />}
    </View>
  );
}

/**
 * Éditeur des créneaux : tous les créneaux sont affichés.
 * - un simple toucher active / désactive le créneau (si disabled est fourni) ;
 * - ✎ change l'heure du créneau, et décale d'autant les créneaux suivants ;
 * - ✕ retire le créneau.
 */
function StartsEditor({
  starts,
  setStarts,
  minutes,
  disabled,
  setDisabled,
}: {
  starts: string[];
  setStarts: (l: string[]) => void;
  minutes: number;
  /** Créneaux désactivés (toucher = activer / désactiver) ; absent = toucher pour modifier l'heure. */
  disabled?: string[];
  setDisabled?: (l: string[]) => void;
}) {
  const { t } = useApp();
  const [add, setAdd] = useState('');
  const [edit, setEdit] = useState<{ from: string; to: string; cascade: boolean } | null>(null);
  const list = sorted(starts);
  const overlaps = list.some((s, i, arr) => i > 0 && hhmmToMinutes(s) < hhmmToMinutes(arr[i - 1]) + minutes);
  const parse = (v: string) => {
    const m = /^(\d{1,2})[:h]?(\d{2})$/.exec(v.trim());
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  };
  const addTime = () => {
    const v = parse(add);
    if (!v) return notify(t('slots.addTime'));
    setStarts(sorted([...starts, v]));
    setAdd('');
  };

  /** Nouvelle heure pour un créneau ; les suivants sont décalés du même écart (si demandé). */
  const applyEdit = () => {
    if (!edit) return;
    const v = parse(edit.to);
    if (!v) return notify(t('slots.addTime'));
    const delta = hhmmToMinutes(v) - hhmmToMinutes(edit.from);
    const idx = list.indexOf(edit.from);
    const map = new Map<string, string>();
    list.forEach((s, i) => {
      const shift = i === idx || (edit.cascade && i > idx);
      map.set(s, shift ? minutesToHHmm(hhmmToMinutes(s) + delta) : s);
    });
    const next = list.map((s) => map.get(s)!);
    if (next.some((s) => hhmmToMinutes(s) < 0 || hhmmToMinutes(s) + minutes > 24 * 60)) return notify(t('slots.outOfDay'));
    if (new Set(next).size !== next.length) return notify(t('slots.duplicate'));
    setStarts(sorted(next));
    if (setDisabled && disabled) setDisabled(disabled.filter((d) => map.has(d)).map((d) => map.get(d)!));
    setEdit(null);
  };

  const preview = (() => {
    if (!edit) return [];
    const v = parse(edit.to);
    if (!v) return [];
    const delta = hhmmToMinutes(v) - hhmmToMinutes(edit.from);
    const idx = list.indexOf(edit.from);
    return list.map((s, i) => (i === idx || (edit.cascade && i > idx) ? minutesToHHmm(hhmmToMinutes(s) + delta) : s));
  })();

  return (
    <>
      <Text style={[font.small, { marginBottom: 8 }]}>{setDisabled ? t('slots.tapHint2') : t('slots.tapHintDate')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {list.map((s) => {
          const off = !!disabled?.includes(s);
          return (
            <View
              key={s}
              style={{
                width: 150,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: off ? colors.border : colors.accent,
                backgroundColor: off ? colors.bgElevated : colors.accentSoft,
                opacity: off ? 0.75 : 1,
              }}
            >
              <Pressable
                onPress={() => (setDisabled ? setDisabled(off ? (disabled ?? []).filter((x) => x !== s) : [...(disabled ?? []), s]) : setEdit({ from: s, to: s, cascade: true }))}
                accessibilityState={{ checked: !off }}
                style={{ paddingVertical: 8, paddingHorizontal: 10 }}
              >
                <Text style={{ color: off ? colors.faint : colors.text, fontWeight: '800', fontSize: 15, textDecorationLine: off ? 'line-through' : 'none' }}>
                  {s}–{minutesToHHmm(hhmmToMinutes(s) + minutes)}
                </Text>
                {setDisabled ? (
                  <Text style={{ fontSize: 11, fontWeight: '800', color: off ? colors.red : colors.success, marginTop: 2 }}>{off ? t('slots.off') : t('slots.on')}</Text>
                ) : null}
              </Pressable>
              <Row style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <Pressable onPress={() => setEdit({ from: s, to: s, cascade: true })} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }} accessibilityLabel={t('slots.editTime')}>
                  <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>✎ {t('slots.time')}</Text>
                </Pressable>
                <Pressable onPress={() => setStarts(starts.filter((x) => x !== s))} style={{ paddingHorizontal: 12, paddingVertical: 6 }} accessibilityLabel={t('common.delete')}>
                  <Text style={{ color: colors.red, fontWeight: '900' }}>✕</Text>
                </Pressable>
              </Row>
            </View>
          );
        })}
      </View>
      {setDisabled && disabled?.length ? <Text style={[font.tiny, { marginTop: 6 }]}>{t('slots.disabledN', { n: disabled.filter((d) => starts.includes(d)).length })}</Text> : null}
      {!starts.length ? <Text style={{ color: colors.orange, marginTop: 4 }}>{t('slots.dateClosed')}</Text> : null}
      {overlaps ? <Text style={{ color: colors.orange, marginTop: 8, fontSize: 12 }}>⚠ {t('slots.overlap')}</Text> : null}
      <Row style={{ gap: 8, marginTop: 14, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field label={t('slots.addTime')} value={add} onChangeText={setAdd} placeholder="17:30" onSubmitEditing={addTime} />
        </View>
        <Button label="+" onPress={addTime} small style={{ marginBottom: 14 }} />
      </Row>

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={t('slots.editTitle', { s: edit?.from ?? '' })}>
        {edit ? (
          <View>
            <Field label={t('slots.newTime')} value={edit.to} onChangeText={(v) => setEdit({ ...edit, to: v })} placeholder="19:30" />
            <Row style={{ marginBottom: 12 }}>
              <Text style={[font.body, { flex: 1 }]}>{t('slots.cascade')}</Text>
              <Switch value={edit.cascade} onValueChange={(v) => setEdit({ ...edit, cascade: v })} trackColor={{ true: colors.accent, false: colors.border }} />
            </Row>
            {preview.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {preview.map((p, i) => (
                  <Pill key={i} label={`${p}–${minutesToHHmm(hhmmToMinutes(p) + minutes)}`} color={p !== list[i] ? colors.accent : colors.muted} bg={p !== list[i] ? colors.accentSoft : undefined} />
                ))}
              </View>
            ) : null}
            <Button label={t('slots.apply')} icon="checkmark" onPress={applyEdit} />
            <Text style={[font.tiny, { marginTop: 8 }]}>{t('slots.applyHint')}</Text>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

function useSavePitch() {
  const { t, services } = useApp();
  const [busy, setBusy] = useState(false);
  const save = async (pitch: Pitch, next: Partial<Pitch>) => {
    setBusy(true);
    try {
      await services.savePitch({ ...pitch, ...next });
      notify(t('slots.saved'));
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

/** Créneaux habituels (tous les jours). */
function DefaultSlots({ pitch }: { pitch: Pitch }) {
  const { t, config } = useApp();
  const custom = !!pitch.slotStarts?.length;
  const [minutes, setMinutes] = useState(String(pitch.slotMinutes ?? config.slotMinutes));
  const [starts, setStarts] = useState<string[]>(pitchSchedule(config, pitch).starts);
  const [disabled, setDisabled] = useState<string[]>(pitch.disabledStarts ?? []);
  const { busy, save } = useSavePitch();
  useEffect(() => {
    setMinutes(String(pitch.slotMinutes ?? config.slotMinutes));
    setStarts(pitchSchedule(config, pitch).starts);
    setDisabled(pitch.disabledStarts ?? []);
  }, [pitch, config]);
  const dur = Math.max(30, Number(minutes) || config.slotMinutes);
  const open = minutesToHHmm(config.openMinutes);
  const close = minutesToHHmm(config.closeMinutes);

  return (
    <Section title={custom ? t('slots.custom') : t('slots.default', { open, close })}>
      <Card>
        <Field label={t('slots.duration')} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
        <StartsEditor starts={starts} setStarts={setStarts} minutes={dur} disabled={disabled} setDisabled={setDisabled} />
        <Button
          label={t('slots.generate', { open, close })}
          variant="secondary"
          icon="refresh"
          small
          onPress={() => setStarts(generateStartTimes(config.openMinutes, config.closeMinutes, dur))}
        />
        <Button
          label={t('common.save')}
          icon="save"
          onPress={() => save(pitch, { slotStarts: sorted(starts), slotMinutes: dur, disabledStarts: disabled.filter((d) => starts.includes(d)) })}
          loading={busy}
          disabled={!starts.length}
          style={{ marginTop: 10 }}
        />
        {custom ? (
          <Button label={t('slots.reset')} variant="ghost" small onPress={() => save(pitch, { slotStarts: null, slotMinutes: null })} style={{ marginTop: 10 }} />
        ) : null}
      </Card>
    </Section>
  );
}

/** Créneaux d'une date précise (jour férié, tournoi, horaires d'été…). */
function DateSlots({ pitch }: { pitch: Pitch }) {
  const { t, lang, config } = useApp();
  const today = toDateKey(new Date());
  const [date, setDate] = useState(today);
  const dateSlots = useMemo(() => pruneDateSlots(pitch.dateSlots, today), [pitch.dateSlots, today]);
  const marked = useMemo(() => new Set(Object.keys(dateSlots)), [dateSlots]);
  const sched = pitchSchedule(config, pitch, date);
  const [starts, setStarts] = useState<string[]>(sched.starts);
  const { busy, save } = useSavePitch();
  useEffect(() => {
    setStarts(pitchSchedule(config, pitch, date).starts);
  }, [pitch, config, date]);
  const isCustom = sched.custom === 'date';
  const usual = pitchSchedule(config, pitch).starts;

  const saveDate = (list: string[] | null) => {
    const next = { ...dateSlots };
    if (list === null) delete next[date];
    else next[date] = sorted(list);
    return save(pitch, { dateSlots: next });
  };

  return (
    <Section title={t('slots.mode.date')}>
      <DateStrip value={date} onChange={setDate} lang={lang} t={t} days={60} marked={marked} />
      <OtherDate value={date} onChange={setDate} marked={marked} />
      {marked.size ? <Text style={[font.small, { marginTop: 6 }]}>● {t('slots.customDays', { n: marked.size })}</Text> : null}
      <Card style={{ marginTop: 12 }}>
        <Row style={{ marginBottom: 8 }}>
          <Text style={[font.h3, { flex: 1 }]}>{dayLabel(date, lang, t)}</Text>
          {isCustom ? <Pill label={t('slots.dateCustom')} color={colors.onAccent} bg={colors.accent} /> : <Pill label={t('slots.mode.default')} />}
        </Row>
        <Text style={[font.small, { marginBottom: 10 }]}>{t('slots.dateInfo', { d: dayLabel(date, lang, t) })}</Text>
        <StartsEditor starts={starts} setStarts={setStarts} minutes={sched.minutes} />
        <Button label={t('common.save')} icon="save" onPress={() => saveDate(starts)} loading={busy} />
        <Row style={{ gap: 8, marginTop: 10 }}>
          <Button label={t('slots.closeDay')} variant="ghost" small icon="close-circle" onPress={() => saveDate([])} style={{ flex: 1 }} />
          {isCustom ? (
            <Button label={t('slots.useDefault')} variant="ghost" small icon="refresh" onPress={() => saveDate(null)} style={{ flex: 1 }} />
          ) : (
            <Button label={t('slots.copyDefault')} variant="ghost" small icon="copy" onPress={() => setStarts(usual)} style={{ flex: 1 }} />
          )}
        </Row>
      </Card>
    </Section>
  );
}

export default function SlotsScreen() {
  return (
    <Guard allow="slots.config">
      <SlotsAdmin />
    </Guard>
  );
}
