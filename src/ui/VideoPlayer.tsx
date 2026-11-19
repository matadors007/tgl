import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { VideoSource } from '../domain/model';
import { embedHtml } from './videoEmbed';

/** Lecteur vidéo (YouTube, Facebook, .mp4). Version mobile : WebView. */
export function VideoPlayer({ source, autoplay = true, fill }: { source: VideoSource; autoplay?: boolean; fill?: boolean }) {
  return (
    <View style={fill ? { flex: 1, backgroundColor: '#000' } : { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }}>
      <WebView
        // baseUrl : fournit une origine au lecteur YouTube (sinon "erreur 153" sur Android)
        source={{ html: embedHtml(source, autoplay), baseUrl: 'https://tunisiagoldenleague.app' }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        javaScriptEnabled
        style={{ flex: 1, backgroundColor: '#000' }}
      />
    </View>
  );
}
