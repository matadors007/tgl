import { colors, themeMode } from './theme';
import { loaderHtml } from './loaderHtml';

/** Page du loader aux couleurs du thème courant (sombre / clair). */
export function themedLoaderHtml(label: string): string {
  const dark = themeMode() === 'dark';
  label = label.replace(/[….]+$/, '');
  return loaderHtml(
    dark
      ? { bg: colors.bg, ink: '#EADBAE', mute: 'rgba(234,219,174,.5)', track: 'rgba(234,219,174,.12)', label }
      : { bg: colors.bg, ink: '#6E5114', mute: 'rgba(110,81,20,.6)', track: 'rgba(110,81,20,.14)', label },
  );
}
