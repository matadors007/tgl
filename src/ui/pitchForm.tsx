import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { PhotoPicker } from '../app/admin/showcase';
import { useApp } from '../data/AppProvider';
import { AppError } from '../data/services';
import type { Pitch, PitchType } from '../domain/model';
import { ask, notify } from './dialogs';
import { Button, Field, Row, Segmented } from './kit';
import { colors, font } from './theme';

/** Ajout / modification d'un terrain : nom, type, ouvert ou fermé, photo et présentation. */
export function PitchForm({ pitch, onDone }: { pitch?: Pitch | null; onDone?: (id?: string) => void }) {
  const { t, services, pitches } = useApp();
  const [form, setForm] = useState({
    name: pitch?.name ?? '',
    type: (pitch?.type ?? '6v6') as PitchType,
    active: pitch?.active ?? true,
    photo: pitch?.photo ?? '',
    description: pitch?.description ?? '',
    surface: pitch?.surface ?? '',
    dimensions: pitch?.dimensions ?? '',
    features: (pitch?.features ?? []).join(', '),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string | boolean) => setForm({ ...form, [k]: v });

  const save = async () => {
    if (!form.name.trim()) return notify(t('auth.errFields'));
    setBusy(true);
    try {
      const data: Pitch = {
        ...(pitch ?? { id: '', order: pitches.length + 1 }),
        name: form.name.trim(),
        type: form.type,
        active: form.active,
        photo: form.photo || null,
        description: form.description.trim() || null,
        surface: form.surface.trim() || null,
        dimensions: form.dimensions.trim() || null,
        features: form.features
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      } as Pitch;
      await services.savePitch(data);
      notify(pitch ? t('pitch.saved') : t('pitch.added'));
      onDone?.();
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!pitch) return;
    if (!(await ask(t('pitch.deleteQ'), t('pitch.deleteWarn', { n: pitch.name }), t('common.delete'), t('common.cancel')))) return;
    setBusy(true);
    try {
      await services.deletePitch(pitch);
      notify(t('pitch.deleted'));
      onDone?.('deleted');
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Field label={t('pitch.name')} value={form.name} onChangeText={set('name')} placeholder="Terrain 4" />
      <Text style={[font.small, { marginBottom: 6, fontWeight: '600' }]}>{t('pitch.type')}</Text>
      <Segmented<PitchType>
        value={form.type}
        onChange={(v) => set('type')(v)}
        options={[
          { value: '6v6', label: '6v6' },
          { value: '7v7', label: '7v7' },
        ]}
      />
      <Row style={{ marginVertical: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[font.body, { fontWeight: '700' }]}>{t('pitch.active')}</Text>
          <Text style={font.tiny}>{t('pitch.activeHint')}</Text>
        </View>
        <Switch value={form.active} onValueChange={(v) => set('active')(v)} trackColor={{ true: colors.accent, false: colors.border }} />
      </Row>
      <Text style={[font.small, { marginBottom: 8 }]}>{t('showcase.pitchPhoto')}</Text>
      <PhotoPicker value={form.photo} onChange={(v) => set('photo')(v)} />
      <Field label={t('showcase.pitchDesc')} value={form.description} onChangeText={set('description')} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      <Field label={t('showcase.surface')} value={form.surface} onChangeText={set('surface')} placeholder={t('about.defaultSurface')} />
      <Field label={t('showcase.dimensions')} value={form.dimensions} onChangeText={set('dimensions')} />
      <Field label={t('showcase.features')} value={form.features} onChangeText={set('features')} placeholder="Éclairage LED, Vestiaires, Douches" />
      <Button label={pitch ? t('common.save') : t('pitch.add')} icon={pitch ? 'save' : 'add-circle'} onPress={save} loading={busy} />
      {pitch ? <Button label={t('pitch.delete')} icon="trash" variant="danger" style={{ marginTop: 10 }} onPress={remove} loading={busy} /> : null}
    </View>
  );
}
