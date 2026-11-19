import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/tabs';
import React from 'react';
import { useApp } from '@/data/AppProvider';
import { isLive } from '@/domain/model';
import { colors } from '@/ui/theme';
import { useWideWeb } from '@/ui/web';

export default function TabsLayout() {
  const { t, matchesAll, isCompany, canBookPitch, isStaff, isOperator } = useApp();
  const liveCount = matchesAll.filter(isLive).length;
  const wide = useWideWeb();
  const icon =
    (name: React.ComponentProps<typeof Ionicons>['name']) =>
    ({ color, size }: { color: import('react-native').ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        // Site sur grand écran : navigation dans la barre du haut
        tabBarStyle: wide ? { display: 'none' } : { backgroundColor: colors.bgElevated, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarIcon: icon('home') }} />
      {/* Clients : réservation, vidéos, à propos — pas de championnat */}
      <Tabs.Screen name="book" options={{ title: t('tab.book'), tabBarIcon: icon('calendar'), href: canBookPitch ? undefined : null }} />
      {/* Entreprise : « Mon équipe » en 2e position */}
      <Tabs.Screen name="company" options={{ title: t('tab.company'), tabBarIcon: icon('business'), href: isCompany ? undefined : null }} />
      {/* Championnat : matchs et classements, visibles par tous, visiteurs compris */}
      <Tabs.Screen
        name="matches"
        options={{
          title: t('tab.championship'),
          tabBarIcon: icon('trophy'),
          tabBarBadge: liveCount ? liveCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.live, fontSize: 10 },
        }}
      />
      {/* Classements : dans l'onglet Championnat (bouton « Classements ») */}
      <Tabs.Screen name="standings" options={{ title: t('tab.standings'), tabBarIcon: icon('trophy'), href: null }} />
      <Tabs.Screen name="videos" options={{ title: t('tab.videos'), tabBarIcon: icon('play-circle'), href: isCompany || isOperator ? null : undefined }} />
      {/* « À propos » : accessible depuis l'accueil */}
      <Tabs.Screen name="about" options={{ title: t('tab.about'), tabBarIcon: icon('information-circle'), href: null }} />
      {/* Terrains : accessibles depuis l'Administration */}
      <Tabs.Screen name="pitches" options={{ title: t('tab.pitches'), tabBarIcon: icon('grid'), href: null }} />
      {/* Personnel : Administration (Terrains, Championnats… selon les permissions) */}
      <Tabs.Screen name="gestion" options={{ title: t('admin.title'), tabBarIcon: icon('shield-checkmark'), href: isStaff && !isOperator ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: t('tab.profile'), tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
