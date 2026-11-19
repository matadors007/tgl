import { Platform } from 'react-native';
import * as Print from 'expo-print';
import { File, Paths } from 'expo-file-system';

/**
 * Imprime une page HTML.
 * - Site web : ouvre une fenêtre d'impression du navigateur (impression ou « Enregistrer en PDF »).
 * - Téléphone : aperçu d'impression natif (imprimante ou PDF).
 */
export async function printHtml(html: string, title = 'Tunisia Golden League') {
  if (Platform.OS === 'web') {
    const w = window.open('', '_blank');
    if (!w) throw new Error('popup');
    w.document.open();
    w.document.write(html.replace('<head>', `<head><title>${title}</title>`));
    w.document.close();
    // Attend le chargement des images avant d'imprimer
    const go = () => {
      w.focus();
      w.print();
    };
    if (w.document.readyState === 'complete') setTimeout(go, 400);
    else w.addEventListener('load', () => setTimeout(go, 300));
    return;
  }
  await Print.printAsync({ html });
}

/** Imprime / affiche une pièce jointe (image ou PDF stockée en data URI). */
export async function printDataUri(dataUri: string, mime: string, name = 'document') {
  if (mime === 'application/pdf') {
    if (Platform.OS === 'web') {
      const w = window.open('', '_blank');
      if (!w) throw new Error('popup');
      w.document.write(`<title>${name}</title><iframe src="${dataUri}" style="border:0;position:fixed;inset:0;width:100%;height:100%"></iframe>`);
      return;
    }
    const f = new File(Paths.cache, `tgl-${Date.now()}.pdf`);
    f.create();
    f.write(dataUri.split(',')[1] ?? '', { encoding: 'base64' });
    await Print.printAsync({ uri: f.uri });
    return;
  }
  await printHtml(
    `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center}img{max-width:100%;max-height:270mm;object-fit:contain}</style></head><body><img src="${dataUri}"/></body></html>`,
    name,
  );
}
