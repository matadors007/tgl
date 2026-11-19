import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';
import React from 'react';
import { Platform } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { BackButton } from '@/ui/backButton';
import { colors } from '@/ui/theme';

export default function AdminLayout() {
  const { isStaff, t } = useApp();
  if (!isStaff) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        // Rubriques : un bouton « Retour » à la place de la flèche et du titre (le titre reste celui de l'onglet du navigateur)
        headerTitle: '',
        headerLeft: () => <BackButton style={{ marginLeft: Platform.OS === 'web' ? 12 : 0 }} />,
      }}
    >
      {/* Accueil de l'administration : pas de barre (ni flèche, ni « Administration ») */}
      <Stack.Screen name="index" options={{ title: t('admin.title'), headerShown: false }} />
      <Stack.Screen name="queue" options={{ title: t('admin.queue') }} />
      <Stack.Screen name="planning" options={{ title: t('admin.planning') }} />
      <Stack.Screen name="matches" options={{ title: t('admin.matches') }} />
      <Stack.Screen name="live/[id]" options={{ title: t('msheet.matchTitle') }} />
      <Stack.Screen name="season" options={{ title: t('admin.season') }} />
      <Stack.Screen name="team/[id]" options={{ title: t('season.teams') }} />
      <Stack.Screen name="news" options={{ title: t('admin.news') }} />
      <Stack.Screen name="settings" options={{ title: t('admin.settings') }} />
      <Stack.Screen name="validation" options={{ title: t('validation.title') }} />
      <Stack.Screen name="slots" options={{ title: t('admin.slots') }} />
      <Stack.Screen name="showcase" options={{ title: t('admin.showcase') }} />
      <Stack.Screen name="licences" options={{ title: t('lic.title') }} />
      <Stack.Screen name="staff" options={{ title: t('staff.title') }} />
      <Stack.Screen name="calendar" options={{ title: t('cal.title') }} />
      <Stack.Screen name="pitch/[id]" options={{ title: t('tab.pitches') }} />
      <Stack.Screen name="championships" options={{ title: t('champ.title') }} />
      <Stack.Screen name="championship/[id]" options={{ title: t('champ.title') }} />
    </Stack>
  );
}
