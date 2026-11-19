import { leagueTitle, sheetLineup } from '@/domain/model';
import { stageLabel } from '@/ui/stage';
import { useCallback } from 'react';
import { useApp } from '../data/AppProvider';
import { COL } from '../data/store';
import { isGoal, scoringTeamId, type Match, type MatchEvent, type Player, type SheetSide, type Team } from '../domain/model';
import { notify } from '../ui/dialogs';
import { printHtml } from './printing';
import { matchSheetHtml, type MatchSheetData, type SheetPlayer } from './templates';

/** Prépare et imprime la feuille de match (joueurs sélectionnés, entraîneurs, délégués, résultat si joué). */
export function useMatchSheet() {
  const { t, store, teamsAll: allTeams, allPlayers, pitches, seasons } = useApp();
  return useCallback(
    async (match: Match) => {
      try {
        const team1 = allTeams.find((x) => x.id === match.homeTeamId);
        const team2 = allTeams.find((x) => x.id === match.awayTeamId);
        if (!team1 || !team2) return notify(t('common.error'));
        const events = (await store.query<MatchEvent>(COL.events, [['matchId', match.id]])).sort((a, b) => a.half - b.half || a.minute - b.minute);
        const byId = new Map(allPlayers.map((p) => [p.id, p]));
        const label = (id?: string | null) => {
          const p = id ? byId.get(id) : undefined;
          return p ? `${p.number ? `${p.number} – ` : ''}${p.name}` : '';
        };
        const side = (team: Team, lineup: string[], sheet?: SheetSide) => {
          const captainId = sheet?.captainId ?? team.captainId;
          // Feuille de match : titulaires puis remplaçants (R) ; sinon sélection de l'entreprise
          const { starters, subs } = sheet?.playerIds?.length ? sheetLineup(sheet) : { starters: lineup ?? [], subs: [] as string[] };
          const pick = (ids: string[], sub: boolean): SheetPlayer[] =>
            ids
              .map((id) => byId.get(id))
              .filter((p): p is Player => !!p)
              .sort((a, b) => (a.number || 99) - (b.number || 99))
              .map((p) => ({ number: p.number || null, name: sub ? `${p.name} (R)` : p.name, captain: captainId === p.id }));
          const list: SheetPlayer[] = [...pick(starters, false), ...pick(subs, true)];
          return {
            name: team.name,
            logo: team.logoUrl,
            players: list,
            coach: sheet?.coach ?? team.coach?.name ?? null,
            delegate: sheet?.delegate ?? team.managers?.[0]?.name ?? null,
            captain: captainId ? byId.get(captainId)?.name ?? null : null,
          };
        };
        const played = match.status !== 'scheduled' && match.status !== 'postponed';
        // Cartons : joueurs et entraîneur
        const of = (type: MatchEvent['type'], teamId: string) =>
          events.filter((e) => e.type === type && e.teamId === teamId).map((e) => `${e.coach ? `Entraîneur ${e.personName ?? ''}`.trim() : label(e.playerId)} (${e.minute}')`);
        const goals = (teamId: string) =>
          events.filter((e) => isGoal(e) && scoringTeamId(e, match) === teamId).map((e) => `${label(e.playerId)}${e.type === 'own_goal' ? ' (csc)' : ''} ${e.minute}'`);
        const data: MatchSheetData = {
          date: match.date,
          start: match.start,
          pitch: pitches.find((p) => p.id === match.pitchId)?.name ?? null,
          round: match.round,
          stageLabel: match.stage ? stageLabel(match, t) : null,
          forfeit: match.forfeit ? (match.forfeit === 'home' ? team1 : team2).name : null,
          pens: match.homePens != null && match.awayPens != null ? `${match.homePens}-${match.awayPens}` : null,
          season: seasons.find((x) => x.id === match.seasonId)?.name ?? null,
          league: leagueTitle(seasons.find((x) => x.id === match.seasonId)),
          team1: side(team1, match.homeLineup, match.sheet?.home),
          team2: side(team2, match.awayLineup, match.sheet?.away),
          referee: match.sheet?.referee ?? match.referee ?? null,
          ...(played
            ? {
                yellows1: of('yellow', team1.id),
                yellows2: of('yellow', team2.id),
                reds1: of('red', team1.id),
                reds2: of('red', team2.id),
                scorers1: goals(team1.id),
                scorers2: goals(team2.id),
                score1: match.homeScore,
                score2: match.awayScore,
              }
            : {}),
        };
        if (!match.homeLineup?.length || !match.awayLineup?.length) notify(t('sheet.noLineup'));
        await printHtml(matchSheetHtml(data), `Feuille de match ${team1.shortName}-${team2.shortName}`);
      } catch {
        notify(t('files.printErr'));
      }
    },
    [t, store, allTeams, allPlayers, pitches, seasons],
  );
}
