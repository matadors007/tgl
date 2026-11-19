import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/data/AppProvider';
import { passwordOk } from '@/domain/password';
import { authErrorKey } from '@/data/auth';
import { notify } from '@/ui/dialogs';
import { Button, Card, Field, Row, Screen, Section } from '@/ui/kit';
import { pickImage } from '@/ui/pickImage';
import { RequestBox } from './suppression-compte';
import { colors, font } from '@/ui/theme';

/** Paramètres du compte : photo de profil, nom, téléphone, mot de passe. */
export default function AccountScreen() {
  const { t, user, services, auth, needsVerification } = useApp();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  if (!user) return null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      notify(t(authErrorKey(e) as 'common.error'));
    } finally {
      setBusy(null);
    }
  };

  const pickPhoto = () =>
    run('photo', async () => {
      const img = await pickImage(320).catch(() => {
        throw new Error('permission');
      });
      if (img) await services.updateProfile(user.id, { photo: img });
    });

  const changePassword = () => {
    if (!passwordOk(next)) return notify(t('signup.short'));
    if (next !== confirm) return notify(t('signup.mismatch'));
    run('pass', async () => {
      await auth.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      notify(t('account.passChanged'));
    });
  };

  return (
    <Screen edges={['bottom']}>
      <View style={{ alignItems: 'center', marginBottom: 10 }}>
        <Pressable onPress={pickPhoto} style={{ width: 110, height: 110, borderRadius: 55, overflow: 'hidden', backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          {user.photo ? (
            <Image source={{ uri: user.photo }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <Ionicons name="person" size={52} color={colors.accent} />
          )}
        </Pressable>
        <Row style={{ gap: 8, marginTop: 10 }}>
          <Button small icon="camera" label={user.photo ? t('account.changePhoto') : t('account.addPhoto')} variant="secondary" onPress={pickPhoto} loading={busy === 'photo'} />
          {user.photo ? <Button small label={t('common.delete')} variant="ghost" onPress={() => run('photo', () => services.updateProfile(user.id, { photo: null }))} /> : null}
        </Row>
      </View>

      {needsVerification ? (
        <Card style={{ borderColor: colors.orange, marginBottom: 6 }} onPress={() => router.push('/verify-email')}>
          <Text style={{ color: colors.orange, fontWeight: '700' }}>{t('verify.banner')}</Text>
        </Card>
      ) : null}

      <Section title={t('account.info')}>
        <Card>
          <Field label={t('auth.name')} value={name} onChangeText={setName} />
          <Field label={t('auth.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Text style={[font.small, { marginBottom: 10 }]}>
            {t('auth.email')} : {user.email ?? auth.currentEmail() ?? '—'}
          </Text>
          <Button
            label={t('common.save')}
            icon="save"
            loading={busy === 'info'}
            onPress={() =>
              run('info', async () => {
                await services.updateProfile(user.id, { name: name.trim() || user.name, phone: phone.trim() });
                notify(t('showcase.saved'));
              })
            }
          />
        </Card>
      </Section>

      <Section title={t('account.password')}>
        <Card>
          <Field label={t('account.current')} value={current} onChangeText={setCurrent} secureTextEntry />
          <Field label={t('reset.new')} value={next} onChangeText={setNext} secureTextEntry />
          <Field label={t('signup.confirm')} value={confirm} onChangeText={setConfirm} secureTextEntry />
          <Button label={t('account.changePass')} icon="key" onPress={changePassword} loading={busy === 'pass'} disabled={!current || !next} />
        </Card>
      </Section>
      <Section title={t('account.delete')}>
        <Card>
          <Text style={font.small}>{t('account.deleteHint')}</Text>
          <RequestBox />
          <Pressable onPress={() => router.push('/confidentialite')} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>{t('legal.privacy')} ›</Text>
          </Pressable>
        </Card>
      </Section>
    </Screen>
  );
}
