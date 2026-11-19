import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StatusBar, View } from 'react-native';
import { useApp } from '../data/AppProvider';
import { FullscreenButton } from './FullscreenButton';

/**
 * Vidéo avec bouton « Plein écran » (téléphone) : la vidéo s'ouvre en grand, écran en paysage,
 * puis revient en portrait à la fermeture.
 */
export function FullscreenVideo({ render }: { render: (fill: boolean) => React.ReactNode }) {
  const { t } = useApp();
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [full]);
  return (
    <View>
      {full ? <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12 }} /> : render(false)}
      <FullscreenButton label={t('video.fullscreen')} onPress={() => setFull(true)} />
      <Modal visible={full} animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setFull(false)}>
        <StatusBar hidden />
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {full ? render(true) : null}
          <Pressable
            onPress={() => setFull(false)}
            hitSlop={12}
            accessibilityLabel={t('video.exitFullscreen')}
            style={{ position: 'absolute', top: 14, right: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="contract" size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
