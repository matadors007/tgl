import { Redirect } from 'expo-router';
import React from 'react';
import { useApp } from '../data/AppProvider';
import type { Perm } from '../domain/model';

/** Protège un écran de l'administration selon les permissions du compte. */
export function Guard({ allow, children }: { allow: 'book' | 'operate' | 'admin' | 'champ' | Perm; children: React.ReactNode }) {
  const { canBook, canOperate, canChamp, isAdmin, can } = useApp();
  const ok =
    allow === 'book' ? canBook : allow === 'operate' ? canOperate : allow === 'champ' ? canChamp : allow === 'admin' ? isAdmin : can(allow);
  if (!ok) return <Redirect href="/admin" />;
  return <>{children}</>;
}
