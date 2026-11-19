/** Libellés « Journée 3 », « Poule A », « Demi-finales »… et regroupement des matchs par section. */
import type { KoRound, Match } from '@/domain/model';
import type { TFn } from '@/data/AppProvider';

/** Ordre d'affichage des tours à élimination (3e place juste avant la finale). */
const KO_ORDER: KoRound[] = [32, 16, 8, 4, 1, 2];

export function koLabel(r: KoRound | null | undefined, t: TFn): string {
  return t(`cup.ko.${r ?? 2}` as 'cup.ko.2');
}

export function stageLabel(m: Pick<Match, 'stage' | 'group' | 'koRound' | 'round'>, t: TFn): string {
  if (m.stage === 'group') return t('cup.groupN', { g: m.group ?? '?' });
  if (m.stage === 'ko') return koLabel(m.koRound, t);
  return t('match.round', { n: m.round });
}

/** Numéro de « journée » enregistré pour un match de tournoi (sert au tri). */
export function cupRoundNumber(stage: 'group' | 'ko', koRound?: KoRound | null): number {
  return stage === 'group' ? 1 : 2 + Math.max(0, KO_ORDER.indexOf(koRound ?? 2));
}

function sectionOf(m: Match): { key: string; order: number } {
  if (m.stage === 'group') return { key: `g-${m.group ?? '?'}`, order: (m.group ?? 'Z').charCodeAt(0) / 1000 };
  if (m.stage === 'ko') return { key: `k-${m.koRound ?? 2}`, order: 100 + KO_ORDER.indexOf(m.koRound ?? 2) };
  return { key: `r-${m.round}`, order: m.round };
}

/** Regroupe les matchs par journée (championnat) ou par poule / tour (tournoi), dans l'ordre. */
export function stageSections(list: Match[], t: TFn, reverse = false): { key: string; label: string; matches: Match[] }[] {
  const map = new Map<string, { key: string; label: string; order: number; matches: Match[] }>();
  for (const m of list) {
    const s = sectionOf(m);
    const cur = map.get(s.key) ?? { key: s.key, label: stageLabel(m, t), order: s.order, matches: [] };
    cur.matches.push(m);
    map.set(s.key, cur);
  }
  const out = [...map.values()].sort((a, b) => a.order - b.order);
  return (reverse ? out.reverse() : out).map(({ key, label, matches }) => ({ key, label, matches }));
}
