import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useApp } from '../data/AppProvider';
import { themedLoaderHtml } from './loaderTheme';
import { colors } from './theme';

/** Loader animé plein écran (site : iframe). */
export function Loader() {
  const { t, theme } = useApp();
  const html = useMemo(() => themedLoaderHtml(t('common.loading')), [t, theme]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} accessibilityLabel={t('common.loading')}>
      {React.createElement('iframe', {
        srcDoc: html,
        title: t('common.loading'),
        style: { border: 'none', width: '100%', height: '100%', background: colors.bg },
      })}
    </View>
  );
}
