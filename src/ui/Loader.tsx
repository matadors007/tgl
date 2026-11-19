import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useApp } from '../data/AppProvider';
import { themedLoaderHtml } from './loaderTheme';
import { colors } from './theme';

/** Loader animé plein écran (téléphone : WebView). */
export function Loader() {
  const { t, theme } = useApp();
  const html = useMemo(() => themedLoaderHtml(t('common.loading')), [t, theme]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} accessibilityLabel={t('common.loading')}>
      <WebView
        source={{ html }}
        originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: colors.bg }}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled={false}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
      />
    </View>
  );
}
