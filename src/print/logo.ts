/**
 * Écusson « Tunisia Golden League » (vectoriel) : utilisé dans l'app (PNG généré),
 * sur les cartes de licence et les feuilles de match imprimées.
 * Remplaçable par le logo officiel : il suffit de changer ce SVG.
 */
export const TGL_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7DC8A"/><stop offset=".45" stop-color="#D7AB3E"/><stop offset="1" stop-color="#9C7418"/></linearGradient>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1c1c"/><stop offset="1" stop-color="#050505"/></linearGradient>
</defs>
<path d="M100 6 L188 30 L188 120 C188 175 150 212 100 234 C50 212 12 175 12 120 L12 30 Z" fill="url(#g)"/>
<path d="M100 16 L178 37 L178 120 C178 169 144 202 100 222 C56 202 22 169 22 120 L22 37 Z" fill="url(#b)"/>
<path d="M100 22 L172 41 L172 120 C172 165 141 196 100 215 C59 196 28 165 28 120 L28 41 Z" fill="none" stroke="url(#g)" stroke-width="1.6" opacity=".7"/>
<text x="100" y="62" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="21" letter-spacing="3" fill="url(#g)">TUNISIA</text>
<g fill="url(#g)"><polygon points="46,100 48.4,105.4 54,105.8 49.7,109.4 51,115 46,112 41,115 42.3,109.4 38,105.8 43.6,105.4"/><polygon points="154,100 156.4,105.4 162,105.8 157.7,109.4 159,115 154,112 149,115 150.3,109.4 146,105.8 151.6,105.4"/></g>
<circle cx="100" cy="112" r="34" fill="#F6F1E3" stroke="url(#g)" stroke-width="4"/>
<circle cx="100" cy="112" r="31" fill="none" stroke="#111" stroke-width="1.2" opacity=".35"/>
<polygon points="100,95 113,104.5 108,120 92,120 87,104.5" fill="#111"/>
<path d="M100 95 L100 78 M113 104.5 L130 99 M108 120 L118 135 M92 120 L82 135 M87 104.5 L70 99" stroke="#111" stroke-width="3"/>
<path d="M34 158 Q100 146 166 158 L160 182 Q100 171 40 182 Z" fill="url(#g)"/>
<text x="100" y="175" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="20" letter-spacing="2" fill="#111">GOLDEN</text>
<text x="100" y="202" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="15" letter-spacing="5" fill="url(#g)">LEAGUE</text>
</svg>`;

import { TGL_LOGO_PNG } from './logoData.ts';

/** Logo utilisé sur les cartes de licence et feuilles de match : le logo officiel. */
export const TGL_LOGO_DATA_URI = TGL_LOGO_PNG;
/** Ancien écusson vectoriel (conservé en secours). */
export const TGL_CREST_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(TGL_LOGO_SVG)}`;
