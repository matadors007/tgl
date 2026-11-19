import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { passwordOk } from '@/domain/password';
import { authErrorKey } from '@/data/auth';
import { LOGO } from '@/ui/brand';
import { Button, Field, Screen } from '@/ui/kit';
import { colors, font, radius } from '@/ui/theme';

type AccountType = 'user' | 'company';

/** Création de compte : joueur (réservations) ou entreprise (championnat). */
export default function SignupScreen() {
  const { t, auth, services, lang, mode } = useApp();
  const [type, setType] = useState<AccountType>('user');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!name.trim() || !phone.trim() || !email.trim() || !password || (type === 'company' && !companyName.trim())) return setError(t('auth.errFields'));
    if (!passwordOk(password)) return setError(t('signup.short'));
    if (password !== confirm) return setError(t('signup.mismatch'));
    setBusy(true);
    try {
      const uid = await auth.signUp(email.trim(), password);
      await services.saveProfile({
        id: uid,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role: type,
        lang,
        ...(type === 'company' ? { companyName: companyName.trim(), teamId: null } : {}),
      });
      if (type === 'user') {
        // Compte particulier : code OTP envoyé par e-mail, le compte devient actif une fois le code saisi
        const sent = await auth.sendVerification().catch(() => null);
        router.replace(sent?.expiresAt ? { pathname: '/verify-email', params: { expiresAt: String(sent.expiresAt) } } : '/verify-email');
      } else router.replace('/company');
    } catch (e) {
      setError(t(authErrorKey(e) as 'common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <Image source={LOGO} style={{ width: 130, height: 118 }} resizeMode="contain" />
        <Text style={[font.h1, { marginTop: 8 }]}>{t('signup.title')}</Text>
        <Text style={font.small}>{t('signup.sub')}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
        <TypeCard icon="football" title={t('signup.player')} sub={t('signup.playerSub')} selected={type === 'user'} onPress={() => setType('user')} />
        <TypeCard icon="business" title={t('signup.company')} sub={t('signup.companySub')} selected={type === 'company'} onPress={() => setType('company')} />
      </View>

      {type === 'company' ? (
        <>
          <Field label={t('auth.companyName')} value={companyName} onChangeText={setCompanyName} />
          <Text style={[font.small, { marginTop: -6, marginBottom: 12 }]}>{t('auth.companyHint')}</Text>
        </>
      ) : null}
      <Field label={t('auth.name')} value={name} onChangeText={setName} autoComplete="name" />
      <Field label={t('auth.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+216 …" />
      <Field label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Field label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry />
      <Field label={t('signup.confirm')} value={confirm} onChangeText={setConfirm} secureTextEntry />
      {error ? <Text style={{ color: colors.red, marginBottom: 12 }}>{error}</Text> : null}
      {mode === 'demo' ? <Text style={[font.small, { color: colors.orange, marginBottom: 12 }]}>{t('signup.demoInfo')}</Text> : null}
      <Button label={t('auth.signup')} icon="person-add" onPress={submit} loading={busy} />
      <Text style={[font.tiny, { textAlign: 'center', marginTop: 10 }]}>
        {t('legal.signupNote')}{' '}
        <Text style={{ color: colors.accent, fontWeight: '700' }} onPress={() => router.push('/confidentialite')}>
          {t('legal.privacy')}
        </Text>
      </Text>
      <Pressable onPress={() => router.replace('/login')} style={{ padding: 16, alignItems: 'center' }}>
        <Text style={{ color: colors.accent, fontWeight: '700' }}>{t('signup.have')}</Text>
      </Pressable>
    </Screen>
  );
}

function TypeCard({
  icon,
  title,
  sub,
  selected,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        padding: 14,
        borderRadius: radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentSoft : colors.card,
        alignItems: 'center',
      }}
    >
      <Ionicons name={icon} size={28} color={selected ? colors.accent : colors.muted} />
      <Text style={[font.h3, { marginTop: 6 }]}>{title}</Text>
      <Text style={[font.tiny, { textAlign: 'center', marginTop: 2 }]}>{sub}</Text>
    </Pressable>
  );
}
