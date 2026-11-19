/**
 * Accès à PostgreSQL.
 *  - migrate()   : applique les migrations SQL (dossier migrations/) dans l'ordre, une seule fois chacune,
 *                  reprend l'ancien format « docs » s'il existe, puis vérifie le schéma.
 *  - getDoc / queryDocs / putDoc / deleteDoc : lecture / écriture des documents de l'application,
 *                  rangés dans leurs tables (voir schema.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { COLLECTIONS, TABLE_TO_COLLECTION, fromRow, toRow, whereSql } from './schema.js';

// Types renvoyés tels que l'application les attend
pg.types.setTypeParser(1082, (v) => v); // date → 'AAAA-MM-JJ'
pg.types.setTypeParser(1700, (v) => (v == null ? null : Number(v))); // numeric → nombre
pg.types.setTypeParser(20, (v) => (v == null ? null : Number(v))); // bigint → nombre

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
});

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Collection → définition (table typée, table clé/valeur ou table générique « documents »). */
function defOf(col) {
  return COLLECTIONS[col] ?? { generic: true, table: 'documents' };
}

// ───────────── Lecture / écriture ─────────────

const META = 'row_version';

export async function getDoc(client, col, id, { lock = false } = {}) {
  const def = defOf(col);
  const r = def.generic
    ? await client.query(`SELECT id, data, ${META} FROM documents WHERE col = $1 AND id = $2${lock ? ' FOR UPDATE' : ''}`, [col, id])
    : await client.query(`SELECT * FROM ${def.table} WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!r.rows.length) return null;
  const row = r.rows[0];
  return def.generic ? { ...row.data, id, __v: Number(row.row_version) } : fromRow(def, row);
}

/** Requête par égalités (comme where('champ', '==', valeur)) ; renvoie les documents sans __v. */
export async function queryDocs(client, col, where = []) {
  const def = defOf(col);
  if (def.generic) {
    const r = await client.query('SELECT id, data FROM documents WHERE col = $1 AND data @> $2::jsonb', [col, JSON.stringify(Object.fromEntries(where))]);
    return r.rows.map((x) => ({ ...x.data, id: x.id }));
  }
  const params = [];
  const r = await client.query(`SELECT * FROM ${def.table} WHERE ${whereSql(def, where, params)}`, params);
  return r.rows.map((row) => {
    const d = fromRow(def, row);
    delete d.__v;
    return d;
  });
}

/** Écrit le document complet (remplace l'existant) ; un champ absent prend la valeur par défaut de la colonne. */
export async function putDoc(client, col, id, data) {
  const def = defOf(col);
  if (def.generic) {
    const { __v: _v, ...clean } = data;
    await client.query(
      `INSERT INTO documents (col, id, data) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (col, id) DO UPDATE SET data = EXCLUDED.data, row_version = documents.row_version + 1, row_updated_at = now()`,
      [col, id, JSON.stringify({ ...clean, id })],
    );
    return;
  }
  const { columns, values, casts } = toRow(def, data);
  const params = [id];
  const placeholders = values.map((v, i) => {
    if (v === null) return 'DEFAULT';
    params.push(v);
    return `$${params.length}${casts[i] ? `::${casts[i]}` : ''}`;
  });
  await client.query(
    `INSERT INTO ${def.table} (id, ${columns.join(', ')}) VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${columns.map((c) => `${c} = EXCLUDED.${c}`).join(', ')},
       row_version = ${def.table}.row_version + 1, row_updated_at = now()`,
    params,
  );
}

export async function deleteDoc(client, col, id) {
  const def = defOf(col);
  if (def.generic) await client.query('DELETE FROM documents WHERE col = $1 AND id = $2', [col, id]);
  else await client.query(`DELETE FROM ${def.table} WHERE id = $1`, [id]);
}

export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ───────────── Relations (clés étrangères) ─────────────

let foreignKeys = [];
/** Collections touchées par une suppression en cascade (ou mise à NULL) depuis une collection donnée. */
let dependents = new Map();

async function loadForeignKeys(client) {
  const r = await client.query(`
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, c.confrelid::regclass::text AS ref,
           af.attname AS refcol, c.confdeltype AS ondelete
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`);
  foreignKeys = r.rows;
  const direct = new Map();
  for (const fk of foreignKeys) {
    const from = TABLE_TO_COLLECTION[fk.ref];
    const to = TABLE_TO_COLLECTION[fk.tbl];
    if (!from || !to) continue;
    if (!direct.has(from)) direct.set(from, new Set());
    direct.get(from).add(to);
  }
  dependents = new Map();
  for (const col of direct.keys()) {
    const seen = new Set();
    const stack = [...direct.get(col)];
    while (stack.length) {
      const c = stack.pop();
      if (seen.has(c)) continue;
      seen.add(c);
      for (const n of direct.get(c) ?? []) stack.push(n);
    }
    dependents.set(col, seen);
  }
}

export const dependentCollections = (col) => dependents.get(col) ?? new Set();

/**
 * Références cassées (données importées) : ligne mise de côté dans « documents » (_orphelin_<table>)
 * puis supprimée, ou référence remise à vide, selon la règle de la clé étrangère. Rien n'est perdu.
 */
export async function cleanOrphans(client) {
  const report = {};
  for (let pass = 0; pass < 10; pass++) {
    let changed = 0;
    for (const fk of foreignKeys) {
      const cond = `t.${fk.col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${fk.ref} r WHERE r.${fk.refcol} = t.${fk.col})`;
      let n;
      if (fk.ondelete === 'n') {
        n = (await client.query(`UPDATE ${fk.tbl} t SET ${fk.col} = NULL WHERE ${cond}`)).rowCount;
      } else {
        const idCol = fk.tbl === 'otp_codes' ? 'uid' : fk.tbl === 'reset_codes' ? 'code' : 'id';
        await client.query(
          `INSERT INTO documents (col, id, data) SELECT '_orphelin_' || '${fk.tbl}', t.${idCol}, to_jsonb(t) FROM ${fk.tbl} t WHERE ${cond}
           ON CONFLICT (col, id) DO NOTHING`,
        );
        n = (await client.query(`DELETE FROM ${fk.tbl} t WHERE ${cond}`)).rowCount;
      }
      if (n) {
        const k = `${fk.tbl}.${fk.col}`;
        report[k] = (report[k] ?? 0) + n;
        changed += n;
      }
    }
    if (!changed) break;
  }
  return report;
}

/**
 * Charge une liste de documents [col, doc] (import, reprise de l'ancien format).
 * Un document refusé (valeur invalide) est mis de côté dans « documents » (_rejete_<collection>).
 */
export async function loadDocs(client, entries) {
  const stats = { ok: {}, rejected: {} };
  for (const [col, doc] of entries) {
    const id = String(doc.id);
    await client.query('SAVEPOINT doc');
    try {
      await putDoc(client, col, id, { ...doc, id });
      await client.query('RELEASE SAVEPOINT doc');
      stats.ok[col] = (stats.ok[col] ?? 0) + 1;
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT doc');
      await client.query(
        `INSERT INTO documents (col, id, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (col, id) DO UPDATE SET data = EXCLUDED.data`,
        [`_rejete_${col}`, id, JSON.stringify({ ...doc, _erreur: e.message })],
      );
      stats.rejected[col] = (stats.rejected[col] ?? 0) + 1;
    }
  }
  return stats;
}

/** Tables de données (hors comptes) : vidées par un import --replace. */
export const DATA_TABLES = [...new Set(Object.values(COLLECTIONS).map((d) => d.table)), 'documents'];

// ───────────── Migrations ─────────────

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)'); // une seule instance migre à la fois
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    // Ancien format (une seule table « docs » en JSON) : mis de côté, repris dans les tables plus bas
    if ((await client.query(`SELECT to_regclass('public.docs') IS NOT NULL AS x`)).rows[0].x) {
      await client.query('DROP VIEW IF EXISTS v_utilisateurs, v_championnats, v_equipes, v_joueurs, v_matchs, v_reservations');
      await client.query('ALTER TABLE docs RENAME TO legacy_docs');
    }
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    for (const f of files) {
      const version = f.replace(/\.sql$/, '');
      if (done.has(version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.log(`Migration appliquée : ${version}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${version} impossible : ${e.message}`);
      }
    }
    await loadForeignKeys(client);
    const legacy = (await client.query(`SELECT to_regclass('public.legacy_docs') IS NOT NULL AS x`)).rows[0].x;
    if (legacy && !done.has('reprise_ancien_format')) {
      await migrateLegacy(client);
      await client.query(`INSERT INTO schema_migrations (version) VALUES ('reprise_ancien_format')`);
    }
    await checkSchema(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
}

/** Reprise de l'ancien format (table docs JSON) vers les tables. */
async function migrateLegacy(client) {
  console.log('Reprise des données de l’ancien format…');
  await client.query('BEGIN');
  try {
    const rows = (await client.query('SELECT col, id, data FROM legacy_docs')).rows;
    const stats = await loadDocs(client, rows.map((r) => [r.col, { ...r.data, id: r.id }]));
    const orphans = await cleanOrphans(client);
    await client.query('COMMIT');
    console.log('  repris :', JSON.stringify(stats.ok), '· mis de côté :', JSON.stringify(stats.rejected), '· références cassées :', JSON.stringify(orphans));
    console.log('  (ancien format conservé dans legacy_docs, à supprimer quand tout est vérifié)');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

/** Vérifie que chaque champ de schema.js a bien sa colonne (erreur claire au démarrage sinon). */
async function checkSchema(client) {
  const r = await client.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
  const cols = new Set(r.rows.map((x) => `${x.table_name}.${x.column_name}`));
  const missing = [];
  for (const def of Object.values(COLLECTIONS)) {
    if (def.kv) continue;
    for (const { column } of Object.values(def.fields)) if (!cols.has(`${def.table}.${column}`)) missing.push(`${def.table}.${column}`);
    if (!cols.has(`${def.table}.extra`)) missing.push(`${def.table}.extra`);
  }
  if (missing.length) throw new Error(`Schéma incomplet, colonnes manquantes : ${missing.join(', ')}`);
}
