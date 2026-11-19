import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { Button, Card, Screen } from '@/ui/kit';
import { H, Li, P } from '@/ui/legal';
import { font } from '@/ui/theme';

/** Politique de confidentialité (page publique : site, application, fiche Google Play). */
export const PRIVACY_UPDATED = '16/11/2026';

export default function PrivacyScreen() {
  const { config } = useApp();
  const contact = [config.contactEmail, config.contactPhone, config.address].filter(Boolean).join(' · ');
  return (
    <Screen edges={[]}>
      <Card>
        <Text style={font.h1}>Politique de confidentialité</Text>
        <Text style={[font.small, { marginTop: 4 }]}>Tunisia Golden League · dernière mise à jour : {PRIVACY_UPDATED}</Text>

        <H>1. Qui sommes-nous ?</H>
        <P>
          Tunisia Golden League (application mobile Android et site tunisiaga.web.app) est le service du complexe de football à 6 et à 7 « Tunisia Golden
          League » : réservation de terrains, championnats et tournois inter-entreprises. Le complexe est responsable du traitement des données décrites
          ci-dessous. Contact : {contact || '—'}.
        </P>

        <H>2. Données collectées</H>
        <Li>Compte : nom, adresse e-mail, téléphone, photo de profil (facultative), langue. Le mot de passe est géré par Google Firebase Authentication et n’est jamais visible par le complexe.</Li>
        <Li>Réservations : terrain, date, heure, nom et téléphone de la personne qui réserve.</Li>
        <Li>Entreprises et équipes : nom de l’entreprise, logo, nom et coordonnées des responsables et de l’entraîneur.</Li>
        <Li>
          Joueurs (saisis par leur entreprise) : nom, prénom, date de naissance, numéro de pièce d’identité, téléphone, fonction, matricule, photo, pièce
          d’identité, attestation de travail et certificat d’aptitude au football.
        </Li>
        <Li>Matchs : feuilles de match, compositions, buts, passes, cartons, résultats et classements.</Li>
        <Li>Données techniques : jeton de notification de l’appareil, préférences de notification, équipes et matchs suivis.</Li>

        <H>3. Utilisation des données</H>
        <Li>Gérer les réservations de terrains et prévenir le client (confirmation, refus, annulation).</Li>
        <Li>Organiser les compétitions : inscription et validation des équipes et des joueurs, cartes de licence, feuilles de match, résultats et classements.</Li>
        <Li>Envoyer des notifications (réservations, matchs, buts, rappels) selon les réglages de chacun.</Li>
        <Li>Assurer la sécurité du service (contrôle des accès selon le rôle de chaque compte).</Li>
        <P>Aucune donnée n’est vendue ni utilisée pour de la publicité. L’application ne contient pas de publicité.</P>

        <H>4. Qui voit quoi ?</H>
        <Li>Public (tout visiteur) : noms des équipes et logos, noms des joueurs, résultats, statistiques sportives et classements.</Li>
        <Li>L’entreprise : les données et pièces de ses propres joueurs.</Li>
        <Li>Le personnel du complexe : selon ses permissions (réservations, validation des équipes, feuilles de match…).</Li>
        <Li>Les pièces d’identité, attestations, certificats et numéros de téléphone ne sont jamais publics.</Li>

        <H>5. Hébergement et prestataires</H>
        <Li>Google Firebase (Authentication, Cloud Firestore, Hosting) : comptes et données de l’application.</Li>
        <Li>Expo (Expo Push Service) : acheminement des notifications vers les téléphones.</Li>
        <Li>Facebook : lecture des vidéos en direct intégrées, uniquement si vous les regardez.</Li>
        <P>Ces prestataires peuvent traiter des données hors de Tunisie, avec leurs propres garanties de sécurité.</P>

        <H>6. Durée de conservation</H>
        <P>
          Les données sont conservées tant que le compte est actif et pendant la durée des compétitions. Après une demande de suppression, le compte et
          les données personnelles sont supprimés dans un délai de 30 jours ; les résultats et statistiques sportives déjà publiés peuvent être conservés
          comme historique de la compétition.
        </P>

        <H>7. Vos droits</H>
        <P>
          Conformément à la loi organique n° 2004-63 du 27 juillet 2004 relative à la protection des données à caractère personnel, vous pouvez accéder à
          vos données, les corriger ou demander leur suppression. Vous pouvez modifier votre profil dans Profil › Compte, et demander la suppression de
          votre compte depuis l’application ou la page « Suppression de compte ».
        </P>
        <Button small variant="secondary" icon="trash-outline" label="Supprimer mon compte" onPress={() => router.push('/suppression-compte')} style={{ alignSelf: 'flex-start' }} />

        <H>8. Âge</H>
        <P>Le service n’est pas destiné aux enfants de moins de 16 ans.</P>

        <H>9. Sécurité</H>
        <P>Les échanges sont chiffrés (HTTPS). L’accès aux données est limité par des règles de sécurité selon le rôle de chaque compte.</P>

        <H>10. Modifications</H>
        <P>Cette politique peut être mise à jour ; la date de dernière mise à jour figure en haut de la page.</P>
      </Card>
    </Screen>
  );
}
