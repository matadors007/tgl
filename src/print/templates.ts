/**
 * Documents imprimables (HTML + CSS d'impression) :
 *  - cartes de licence (recto / verso, format carte bancaire 85,6 × 54 mm, 10 par page A4)
 *  - feuille de match (reprend la feuille papier du championnat)
 * Fonctions pures : testables et utilisables sur le site comme sur le téléphone.
 */
import { TGL_LOGO_DATA_URI } from './logo.ts';

export const SLOGAN = 'Jouer avec le cœur, gagner en équipe';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const frDate = (d?: string | null) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
};

const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media screen{body{background:#555;padding:16px}.page{background:#fff;margin:0 auto 16px;box-shadow:0 2px 12px rgba(0,0,0,.4)}}
.page{width:210mm;min-height:297mm;padding:10mm;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
`;

// ───────────────────────── Cartes de licence ─────────────────────────

export interface LicenseCardData {
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  licenseNo?: string | null;
  photo?: string | null; // data URI
  teamName: string;
  companyLogo?: string | null;
  teamColor?: string;
  season: string;
  number?: number | null;
  /** Nom de la ligue (défaut : Tunisia Golden League). */
  league?: string | null;
}

const CARD_CSS = `
.card{width:85.6mm;height:54mm;border-radius:3mm;overflow:hidden;position:relative;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.front{background:linear-gradient(135deg,#151515 0%,#0a0a0a 60%,#1d1608 100%);color:#F6F1E3;border:0.6mm solid #D7AB3E}
.top{display:flex;align-items:center;height:12.5mm;padding:1.5mm 2.5mm;border-bottom:0.4mm solid #D7AB3E}
.logo{height:10mm}
.title{flex:1;text-align:center}
.l1{font-weight:900;font-size:7.6pt;letter-spacing:.6pt;color:#D7AB3E}
.l2{font-size:5.6pt;letter-spacing:.8pt;margin-top:.4mm}
.clogo{height:9mm;width:9mm;object-fit:contain;background:#fff;border-radius:50%;border:0.3mm solid #D7AB3E}
.clogo.ph{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:6pt}
.body{display:flex;padding:2mm 2.5mm 0}
.photo{width:22mm;height:28mm;border:0.5mm solid #D7AB3E;border-radius:1.5mm;overflow:hidden;background:#2a2a2a;display:flex;align-items:center;justify-content:center;color:#777;font-size:6pt}
.photo img{width:100%;height:100%;object-fit:cover}
.info{flex:1;padding-left:3mm;min-width:0}
.name{font-weight:900;font-size:10.5pt;line-height:1.05;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.first{font-size:8.5pt;color:#D7AB3E;font-weight:700;margin-bottom:1.6mm}
.row{display:flex;justify-content:space-between;font-size:6.2pt;border-bottom:0.15mm solid rgba(215,171,62,.35);padding:.55mm 0;gap:2mm}
.row span{color:#bbb}.row b{color:#fff;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.slogan{position:absolute;left:0;right:0;bottom:0;height:6mm;background:linear-gradient(90deg,#9C7418,#F1D27C,#9C7418);color:#111;font-size:6.4pt;font-weight:900;font-style:italic;display:flex;align-items:center;justify-content:center;letter-spacing:.3pt}
.back{background:radial-gradient(circle at 50% 40%,#22201a 0%,#0a0a0a 70%);border:0.6mm solid #D7AB3E;display:flex;flex-direction:column;align-items:center;justify-content:center}
.back img{height:38mm}
.bt{color:#D7AB3E;font-weight:900;font-size:8pt;letter-spacing:1.2pt;margin-top:1.5mm}
.bs{color:#ccc;font-size:5.5pt;margin-top:.6mm}
`;

function cardFront(c: LicenseCardData) {
  return `<div class="card front">
  <div class="top">
    <img class="logo" src="${TGL_LOGO_DATA_URI}"/>
    <div class="title"><div class="l1">${esc((c.league ?? 'Tunisia Golden League').toUpperCase())}</div><div class="l2">LICENCE JOUEUR · ${esc(c.season)}</div></div>
    ${c.companyLogo ? `<img class="clogo" src="${c.companyLogo}"/>` : `<div class="clogo ph" style="background:${esc(c.teamColor ?? '#D7AB3E')}">${esc(c.teamName.slice(0, 3).toUpperCase())}</div>`}
  </div>
  <div class="body">
    <div class="photo">${c.photo ? `<img src="${c.photo}"/>` : '<span>PHOTO</span>'}</div>
    <div class="info">
      <div class="name">${esc(c.lastName.toUpperCase())}</div>
      <div class="first">${esc(c.firstName)}</div>
      <div class="row"><span>Né(e) le</span><b>${esc(frDate(c.birthDate)) || '—'}</b></div>
      <div class="row"><span>N° licence</span><b>${esc(c.licenseNo ?? '—')}</b></div>
      <div class="row"><span>Équipe</span><b>${esc(c.teamName)}${c.number ? ` · N° ${c.number}` : ''}</b></div>
    </div>
  </div>
  <div class="slogan">« ${esc(SLOGAN)} »</div>
</div>`;
}

function cardBack(season: string) {
  return `<div class="card back"><img src="${TGL_LOGO_DATA_URI}"/><div class="bs">Championnat des entreprises · ${esc(season)}</div></div>`;
}

/** Largeur / hauteur d'une carte (mm) — format carte bancaire CR80. */
export const CARD_MM = { w: 85.6, h: 54 };

/** Nom de fichier d'une carte : TGL-26-ABC-001_NOM_Prenom */
export function licenseCardFileName(c: LicenseCardData): string {
  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9-]+/g, '_')
      .replace(/^_+|_+$/g, '');
  return [clean(c.licenseNo ?? 'SANS-LICENCE'), clean(c.lastName.toUpperCase()), clean(c.firstName)].filter(Boolean).join('_') || 'carte';
}

/** Une face de carte, autonome (XHTML valide : utilisable dans un SVG pour en faire une image). */
export function licenseCardSideXhtml(c: LicenseCardData, side: 'front' | 'back'): string {
  return `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${CARD_MM.w}mm;height:${CARD_MM.h}mm;margin:0;color:#111"><style>*{box-sizing:border-box}${CARD_CSS}.card{border-radius:0}</style>${side === 'front' ? cardFront(c) : cardBack(c.season)}</div>`;
}

/** Une carte = un document de 2 pages au format exact de la carte (recto puis verso). */
export function licenseCardFileHtml(c: LicenseCardData): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:${CARD_MM.w}mm ${CARD_MM.h}mm;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0}
.sheet{width:${CARD_MM.w}mm;height:${CARD_MM.h}mm;overflow:hidden;page-break-after:always;break-after:page}
.sheet:last-child{page-break-after:auto;break-after:auto}
${CARD_CSS}.card{border-radius:0}
</style></head><body><div class="sheet">${cardFront(c)}</div><div class="sheet">${cardBack(c.season)}</div></body></html>`;
}

export function licenseCardsHtml(cards: LicenseCardData[]): string {
  const perPage = 10;
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += perPage) {
    const chunk = cards.slice(i, i + perPage);
    pages.push(`<div class="page"><div class="hint">Recto — découper selon les pointillés</div><div class="grid">${chunk.map(cardFront).join('')}</div></div>`);
    // Verso : colonnes inversées pour l'impression recto-verso (bord long)
    const backs: string[] = [];
    for (let r = 0; r < Math.ceil(chunk.length / 2); r++) {
      const left = chunk[r * 2];
      const right = chunk[r * 2 + 1];
      backs.push(right ? cardBack(right.season) : '<div class="card empty"></div>');
      backs.push(left ? cardBack(left.season) : '<div class="card empty"></div>');
    }
    pages.push(`<div class="page"><div class="hint">Verso</div><div class="grid">${backs.join('')}</div></div>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
@page{size:A4;margin:0}
.hint{font-size:9pt;color:#888;margin-bottom:3mm}
.grid{display:grid;grid-template-columns:85.6mm 85.6mm;grid-auto-rows:54mm;gap:4mm 6mm;justify-content:center}
.card{outline:0.2mm dashed #999;outline-offset:1mm}
.card.empty{outline:none}
${CARD_CSS}
</style></head><body>${pages.join('') || '<div class="page">Aucun joueur validé.</div>'}</body></html>`;
}

// ───────────────────────── Feuille de match ─────────────────────────

export interface SheetPlayer {
  number?: number | null;
  name: string;
  captain?: boolean;
}

export interface MatchSheetData {
  date: string; // YYYY-MM-DD
  start: string;
  pitch?: string | null;
  round?: number | null;
  /** Tournoi : « Poule A », « Demi-finales »… (remplace la journée). */
  stageLabel?: string | null;
  /** Tirs au but « 4-3 ». */
  pens?: string | null;
  /** Équipe forfait (match perdu 0-2). */
  forfeit?: string | null;
  season?: string | null;
  league?: string | null;
  team1: { name: string; logo?: string | null; players: SheetPlayer[]; coach?: string | null; delegate?: string | null; captain?: string | null };
  team2: { name: string; logo?: string | null; players: SheetPlayer[]; coach?: string | null; delegate?: string | null; captain?: string | null };
  /** Facultatif : rempli si le match est déjà joué (sinon cases vides à remplir par l'arbitre). */
  yellows1?: string[];
  yellows2?: string[];
  reds1?: string[];
  reds2?: string[];
  scorers1?: string[];
  scorers2?: string[];
  score1?: number | null;
  score2?: number | null;
  referee?: string | null;
}

export function matchSheetHtml(d: MatchSheetData, rows = 12): string {
  const line = (p?: SheetPlayer) => (p ? `${esc(p.name)}${p.captain ? ' <b>(C)</b>' : ''}` : '');
  const num = (p?: SheetPlayer) => (p?.number ? esc(p.number) : '');
  const players = Array.from({ length: Math.max(rows, d.team1.players.length, d.team2.players.length) }, (_, i) => {
    const a = d.team1.players[i];
    const b = d.team2.players[i];
    return `<tr><td class="n">${num(a)}</td><td>${line(a)}</td><td>${line(b)}</td><td class="n">${num(b)}</td></tr>`;
  }).join('');
  const four = (list?: string[]) => Array.from({ length: 4 }, (_, i) => esc(list?.[i] ?? ''));
  const y1 = four(d.yellows1);
  const r1 = four(d.reds1);
  const y2 = four(d.yellows2);
  const r2 = four(d.reds2);
  const cards = y1.map((_, i) => `<tr class="h"><td>${y1[i]}</td><td>${r1[i]}</td><td>${y2[i]}</td><td>${r2[i]}</td></tr>`).join('');
  const logo = (src?: string | null) => `<img class="hl" src="${src || TGL_LOGO_DATA_URI}"/>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
@page{size:A4;margin:0}
.page{font-size:10pt}
.date{margin:0 0 4mm 6mm;font-size:11pt}
table{width:100%;border-collapse:collapse;table-layout:fixed}
td,th{border:1px solid #000;padding:1.6mm 2mm;vertical-align:middle}
.head td{border:1.5px solid #000;text-align:center}
.head .t{font-family:'Times New Roman',serif;font-size:17pt;letter-spacing:1px;color:#333}
.hl{height:12mm;max-width:22mm;object-fit:contain}
.blk{background:#111}
th{font-weight:bold;text-align:left;font-size:9.5pt}
.n{width:12mm;text-align:center;font-weight:bold}
tr.p td{height:7.6mm}
.title{text-align:center;font-family:'Times New Roman',serif;font-size:14pt;margin:3mm 0 2mm;color:#333;letter-spacing:.5px}
.lbl{font-weight:bold;font-size:9.5pt}
.c{text-align:center;font-weight:bold;font-size:9.5pt}
tr.h td{height:6.5mm}
.tall{height:16mm;vertical-align:top}
.sign{height:34mm;vertical-align:top}
.small{font-size:8pt;color:#555}
</style></head><body><div class="page">
<div class="date">DATE : <b>${esc(frDate(d.date))}</b> &nbsp; HEURE : <b>${esc(d.start)}</b>${d.pitch ? ` &nbsp; TERRAIN : <b>${esc(d.pitch)}</b>` : ''}${d.stageLabel ? ` &nbsp; <b>${esc(d.stageLabel.toUpperCase())}</b>` : d.round ? ` &nbsp; JOURNÉE : <b>${esc(d.round)}</b>` : ''}${d.pens ? ` &nbsp; TIRS AU BUT : <b>${esc(d.pens)}</b>` : ''}${d.forfeit ? ` &nbsp; <b style="color:#b91c1c">FORFAIT : ${esc(d.forfeit.toUpperCase())} (0-2)</b>` : ''}</div>
<table class="head"><tr><td style="width:22%" class="blk">${logo(null)}</td><td class="t">${esc((d.league ?? 'Tunisia Golden League').toUpperCase())}</td><td style="width:22%" class="blk">${logo(null)}</td></tr></table>
<table>
<tr><th class="n">N°</th><th>ÉQUIPE 1 : ${esc(d.team1.name)}</th><th>ÉQUIPE 2 : ${esc(d.team2.name)}</th><th class="n">N°</th></tr>
${players.replace(/<tr>/g, '<tr class="p">')}
<tr><td colspan="2" class="lbl">CAPITAINE D'ÉQUIPE : ${esc(d.team1.captain ?? '')}</td><td colspan="2" class="lbl">CAPITAINE D'ÉQUIPE : ${esc(d.team2.captain ?? '')}</td></tr>
</table>
<div class="title">RESPONSABLES DES ÉQUIPES</div>
<table>
<tr><td colspan="2" class="lbl">ENTRAÎNEUR : ${esc(d.team1.coach ?? '')}</td><td colspan="2" class="lbl">ENTRAÎNEUR : ${esc(d.team2.coach ?? '')}</td></tr>
<tr><td colspan="2" class="lbl">DÉLÉGUÉ : ${esc(d.team1.delegate ?? '')}</td><td colspan="2" class="lbl">DÉLÉGUÉ : ${esc(d.team2.delegate ?? '')}</td></tr>
<tr><td class="c">AVERTISSEMENT<br>ÉQUIPE 1</td><td class="c">EXPULSION<br>ÉQUIPE 1</td><td class="c">AVERTISSEMENT<br>ÉQUIPE 2</td><td class="c">EXPULSION<br>ÉQUIPE 2</td></tr>
${cards}
<tr><td colspan="4" class="c tall">RÉSERVE ET BLESSURE</td></tr>
<tr><td colspan="2" class="c">N° BUTEUR ÉQUIPE 1</td><td colspan="2" class="c">N° BUTEUR ÉQUIPE 2</td></tr>
<tr><td colspan="2" class="tall">${esc((d.scorers1 ?? []).join(', '))}</td><td colspan="2" class="tall">${esc((d.scorers2 ?? []).join(', '))}</td></tr>
<tr><td colspan="2" class="c">RÉSULTAT ÉQUIPE 1 : <span style="font-size:13pt">${d.score1 ?? ''}</span></td><td colspan="2" class="c">RÉSULTAT ÉQUIPE 2 : <span style="font-size:13pt">${d.score2 ?? ''}</span></td></tr>
<tr><td colspan="4" class="c" style="font-family:'Times New Roman',serif;font-weight:normal;font-size:12pt;color:#333">SIGNATURE ET OBSERVATION DE L'ARBITRE${d.referee ? ` — ${esc(d.referee)}` : ''}</td></tr>
<tr><td colspan="4" class="sign"></td></tr>
</table>
<div class="small" style="margin-top:2mm">${esc(d.season ?? '')} · Feuille générée par l'application ${esc(d.league ?? 'Tunisia Golden League')}</div>
</div></body></html>`;
}
