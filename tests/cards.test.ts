import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unzipSync } from 'fflate';
import { base64ToBytes, buildZip, cardFileNames, zipFileName } from '../src/print/cardZip.ts';
import { jpegPagesToPdf } from '../src/print/pdf.ts';
import { licenseCardFileHtml, licenseCardSideXhtml, type LicenseCardData } from '../src/print/templates.ts';

const card = (o: Partial<LicenseCardData> = {}): LicenseCardData => ({
  firstName: 'Amine',
  lastName: 'Ben Salah',
  licenseNo: 'TGL-26-ABC-001',
  teamName: 'ABC & Co',
  season: '2026',
  ...o,
});

test('noms de fichiers : licence + nom, sans accents, uniques', () => {
  const names = cardFileNames([card(), card({ firstName: 'Hédi', lastName: 'Trabelsi', licenseNo: null }), card({ firstName: 'Hédi', lastName: 'Trabelsi', licenseNo: null })]);
  assert.deepEqual(names, ['TGL-26-ABC-001_BEN_SALAH_Amine.pdf', 'SANS-LICENCE_TRABELSI_Hedi.pdf', 'SANS-LICENCE_TRABELSI_Hedi_2.pdf']);
  assert.match(zipFileName('ABC', new Date('2026-10-10T10:00:00Z')), /^Licences_ABC_2026-10-10\.zip$/);
});

test('ZIP : un fichier par carte', () => {
  const zip = buildZip([
    { name: 'a.pdf', data: new Uint8Array([1, 2, 3]) },
    { name: 'b.pdf', data: new Uint8Array([4]) },
  ]);
  const out = unzipSync(zip);
  assert.deepEqual(Object.keys(out).sort(), ['a.pdf', 'b.pdf']);
  assert.deepEqual([...out['a.pdf']], [1, 2, 3]);
});

test('PDF : 2 pages au format carte, table xref cohérente', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = jpegPagesToPdf([{ jpeg, width: 10, height: 6 }, { jpeg, width: 10, height: 6 }], { w: 85.6, h: 54 });
  const txt = Buffer.from(pdf).toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4'));
  assert.match(txt, /\/Count 2/);
  assert.match(txt, /\/MediaBox \[0 0 242\.65 153\.07\]/);
  const xrefAt = Number(txt.match(/startxref\n(\d+)/)![1]);
  assert.ok(txt.slice(xrefAt).startsWith('xref'));
  const offsets = [...txt.slice(xrefAt).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  offsets.forEach((o, i) => assert.ok(txt.slice(o).startsWith(`${i + 1} 0 obj`)));
});

test('base64 → octets', () => {
  assert.deepEqual([...base64ToBytes(Buffer.from('Bonjour!').toString('base64'))], [...Buffer.from('Bonjour!')]);
  assert.deepEqual([...base64ToBytes('data:x;base64,' + Buffer.from('ab').toString('base64'))], [...Buffer.from('ab')]);
});

test('carte seule : recto + verso, XHTML échappé', () => {
  const html = licenseCardFileHtml(card());
  assert.equal(html.match(/class="sheet"/g)?.length, 2);
  const x = licenseCardSideXhtml(card(), 'front');
  assert.ok(x.includes('ABC &amp; Co'));
  assert.ok(x.includes('xmlns="http://www.w3.org/1999/xhtml"'));
});
