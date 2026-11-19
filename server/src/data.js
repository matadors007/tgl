/**
 * Données : lecture (get, query) et écriture atomique (commit) des documents,
 * avec les règles de sécurité de rules.js. Les écritures prévenues en temps réel via realtime.js.
 *
 * POST /db/get    { col, id }                  → { doc }      (doc.__v : version, pour les transactions)
 * POST /db/query  { col, where: [[champ, valeur]] } → { rows }
 * POST /db/commit { ops: [{ type: 'set'|'update'|'remove', col, id, data }], reads: [{ col, id, v }] }
 *   reads : versions lues pendant une transaction ; si l'une a changé → 409 (le client recommence)
 */
import express from 'express';
import { deleteDoc, dependentCollections, getDoc, pool, putDoc, queryDocs, withTx } from './db.js';
import { identify } from './context.js';
import { ApiError } from './auth.js';
import { canRead, canWrite, redact } from './rules.js';
import { notifyChange } from './realtime.js';

const COL_RE = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const ID_RE = /^[A-Za-z0-9_.:@+-]{1,200}$/;
function checkRef(col, id) {
  if (!COL_RE.test(String(col)) || (id !== undefined && !ID_RE.test(String(id)))) throw new ApiError(400, 'invalid-ref');
}
const strip = (d) => {
  if (!d) return d;
  const { __v, ...rest } = d;
  return rest;
};

/** Contexte des règles : lectures sur une connexion donnée (+ état « après » pendant un commit). */
export function rulesCtx(identity, client, after = new Map()) {
  return {
    uid: identity.uid,
    emailVerified: identity.emailVerified,
    me: identity.me,
    now: Date.now(),
    get: (col, id) => (id ? getDoc(client, col, String(id)) : null),
    async getAfter(col, id) {
      if (!id) return null;
      const k = `${col}/${id}`;
      if (after.has(k)) return after.get(k);
      return getDoc(client, col, String(id));
    },
  };
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function dataRouter() {
  const r = express.Router();
  r.use(identify);

  r.post('/get', wrap(async (req, res) => {
    const { col, id } = req.body;
    checkRef(col, id);
    const doc = await getDoc(pool, col, id);
    const ctx = rulesCtx(req.identity, pool);
    if (doc && !canRead(ctx, col, doc)) throw new ApiError(403, 'permission-denied');
    res.json({ doc: await redact(ctx, col, doc) });
  }));

  r.post('/query', wrap(async (req, res) => {
    const { col, where = [] } = req.body;
    checkRef(col);
    const ctx = rulesCtx(req.identity, pool);
    const rows = (await queryDocs(pool, col, where)).filter((d) => canRead(ctx, col, d));
    res.json({ rows: await Promise.all(rows.map((d) => redact(ctx, col, d))) });
  }));

  r.post('/commit', wrap(async (req, res) => {
    const ops = Array.isArray(req.body.ops) ? req.body.ops : [];
    const reads = Array.isArray(req.body.reads) ? req.body.reads : [];
    if (!ops.length) return res.json({ ok: true });
    if (ops.length > 1000) throw new ApiError(400, 'too-many-ops');
    for (const op of ops) {
      checkRef(op.col, op.id);
      // Taille maximale d'un document (comme Firestore : ~1 Mo ; photos et pièces déjà compressées)
      if (op.data && JSON.stringify(op.data).length > 1_500_000) throw new ApiError(413, 'too-large', { col: op.col, id: op.id });
    }
    const changed = await withTx(async (client) => {
      // Verrou des documents concernés (ordre stable pour éviter les interblocages)
      const keys = [...new Set([...ops.map((o) => `${o.col}/${o.id}`), ...reads.map((x) => `${x.col}/${x.id}`)])].sort();
      // Verrou par document, même s'il n'existe pas encore (deux réservations simultanées du même créneau)
      for (const k of keys) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [k]);
      const before = new Map();
      for (const k of keys) {
        const [col, ...rest] = k.split('/');
        before.set(k, await getDoc(client, col, rest.join('/'), { lock: true }));
      }
      for (const rd of reads) {
        const cur = before.get(`${rd.col}/${rd.id}`);
        if ((cur?.__v ?? 0) !== (rd.v ?? 0)) throw new ApiError(409, 'aborted');
      }
      // État après chaque opération (les règles peuvent lire l'état final, comme getAfter)
      const after = new Map([...before].map(([k, v]) => [k, v ? strip(v) : null]));
      const plan = [];
      for (const op of ops) {
        const k = `${op.col}/${op.id}`;
        const prev = after.get(k);
        if (op.type === 'set') {
          const next = { ...(op.data ?? {}), id: op.id };
          plan.push({ kind: prev ? 'update' : 'create', col: op.col, id: op.id, before: prev, after: next });
          after.set(k, next);
        } else if (op.type === 'update') {
          if (!prev) throw new ApiError(404, 'not-found', { col: op.col, id: op.id });
          const next = { ...prev, ...(op.data ?? {}), id: op.id };
          plan.push({ kind: 'update', col: op.col, id: op.id, before: prev, after: next });
          after.set(k, next);
        } else if (op.type === 'remove') {
          if (prev) plan.push({ kind: 'delete', col: op.col, id: op.id, before: prev, after: null });
          after.set(k, null);
        } else throw new ApiError(400, 'invalid-op');
      }
      const ctx = rulesCtx(req.identity, client, after);
      for (const p of plan) {
        // Règles évaluées sur l'état avant la transaction (comme Firestore) ; getAfter voit l'état final
        const original = before.get(`${p.col}/${p.id}`);
        const check = { ...p, before: p.kind === 'create' ? null : original ? strip(original) : p.before };
        if (!(await canWrite(ctx, check))) throw new ApiError(403, 'permission-denied', { col: p.col, id: p.id, kind: p.kind });
      }
      for (const [k, v] of after) {
        if (!ops.some((o) => `${o.col}/${o.id}` === k)) continue;
        const [col, ...rest] = k.split('/');
        const id = rest.join('/');
        if (v) await putDoc(client, col, id, v);
        else await deleteDoc(client, col, id);
      }
      const keys2 = new Set(ops.map((o) => `${o.col}/${o.id}`));
      // Suppression : les tables liées ont pu changer (cascade / mise à vide) → leurs abonnés sont prévenus
      for (const o of ops) if (o.type === 'remove') for (const dep of dependentCollections(o.col)) keys2.add(`${dep}/*`);
      return [...keys2];
    });
    notifyChange(changed);
    res.json({ ok: true });
  }));

  return r;
}
