/** Charte Tunisia Golden League : noir profond + or (mode sombre) / crème + or (mode clair). */
export type ThemeMode = 'dark' | 'light';

const dark = {
  bg: '#0B0B0B',
  bgElevated: '#121212',
  card: '#181818',
  cardAlt: '#212019',
  border: '#2D2A22',
  text: '#F6F1E3',
  muted: '#A69F8C',
  faint: '#6B6555',
  /** Or de la marque (#D7AB3E) — couleur d'action principale. */
  accent: '#D7AB3E',
  accentDark: '#B38B28',
  accentSoft: 'rgba(215,171,62,0.14)',
  /** Texte posé sur un fond or. */
  onAccent: '#111111',
  success: '#34C47C',
  successSoft: 'rgba(52,196,124,0.14)',
  live: '#EF4444',
  liveSoft: 'rgba(239,68,68,0.14)',
  yellow: '#FACC15',
  red: '#EF4444',
  orange: '#F59E0B',
  orangeSoft: 'rgba(245,158,11,0.14)',
  blue: '#60A5FA',
  blueSoft: 'rgba(96,165,250,0.12)',
  grey: '#4B4B4B',
  white: '#FFFFFF',
  cream: '#FCF9F2',
  /** Fond de la barre de navigation du site. */
  nav: 'rgba(11,11,11,0.92)',
  shadow: 'rgba(0,0,0,0.45)',
};

const light: typeof dark = {
  bg: '#F6F3EC',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#F4EEDD',
  border: '#E5DCC5',
  text: '#1B1812',
  muted: '#6A6250',
  faint: '#A39A84',
  accent: '#B8891F',
  accentDark: '#94690E',
  accentSoft: 'rgba(184,137,31,0.13)',
  onAccent: '#FFFFFF',
  success: '#15925A',
  successSoft: 'rgba(21,146,90,0.12)',
  live: '#DC2626',
  liveSoft: 'rgba(220,38,38,0.10)',
  yellow: '#CA8A04',
  red: '#DC2626',
  orange: '#C2690A',
  orangeSoft: 'rgba(194,105,10,0.12)',
  blue: '#2563EB',
  blueSoft: 'rgba(37,99,235,0.10)',
  grey: '#9A9A9A',
  white: '#FFFFFF',
  cream: '#FCF9F2',
  nav: 'rgba(255,255,255,0.94)',
  shadow: 'rgba(60,45,10,0.12)',
};

export const palettes = { dark, light };

/** Couleurs courantes : objet modifié sur place quand on change de thème. */
export const colors = { ...dark };

let current: ThemeMode = 'dark';
let version = 0;
export const THEME_KEY = 'tgl.theme';

export function themeMode(): ThemeMode {
  return current;
}

/** Applique un thème (les écrans se redessinent via AppProvider). */
export function applyTheme(mode: ThemeMode) {
  if (mode === current) return;
  current = mode;
  version++;
  Object.assign(colors, palettes[mode]);
}

// Site web : thème mémorisé lu tout de suite (pas de clignotement au chargement)
try {
  const w = globalThis as { localStorage?: Storage };
  const saved = w.localStorage?.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') applyTheme(saved);
} catch {
  // stockage indisponible
}

/** Feuille de styles recalculée automatiquement après un changement de thème. */
export function themedStyles<T extends object>(make: () => T): T {
  let made = make();
  let at = version;
  return new Proxy({} as T, {
    get(_t, prop) {
      if (at !== version) {
        made = make();
        at = version;
      }
      return (made as Record<string | symbol, unknown>)[prop];
    },
  });
}

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

// La couleur est lue au moment du rendu (getter) : elle suit le thème
const txt = <T extends object>(base: T, key: 'text' | 'muted') =>
  Object.defineProperty(base, 'color', { get: () => colors[key], enumerable: true }) as T & { color: string };

export const font = {
  h1: txt({ fontSize: 24, fontWeight: '800' as const }, 'text'),
  h2: txt({ fontSize: 18, fontWeight: '700' as const }, 'text'),
  h3: txt({ fontSize: 15, fontWeight: '700' as const }, 'text'),
  body: txt({ fontSize: 14 }, 'text'),
  small: txt({ fontSize: 12 }, 'muted'),
  tiny: txt({ fontSize: 10 }, 'muted'),
};

export const BRAND = {
  name: 'Tunisia Golden League',
  short: 'TGL',
};
