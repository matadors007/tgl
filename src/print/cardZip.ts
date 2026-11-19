/** Archive ZIP des cartes de licence : un fichier par carte (fonctions communes web / téléphone). */
import { zipSync } from 'fflate';
import { licenseCardFileName, type LicenseCardData } from './templates.ts';

export interface CardFile {
  name: string;
  data: Uint8Array;
}

/** Noms uniques dans l'archive (deux joueurs sans licence et au même nom → suffixe). */
export function uniqueNames(names: string[], ext: string): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = n.toLowerCase();
    const c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    return `${n}${c > 1 ? `_${c}` : ''}.${ext}`;
  });
}

export function cardFileNames(cards: LicenseCardData[], ext = 'pdf'): string[] {
  return uniqueNames(cards.map(licenseCardFileName), ext);
}

export function buildZip(files: CardFile[]): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  // Les PDF contiennent déjà des images compressées : stockage sans recompression
  for (const f of files) entries[f.name] = [f.data, { level: 0 }];
  return zipSync(entries);
}

/** Nom de l'archive : Licences_ABC_2026-10-10.zip */
export function zipFileName(team: string, date = new Date()): string {
  const d = date.toISOString().slice(0, 10);
  const t = team.replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'equipe';
  return `Licences_${t}_${d}.zip`;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}
