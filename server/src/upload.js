/**
 * Vidéos de la vitrine importées depuis l'ordinateur (au lieu d'un lien YouTube / Facebook).
 *
 * POST /api/upload/video          corps = le fichier brut (Content-Type video/mp4, video/webm ou video/quicktime)
 *                                 → { url }   (servie par Caddy sous /uploads/videos/…)
 * POST /api/upload/video/delete   { url }  → supprime un fichier importé (vidéo remplacée ou retirée)
 *
 * Réservé aux comptes qui gèrent la vitrine (permission « showcase »).
 * Le fichier est reçu en flux (jamais entièrement en mémoire), sa taille est limitée
 * et son contenu réel est vérifié (signature MP4 / MOV / WebM), pas seulement son extension.
 */
import express from 'express';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { identify } from './context.js';
import { ApiError } from './auth.js';
import { permOf } from './rules.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/data/uploads';
const VIDEO_DIR = path.join(UPLOAD_DIR, 'videos');
export const VIDEO_MAX_MB = Number(process.env.VIDEO_MAX_MB ?? 500);
const MAX_BYTES = VIDEO_MAX_MB * 1024 * 1024;
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/$/, '');

const TYPES = { 'video/mp4': 'mp4', 'video/x-m4v': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
/** Nom des fichiers créés ici : 24 caractères aléatoires + extension (rien d'autre n'est jamais supprimé). */
const NAME_RE = /\/uploads\/videos\/([A-Za-z0-9_-]{24,64}\.(?:mp4|mov|webm))$/;

/** Contenu réel : MP4 / MOV → « ftyp » à l'octet 4 ; WebM → signature EBML 1A 45 DF A3. */
async function realType(file) {
  const fh = await open(file, 'r');
  try {
    const buf = Buffer.alloc(12);
    await fh.read(buf, 0, 12, 0);
    if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'iso';
    if (buf.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
    return null;
  } finally {
    await fh.close();
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const requireShowcase = (req) => {
  if (!req.identity?.uid) throw new ApiError(401, 'auth/unauthenticated');
  if (!permOf(req.identity.me, 'showcase')) throw new ApiError(403, 'permission-denied');
};

export function uploadRouter() {
  const r = express.Router();
  r.use(identify);

  r.post('/video', wrap(async (req, res) => {
    requireShowcase(req);
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const ext = TYPES[type];
    if (!ext) throw new ApiError(415, 'unsupported-type');
    const declared = Number(req.headers['content-length'] ?? NaN);
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      res.setHeader('Connection', 'close'); // la suite de l'envoi n'est pas lue
      throw new ApiError(413, 'too-large', { maxMb: VIDEO_MAX_MB });
    }

    await mkdir(VIDEO_DIR, { recursive: true });
    const name = `${randomBytes(18).toString('base64url')}.${ext}`;
    const tmp = path.join(VIDEO_DIR, `.part-${name}`);
    const out = createWriteStream(tmp, { flags: 'wx' });
    let size = 0;
    let tooBig = false;

    try {
      await new Promise((resolve, reject) => {
        req.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES && !tooBig) {
            tooBig = true;
            req.unpipe(out);
            out.destroy();
            // Réponse 413 puis connexion fermée : le reste de l'envoi n'est ni lu ni stocké
            res.setHeader('Connection', 'close');
            reject(new ApiError(413, 'too-large', { maxMb: VIDEO_MAX_MB }));
          }
        });
        req.on('aborted', () => reject(new ApiError(400, 'aborted')));
        req.on('error', reject);
        out.on('error', reject);
        out.on('finish', resolve);
        req.pipe(out);
      });
      if (size < 1024) throw new ApiError(400, 'invalid-argument');
      const real = await realType(tmp);
      if (!real || (real === 'webm') !== (ext === 'webm')) throw new ApiError(415, 'unsupported-type');
      await rename(tmp, path.join(VIDEO_DIR, name));
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw e;
    }
    console.log(`[vidéo] importée : ${name} (${Math.round(size / 1024 / 1024)} Mo) par ${req.identity.uid}`);
    res.json({ url: `${SITE_URL}/uploads/videos/${name}`, size });
  }));

  r.post('/video/delete', express.json(), wrap(async (req, res) => {
    requireShowcase(req);
    const m = NAME_RE.exec(String(req.body?.url ?? ''));
    if (!m) return res.json({ deleted: false });
    await unlink(path.join(VIDEO_DIR, m[1])).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
    res.json({ deleted: true });
  }));

  return r;
}
