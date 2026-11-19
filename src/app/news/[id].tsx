import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { COL } from '@/data/store';
import { isFacebookUrl, type NewsItem } from '@/domain/model';
import { FacebookPlayer } from '@/ui/FacebookPlayer';
import { MatchRow } from '@/ui/football';
import { dayLabel } from '@/ui/format';
import { Button, Empty, Screen, Section } from '@/ui/kit';
import { NEWS_COLOR, NEWS_ICON } from '@/ui/news';
import { toDateKeySafe } from '@/ui/newsUtil';
import { colors, font, radius } from '@/ui/theme';

export default function NewsDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, store, matches } = useApp();
  const [item, setItem] = useState<NewsItem | null | undefined>(undefined);
  useEffect(() => store.watchDoc<NewsItem>(COL.news, id, setItem), [store, id]);
  if (item === undefined) return <Screen><Empty text={t('common.loading')} /></Screen>;
  if (!item) return <Screen><Empty text={t('common.empty')} /></Screen>;
  const match = item.matchId ? matches.find((m) => m.id === item.matchId) : undefined;

  return (
    <Screen edges={[]}>
      {item.videoUrl && isFacebookUrl(item.videoUrl) ? (
        <FacebookPlayer url={item.videoUrl} />
      ) : item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md }} />
      ) : (
        <View style={{ height: 140, borderRadius: radius.md, backgroundColor: NEWS_COLOR[item.type] + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={NEWS_ICON[item.type]} size={56} color={NEWS_COLOR[item.type]} />
        </View>
      )}
      <Text style={[font.tiny, { color: NEWS_COLOR[item.type], fontWeight: '800', textTransform: 'uppercase', marginTop: 16 }]}>
        {t(`news.${item.type}` as 'news.article')} · {dayLabel(toDateKeySafe(item.createdAt), lang, t)}
      </Text>
      <Text style={[font.h1, { marginTop: 6 }]}>{item.title}</Text>
      <Text style={[font.body, { marginTop: 12, lineHeight: 22, color: colors.text }]}>{item.body}</Text>
      {item.videoUrl && !isFacebookUrl(item.videoUrl) ? (
        <Button label={t('news.watch')} icon="play" style={{ marginTop: 16 }} onPress={() => Linking.openURL(item.videoUrl!)} />
      ) : null}
      {match ? (
        <Section title={t('match.summary')}>
          <MatchRow match={match} showDate />
        </Section>
      ) : null}
    </Screen>
  );
}
