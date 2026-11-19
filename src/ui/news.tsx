import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useApp } from '../data/AppProvider';
import type { NewsItem, NewsType } from '../domain/model';
import { dayLabel, toDateKeySafe } from './newsUtil';
import type { IconName } from './kit';
import { colors, font, radius } from './theme';

export const NEWS_ICON: Record<NewsType, IconName> = {
  article: 'newspaper',
  video: 'play-circle',
  gallery: 'images',
  award: 'star',
};
export const NEWS_COLOR: Record<NewsType, string> = {
  get article() {
    return colors.blue;
  },
  get video() {
    return colors.live;
  },
  get gallery() {
    return colors.accent;
  },
  get award() {
    return colors.yellow;
  },
};

export function NewsCard({ item }: { item: NewsItem }) {
  const { t, lang } = useApp();
  return (
    <Pressable
      onPress={() => router.push(`/news/${item.id}`)}
      style={({ pressed }) => [
        {
          backgroundColor: colors.card,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          marginBottom: 10,
          flexDirection: 'row',
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={{ width: 96, height: 96 }} />
      ) : (
        <View style={{ width: 96, height: 96, backgroundColor: NEWS_COLOR[item.type] + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={NEWS_ICON[item.type]} size={34} color={NEWS_COLOR[item.type]} />
        </View>
      )}
      <View style={{ flex: 1, padding: 10 }}>
        <Text style={[font.tiny, { color: NEWS_COLOR[item.type], fontWeight: '800', textTransform: 'uppercase' }]}>
          {t(`news.${item.type}` as 'news.article')} · {dayLabel(toDateKeySafe(item.createdAt), lang, t)}
        </Text>
        <Text style={[font.h3, { marginTop: 4 }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[font.small, { marginTop: 4 }]} numberOfLines={2}>
          {item.body}
        </Text>
      </View>
    </Pressable>
  );
}
