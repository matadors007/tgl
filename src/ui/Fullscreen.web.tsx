import React, { useRef } from 'react';
import { View } from 'react-native';
import { useApp } from '../data/AppProvider';
import { FullscreenButton } from './FullscreenButton';

/** Site : la vidéo passe en plein écran (API du navigateur). */
export function FullscreenVideo({ render }: { render: (fill: boolean) => React.ReactNode }) {
  const { t } = useApp();
  const box = useRef<View>(null);
  const go = () => {
    const el = box.current as unknown as HTMLElement | null;
    const any = el as (HTMLElement & { webkitRequestFullscreen?: () => void }) | null;
    if (any?.requestFullscreen) any.requestFullscreen().catch(() => {});
    else any?.webkitRequestFullscreen?.();
  };
  return (
    <View>
      <View ref={box} style={{ backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }}>
        {render(false)}
      </View>
      <FullscreenButton label={t('video.fullscreen')} onPress={go} />
    </View>
  );
}
