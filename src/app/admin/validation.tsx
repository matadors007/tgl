import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { ageAt, checkSquad, teamRequestStatus, toDateKey, underAge, type Player, type Team } from '@/domain/model';
import { FileThumb } from '@/ui/attachments';
import { TeamBadge } from '@/ui/football';
import { phoneLink } from '@/ui/format';
import { Guard } from '@/ui/Guard';
import { ask, notify } from '@/ui/dialogs';
import { Button, Card, Empty, Field, MaybeScreen, Pill, Row, Screen, Section, Segmented, Sheet } from '@/ui/kit';
import { useTeamPlayerInfos } from '@/ui/registration';
import { PLAYER_STATUS_COLORS } from '@/ui/status';
import { colors, font } from '@/ui/theme';

/**
 * Validation des inscriptions : demandes des entreprises (équipe, responsables, effectif)
 * avec aperçu direct des pièces jointes (CIN, photo, attestation, certificat) et impression.
 */
export function ValidationPanel({ embedded }: { embedded?: boolean } = {}) {
  const { t, allTeams, allPlayers } = useApp();
  const [tab, setTab] = useState<'requests' | 'players' | 'drafts'>('requests');
  const requests = allTeams.filter((x) => teamRequestStatus(x) === 'submitted');
  const drafts = allTeams.filter((x) => teamRequestStatus(x) === 'draft' || teamRequestStatus(x) === 'rejected');
  const approvedTeams = new Set(allTeams.filter((x) => teamRequestStatus(x) === 'approved').map((x) => x.id));
  // Joueurs ajoutés / modifiés après la validation de leur équipe
  const latePlayers = allPlayers.filter((p) => p.status === 'pending' && approvedTeams.has(p.teamId));
  const teamsWithLate = allTeams.filter((x) => latePlayers.some((p) => p.teamId === x.id));

  return (
    <MaybeScreen embedded={embedded} edges={['bottom']}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'requests', label: `${t('validation.requests')} (${requests.length})` },
          { value: 'players', label: `${t('validation.players')} (${latePlayers.length})` },
          { value: 'drafts', label: `${t('validation.drafts')} (${drafts.length})` },
        ]}
      />
      <View style={{ height: 12 }} />
      {tab === 'requests' ? (
        requests.length ? requests.map((team) => <TeamRequest key={team.id} team={team} />) : <Empty text={t('validation.empty')} icon="checkmark-done-outline" />
      ) : null}
      {tab === 'players' ? (
        teamsWithLate.length ? (
          teamsWithLate.map((team) => <TeamRequest key={team.id} team={team} onlyPending />)
        ) : (
          <Empty text={t('validation.empty')} icon="checkmark-done-outline" />
        )
      ) : null}
      {tab === 'drafts' ? (
        drafts.length ? (
          drafts.map((team) => (
            <Card key={team.id} style={{ marginBottom: 8 }}>
              <Row>
                <TeamBadge team={team} size={36} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={font.h3}>{team.name}</Text>
                  <Text style={font.small}>{team.company}</Text>
                </View>
                <Pill label={t(`reg.status.${teamRequestStatus(team)}`)} color={colors.muted} />
              </Row>
            </Card>
          ))
        ) : (
          <Empty text={t('validation.empty')} icon="checkmark-done-outline" />
        )
      ) : null}
    </MaybeScreen>
  );
}

