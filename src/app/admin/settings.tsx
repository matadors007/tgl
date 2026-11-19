import { Guard } from '@/ui/Guard';
import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { COL } from '@/data/store';
import { ROLES, hhmmToMinutes, minutesToHHmm, type AppConfig, type Pitch, type PitchType, type UserProfile } from '@/domain/model';
import { notify } from '@/ui/dialogs';
import { Button, Card, Field, ListItem, Row, Screen, Section, Segmented } from '@/ui/kit';
import { router } from 'expo-router';
import { colors, font } from '@/ui/theme';

function SettingsAdmin() {
  const { t, config, pitches, services, store, user, teams, notifier } = useApp();
  const [form, setForm] = useState({
    open: minutesToHHmm(config.openMinutes),
    close: minutesToHHmm(config.closeMinutes),
    slot: String(config.slotMinutes),
    expiry: String(config.expiryMinutes),
    maxPending: String(config.maxPendingPerUser),
    price6: String(config.price6v6),
    price7: String(config.price7v7),
    phone: config.contactPhone,
    email: config.contactEmail ?? '',
    whatsapp: config.whatsappNumber ?? '',
    windowDays: String(config.bookingWindowDays ?? 7),
  });
  const [busy, setBusy] = useState(false);
  const [waKey, setWaKey] = useState('');
  const [waBusy, setWaBusy] = useState(false);
  useEffect(() => store.watchDoc<{ apiKey?: string }>(COL.config, 'whatsapp', (d) => setWaKey(d?.apiKey ?? '')), [store]);
  const [newPitch, setNewPitch] = useState<{ name: string; type: PitchType }>({ name: '', type: '6v6' });
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<UserProfile[] | null>(null);

  useEffect(() => {
    setForm({
      open: minutesToHHmm(config.openMinutes),
      close: minutesToHHmm(config.closeMinutes),
      slot: String(config.slotMinutes),
      expiry: String(config.expiryMinutes),
      maxPending: String(config.maxPendingPerUser),
      price6: String(config.price6v6),
      price7: String(config.price7v7),
      phone: config.contactPhone,
      email: config.contactEmail ?? '',
      whatsapp: config.whatsappNumber ?? '',
      windowDays: String(config.bookingWindowDays ?? 7),
    });
  }, [config]);

  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  const save = async () => {
    const ok = /^\d{1,2}:\d{2}$/.test(form.open) && /^\d{1,2}:\d{2}$/.test(form.close);
    if (!ok) return notify(t('common.error'));
    const next: AppConfig = {
      ...config,
      openMinutes: hhmmToMinutes(form.open),
      closeMinutes: hhmmToMinutes(form.close),
      slotMinutes: Math.max(30, Number(form.slot) || 90),
      expiryMinutes: Math.max(5, Number(form.expiry) || 30),
      maxPendingPerUser: Math.max(1, Number(form.maxPending) || 2),
      price6v6: Number(form.price6) || 0,
      price7v7: Number(form.price7) || 0,
      contactPhone: form.phone.trim(),
      contactEmail: form.email.trim(),
      whatsappNumber: form.whatsapp.trim(),
      bookingWindowDays: Math.min(60, Math.max(1, Number(form.windowDays) || 7)),
    };
    setBusy(true);
    try {
      await services.saveConfig(next);
      await services.saveWhatsappKey(waKey);
      notify(t('settings.saved'));
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const addPitch = async () => {
    if (!newPitch.name.trim()) return;
    await services.savePitch({ id: '', name: newPitch.name.trim(), type: newPitch.type, active: true, order: pitches.length + 1 } as Pitch);
    setNewPitch({ name: '', type: '6v6' });
  };

  const doSearch = async () => {
    const q = search.trim();
    if (!q) return;
    const byPhone = await store.query<UserProfile>(COL.users, [['phone', q]]);
    const byEmail = await store.query<UserProfile>(COL.users, [['email', q]]);
    const all = [...byPhone, ...byEmail.filter((u) => !byPhone.some((x) => x.id === u.id))];
    setFound(all);
  };

  return (
    <Screen edges={[]}>
      <Section title={t('settings.hours')} style={{ marginTop: 0 }}>
        <Card>
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label={t('settings.open')} value={form.open} onChangeText={set('open')} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('settings.close')} value={form.close} onChangeText={set('close')} />
            </View>
          </Row>
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label={t('settings.slot')} value={form.slot} onChangeText={set('slot')} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('settings.expiry')} value={form.expiry} onChangeText={set('expiry')} keyboardType="number-pad" />
            </View>
          </Row>
          <Field label={t('settings.maxPending')} value={form.maxPending} onChangeText={set('maxPending')} keyboardType="number-pad" />
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label={t('settings.price6')} value={form.price6} onChangeText={set('price6')} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('settings.price7')} value={form.price7} onChangeText={set('price7')} keyboardType="number-pad" />
            </View>
          </Row>
          <Field label={t('settings.phone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
          <Field label={t('settings.email')} value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" placeholder="contact@…" />
          <Field label={t('settings.whatsapp')} value={form.whatsapp} onChangeText={set('whatsapp')} keyboardType="phone-pad" placeholder="+216 20 000 000" />
          <Field label={t('settings.waKey')} value={waKey} onChangeText={setWaKey} autoCapitalize="none" placeholder="123456" />
          <Text style={[font.small, { marginTop: -6, marginBottom: 10 }]}>{t('settings.waHelp')}</Text>
          <Button
            label={t('settings.waTest')}
            icon="logo-whatsapp"
            variant="secondary"
            small
            loading={waBusy}
            style={{ marginBottom: 14 }}
            onPress={async () => {
              setWaBusy(true);
              try {
                await services.saveWhatsappKey(waKey);
                const ok = await notifier.whatsappToAdmin(form.whatsapp, '✅ Tunisia Golden League : test des notifications WhatsApp.');
                notify(ok ? t('settings.waTestOk') : t('settings.waTestKo'));
              } finally {
                setWaBusy(false);
              }
            }}
          />
          <Field label={t('settings.window')} value={form.windowDays} onChangeText={set('windowDays')} keyboardType="number-pad" />
          <Button label={t('common.save')} icon="save" onPress={save} loading={busy} />
        </Card>
      </Section>

      <Section title={t('settings.pitches')}>
        <Text style={font.small}>{t('settings.pitchesMoved')}</Text>
      </Section>

      <Section title={t('staff.title')}>
        <ListItem icon="people" title={t('staff.title')} subtitle={t('staff.sub')} onPress={() => router.push('/admin/staff')} />
      </Section>
    </Screen>
  );
}

export default function GuardedSettingsAdmin() {
  return (
    <Guard allow="settings">
      <SettingsAdmin />
    </Guard>
  );
}
