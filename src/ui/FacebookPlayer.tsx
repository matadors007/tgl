import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { facebookEmbedUrl } from '../domain/model';

/** Lecteur vidéo Facebook intégré (live ou replay). Version mobile : WebView. */
export function FacebookPlayer({ url, fill }: { url: string; fill?: boolean }) {
  return (
    <View style={fill ? { flex: 1, backgroundColor: '#000' } : { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }}>
      <WebView
        source={{ uri: facebookEmbedUrl(url) }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        javaScriptEnabled
        style={{ flex: 1, backgroundColor: '#000' }}
      />
    </View>
  );
}
