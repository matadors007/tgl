/**
 * Site web : chaque carte est dessinée (recto + verso) en image haute définition,
 * mise dans un PDF au format carte, puis toutes les cartes sont réunies dans un ZIP téléchargé.
 */
import { buildZip, cardFileNames, type CardFile } from './cardZip';
import { jpegPagesToPdf, type JpegPage } from './pdf';
import { CARD_MM, licenseCardSideXhtml, type LicenseCardData } from './templates';

const PX_PER_MM = 12; // ≈ 300 dpi
const CSS_PX_PER_MM = 96 / 25.4;

async function toDataUri(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise<string>((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = ko;
      r.readAsDataURL(blob);
    });
  } catch {
    return null; // logo inaccessible : pastille de couleur à la place
  }
}

async function renderSide(card: LicenseCardData, side: 'front' | 'back'): Promise<JpegPage> {
  const cssW = CARD_MM.w * CSS_PX_PER_MM;
  const cssH = CARD_MM.h * CSS_PX_PER_MM;
  const W = Math.round(CARD_MM.w * PX_PER_MM);
  const H = Math.round(CARD_MM.h * PX_PER_MM);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${cssW} ${cssH}">` +
    `<foreignObject x="0" y="0" width="${cssW}" height="${cssH}">${licenseCardSideXhtml(card, side)}</foreignObject></svg>`;
  const img = new Image();
  img.width = W;
  img.height = H;
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  await new Promise((r) => setTimeout(r, 30)); // laisse le temps aux images internes (photo, logos)
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const blob = await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('canvas'))), 'image/jpeg', 0.93));
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: W, height: H };
}

export async function cardPdf(card: LicenseCardData): Promise<Uint8Array> {
  const c = { ...card, companyLogo: await toDataUri(card.companyLogo), photo: await toDataUri(card.photo) };
  return jpegPagesToPdf([await renderSide(c, 'front'), await renderSide(c, 'back')], CARD_MM);
}

/** Construit le ZIP (un PDF recto/verso par carte) et lance le téléchargement. */
export async function exportLicenseCards(cards: LicenseCardData[], zipName: string, onProgress?: (done: number, total: number) => void): Promise<void> {
  const names = cardFileNames(cards);
  const files: CardFile[] = [];
  for (let i = 0; i < cards.length; i++) {
    files.push({ name: names[i], data: await cardPdf(cards[i]) });
    onProgress?.(i + 1, cards.length);
  }
  const zip = buildZip(files);
  const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
