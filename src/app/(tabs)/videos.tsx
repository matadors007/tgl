import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { videoSource } from '@/domain/model';
import { Empty, Header, Screen, Section } from '@/ui/kit';
import { VideoThumb } from '@/ui/showcase';
import { colors, font } from '@/ui/theme';
import { VideoPlayer } from '@/ui/VideoPlayer';
import { FullscreenVideo } from '@/ui/Fullscreen';

/** Rubrique « Vidéos » : petites vidéos publicitaires du complexe. */
export default function VideosScreen() {
  const { t, showcase } = useApp();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const videos = useMemo(() => showcase.filter((i) => i.kind === 'video' && i.active), [showcase]);
  const [current, setCurrent] = useState<string | null>(id ?? null);
  useEffect(() => {
    if (id) setCurrent(id);
  }, [id]);
  const playing = videos.find((v) => v.id === current) ?? null;
  const src = videoSource(playing?.videoUrl);

  return (
    <Screen>
      <Header title={t('videos.title')} />
      {!videos.length ? <Empty text={t('videos.empty')} icon="play-circle-outline" /> : null}
      {playing ? (
        <View style={{ marginBottom: 8 }}>
          {src ? (
            <FullscreenVideo key={playing.id} render={(fill) => <VideoPlayer source={src} fill={fill} />} />
          ) : (
            <Text style={[font.small, { color: colors.orange }]}>{t('videos.unsupported')}</Text>
          )}
          <Text style={[font.h2, { marginTop: 10 }]}>{playing.title}</Text>
          {playing.subtitle ? <Text style={font.small}>{playing.subtitle}</Text> : null}
        </View>
      ) : null}
      {videos.length ? (
        <Section title={playing ? t('home.videos') : undefined} style={playing ? undefined : { marginTop: 0 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 }}>
            {videos.map((v) => (
              <View key={v.id} style={{ width: '48%' }}>
                <VideoThumb item={v} active={v.id === current} onPress={() => setCurrent(v.id)} />
              </View>
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
