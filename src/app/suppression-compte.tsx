import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { ask, notify } from '@/ui/dialogs';
import { Button, Card, Screen } from '@/ui/kit';
import { H, Li, P } from '@/ui/legal';
import { colors, font } from '@/ui/theme';

/**
 * Suppression de compte (page publique, exigée par Google Play) :
 * explique la démarche et permet de faire la demande une fois connecté.
 */
export default function AccountDeletionScreen() {
  const { user, config } = useApp();
  return (
    <Screen edges={[]}>
      <Card>
        <Text style={font.h1}>Suppression de compte</Text>
        <Text style={[font.small, { marginTop: 4 }]}>Tunisia Golden League (application Android et site tunisiaga.web.app)</Text>

        <H>Comment demander la suppression ?</H>
        <Li>Dans l’application ou sur le site : connectez-vous, puis Profil › Compte › « Supprimer mon compte ».</Li>
        <Li>Ou directement ci-dessous, une fois connecté.</Li>
        <Li>
          Sans accès au compte : écrivez-nous en indiquant l’adresse e-mail du compte
          {config.contactEmail ? ` à ${config.contactEmail}` : ''}
          {config.contactPhone ? ` ou appelez le ${config.contactPhone}` : ''}.
        </Li>

        <H>Ce qui est supprimé</H>
        <Li>Le compte de connexion, le profil (nom, e-mail, téléphone, photo) et les préférences de notification.</Li>
        <Li>Pour une entreprise : les fiches privées des joueurs et les pièces jointes (pièces d’identité, photos, attestations, certificats).</Li>

        <H>Ce qui peut être conservé</H>
        <Li>Les résultats, compositions et statistiques des matchs déjà joués, comme historique de la compétition, sans coordonnées.</Li>
        <Li>Les réservations passées, pour la comptabilité du complexe, au plus 12 mois.</Li>

        <H>Délai</H>
        <P>La demande est traitée par l’administration du complexe dans un délai de 30 jours au plus. Vous pouvez l’annuler tant qu’elle n’a pas été traitée.</P>

        {user ? <RequestBox /> : <Button label="Se connecter pour faire la demande" icon="log-in" onPress={() => router.push('/login')} style={{ marginTop: 10 }} />}
      </Card>
    </Screen>
  );
}

/** Bouton de demande / d'annulation pour le compte connecté. */
export function RequestBox() {
  const { user, services, notifier } = useApp();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const requested = !!user.deletionRequestedAt;
  const toggle = async () => {
    if (!requested && !(await ask('Supprimer mon compte ?', 'Votre demande sera transmise à l’administration, qui supprimera votre compte et vos données personnelles sous 30 jours.', 'Demander la suppression', 'Annuler'))) return;
    setBusy(true);
    try {
      await services.requestAccountDeletion(user.id, requested);
      if (!requested) notifier.deletionRequested(user);
      notify(requested ? 'Demande de suppression annulée.' : 'Demande de suppression envoyée.');
    } catch {
      notify('Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {requested ? (
        <Text style={[font.small, { color: colors.orange, marginTop: 10, fontWeight: '700' }]}>
          Demande envoyée le {new Date(user.deletionRequestedAt!).toLocaleDateString('fr-FR')} : elle sera traitée sous 30 jours.
        </Text>
      ) : null}
      <Button
        label={requested ? 'Annuler ma demande de suppression' : 'Supprimer mon compte'}
        icon={requested ? 'arrow-undo' : 'trash'}
        variant={requested ? 'secondary' : 'danger'}
        loading={busy}
        onPress={toggle}
        style={{ marginTop: 10 }}
      />
    </>
  );
}
