import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/data/AppProvider';
import { passwordOk } from '@/domain/password';
import { authErrorKey } from '@/data/auth';
import { Button, Card, Field, Screen } from '@/ui/kit';
import { colors, font } from '@/ui/theme';

/**
 * Lien des e-mails Firebase (à régler comme « URL d'action » dans la console) :
 *  - mode=resetPassword : saisie et confirmation du nouveau mot de passe
 *  - mode=verifyEmail   : confirmation de l'adresse e-mail
 * Sur un téléphone, la page web propose (et tente) d'ouvrir directement l'application.
 */
export default function AuthActionScreen() {
  const { t, auth, refreshEmailVerified } = useApp();
  const { mode, oobCode } = useLocalSearchParams<{ mode?: string; oobCode?: string }>();
  const [email, setEmail] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'form' | 'done' | 'error'>('loading');
  const [error, setError] = useState('');
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const appLink = `tga://auth-action?mode=${encodeURIComponent(mode ?? '')}&oobCode=${encodeURIComponent(oobCode ?? '')}`;
  const isMobileWeb = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);

  useEffect(() => {
    // Sur le navigateur d'un téléphone : on essaie d'ouvrir l'application (si elle est installée)
    if (isMobileWeb && oobCode) window.location.href = appLink;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!oobCode) {
      setState('error');
      setError(t('auth.errLink'));
      return;
    }
    if (mode === 'resetPassword') {
      auth
        .verifyResetCode(oobCode)
        .then((e) => {
          setEmail(e);
          setState('form');
        })
        .catch((e) => {
          setError(t(authErrorKey(e) as 'common.error'));
          setState('error');
        });
    } else if (mode === 'verifyEmail') {
      auth
        .applyCode(oobCode)
        .then(async () => {
          await refreshEmailVerified().catch(() => {});
          setState('done');
        })
        .catch((e) => {
          setError(t(authErrorKey(e) as 'common.error'));
          setState('error');
        });
    } else {
      setState('error');
      setError(t('auth.errLink'));
    }
  }, [mode, oobCode, auth, t, refreshEmailVerified]);

  const save = async () => {
    setError('');
    if (!passwordOk(pass)) return setError(t('signup.short'));
    if (pass !== confirm) return setError(t('signup.mismatch'));
    setBusy(true);
    try {
      await auth.confirmReset(oobCode!, pass);
      setState('done');
    } catch (e) {
      setError(t(authErrorKey(e) as 'common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginVertical: 20 }}>
        <Ionicons name={mode === 'verifyEmail' ? 'mail-open' : 'key'} size={56} color={colors.accent} />
        <Text style={[font.h1, { marginTop: 12, textAlign: 'center' }]}>{mode === 'verifyEmail' ? t('verify.title') : t('reset.title')}</Text>
      </View>
      {isMobileWeb ? <Button label={t('reset.openApp')} icon="phone-portrait" variant="secondary" onPress={() => Linking.openURL(appLink)} style={{ marginBottom: 14 }} /> : null}
      {state === 'loading' ? <Text style={[font.body, { textAlign: 'center' }]}>{t('common.loading')}</Text> : null}
      {state === 'error' ? (
        <Card>
          <Text style={{ color: colors.red, fontWeight: '700' }}>{error}</Text>
          <Button label={t('auth.signin')} onPress={() => router.replace('/login')} style={{ marginTop: 12 }} />
        </Card>
      ) : null}
      {state === 'form' ? (
        <Card>
          <Text style={[font.small, { marginBottom: 12 }]}>{t('reset.for', { email: email ?? '' })}</Text>
          <Field label={t('reset.new')} value={pass} onChangeText={setPass} secureTextEntry />
          <Field label={t('signup.confirm')} value={confirm} onChangeText={setConfirm} secureTextEntry />
          {error ? <Text style={{ color: colors.red, marginBottom: 10 }}>{error}</Text> : null}
          <Button label={t('reset.save')} icon="checkmark" onPress={save} loading={busy} />
        </Card>
      ) : null}
      {state === 'done' ? (
        <Card style={{ borderColor: colors.success }}>
          <Text style={{ color: colors.success, fontWeight: '800', fontSize: 16 }}>✓ {mode === 'verifyEmail' ? t('verify.ok') : t('reset.done')}</Text>
          <Button label={mode === 'verifyEmail' ? t('tab.home') : t('auth.signin')} onPress={() => router.replace(mode === 'verifyEmail' ? '/' : '/login')} style={{ marginTop: 12 }} />
        </Card>
      ) : null}
    </Screen>
  );
}