function TeamRequest({ team, onlyPending }: { team: Team; onlyPending?: boolean }) {
  const { t, lang, allPlayers, services, notifier, season } = useApp();
  const infos = useTeamPlayerInfos(team);
  const [open, setOpen] = useState(!onlyPending);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ player?: Player } | null>(null);
  const [reason, setReason] = useState('');
  const players = useMemo(
    () => allPlayers.filter((p) => p.teamId === team.id && (!onlyPending || p.status === 'pending')).sort((a, b) => a.name.localeCompare(b.name)),
    [allPlayers, team.id, onlyPending],
  );
  const check = useMemo(() => checkSquad(team, players, infos), [team, players, infos]);
  const year = season ? new Date(season.createdAt).getFullYear() : new Date().getFullYear();

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(null);
    }
  };

  const approveAll = async () => {
    const warn = [
      check.missingRequired.length ? t('validation.warnRequired', { n: check.missingRequired.length }) : '',
      check.missingAttestation.length ? t('validation.warnAttestation', { n: check.missingAttestation.length }) : '',
      check.missingCertificate.length ? t('validation.warnCertificate', { n: check.missingCertificate.length }) : '',
    ].filter(Boolean);
    if (!(await ask(t('validation.approveTeam'), warn.length ? warn.join('\n') : team.name, t('validation.approve'), t('common.cancel')))) return;
    await run('team', async () => {
      await services.approveTeam(team, true, year);
      notifier.teamReviewed(team, true);
    });
  };

  const confirmReject = () => {
    const target = rejecting;
    const r = reason.trim();
    if (!target) return;
    if (!r) return notify(t('queue.reasonRequired'));
    setRejecting(null);
    setReason('');
    if (target.player) {
      const p = target.player;
      run(p.id, async () => {
        await services.reviewPlayer(p.id, false, r);
        notifier.playerReviewed(p, team, false, r);
      });
    } else {
      run('team', async () => {
        await services.rejectTeamRequest(team, r);
        notifier.teamReviewed(team, false, r);
      });
    }
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      <Pressable onPress={() => setOpen(!open)}>
        <Row>
          <TeamBadge team={team} size={48} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={font.h2}>{team.name}</Text>
            <Text style={font.small}>
              {team.company} · {team.shortName}
              {team.submittedAt ? ` · ${new Date(team.submittedAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}` : ''}
            </Text>
            <Text style={font.tiny}>{t('validation.playersCount', { n: players.length })}</Text>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.accent} />
        </Row>
      </Pressable>

      {open ? (
        <View style={{ marginTop: 12 }}>
          {!onlyPending ? (
            <>
              <Text style={styles.label}>{t('reg.managers')}</Text>
              {(team.managers ?? []).map((m, i) => (
                <Row key={i} style={{ paddingVertical: 4 }}>
                  <Text style={[font.body, { flex: 1 }]}>
                    {m.name}
                    {i === 0 ? <Text style={font.tiny}> · {t('reg.delegate')}</Text> : null}
                  </Text>
                  <Pressable onPress={() => Linking.openURL(phoneLink(m.phone))}>
                    <Text style={{ color: colors.accent, fontSize: 12 }}>{m.phone}</Text>
                  </Pressable>
                  {m.email ? <Text style={[font.tiny, { marginLeft: 8 }]}>{m.email}</Text> : null}
                </Row>
              ))}
              <Text style={[styles.label, { marginTop: 8 }]}>{t('reg.coach')}</Text>
              <Text style={font.body}>
                {team.coach?.name ?? '—'} {team.coach?.phone ? `· ${team.coach.phone}` : ''}
              </Text>
              <Text style={[styles.label, { marginTop: 10 }]}>{t('reg.collective')}</Text>
              <Row style={{ gap: 10, alignItems: 'flex-start' }}>
                <FileThumb id={team.collectiveAttestationId} label={t('reg.collectiveAttestation')} missingLabel={team.collectiveAttestationPromised ? t('validation.promised') : t('validation.none')} />
                <FileThumb id={team.collectiveCertificateId} label={t('reg.collectiveCertificate')} missingLabel={team.collectiveCertificatePromised ? t('validation.promised') : t('validation.none')} />
              </Row>
            </>
          ) : null}

          <Text style={[styles.label, { marginTop: 12 }]}>{t('reg.squad', { n: players.length })}</Text>
          {players.map((p) => {
            const i = infos.get(p.id);
            const st = p.status ?? 'approved';
            const c = PLAYER_STATUS_COLORS[st];
            return (
              <View key={p.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Row style={{ marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[font.body, { fontWeight: '800' }]}>{p.name}</Text>
                    <Text style={font.tiny}>
                      {t('validation.born')} {p.birthDate ?? '—'}
                      {p.licenseNo ? ` · ${p.licenseNo}` : ''}
                    </Text>
                    {underAge(season, p.birthDate, Date.now()) ? (
                      <Text style={{ color: colors.orange, fontSize: 11, fontWeight: '800', marginTop: 2 }}>⚠ {t('reg.under35Badge')} ({ageAt(p.birthDate, season?.startDate || toDateKey(new Date()))} ans)</Text>
                    ) : null}
                  </View>
                  <Pill label={t(`players.status.${st}`)} color={c.fg} bg={c.bg} />
                </Row>
                <Row style={{ gap: 6, alignItems: 'flex-start' }}>
                  <FileThumb id={i?.photoFileId} label={t('reg.doc.photo')} size={58} />
                  <FileThumb id={i?.cinFileId} label={t('reg.doc.cin')} size={58} />
                  <FileThumb id={i?.attestationFileId} label={t('reg.doc.attestation')} size={58} missingLabel={team.collectiveAttestationId ? t('validation.collectiveOk') : t('reg.doc.attestation')} />
                  <FileThumb id={i?.certificateFileId} label={t('reg.doc.certificate')} size={58} missingLabel={team.collectiveCertificateId ? t('validation.collectiveOk') : t('reg.doc.certificate')} />
                </Row>
                {st === 'pending' || st === 'draft' ? (
                  <Row style={{ gap: 8, marginTop: 8 }}>
                    <Button
                      small
                      label={t('validation.approve')}
                      icon="checkmark"
                      style={{ flex: 1 }}
                      loading={busy === p.id}
                      onPress={() =>
                        run(p.id, async () => {
                          await services.reviewPlayer(p.id, true, undefined, team, year);
                          notifier.playerReviewed(p, team, true);
                        })
                      }
                    />
                    <Button small label={t('validation.reject')} icon="close" variant="ghost" style={{ flex: 1 }} onPress={() => setRejecting({ player: p })} />
                  </Row>
                ) : null}
              </View>
            );
          })}

          {!onlyPending ? (
            <Row style={{ gap: 8, marginTop: 14 }}>
              <Button label={t('validation.approveTeam')} icon="shield-checkmark" style={{ flex: 1 }} onPress={approveAll} loading={busy === 'team'} />
              <Button label={t('validation.reject')} icon="close" variant="danger" onPress={() => setRejecting({})} />
            </Row>
          ) : null}
        </View>
      ) : null}

      <Sheet visible={!!rejecting} onClose={() => setRejecting(null)} title={`${t('validation.reject')} · ${rejecting?.player?.name ?? team.name}`}>
        <Field label={t('validation.reasonPrompt')} value={reason} onChangeText={setReason} multiline placeholder={t('validation.reasonExample')} />
        <Button label={t('validation.reject')} icon="close" variant="danger" onPress={confirmReject} />
      </Sheet>
    </Card>
  );
}

const styles = {
  get label() {
    return { ...font.tiny, fontWeight: '800' as const, textTransform: 'uppercase' as const, marginBottom: 4 };
  },
};

export default function ValidationScreen() {
  return (
    <Guard allow="teams.validate">
      <ValidationPanel />
    </Guard>
  );
}
