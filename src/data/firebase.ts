import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { clean, type Store, type Tx, type Where } from './store';

/**
 * Configuration Firebase lue depuis les variables d'environnement (fichier .env).
 * Si EXPO_PUBLIC_FIREBASE_PROJECT_ID est vide, l'app démarre en mode démo.
 */
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

export const isFirebaseConfigured = !!firebaseConfig.projectId && !!firebaseConfig.apiKey;

/** Adresse du site web (Firebase Hosting) : sert aux liens des e-mails (mot de passe oublié, confirmation). */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || (firebaseConfig.projectId ? `https://${firebaseConfig.projectId}.web.app` : '')).replace(/\/$/, '');

/**
 * Crée un compte e-mail / mot de passe SANS déconnecter l'administrateur connecté
 * (utilise une seconde instance Firebase). Sert à « Gestion du personnel ».
 */
export async function createAccountAsAdmin(email: string, password: string): Promise<string> {
  const name = 'staff-creator';
  const second = getApps().find((a) => a.name === name) ?? initializeApp(firebaseConfig, name);
  const secondAuth = FirebaseAuth.getAuth(second);
  const cred = await FirebaseAuth.createUserWithEmailAndPassword(secondAuth, email.trim(), password);
  await FirebaseAuth.signOut(secondAuth);
  return cred.user.uid;
}

let app: FirebaseApp | null = null;
let auth: FirebaseAuth.Auth | null = null;
let db: Firestore | null = null;

export function getFirebase() {
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    if (Platform.OS === 'web') {
      auth = FirebaseAuth.getAuth(app);
    } else {
      // getReactNativePersistence n'existe que dans le build React Native de firebase/auth.
      const rnPersistence = (FirebaseAuth as unknown as {
        getReactNativePersistence?: (s: typeof AsyncStorage) => FirebaseAuth.Persistence;
      }).getReactNativePersistence;
      try {
        auth = FirebaseAuth.initializeAuth(app, {
          persistence: rnPersistence ? rnPersistence(AsyncStorage) : FirebaseAuth.inMemoryPersistence,
        });
      } catch {
        auth = FirebaseAuth.getAuth(app);
      }
    }
    db = getFirestore(app);
  }
  return { app: app!, auth: auth!, db: db! };
}

export function createFirebaseStore(): Store {
  const { db } = getFirebase();
  const q = (col: string, w: Where[]) => query(collection(db, col), ...w.map(([f, v]) => where(f, '==', v)));

  return {
    newId: (col) => doc(collection(db, col)).id,
    watch<T>(col: string, w: Where[], cb: (rows: T[]) => void) {
      return onSnapshot(
        q(col, w),
        (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T)),
        (err) => console.warn(`[firestore] ${col}`, err.message),
      );
    },
    watchDoc<T>(col: string, id: string, cb: (row: T | null) => void) {
      return onSnapshot(
        doc(db, col, id),
        (d) => cb(d.exists() ? ({ ...d.data(), id: d.id } as T) : null),
        (err) => console.warn(`[firestore] ${col}/${id}`, err.message),
      );
    },
    async get<T>(col: string, id: string) {
      const d = await getDoc(doc(db, col, id));
      return d.exists() ? ({ ...d.data(), id: d.id } as T) : null;
    },
    async query<T>(col: string, w: Where[]) {
      const snap = await getDocs(q(col, w));
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
    },
    async set(col, id, data) {
      await setDoc(doc(db, col, id), clean({ ...data, id }));
    },
    async update(col, id, data) {
      await updateDoc(doc(db, col, id), clean(data) as Record<string, unknown>);
    },
    async remove(col, id) {
      await deleteDoc(doc(db, col, id));
    },
    async batch(ops) {
      // Firestore limite un batch à 500 écritures
      for (let i = 0; i < ops.length; i += 450) {
        const b = writeBatch(db);
        for (const op of ops.slice(i, i + 450)) {
          const ref = doc(db, op.col, op.id);
          if (op.type === 'set') b.set(ref, clean({ ...(op.data ?? {}), id: op.id }));
          else if (op.type === 'update') b.update(ref, clean(op.data ?? {}) as Record<string, unknown>);
          else b.delete(ref);
        }
        await b.commit();
      }
    },
    async runTransaction<R>(fn: (tx: Tx) => Promise<R>) {
      return runTransaction(db, async (t) => {
        const tx: Tx = {
          get: async <T,>(col: string, id: string) => {
            const d = await t.get(doc(db, col, id));
            return d.exists() ? ({ ...d.data(), id: d.id } as T) : null;
          },
          set: (col, id, data) => void t.set(doc(db, col, id), clean({ ...data, id })),
          update: (col, id, data) => void t.update(doc(db, col, id), clean(data) as Record<string, unknown>),
          remove: (col, id) => void t.delete(doc(db, col, id)),
        };
        return fn(tx);
      });
    },
  };
}
