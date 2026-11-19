import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { authErrorKey } from '@/data/auth';
import type { Role } from '@/domain/model';
import { notify } from '@/ui/dialogs';
import { Button, Field, ListItem, Screen, Section, Segmented } from '@/ui/kit';
import { LOGO } from '@/ui/brand';
import { colors, font } from '@/ui/theme';

export default function LoginScreen() {
  const { t, auth, services, mode, lang } = useApp();
  const [signup, setSignup] = useState(false);
  const [accountType, setAccountType] = useState<'user' | 'company'>('user');
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const done = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const submit = async () => {
    setError('');
    if (!email || !password || (signup && (!name || !phone))) return setError(t('auth.errFields'));
    if (signup && accountType === 'company' && !companyName.trim()) return setError(t('auth.errFields'));
    setBusy(true);
    try {
      if (signup) {
        const uid = await auth.signUp(email, password);
        const isCompany = accountType === 'company';
        await services.saveProfile({
          id: uid,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          role: isCompany ? 'company' : 'user',
          lang,
          ...(isCompany ? { companyName: companyName.trim(), teamId: null } : {}),
        });
      } else {
        await auth.signIn(email, password);
      }
      done();
    } catch (e) {
      setError(t(authErrorKey(e) as 'common.error'));
    } finally {
      setBusy(false);
    }
  };

  const demo = async (role: Role, uid?: string) => {
    await auth.demoSignIn?.(role, uid);
    done();
  };

  const forgot = async () => {
    if (!email) return setError(t('auth.email'));
    try {
      await auth.resetPassword(email);
      notify(t('auth.resetSent'));
    } catch (e) {
      setError(t(authErrorKey(e) as 'common.error'));
    }
  };

  return (
    <Screen edges={['bottom']}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <Image source={LOGO} style={{ width: 170, height: 154 }} resizeMode="contain" />
      </View>
      {mode === 'demo' ? (
        <Section title={t('auth.demoTitle')} style={{ marginTop: 0 }}>
          <ListItem icon="person" title={t('auth.asUser')} onPress={() => demo('user')} />
          <ListItem icon="business" title={t('auth.asCompany')} onPress={() => demo('company')} />
          <ListItem icon="business-outline" title={t('auth.asNewCompany')} onPress={() => demo('company', 'demo-company-new')} />
          <ListItem icon="radio" title={t('auth.asOperator')} onPress={() => demo('operator')} />
          <ListItem icon="headset" title={t('auth.asAgent')} onPress={() => demo('agent')} />
          <ListItem icon="shield-checkmark" title={t('auth.asAdmin')} onPress={() => demo('admin')} />
          <Pressable onPress={() => router.replace('/signup')} style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>{t('auth.toSignup')}</Text>
          </Pressable>
        </Section>
      ) : (
        <View>
          <Text style={[font.h1, { marginBottom: 16 }]}>{signup ? t('auth.signupTitle') : t('auth.title')}</Text>
          {signup ? (
            <>
              <Text style={[font.small, { marginBottom: 6 }]}>{t('auth.accountType')}</Text>
              <Segmented
                options={[
                  { value: 'user', label: t('auth.typePlayer') },
                  { value: 'company', label: t('auth.typeCompany') },
                ]}
                value={accountType}
                onChange={setAccountType}
              />
              <View style={{ height: 12 }} />
              {accountType === 'company' ? (
                <>
                  <Field label={t('auth.companyName')} value={companyName} onChangeText={setCompanyName} />
                  <Text style={[font.small, { marginTop: -6, marginBottom: 12 }]}>{t('auth.companyHint')}</Text>
                </>
              ) : null}
              <Field label={t('auth.name')} value={name} onChangeText={setName} autoComplete="name" />
              <Field label={t('auth.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+216 …" />
            </>
          ) : null}
          <Field label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Field label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry />
          {error ? <Text style={{ color: colors.red, marginBottom: 12 }}>{error}</Text> : null}
          <Button label={signup ? t('auth.signup') : t('auth.signin')} onPress={submit} loading={busy} />
          <Pressable onPress={() => router.replace('/signup')} style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>{t('auth.toSignup')}</Text>
          </Pressable>
          {!signup ? (
            <Pressable onPress={forgot} style={{ alignItems: 'center' }}>
              <Text style={font.small}>{t('auth.forgot')}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
