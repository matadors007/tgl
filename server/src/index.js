/** Serveur API Tunisia Golden League : HTTP (/api) + temps réel (/ws). */
import http from 'node:http';
import express from 'express';
import { migrate, pool } from './db.js';
import { ApiError, authRouter } from './auth.js';
import { dataRouter } from './data.js';
import { notifyRouter } from './notify.js';
import { attachRealtime } from './realtime.js';
import { uploadRouter } from './upload.js';

const app = express();
app.set('trust proxy', 1); // derrière Caddy
app.disable('x-powered-by');
// Photos et justificatifs en base64 : 1,5 Mo maximum par document (data.js), quelques documents par envoi
app.use(express.json({ limit: '10mb' }));

// Le site web et l'application peuvent appeler l'API (application mobile : pas d'origine)
const ORIGINS = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && (ORIGINS.length === 0 || ORIGINS.includes(o))) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Limite de requêtes par adresse IP (protection contre les abus et les robots)
const ipHits = new Map();
setInterval(() => ipHits.clear(), 60_000).unref();
app.use('/api', (req, res, next) => {
  const n = (ipHits.get(req.ip) ?? 0) + 1;
  ipHits.set(req.ip, n);
  if (n > Number(process.env.RATE_LIMIT_PER_MIN ?? 600)) return res.status(429).json({ code: 'resource-exhausted' });
  next();
});
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});
app.use('/api/auth', authRouter());
app.use('/api/db', dataRouter());
app.use('/api/notify', notifyRouter());
app.use('/api/upload', uploadRouter());

app.use((_req, res) => res.status(404).json({ code: 'not-found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ code: err.code, details: err.details ?? null });
  if (err?.type === 'entity.too.large') return res.status(413).json({ code: 'too-large' });
  // Contraintes de la base : données incohérentes refusées proprement
  if (/^2[23]/.test(err?.code ?? '')) console.warn(`[base] écriture refusée (${err.code}) : ${err.message}`);
  if (err?.code === '23503') return res.status(409).json({ code: 'failed-precondition', details: { constraint: err.constraint ?? null } });
  if (err?.code === '23514' || err?.code === '23502' || err?.code === '22P02' || err?.code === '22007' || err?.code === '22008')
    return res.status(400).json({ code: 'invalid-argument', details: { constraint: err.constraint ?? err.column ?? null, message: err.message } });
  if (err?.code === '23505') return res.status(409).json({ code: 'already-exists', details: { constraint: err.constraint ?? null } });
  console.error(err);
  res.status(500).json({ code: 'internal' });
});

const port = Number(process.env.PORT ?? 8080);
await migrate();
const server = http.createServer(app);
// Envoi d'une vidéo (jusqu'à 500 Mo) sur une connexion lente : plus de 5 minutes possibles
server.requestTimeout = 60 * 60_000;
attachRealtime(server);
server.listen(port, () => console.log(`API prête sur le port ${port}`));

const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
