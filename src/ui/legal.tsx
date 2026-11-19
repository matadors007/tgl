/** Petits éléments de mise en page des pages légales (confidentialité, suppression de compte). */
import React from 'react';
import { Text, View } from 'react-native';
import { colors, font } from './theme';

export function H({ children }: { children: React.ReactNode }) {
  return <Text style={[font.h3, { color: colors.accent, marginTop: 18, marginBottom: 6 }]}>{children}</Text>;
}
export function P({ children }: { children: React.ReactNode }) {
  return <Text style={[font.body, { lineHeight: 22, marginBottom: 8 }]}>{children}</Text>;
}
export function Li({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 4, paddingRight: 8 }}>
      <Text style={[font.body, { width: 18, color: colors.accent }]}>•</Text>
      <Text style={[font.body, { flex: 1, lineHeight: 22 }]}>{children}</Text>
    </View>
  );
}
