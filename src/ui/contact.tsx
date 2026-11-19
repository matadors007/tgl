/**
 * « Nous contacter » : numéro public du complexe (appel et WhatsApp) et e-mail,
 * visible par tous les internautes, connectés ou non.
 */
import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/data/AppProvider';
import { phoneLink, whatsappLink } from './format';
import { Button, Card } from './kit';
import { colors, font } from './theme';

/** Numéro WhatsApp public : celui des réglages, sinon le téléphone du complexe. */
export function publicWhatsapp(config: { whatsappNumber?: string; contactPhone?: string }) {
  return (config.whatsappNumber || config.contactPhone || '').trim();
}

export function ContactCard() {
  const { t, config } = useApp();
  const phone = (config.contactPhone ?? '').trim();
  const wa = publicWhatsapp(config);
  const mail = (config.contactEmail ?? '').trim();
  if (!phone && !wa && !mail) return null;
  return (
    <Card style={{ marginTop: 16 }}>
      <Text style={font.h3}>{t('contact.title')}</Text>
      <Text style={[font.small, { marginTop: 2 }]}>{t('contact.sub')}</Text>
      {phone ? <Text style={[font.h2, { color: colors.accent, marginTop: 8 }]}>{phone}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {phone ? <Button small icon="call" label={t('contact.call')} onPress={() => Linking.openURL(phoneLink(phone))} /> : null}
        {wa ? <Button small variant="secondary" icon="logo-whatsapp" label={t('contact.whatsapp')} onPress={() => Linking.openURL(whatsappLink(wa))} /> : null}
        {mail ? <Button small variant="secondary" icon="mail" label={t('contact.email')} onPress={() => Linking.openURL(`mailto:${mail}`)} /> : null}
      </View>
    </Card>
  );
}

/** Version compacte (pied de page du site). */
export function ContactLinks() {
  const { config } = useApp();
  const phone = (config.contactPhone ?? '').trim();
  const wa = publicWhatsapp(config);
  if (!phone && !wa) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
      {phone ? (
        <Pressable onPress={() => Linking.openURL(phoneLink(phone))} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="call" size={14} color={colors.accent} />
          <Text style={[font.small, { color: colors.accent, fontWeight: '700' }]}>{phone}</Text>
        </Pressable>
      ) : null}
      {wa ? (
        <Pressable onPress={() => Linking.openURL(whatsappLink(wa))} accessibilityLabel="WhatsApp">
          <Ionicons name="logo-whatsapp" size={18} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}
