import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useApp } from '../data/AppProvider';
import { Segmented } from './kit';

/** Choix du championnat affiché (Championnat mixte, Championnat +35…). Masqué s'il n'y en a qu'un. */
export function ChampionshipSwitch({ style }: { style?: object }) {
  const { season, setChampionship } = useApp();
  const list = useMyChampionships();
  if (list.length < 2 || !season) return null;
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Segmented scroll value={season.id} onChange={setChampionship} options={list.map((c) => ({ value: c.id, label: c.name }))} />
    </View>
  );
}

/**
 * Championnats proposés : tous, ou pour une entreprise seulement ceux où elle a une équipe
 * (elle choisit le championnat affiché parmi les siens).
 */
export function useMyChampionships() {
  const { championships, isCompany, myTeams, season, setChampionship } = useApp();
  const ids = new Set(myTeams.map((x) => x.seasonId));
  const list = isCompany && ids.size ? championships.filter((c) => ids.has(c.id)) : championships;
  // Championnat affiché hors de ceux de l'entreprise : on bascule sur le sien
  useEffect(() => {
    if (isCompany && list.length && season && !list.some((c) => c.id === season.id)) setChampionship(list[0].id);
  }, [isCompany, list, season, setChampionship]);
  return list;
}
