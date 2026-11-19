import { clean, type Store, type Tx, type Unsub, type Where } from './store';

type Row = Record<string, unknown> & { id: string };

/** Stockage en mémoire avec écoute temps réel — utilisé par le mode démo. */
export function createMemoryStore(seed: Record<string, Row[]>): Store {
  const data = new Map<string, Map<string, Row>>();
  for (const [col, rows] of Object.entries(seed)) {
    data.set(col, new Map(rows.map((r) => [r.id, { ...r }])));
  }
  const listeners = new Map<string, Set<() => void>>();
  let counter = 0;

  const colMap = (col: string) => {
    let m = data.get(col);
    if (!m) {
      m = new Map();
      data.set(col, m);
    }
    return m;
  };
  const matches = (r: Row, where: Where[]) => where.every(([f, v]) => r[f] === v);
  const pendingNotify = new Set<string>();
  let scheduled = false;
  const notify = (col: string) => {
    pendingNotify.add(col);
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      const cols = [...pendingNotify];
      pendingNotify.clear();
      for (const c of cols) listeners.get(c)?.forEach((l) => l());
    }, 0);
  };
  const listen = (col: string, fn: () => void): Unsub => {
    let s = listeners.get(col);
    if (!s) {
      s = new Set();
      listeners.set(col, s);
    }
    s.add(fn);
    return () => s!.delete(fn);
  };

  const doSet = (col: string, id: string, d: object) => {
    colMap(col).set(id, { ...(clean(d) as object), id } as Row);
    notify(col);
  };
  const doUpdate = (col: string, id: string, d: object) => {
    const cur = colMap(col).get(id);
    if (!cur) throw new Error(`Document introuvable : ${col}/${id}`);
    colMap(col).set(id, { ...cur, ...(clean(d) as object), id });
    notify(col);
  };
  const doRemove = (col: string, id: string) => {
    colMap(col).delete(id);
    notify(col);
  };
  const copy = <T>(r: Row | undefined): T | null => (r ? (JSON.parse(JSON.stringify(r)) as T) : null);

  const store: Store = {
    newId: (col) => `${col.slice(0, 3)}_${Date.now().toString(36)}${(counter++).toString(36)}`,
    watch<T>(col: string, where: Where[], cb: (rows: T[]) => void) {
      const emit = () =>
        cb([...colMap(col).values()].filter((r) => matches(r, where)).map((r) => copy<T>(r)!));
      emit();
      return listen(col, emit);
    },
    watchDoc<T>(col: string, id: string, cb: (row: T | null) => void) {
      const emit = () => cb(copy<T>(colMap(col).get(id)));
      emit();
      return listen(col, emit);
    },
    async get<T>(col: string, id: string) {
      return copy<T>(colMap(col).get(id));
    },
    async query<T>(col: string, where: Where[]) {
      return [...colMap(col).values()].filter((r) => matches(r, where)).map((r) => copy<T>(r)!);
    },
    async set(col, id, d) {
      doSet(col, id, d);
    },
    async update(col, id, d) {
      doUpdate(col, id, d);
    },
    async remove(col, id) {
      doRemove(col, id);
    },
    async batch(ops) {
      for (const op of ops) {
        if (op.type === 'set') doSet(op.col, op.id, op.data ?? {});
        else if (op.type === 'update') doUpdate(op.col, op.id, op.data ?? {});
        else doRemove(op.col, op.id);
      }
    },
    async runTransaction<R>(fn: (tx: Tx) => Promise<R>) {
      const writes: (() => void)[] = [];
      const tx: Tx = {
        get: async <T,>(col: string, id: string) => copy<T>(colMap(col).get(id)),
        set: (col, id, d) => writes.push(() => doSet(col, id, d)),
        update: (col, id, d) => writes.push(() => doUpdate(col, id, d)),
        remove: (col, id) => writes.push(() => doRemove(col, id)),
      };
      const res = await fn(tx);
      writes.forEach((w) => w());
      return res;
    },
  };
  return store;
}
