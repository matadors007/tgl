import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useApp } from '../data/AppProvider';
import { AppError } from '../data/services';
import { COL } from '../data/store';
import {
  MIN_SQUAD,
  checkSquad,
  teamRequestStatus,
  type Player,
  type PlayerInfo,
  type PlayerStatus,
  type Position,
  type Team,
  type TeamContact,
} from '../domain/model';
import { addDays, isRemoved, rosterOpen, SQUAD_MAX, squadPlacesUsed, toDateKey, underAge } from '../domain/model';
import { AttachmentField, FileThumb } from './attachments';
import { ask, notify } from './dialogs';
import { Button, Card, Empty, Field, Pill, Row, Section, Sheet } from './kit';
import { DateField } from './datepicker';
import { pickImage } from './pickImage';
import { PLAYER_STATUS_COLORS } from './status';
import { ColorPicker, TEAM_COLORS } from './todos';
import { colors, font, radius } from './theme';

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// ───────────────────────── Logo de l'équipe ─────────────────────────

export function LogoPicker({ value, onChange, color, short }: { value?: string | null; onChange: (v: string | null) => void; color: string; short: string }) {
  const { t } = useApp();
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    setBusy(true);
    try {
      const img = await pickImage(320);
      if (img) onChange(img);
    } catch {
      notify(t('showcase.photoErr'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Row style={{ marginBottom: 14 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          overflow: 'hidden',
          backgroundColor: value ? '#fff' : color,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: colors.accent,
          marginRight: 14,
        }}
      >
        {value ? (
          <Image source={{ uri: value }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 }}>{short || '?'}</Text>
        )}
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={[font.body, { fontWeight: '700' }]}>{t('reg.logo')}</Text>
        <Row style={{ gap: 8 }}>
          <Button small label={value ? t('files.replace') : t('reg.addLogo')} icon="image" variant="secondary" onPress={pick} loading={busy} />
          {value ? <Button small label={t('common.delete')} variant="ghost" onPress={() => onChange(null)} /> : null}
        </Row>
      </View>
    </Row>
  );
}

// ───────────────────────── Statut de la demande ─────────────────────────

export function RequestStatusCard({ team }: { team: Team }) {
  const { t } = useApp();
  const status = teamRequestStatus(team);
  const steps: { key: string; label: string; done: boolean; active: boolean }[] = [
    { key: 'draft', label: t('reg.st.draft'), done: status !== 'draft', active: status === 'draft' || status === 'rejected' },
    { key: 'sent', label: t('reg.st.sent'), done: status === 'submitted' || status === 'approved', active: false },
    { key: 'review', label: t('reg.st.review'), done: status === 'approved', active: status === 'submitted' },
    { key: 'ok', label: t('reg.st.approved'), done: status === 'approved', active: false },
  ];
  const tone = status === 'approved' ? colors.success : status === 'rejected' ? colors.red : status === 'submitted' ? colors.orange : colors.accent;
  return (
    <Card style={{ borderColor: tone, borderWidth: 1 }}>
      <Row>
        <Ionicons
          name={status === 'approved' ? 'checkmark-circle' : status === 'rejected' ? 'close-circle' : status === 'submitted' ? 'hourglass' : 'create'}
          size={26}
          color={tone}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={font.h3}>{t(`reg.status.${status}`)}</Text>
          <Text style={font.small}>{t(`reg.statusSub.${status}`)}</Text>
        </View>
      </Row>
      {status === 'rejected' && team.rejectReason ? (
        <Text style={{ color: colors.red, marginTop: 10, fontWeight: '700' }}>{t('players.reason', { r: team.rejectReason })}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', marginTop: 14 }}>
        {steps.map((s, i) => (
          <View key={s.key} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : s.done || s.active ? tone : colors.border }} />
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: s.done ? tone : 'transparent',
                  borderWidth: 2,
                  borderColor: s.done || s.active ? tone : colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {s.done ? <Ionicons name="checkmark" size={13} color={colors.onAccent} /> : null}
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: i === steps.length - 1 ? 'transparent' : s.done ? tone : colors.border }} />
            </View>
            <Text style={[font.tiny, { textAlign: 'center', marginTop: 4, color: s.done || s.active ? colors.text : colors.faint }]}>{s.label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ───────────────────────── Assistant d'inscription ─────────────────────────

/**
 * Inscription d'une équipe en 3 étapes : 1. équipe (nom, abréviation, couleur, logo),
 * 2. responsables + entraîneur, 3. effectif avec pièces jointes, puis envoi de la demande.
 */
export function RegistrationWizard({ team }: { team: Team | null }) {
  const { t } = useApp();
  const initial = !team ? 0 : team.managers?.length && team.coach?.name ? 2 : 1;
  const [step, setStep] = useState(initial);
  const labels = [t('reg.step1'), t('reg.step2'), t('reg.step3')];
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
        {labels.map((l, i) => {
          const enabled = !!team || i === 0;
          const active = i === step;
          return (
            <Pressable
              key={l}
              disabled={!enabled}
              onPress={() => setStep(i)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: radius.md,
                alignItems: 'center',
                backgroundColor: active ? colors.accent : colors.card,
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.border,
                opacity: enabled ? 1 : 0.5,
              }}
            >
              <Text style={{ color: active ? colors.onAccent : colors.muted, fontWeight: '900', fontSize: 12 }}>{i + 1}</Text>
              <Text style={{ color: active ? colors.onAccent : colors.text, fontWeight: '700', fontSize: 11 }} numberOfLines={1}>
                {l}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {step === 0 ? <TeamStep team={team} onNext={() => setStep(1)} /> : null}
      {step === 1 && team ? <ManagersStep team={team} onNext={() => setStep(2)} /> : null}
      {step === 2 && team ? <SquadManager team={team} mode="register" /> : null}
    </View>
  );
}

function TeamStep({ team, onNext }: { team: Team | null; onNext: () => void }) {
  const { t, user, season, services } = useApp();
  const def = team?.name ?? user?.companyName ?? '';
  const [name, setName] = useState(def);
  const [shortName, setShort] = useState(team?.shortName ?? def.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase());
  const [color, setColor] = useState(team?.color ?? TEAM_COLORS[0]);
  const [logo, setLogo] = useState<string | null>(team?.logoUrl ?? null);
  const [busy, setBusy] = useState(false);
  const next = async () => {
    if (!name.trim() || shortName.trim().length < 2) return notify(t('auth.errFields'));
    if (!user || !season) return;
    setBusy(true);
    try {
      if (team) await services.updateOwnTeam(team.id, { name: name.trim(), shortName: shortName.trim().toUpperCase(), color, logoUrl: logo });
      else await services.registerTeam(user, season, { name: name.trim(), shortName: shortName.trim(), color, logoUrl: logo });
      onNext();
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Text style={[font.small, { marginBottom: 12 }]}>{t('company.registerHint')}</Text>
      <LogoPicker value={logo} onChange={setLogo} color={color} short={shortName} />
      <Field label={t('season.teamName')} value={name} onChangeText={setName} />
      <Field label={t('season.short')} value={shortName} onChangeText={(v) => setShort(v.toUpperCase().slice(0, 3))} autoCapitalize="characters" />
      <Text style={[font.small, { marginBottom: 8 }]}>{t('season.color')}</Text>
      <ColorPicker value={color} onChange={setColor} />
      <Button label={t('reg.next')} icon="arrow-forward" onPress={next} loading={busy} />
    </Card>
  );
}

function ContactFields({ value, onChange, withEmail, title, onRemove }: { value: TeamContact; onChange: (c: TeamContact) => void; withEmail?: boolean; title: string; onRemove?: () => void }) {
  const { t } = useApp();
  return (
    <View style={{ marginBottom: 6 }}>
      <Row style={{ marginBottom: 8 }}>
        <Text style={[font.h3, { flex: 1 }]}>{title}</Text>
        {onRemove ? (
          <Pressable onPress={onRemove} hitSlop={10}>
            <Ionicons name="trash-outline" size={18} color={colors.red} />
          </Pressable>
        ) : null}
      </Row>
      <Field label={t('reg.fullName')} value={value.name} onChangeText={(v) => onChange({ ...value, name: v })} />
      <Field label={t('auth.phone')} value={value.phone} onChangeText={(v) => onChange({ ...value, phone: v })} keyboardType="phone-pad" placeholder="+216 …" />
      {withEmail ? (
        <Field label={t('auth.email')} value={value.email ?? ''} onChangeText={(v) => onChange({ ...value, email: v })} keyboardType="email-address" autoCapitalize="none" />
      ) : null}
    </View>
  );
}

function ManagersStep({ team, onNext }: { team: Team; onNext: () => void }) {
  const { t, services } = useApp();
  const empty: TeamContact = { name: '', phone: '', email: '' };
  const [managers, setManagers] = useState<TeamContact[]>(team.managers?.length ? team.managers : [{ ...empty }]);
  const [coach, setCoach] = useState<TeamContact>(team.coach ?? { name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const next = async () => {
    const list = managers.map((m) => ({ name: m.name.trim(), phone: m.phone.trim(), email: (m.email ?? '').trim() })).filter((m) => m.name || m.phone || m.email);
    if (!list.length || list.some((m) => !m.name || !m.phone || !isEmail(m.email))) return notify(t('reg.managersInvalid'));
    if (!coach.name.trim()) return notify(t('reg.coachRequired'));
    setBusy(true);
    try {
      await services.updateOwnTeam(team.id, { managers: list, coach: { name: coach.name.trim(), phone: coach.phone.trim(), email: null } });
      onNext();
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Text style={[font.small, { marginBottom: 12 }]}>{t('reg.managersHint')}</Text>
      {managers.map((m, i) => (
        <ContactFields
          key={i}
          title={`${t('reg.manager')} ${i + 1}${i === 0 ? ` (${t('reg.delegate')})` : ''}`}
          value={m}
          withEmail
          onChange={(c) => setManagers(managers.map((x, j) => (j === i ? c : x)))}
          onRemove={managers.length > 1 ? () => setManagers(managers.filter((_, j) => j !== i)) : undefined}
        />
      ))}
      {managers.length < 3 ? <Button label={t('reg.addManager')} icon="person-add" variant="ghost" small onPress={() => setManagers([...managers, { ...empty }])} style={{ marginBottom: 16 }} /> : null}
      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 14 }} />
      <ContactFields title={t('reg.coach')} value={coach} onChange={setCoach} />
      <Button label={t('reg.next')} icon="arrow-forward" onPress={next} loading={busy} />
    </Card>
  );
}

// ───────────────────────── Effectif ─────────────────────────

/** Fiches privées (pièces jointes) des joueurs de l'équipe, en temps réel. */
export function useTeamPlayerInfos(team: Team | null): Map<string, PlayerInfo> {
  const { store, user, isAdmin } = useApp();
  const [infos, setInfos] = useState<Map<string, PlayerInfo>>(new Map());
  useEffect(() => {
    if (!team || !user) return setInfos(new Map());
    // Filtre ownerId exigé par les règles de sécurité pour une entreprise (l'admin voit tout)
    const where: [string, string][] = isAdmin ? [['teamId', team.id]] : [['teamId', team.id], ['ownerId', team.ownerId ?? user.id]];
    return store.watch<PlayerInfo>(COL.playerInfo, where, (rows) => setInfos(new Map(rows.map((r) => [r.id, r]))));
  }, [store, team, user, isAdmin]);
  return infos;
}

interface PlayerDraft {
  id?: string;
  status?: PlayerStatus;
  firstName: string;
  lastName: string;
  birthDate: string;
  cinFileId: string | null;
  photoFileId: string | null;
  attestationFileId: string | null;
  certificateFileId: string | null;
  number?: number;
  position?: Position;
}

/**
 * Gestion de l'effectif : liste, ajout / modification d'un joueur avec ses pièces,
 * pièces collectives et (mode « register ») envoi de la demande d'inscription.
 */
export function SquadManager({ team, mode }: { team: Team; mode: 'register' | 'manage' }) {
  const { t, allPlayers, services, notifier, user, seasons } = useApp();
  // Championnat de l'équipe (date limite d'ajout des joueurs, catégorie +35)
  const season = seasons.find((x) => x.id === team.seasonId) ?? null;
  const open_ = rosterOpen(season, Date.now());
  const infos = useTeamPlayerInfos(team);
  const [edit, setEdit] = useState<PlayerDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const status = teamRequestStatus(team);
  const squadAll = useMemo(() => allPlayers.filter((p) => p.teamId === team.id).sort((a, b) => a.name.localeCompare(b.name)), [allPlayers, team.id]);
  // Joueurs validés puis retirés : hors effectif, mais leur place reste prise (18 places au total)
  const players = useMemo(() => squadAll.filter((p) => !isRemoved(p)), [squadAll]);
  const removed = useMemo(() => squadAll.filter(isRemoved), [squadAll]);
  const used = squadPlacesUsed(squadAll);
  const full = used >= SQUAD_MAX;
  const check = useMemo(() => checkSquad(team, players, infos), [team, players, infos]);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const ownerId = team.ownerId ?? user?.id ?? '';

  const open = (p?: Player) => {
    if (!p) return setEdit({ firstName: '', lastName: '', birthDate: '', cinFileId: null, photoFileId: null, attestationFileId: null, certificateFileId: null });
    const i = infos.get(p.id);
    const [fn, ...rest] = p.name.split(' ');
    setEdit({
      id: p.id,
      status: p.status ?? 'approved',
      firstName: i?.firstName ?? fn ?? '',
      lastName: i?.lastName ?? rest.join(' '),
      birthDate: p.birthDate ?? i?.birthDate ?? '',
      cinFileId: i?.cinFileId ?? null,
      photoFileId: i?.photoFileId ?? null,
      attestationFileId: i?.attestationFileId ?? null,
      certificateFileId: i?.certificateFileId ?? null,
      number: p.number,
      position: p.position,
    });
  };

  const save = async () => {
    if (!edit || !season) return;
    if (!edit.firstName.trim() || !edit.lastName.trim()) return notify(t('auth.errFields'));
    if (edit.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(edit.birthDate.trim())) return notify(t('players.birthDate'));
    if (!edit.id && !open_) return notify(t('reg.rosterClosed', { d: season?.rosterDeadline ?? '' }));
    if (!edit.id && full) return notify(t('err.squadFull'));
    // Championnat +35 : simple avertissement (l'administrateur décide à la validation)
    if (underAge(season, edit.birthDate.trim() || null, Date.now()) && !(await ask(t('reg.under35Title'), t('reg.under35'), t('common.confirm'), t('common.cancel')))) return;
    setBusy(true);
    try {
      const p = await services.saveSquadPlayer(team, ownerId, season.id, {
        ...edit,
        birthDate: edit.birthDate.trim() || null,
      });
      // Joueur ajouté / modifié après l'envoi : l'admin est prévenu
      if (p.status === 'pending' && status !== 'draft') notifier.playersSubmitted(team, 1);
      setEdit(null);
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!edit?.id) return;
    const p = players.find((x) => x.id === edit.id);
    if (!p) return;
    const validated = (p.status ?? 'approved') === 'approved';
    const name = `${edit.firstName} ${edit.lastName}`;
    if (validated) {
      if (!(await ask(t('squad.removeTitle'), t('squad.removeWarn', { name, n: SQUAD_MAX }), t('squad.remove'), t('common.cancel')))) return;
    } else if (!(await ask(t('common.delete'), name, t('common.delete'), t('common.cancel')))) return;
    try {
      await services.companyRemovePlayer(p);
      setEdit(null);
    } catch {
      notify(t('common.error'));
    }
  };

  const submit = async () => {
    if (check.tooFew) return notify(t('reg.tooFew', { n: MIN_SQUAD }));
    if (check.missingRequired.length)
      return notify(
        `${t('reg.missingRequired')}\n\n${check.missingRequired
          .map((m) => `• ${nameOf(m.playerId)} : ${m.missing.map((k) => t(`reg.doc.${k}`)).join(', ')}`)
          .join('\n')}`,
      );
    const warnings: string[] = [];
    if (check.missingAttestation.length) warnings.push(`${t('reg.missingAttestation')}\n${check.missingAttestation.map((id) => `• ${nameOf(id)}`).join('\n')}`);
    if (check.missingCertificate.length) warnings.push(`${t('reg.missingCertificate')}\n${check.missingCertificate.map((id) => `• ${nameOf(id)}`).join('\n')}`);
    if (warnings.length && !(await ask(t('reg.incompleteTitle'), warnings.join('\n\n'), t('reg.sendAnyway'), t('reg.complete')))) return;
    setBusy(true);
    try {
      if (warnings.length)
        await services.updateOwnTeam(team.id, {
          collectiveAttestationPromised: check.missingAttestation.length > 0 || !!team.collectiveAttestationPromised,
          collectiveCertificatePromised: check.missingCertificate.length > 0 || !!team.collectiveCertificatePromised,
        });
      await services.submitTeamRequest(team);
      notifier.teamRegistered(team);
      notify(t('reg.sent'));
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = mode === 'register' && (status === 'draft' || status === 'rejected');

  return (
    <View>
      <Row style={{ marginBottom: 10 }}>
        <Text style={[font.h3, { flex: 1 }]}>{t('reg.squad', { n: players.length })}</Text>
        <Button small label={t('players.add')} icon="person-add" onPress={() => open()} disabled={!open_ || full} />
      </Row>
      <Text style={[font.small, { marginBottom: 6, fontWeight: '800', color: full ? colors.red : colors.accent }]}>
        {t('squad.places', { used, max: SQUAD_MAX })}
        {removed.length ? ` · ${t('squad.lost', { n: removed.length })}` : ''}
      </Text>
      <Text style={[font.small, { marginBottom: 10 }]}>{t('reg.squadHint', { n: MIN_SQUAD })}</Text>
      {season?.rosterDeadline ? (
        <Text style={[font.small, { marginBottom: 10, color: open_ ? colors.accent : colors.red, fontWeight: '700' }]}>
          {open_ ? t('reg.rosterUntil', { d: season.rosterDeadline.split('-').reverse().join('/') }) : t('reg.rosterClosed', { d: season.rosterDeadline.split('-').reverse().join('/') })}
        </Text>
      ) : null}
      {!players.length ? <Empty text={t('todo.addPlayers')} icon="people-outline" /> : null}
      {players.map((p) => {
        const i = infos.get(p.id);
        const st = p.status ?? 'approved';
        const c = PLAYER_STATUS_COLORS[st];
        const doc = (ok: boolean, label: string, collective?: boolean) => (
          <View
            key={label}
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: ok ? colors.successSoft : collective ? colors.blueSoft : colors.liveSoft,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: ok ? colors.success : collective ? colors.blue : colors.red }}>
              {ok ? '✓' : collective ? '◎' : '✕'} {label}
            </Text>
          </View>
        );
        return (
          <Card key={p.id} onPress={() => open(p)} style={{ marginBottom: 8, padding: 10 }}>
            <Row>
              <FileThumb id={i?.photoFileId} label="" size={44} />
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={[font.body, { fontWeight: '700' }]}>{p.name}</Text>
                <Text style={font.tiny}>
                  {p.birthDate ?? t('reg.noBirth')}
                  {underAge(season, p.birthDate, Date.now()) ? <Text style={{ color: colors.orange, fontWeight: '800' }}>  · {t('reg.under35Badge')}</Text> : null}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                  {doc(!!i?.cinFileId, t('reg.doc.cin'))}
                  {doc(!!i?.photoFileId, t('reg.doc.photo'))}
                  {doc(!!i?.attestationFileId, t('reg.doc.attestation'), !!team.collectiveAttestationId)}
                  {doc(!!i?.certificateFileId, t('reg.doc.certificate'), !!team.collectiveCertificateId)}
                </View>
                {st === 'rejected' && p.rejectReason ? <Text style={{ color: colors.red, fontSize: 12, marginTop: 4 }}>{t('players.reason', { r: p.rejectReason })}</Text> : null}
              </View>
              <Pill label={t(`players.status.${st}`)} color={c.fg} bg={c.bg} />
            </Row>
          </Card>
        );
      })}

      {removed.length ? (
        <View style={{ marginTop: 6, marginBottom: 6 }}>
          <Text style={[font.small, { fontWeight: '800', marginBottom: 6 }]}>{t('squad.removedTitle')}</Text>
          {removed.map((p) => (
            <Row key={p.id} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.bgElevated, marginBottom: 4 }}>
              <Text style={[font.small, { flex: 1, textDecorationLine: 'line-through', color: colors.faint }]}>{p.name}</Text>
              <Text style={font.tiny}>{p.licenseNo ?? ''}</Text>
              <Pill label={t('players.status.removed')} color={colors.faint} />
            </Row>
          ))}
          <Text style={font.tiny}>{t('squad.removedHint')}</Text>
        </View>
      ) : null}

      <CollectiveDocs team={team} />

      {canSubmit ? (
        <View style={{ marginTop: 16 }}>
          {check.missingAttestation.length || check.missingCertificate.length ? (
            <Text style={[font.small, { color: colors.orange, marginBottom: 8 }]}>{t('reg.incompleteInfo')}</Text>
          ) : null}
          <Button label={status === 'rejected' ? t('reg.resend') : t('reg.send')} icon="paper-plane" onPress={submit} loading={busy} />
        </View>
      ) : null}

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('common.edit') : t('players.add')}>
        {edit ? (
          <View>
            {edit.status && edit.status !== 'draft' && status !== 'draft' ? <Text style={[font.small, { color: colors.orange, marginBottom: 10 }]}>{t('players.editWarn')}</Text> : null}
            <Field label={t('reg.firstName')} value={edit.firstName} onChangeText={(v) => setEdit({ ...edit, firstName: v })} />
            <Field label={t('reg.lastName')} value={edit.lastName} onChangeText={(v) => setEdit({ ...edit, lastName: v })} />
            <DateField
              label={t('players.birthDate')}
              value={edit.birthDate}
              onChange={(v) => setEdit({ ...edit, birthDate: v })}
              min="1950-01-01"
              max={addDays(toDateKey(new Date()), -16 * 365)}
            />
            <AttachmentField label={t('reg.doc.cin')} hint={t('reg.cinHint')} required kind="cin" teamId={team.id} fileId={edit.cinFileId} onChange={(id) => setEdit({ ...edit, cinFileId: id })} />
            <AttachmentField label={t('reg.doc.photo')} hint={t('reg.photoHint')} required imageOnly maxWidth={700} kind="photo" teamId={team.id} fileId={edit.photoFileId} onChange={(id) => setEdit({ ...edit, photoFileId: id })} />
            <AttachmentField
              label={t('reg.doc.attestation')}
              hint={team.collectiveAttestationId ? t('reg.coveredCollective') : t('reg.optionalCollective')}
              kind="attestation"
              teamId={team.id}
              fileId={edit.attestationFileId}
              onChange={(id) => setEdit({ ...edit, attestationFileId: id })}
            />
            <AttachmentField
              label={t('reg.doc.certificate')}
              hint={team.collectiveCertificateId ? t('reg.coveredCollective') : t('reg.optionalCollective')}
              kind="certificate"
              teamId={team.id}
              fileId={edit.certificateFileId}
              onChange={(id) => setEdit({ ...edit, certificateFileId: id })}
            />
            <Button label={t('common.save')} icon="save" onPress={save} loading={busy} />
            {edit.id ? (
              <Button
                label={edit.status === 'approved' ? t('squad.remove') : t('common.delete')}
                variant="ghost"
                icon={edit.status === 'approved' ? 'person-remove-outline' : 'trash-outline'}
                onPress={remove}
                style={{ marginTop: 10 }}
              />
            ) : null}
            {edit.id && edit.status === 'approved' ? <Text style={[font.tiny, { marginTop: 4, textAlign: 'center' }]}>{t('squad.removeHint')}</Text> : null}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

/** Pièces collectives : une attestation de travail / un certificat d'aptitude pour plusieurs joueurs. */
function CollectiveDocs({ team }: { team: Team }) {
  const { t, services } = useApp();
  const set = (data: Parameters<typeof services.updateOwnTeam>[1]) => services.updateOwnTeam(team.id, data).catch(() => notify(t('common.error')));
  return (
    <Section title={t('reg.collective')}>
      <Card>
        <Text style={[font.small, { marginBottom: 12 }]}>{t('reg.collectiveHint')}</Text>
        <AttachmentField
          label={t('reg.collectiveAttestation')}
          kind="collectiveAttestation"
          teamId={team.id}
          fileId={team.collectiveAttestationId}
          onChange={(id) => set({ collectiveAttestationId: id })}
        />
        {!team.collectiveAttestationId ? (
          <ToggleLine label={t('reg.promiseAttestation')} value={!!team.collectiveAttestationPromised} onChange={(v) => set({ collectiveAttestationPromised: v })} />
        ) : null}
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
        <AttachmentField
          label={t('reg.collectiveCertificate')}
          kind="collectiveCertificate"
          teamId={team.id}
          fileId={team.collectiveCertificateId}
          onChange={(id) => set({ collectiveCertificateId: id })}
        />
        {!team.collectiveCertificateId ? (
          <ToggleLine label={t('reg.promiseCertificate')} value={!!team.collectiveCertificatePromised} onChange={(v) => set({ collectiveCertificatePromised: v })} />
        ) : null}
      </Card>
    </Section>
  );
}

function ToggleLine({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row style={{ paddingVertical: 4 }}>
      <Text style={[font.small, { flex: 1, color: colors.text }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} />
    </Row>
  );
}

// ───────────────────────── Numéros et postes (après validation) ─────────────────────────

export function NumbersEditor({ team }: { team: Team }) {
  const { t, players, services } = useApp();
  const squad = useMemo(() => players.filter((p) => p.teamId === team.id).sort((a, b) => (a.number || 99) - (b.number || 99) || a.name.localeCompare(b.name)), [players, team.id]);
  const [draft, setDraft] = useState<Record<string, { number: string; position: Position }>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d: Record<string, { number: string; position: Position }> = {};
    for (const p of squad) d[p.id] = draft[p.id] ?? { number: p.number ? String(p.number) : '', position: p.position };
    setDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad]);
  const changed = squad.filter((p) => draft[p.id] && (String(p.number || '') !== draft[p.id].number || p.position !== draft[p.id].position));
  const save = async () => {
    const nums = squad.map((p) => draft[p.id]?.number).filter(Boolean);
    if (new Set(nums).size !== nums.length) return notify(t('reg.duplicateNumbers'));
    setBusy(true);
    try {
      await Promise.all(changed.map((p) => services.setPlayerNumber(p.id, parseInt(draft[p.id].number, 10) || 0, draft[p.id].position)));
      notify(t('showcase.saved'));
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  if (!squad.length) return null;
  return (
    <Section title={t('reg.numbers')}>
      <Card>
        <Text style={[font.small, { marginBottom: 10 }]}>{t('reg.numbersHint')}</Text>
        {squad.map((p) => {
          const d = draft[p.id] ?? { number: '', position: p.position };
          return (
            <View key={p.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Row>
                <TextInput
                  value={d.number}
                  onChangeText={(v) => setDraft({ ...draft, [p.id]: { ...d, number: v.replace(/\D/g, '').slice(0, 2) } })}
                  keyboardType="number-pad"
                  placeholder="N°"
                  placeholderTextColor={colors.faint}
                  style={{
                    width: 52,
                    height: 40,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: d.number ? colors.accent : colors.orange,
                    color: colors.accent,
                    fontWeight: '900',
                    fontSize: 16,
                    textAlign: 'center',
                    marginRight: 10,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                    {POSITIONS.map((pos) => (
                      <Pressable
                        key={pos}
                        onPress={() => setDraft({ ...draft, [p.id]: { ...d, position: pos } })}
                        style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: d.position === pos ? colors.accent : colors.cardAlt }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: d.position === pos ? colors.onAccent : colors.muted }}>{t(`posShort.${pos}`)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </Row>
            </View>
          );
        })}
        <Button label={t('common.save')} icon="save" onPress={save} loading={busy} disabled={!changed.length} style={{ marginTop: 10 }} />
      </Card>
    </Section>
  );
}
