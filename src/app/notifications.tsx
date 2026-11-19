import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { Card, Empty, Screen } from '@/ui/kit';
import { shortDate, timeOf } from '@/ui/format';
import { toDateKey } from '@/domain/model';
import { colors, font } from '@/ui/theme';

/** Boîte de notifications in-app (réservations, validations, rappels). */
export default function NotificationsScreen() {
  const { t, lang, inbox, inboxSeenAt, markInboxSeen } = useApp();
  // Mémorise le "déjà vu" à l'ouverture pour garder le surlignage pendant la lecture
  const [seenBefore] = useState(inboxSeenAt);
  useEffect(() => {
    markInboxSeen();
  }, [markInboxSeen, inbox.length]);

  return (
    <Screen>
      {inbox.length === 0 ? <Empty text={t('inbox.empty')} icon="notifications-off-outline" /> : null}
      {inbox.map((it) => {
        const txt = it[lang] ?? it.fr;
        const unread = it.createdAt > seenBefore;
        return (
          <Card
            key={it.id}
            onPress={it.url ? () => router.push(it.url as never) : undefined}
            style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: unread ? colors.accent : 'transparent' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text style={[font.body, { fontWeight: '800', flex: 1 }]}>{txt.title}</Text>
              <Text style={[font.small, { marginLeft: 8 }]}>
                {shortDate(toDateKey(new Date(it.createdAt)))} {timeOf(it.createdAt)}
              </Text>
            </View>
            {txt.body ? <Text style={[font.small, { marginTop: 4, color: colors.text }]}>{txt.body}</Text> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
