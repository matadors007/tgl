/**
 * Mini générateur PDF (sans dépendance) : une page par image JPEG, page au format donné (mm).
 * Utilisé pour produire un fichier par carte de licence (page 1 = recto, page 2 = verso).
 */
export interface JpegPage {
  /** Octets du fichier JPEG. */
  jpeg: Uint8Array;
  /** Dimensions de l'image en pixels. */
  width: number;
  height: number;
}

const MM_TO_PT = 72 / 25.4;
const enc = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

export function jpegPagesToPdf(pages: JpegPage[], pageMm: { w: number; h: number }): Uint8Array {
  const wPt = (pageMm.w * MM_TO_PT).toFixed(2);
  const hPt = (pageMm.h * MM_TO_PT).toFixed(2);
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    length += b.length;
  };
  const obj = (n: number, body: string | Uint8Array[]) => {
    offsets[n] = length;
    if (typeof body === 'string') push(enc(`${n} 0 obj\n${body}\nendobj\n`));
    else {
      push(enc(`${n} 0 obj\n`));
      body.forEach(push);
      push(enc(`\nendobj\n`));
    }
  };

  push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  // 1 : catalogue, 2 : arbre des pages, puis 3 objets par page (page, contenu, image)
  const pageIds = pages.map((_, i) => 3 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  pages.forEach((p, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imgId = pageId + 2;
    obj(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    const draw = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im${i} Do Q`;
    obj(contentId, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    obj(imgId, [
      enc(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`),
      p.jpeg,
      enc('\nendstream'),
    ]);
  });

  const count = 3 + pages.length * 3;
  const xrefAt = length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(enc(`${xref}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`));

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
