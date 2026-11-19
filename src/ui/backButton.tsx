import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { colors, radius } from './theme';

/**
 * Bouton « Retour » des rubriques d'administration : page précédente, sinon l'accueil de l'administration.
 * `to` force la destination (rubrique hors de la pile admin, ex. Terrains qui est un onglet).
 */
export function BackButton({ fallback = '/admin', to, style }: { fallback?: string; to?: string; style?: object }) {
  const { t } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      onPress={() => (to ? router.navigate(to as never) : router.canGoBack() ? router.back() : router.replace(fallback as never))}
      hitSlop={8}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 6,
          paddingVertical: 7,
          paddingLeft: 10,
          paddingRight: 14,
          borderRadius: radius.md,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Ionicons name="arrow-back" size={18} color={colors.accent} />
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{t('common.back')}</Text>
    </Pressable>
  );
}
