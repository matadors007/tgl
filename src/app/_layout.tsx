import { DarkTheme, DefaultTheme, ThemeProvider, router } from 'expo-router';
import { Animated, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { listenNotificationTaps } from '@/data/push';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '@/data/AppProvider';
import { Loader } from '@/ui/Loader';
import { AuthRedirects } from '@/ui/authRedirects';
import { DialogHost } from '@/ui/dialogs';
import { colors } from '@/ui/theme';
import { useWideWeb, WebTopBar } from '@/ui/web';

function navTheme(dark: boolean) {
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark,
    colors: { ...base.colors, background: colors.bg, card: colors.bgElevated, border: colors.border, primary: colors.accent, text: colors.text },
  };
}

function RootStack() {
  const { authReady, t } = useApp();
  const wide = useWideWeb();
  // Toucher une notification ouvre l'écran concerné (match, réservations, file d'attente)
  useEffect(() => {
    if (!authReady) return;
    return listenNotificationTaps((url) => router.push(url as never));
  }, [authReady]);
  if (!authReady) return null;
  const header = (title: string) => ({
    headerShown: true,
    title,
    headerStyle: { backgroundColor: colors.bgElevated },
    headerTintColor: colors.text,
    headerShadowVisible: false,
    headerBackTitle: t('common.back'),
  });
  const stack = (
    <>
    <AuthRedirects />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ ...header(t('auth.title')), presentation: 'modal' }} />
      <Stack.Screen name="match/[id]" options={header('')} />
      <Stack.Screen name="team/[id]" options={header('')} />
      <Stack.Screen name="player/[id]" options={header('')} />
      <Stack.Screen name="news/index" options={header(t('news.title'))} />
      <Stack.Screen name="news/[id]" options={header(t('news.title'))} />
      <Stack.Screen name="bookings" options={header(t('book.mine'))} />
      <Stack.Screen name="signup" options={{ ...header(t('signup.title')), presentation: 'modal' }} />
      <Stack.Screen name="verify-email" options={header(t('otp.title'))} />
      <Stack.Screen name="auth-action" options={header(t('app.name'))} />
      <Stack.Screen name="account" options={header(t('account.title'))} />
      <Stack.Screen name="notifications" options={header(t('inbox.title'))} />
      <Stack.Screen name="entreprise/joueurs" options={header(t('company.players'))} />
      <Stack.Screen name="entreprise/selection/[id]" options={header(t('selection.title'))} />
      <Stack.Screen name="confidentialite" options={header('Politique de confidentialité')} />
      <Stack.Screen name="suppression-compte" options={header('Suppression de compte')} />
      <Stack.Screen name="admin" />
    </Stack>
    </>
  );
  // Site sur grand écran : barre de navigation en haut (les onglets du bas sont masqués)
  if (!wide) return stack;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WebTopBar />
      <View style={{ flex: 1 }}>{stack}</View>
    </View>
  );
}

/** Durée minimale du loader au démarrage : le tracé du logo a le temps de se dessiner. */
const SPLASH_MIN_MS = 4200;

/** Loader animé au lancement (application et site), en fondu une fois l'app prête. */
function Splash() {
  const { authReady } = useApp();
  const [minDone, setMinDone] = useState(false);
  const [gone, setGone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const id = setTimeout(() => setMinDone(true), SPLASH_MIN_MS);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!authReady || !minDone) return;
    Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }).start(() => setGone(true));
  }, [authReady, minDone, opacity]);
  if (gone) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, zIndex: 100 }]} pointerEvents={authReady && minDone ? 'none' : 'auto'}>
      <Loader />
    </Animated.View>
  );
}

function Themed({ children }: { children: React.ReactNode }) {
  const { theme } = useApp();
  return (
    <ThemeProvider value={navTheme(theme === 'dark')}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Themed>
          <RootStack />
          <Splash />
          <DialogHost />
        </Themed>
      </AppProvider>
    </SafeAreaProvider>
  );
}
