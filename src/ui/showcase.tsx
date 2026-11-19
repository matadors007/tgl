import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Image, type ImageSourcePropType, Pressable, ScrollView, Text, View } from 'react-native';
import type { TFn } from '../data/AppProvider';
import { videoThumbnail, type ShowcaseItem } from '../domain/model';
import { colors, radius } from './theme';

/* eslint-disable @typescript-eslint/no-require-imports */
/** Photos par défaut (remplaçables dans Administration → Vitrine). */
export const DEFAULT_PITCH_IMAGES: ImageSourcePropType[] = [
  require('../../assets/showcase/pitch1.jpg'),
  require('../../assets/showcase/pitch2.jpg'),
  require('../../assets/showcase/pitch3.jpg'),
];
/* eslint-enable @typescript-eslint/no-require-imports */

export interface Slide {
  key: string;
  source: ImageSourcePropType;
  title?: string | null;
  subtitle?: string | null;
}

export function imageSource(img?: string | null, fallbackIndex = 0): ImageSourcePropType {
  return img ? { uri: img } : DEFAULT_PITCH_IMAGES[fallbackIndex % DEFAULT_PITCH_IMAGES.length];
}

/** Diapositives du carrousel : celles de l'admin, sinon les photos par défaut. */
export function carouselSlides(items: ShowcaseItem[], t: TFn): Slide[] {
  const mine = items.filter((i) => i.kind === 'slide' && i.active && i.image);
  if (mine.length) return mine.map((i) => ({ key: i.id, source: { uri: i.image! }, title: i.title, subtitle: i.subtitle }));
  return [
    { key: 'd1', source: DEFAULT_PITCH_IMAGES[0], title: t('show.d1.title'), subtitle: t('show.d1.sub') },
    { key: 'd2', source: DEFAULT_PITCH_IMAGES[1], title: t('show.d2.title'), subtitle: t('show.d2.sub') },
    { key: 'd3', source: DEFAULT_PITCH_IMAGES[2], title: t('show.d3.title'), subtitle: t('show.d3.sub') },
  ];
}

/** Carrousel de photos qui défile tout seul (toutes les 4 s), avec points de position. */
export function Carousel({ slides, height = 210, interval = 4000 }: { slides: Slide[]; height?: number; interval?: number }) {
  const ref = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const touching = useRef(false);

  useEffect(() => {
    if (slides.length < 2 || !width) return;
    const id = setInterval(() => {
      if (touching.current) return;
      setIndex((i) => {
        const next = (i + 1) % slides.length;
        ref.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, interval);
    return () => clearInterval(id);
  }, [slides.length, width, interval]);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
    >
      {width ? (
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => (touching.current = true)}
          onScrollEndDrag={() => (touching.current = false)}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          scrollEventThrottle={16}
        >
          {slides.map((s) => (
            <View key={s.key} style={{ width, height }}>
              <Image source={s.source} style={{ width, height }} resizeMode="cover" />
              {s.title ? (
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 30, paddingBottom: 26, backgroundColor: 'rgba(0,0,0,0.45)' }}>
                  <Text style={{ color: '#F6F1E3', fontSize: 18, fontWeight: '900' }} numberOfLines={1}>
                    {s.title}
                  </Text>
                  {s.subtitle ? (
                    <Text style={{ color: '#D7AB3E', fontSize: 13, fontWeight: '600', marginTop: 2 }} numberOfLines={2}>
                      {s.subtitle}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}
      {slides.length > 1 ? (
        <View style={{ position: 'absolute', bottom: 9, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {slides.map((s, i) => (
            <View
              key={s.key}
              style={{ width: i === index ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: i === index ? colors.accent : 'rgba(255,255,255,0.45)' }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Vignette d'une vidéo (miniature + bouton lecture). */
export function VideoThumb({ item, onPress, width, active }: { item: ShowcaseItem; onPress: () => void; width?: number; active?: boolean }) {
  const thumb = videoThumbnail(item);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width, opacity: pressed ? 0.8 : 1 }]}>
      <View
        style={{
          aspectRatio: 16 / 9,
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: colors.cardAlt,
          borderWidth: active ? 2 : 1,
          borderColor: active ? colors.accent : colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {thumb ? <Image source={{ uri: thumb }} style={{ position: 'absolute', width: '100%', height: '100%' }} resizeMode="cover" /> : null}
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.accent }}>
          <Ionicons name="play" size={22} color={colors.accent} style={{ marginLeft: 3 }} />
        </View>
      </View>
      <Text style={{ color: colors.text, fontWeight: '700', marginTop: 6 }} numberOfLines={2}>
        {item.title}
      </Text>
      {item.subtitle ? (
        <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
          {item.subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}
