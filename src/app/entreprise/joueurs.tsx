import React from 'react';
import { useApp } from '@/data/AppProvider';
import { Empty, Screen } from '@/ui/kit';
import { RequestStatusCard, SquadManager } from '@/ui/registration';

/** Mes joueurs : effectif, pièces jointes, pièces collectives (l'entreprise peut modifier à tout moment). */
export default function CompanyPlayersScreen() {
  const { t, myTeam } = useApp();
  if (!myTeam) {
    return (
      <Screen edges={['bottom']}>
        <Empty text={t('company.noTeam')} icon="business-outline" />
      </Screen>
    );
  }
  return (
    <Screen edges={['bottom']}>
      <RequestStatusCard team={myTeam} />
      <SquadManager team={myTeam} mode="register" />
    </Screen>
  );
}
