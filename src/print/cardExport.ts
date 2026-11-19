/**
 * Téléphone : chaque carte devient un PDF recto/verso au format carte (moteur d'impression),
 * les fichiers sont réunis dans un ZIP enregistré puis partagé (Fichiers, Drive, WhatsApp, e-mail…).
 */
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { base64ToBytes, buildZip, cardFileNames, type CardFile } from './cardZip';
import { CARD_MM, licenseCardFileHtml, type LicenseCardData } from './templates';

const MM_TO_PT = 72 / 25.4;

export async function exportLicenseCards(cards: LicenseCardData[], zipName: string, onProgress?: (done: number, total: number) => void): Promise<void> {
  const names = cardFileNames(cards);
  const files: CardFile[] = [];
  for (let i = 0; i < cards.length; i++) {
    const r = await Print.printToFileAsync({
      html: licenseCardFileHtml(cards[i]),
      width: Math.round(CARD_MM.w * MM_TO_PT),
      height: Math.round(CARD_MM.h * MM_TO_PT),
      margins: { left: 0, right: 0, top: 0, bottom: 0 },
      base64: true,
    });
    files.push({ name: names[i], data: base64ToBytes(r.base64 ?? '') });
    onProgress?.(i + 1, cards.length);
  }
  const out = new File(Paths.cache, zipName);
  if (out.exists) out.delete();
  out.create();
  out.write(buildZip(files));
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(out.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive', dialogTitle: zipName });
  else throw new Error('sharing');
}
