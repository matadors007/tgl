import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { colors } from './theme';

export function FullscreenButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
      <Ionicons name="expand" size={16} color={colors.accent} />
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, marginLeft: 6 }}>{label}</Text>
    </Pressable>
  );
}
