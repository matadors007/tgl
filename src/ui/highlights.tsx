import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../data/AppProvider';
import { videoSource, type ShowcaseItem } from '../domain/model';
import { FullscreenVideo } from './Fullscreen';
import { Empty } from './kit';
import { VideoThumb } from './showcase';
import { colors, font } from './theme';
import { VideoPlayer } from './VideoPlayer';
import { useWideWeb } from './web';

/** Vidéos de la vitrine rattachées à un championnat. */
export function championshipVideos(showcase: ShowcaseItem[], championshipId?: string | null) {
  return showcase.filter((i) => i.kind === 'video' && i.active && !!championshipId && i.championshipId === championshipId);
}

/**
 * Rubrique « Highlights » du championnat : vidéos avec leur titre.
 * Un clic lance la vidéo à sa place (sans l'agrandir) ; le plein écran seulement avec le bouton « Agrandir ».
 */
export function HighlightsPanel() {
  const { t, showcase, season } = useApp();
  const wide = useWideWeb();
  const videos = useMemo(() => championshipVideos(showcase, season?.id), [showcase, season?.id]);
  const [playing, setPlaying] = useState<string | null>(null);
  // Autre championnat : on arrête la lecture
  useEffect(() => setPlaying(null), [season?.id]);

  if (!videos.length) return <Empty text={t('hl.empty')} icon="film-outline" />;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 18 }}>
      {videos.map((v) => {
        const src = videoSource(v.videoUrl);
        const on = playing === v.id;
        return (
          <View key={v.id} style={{ width: wide ? '48.5%' : '100%' }}>
            {on && src ? (
              <>
                <FullscreenVideo key={v.id} render={(fill) => <VideoPlayer source={src} fill={fill} />} />
                <Text style={{ color: colors.text, fontWeight: '700', marginTop: 6 }} numberOfLines={2}>
                  {v.title}
                </Text>
              </>
            ) : (
              <VideoThumb item={{ ...v, subtitle: null }} onPress={() => setPlaying(v.id)} />
            )}
            {on && !src ? <Text style={[font.small, { color: colors.orange, marginTop: 4 }]}>{t('videos.unsupported')}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
