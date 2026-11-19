import React from 'react';
import { View } from 'react-native';
import type { VideoSource } from '../domain/model';
import { embedUrl } from './videoEmbed';

/** Lecteur vidéo (YouTube, Facebook, .mp4). Version web : iframe / balise video. */
export function VideoPlayer({ source, autoplay = true, fill }: { source: VideoSource; autoplay?: boolean; fill?: boolean }) {
  return (
    <View style={fill ? { flex: 1, backgroundColor: '#000' } : { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }}>
      {source?.type === 'file'
        ? React.createElement('video', { src: source.url, controls: true, autoPlay: autoplay, playsInline: true, style: { width: '100%', height: '100%' } })
        : React.createElement('iframe', {
            src: embedUrl(source, autoplay) ?? '',
            style: { border: 'none', width: '100%', height: '100%' },
            allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
            allowFullScreen: true,
          })}
    </View>
  );
}
