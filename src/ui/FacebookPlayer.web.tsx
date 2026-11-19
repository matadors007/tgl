import React from 'react';
import { View } from 'react-native';
import { facebookEmbedUrl } from '../domain/model';

/** Lecteur vidéo Facebook intégré (live ou replay). Version web : iframe. */
export function FacebookPlayer({ url, fill }: { url: string; fill?: boolean }) {
  return (
    <View style={fill ? { flex: 1, backgroundColor: '#000' } : { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }}>
      {React.createElement('iframe', {
        src: facebookEmbedUrl(url),
        style: { border: 'none', width: '100%', height: '100%' },
        allow: 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share',
        allowFullScreen: true,
      })}
    </View>
  );
}
