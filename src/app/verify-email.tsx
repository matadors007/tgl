import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { authErrorKey } from '@/data/auth';
import { notify } from '@/ui/dialogs';
import { Button, Card, Screen } from '@/ui/kit';
import { colors, font, radius } from '@/ui/theme';

const RESEND_MS = 60_000;
const key = (uid: string) => `tgl.otp.${uid}`;

/**
 * Activation du compte particulier : un code à 6 chiffres est envoyé par e-mail
 * (valable 30 minutes) ; le compte devient actif dès que le bon code est saisi.
 */
export default function VerifyEmailScreen() {
  const { t, auth, user, uid, mode, refreshEmailVerified } = useApp();
  const params = useLocalSearchParams<{ expiresAt?: string }>();
  const now = useNow(1000);
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(params.expiresAt ? Number(params.expiresAt) : null);
  const [sentAt, setSentAt] = useState<number>(params.expiresAt ? Date.now() : 0);
  const [busy, setBusy] = useState<'check' | 'send' | null>(null);
  const [error, setError] = useState('');
  const input = useRef<TextInput>(null);
  const email = auth.currentEmail() ?? user?.email ?? '';

  // Mémorise l'expiration du dernier code (si on quitte l'écran puis revient)
  useEffect(() => {
    if (!uid) return;
    if (params.expiresAt) {
      AsyncStorage.setItem(key(uid), JSON.stringify({ expiresAt: Number(params.expiresAt), sentAt: Date.now() })).catch(() => {});
      return;
    }
    AsyncStorage.getItem(key(uid))
      .then((v) => {
        if (!v) return;
        const d = JSON.parse(v) as { expiresAt: number; sentAt: number };
        setExpiresAt(d.expiresAt);
        setSentAt(d.sentAt);
      })
      .catch(() => {});
  }, [uid, params.expiresAt]);

  const send = useCallback(async () => {
    setError('');
    setBusy('send');
    try {
      const r = await auth.sendVerification();
      if (r.alreadyVerified) {
        await refreshEmailVerified();
        router.replace('/');
        return;
      }
      setExpiresAt(r.expiresAt);
      setSentAt(Date.now());
      setCode('');
      if (uid) AsyncStorage.setItem(key(uid), JSON.stringify({ expiresAt: r.expiresAt, sentAt: Date.now() })).catch(() => {});
      notify(t('otp.sent', { email }));
      input.current?.focus();
    } catch (e) {
      setError(t(authErrorKey(e) as 'common.error'));
    } finally {
      setBusy(null);
    }
  }, [auth, refreshEmailVerified, uid, t, email]);

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setError('');
    setBusy('check');
    try {
      await auth.verifyCode(value);
      await refreshEmailVerified();
      if (uid) AsyncStorage.removeItem(key(uid)).catch(() => {});
      notify(t('verify.ok'));
      router.replace('/');
    } catch (e) {
      const k = authErrorKey(e);
      const left = (e as { details?: { left?: number } })?.details?.left;
      setError(k === 'otp.wrong' && left != null ? t('otp.wrongLeft', { n: left }) : t(k as 'common.error'));
      setCode('');
    } finally {
      setBusy(null);
    }
  };

  const remaining = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const expired = !!expiresAt && remaining === 0;
  const cooldown = Math.max(0, RESEND_MS - (now - sentAt));
  const mmss = `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <Screen edges={['bottom']}>
      <View style={{ alignItems: 'center', marginVertical: 16 }}>
        <Ionicons name="shield-checkmark" size={58} color={colors.accent} />
        <Text style={[font.h1, { marginTop: 10, textAlign: 'center' }]}>{t('otp.title')}</Text>
        <Text style={[font.small, { marginTop: 6, textAlign: 'center' }]}>{expiresAt ? t('otp.body', { email }) : t('otp.bodyNone', { email })}</Text>
      </View>

      {expiresAt ? (
        <Card>
          {/* Saisie du code : 6 cases, champ unique invisible au-dessus */}
          <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 44,
                  height: 56,
                  borderRadius: radius.md,
                  borderWidth: 1.5,
                  borderColor: expired ? colors.border : i === code.length ? colors.accent : code[i] ? colors.accentDark : colors.border,
                  backgroundColor: colors.bgElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: colors.text, fontSize: 26, fontWeight: '900' }}>{code[i] ?? ''}</Text>
              </View>
            ))}
          </Pressable>
          <TextInput
            ref={input}
            value={code}
            onChangeText={(v) => {
              const c = v.replace(/\D/g, '').slice(0, 6);
              setCode(c);
              if (c.length === 6 && !expired) verify(c);
            }}
            editable={!expired && busy !== 'check'}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            accessibilityLabel={t('otp.title')}
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
          />
          <Text style={{ textAlign: 'center', marginTop: 14, fontWeight: '700', color: expired ? colors.red : remaining < 5 * 60_000 ? colors.orange : colors.muted }}>
            {expired ? t('otp.expiredInfo') : t('otp.validFor', { t: mmss })}
          </Text>
          {error ? <Text style={{ color: colors.red, textAlign: 'center', marginTop: 8 }}>{error}</Text> : null}
          {mode === 'demo' ? <Text style={[font.small, { textAlign: 'center', marginTop: 8, color: colors.orange }]}>{t('otp.demo')}</Text> : null}
          <Button label={t('otp.validate')} icon="checkmark-circle" onPress={() => verify()} loading={busy === 'check'} disabled={code.length !== 6 || expired} style={{ marginTop: 14 }} />
        </Card>
      ) : error ? (
        <Text style={{ color: colors.red, textAlign: 'center', marginBottom: 10 }}>{error}</Text>
      ) : null}

      <Button
        label={cooldown > 0 && expiresAt && !expired ? t('otp.resendIn', { n: Math.ceil(cooldown / 1000) }) : expiresAt ? t('otp.resend') : t('otp.send')}
        icon="mail"
        variant={expired || !expiresAt ? 'primary' : 'secondary'}
        onPress={send}
        loading={busy === 'send'}
        disabled={!!expiresAt && !expired && cooldown > 0}
        style={{ marginTop: 14 }}
      />
      <Text style={[font.small, { textAlign: 'center', marginTop: 10 }]}>{t('verify.spam')}</Text>
      <Button label={t('verify.later')} variant="ghost" onPress={() => router.replace('/')} style={{ marginTop: 10 }} />
    </Screen>
  );
}
