import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { teamRequestStatus, type Player, type Team } from '@/domain/model';
import { leagueTitle } from '@/domain/model';
import { exportLicenseCards } from '@/print/cardExport';
import { zipFileName } from '@/print/cardZip';
import { printHtml } from '@/print/printing';
import { licenseCardsHtml, type LicenseCardData } from '@/print/templates';
import { FileThumb } from '@/ui/attachments';
import { notify } from '@/ui/dialogs';
import { Guard } from '@/ui/Guard';
import { Button, Card, Empty, Row, Screen, Segmented } from '@/ui/kit';
import { useTeamPlayerInfos } from '@/ui/registration';
import { colors, font } from '@/ui/theme';

/** Cartes de licence prêtes à imprimer (recto : logos, photo, nom, n° de licence, naissance ; verso : logo). */
function Licences() {
  const { t, teamsAll } = useApp();
  // Depuis Championnats → équipe → « Consulter » : seulement cette équipe
  const { team: fixed } = useLocalSearchParams<{ team?: string }>();
  const teams = teamsAll.filter((x) => teamRequestStatus(x) === 'approved');
  const [teamId, setTeamId] = useState<string | null>(fixed ?? null);
  const team = teams.find((x) => x.id === teamId) ?? teams[0];
  if (!team)
    return (
      <Screen edges={['bottom']}>
        <Empty text={t('lic.noTeam')} icon="card-outline" />
      </Screen>
    );
  return (
    <Screen edges={['bottom']}>
      {fixed ? null : <Segmented scroll value={team.id} onChange={setTeamId} options={teams.map((x) => ({ value: x.id, label: x.shortName }))} />}
      <TeamLicences key={team.id} team={team} />
    </Screen>
  );
}

function TeamLicences({ team }: { team: Team }) {
  const { t, playersAll: players, services, seasons } = useApp();
  const season = seasons.find((x) => x.id === team.seasonId);
  const infos = useTeamPlayerInfos(team);
  const [busy, setBusy] = useState<'print' | 'zip' | null>(null);
  const [progress, setProgress] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const squad = useMemo(() => players.filter((p) => p.teamId === team.id && p.status !== 'removed').sort((a, b) => (a.licenseNo ?? '').localeCompare(b.licenseNo ?? '')), [players, team.id]);
  const seasonLabel = `${season?.startDate?.slice(0, 4) ?? season?.name?.match(/\d{4}/)?.[0] ?? String(new Date().getFullYear())}`;

  const build = async (list: Player[]): Promise<LicenseCardData[]> =>
    Promise.all(
      list.map(async (p) => {
        const i = infos.get(p.id);
        const photo = i?.photoFileId ? await services.getFile(i.photoFileId) : null;
        const [fn, ...rest] = p.name.split(' ');
        return {
          firstName: i?.firstName ?? fn ?? '',
          lastName: i?.lastName ?? rest.join(' '),
          birthDate: p.birthDate ?? i?.birthDate ?? null,
          licenseNo: p.licenseNo,
          photo: photo?.data ?? null,
          teamName: team.name,
          companyLogo: team.logoUrl,
          teamColor: team.color,
          season: seasonLabel,
          league: leagueTitle(season),
          number: p.number || null,
        };
      }),
    );

  const print = async (list: Player[]) => {
    setBusy('print');
    try {
      await printHtml(licenseCardsHtml(await build(list)), `Licences ${team.name}`);
    } catch {
      notify(t('files.printErr'));
    } finally {
      setBusy(null);
    }
  };

  // Téléchargement : un ZIP avec un PDF (recto + verso) par carte
  const download = async (list: Player[]) => {
    if (!list.length) return;
    setBusy('zip');
    setProgress(t('lic.zipProgress', { done: 0, total: list.length }));
    try {
      const name = zipFileName(list.length === 1 ? `${team.shortName}_${list[0].licenseNo ?? list[0].name}` : team.shortName);
      await exportLicenseCards(await build(list), name, (done, total) => setProgress(t('lic.zipProgress', { done, total })));
      notify(t('lic.zipOk', { name }));
    } catch {
      notify(t('lic.zipErr'));
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const chosen = squad.filter((p) => selected.has(p.id));
  const allChecked = !!squad.length && chosen.length === squad.length;

  return (
    <View style={{ marginTop: 14 }}>
      <Card>
        <Text style={font.h2}>{team.name}</Text>
        <Text style={[font.small, { marginTop: 4, marginBottom: 12 }]}>{t('lic.hint')}</Text>
        <Button label={t('lic.printAll', { n: squad.length })} icon="print" onPress={() => print(squad)} loading={busy === 'print'} disabled={!squad.length || !!busy} />
      </Card>

      <Card style={{ marginTop: 10, borderColor: colors.accent }}>
        <Row style={{ marginBottom: 6 }}>
          <Ionicons name="archive" size={20} color={colors.accent} style={{ marginRight: 8 }} />
          <Text style={[font.h3, { flex: 1 }]}>{t('lic.zipTitle')}</Text>
        </Row>
        <Text style={[font.small, { marginBottom: 12 }]}>{t('lic.zipHint')}</Text>
        <Row style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button
            label={t('lic.zipSel', { n: chosen.length })}
            icon="download"
            onPress={() => download(chosen)}
            loading={busy === 'zip'}
            disabled={!chosen.length || !!busy}
            style={{ flexGrow: 1 }}
          />
          <Button label={t('lic.zipAll', { n: squad.length })} icon="cloud-download" variant="secondary" onPress={() => download(squad)} disabled={!squad.length || !!busy} style={{ flexGrow: 1 }} />
          <Button
            label={allChecked ? t('lic.clearSel') : t('lic.selectAll')}
            icon={allChecked ? 'square-outline' : 'checkbox'}
            variant="ghost"
            onPress={() => setSelected(allChecked ? new Set() : new Set(squad.map((p) => p.id)))}
            disabled={!squad.length}
          />
        </Row>
        {progress ? <Text style={[font.small, { marginTop: 8, color: colors.accent }]}>{progress}</Text> : null}
      </Card>

      {!squad.length ? <Empty text={t('lic.noPlayer')} icon="people-outline" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: 4 }}>
        {squad.map((p) => {
          const i = infos.get(p.id);
          const on = selected.has(p.id);
          return (
            <View key={p.id} style={{ width: wide ? '50%' : '100%', padding: 4 }}>
              <Card style={{ padding: 10, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.card }}>
                <Row>
                  <Pressable onPress={() => toggle(p.id)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ paddingRight: 8 }}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colors.accent : colors.muted} />
                  </Pressable>
                  <FileThumb id={i?.photoFileId} label="" size={46} />
                  <Pressable style={{ flex: 1, marginLeft: 6 }} onPress={() => toggle(p.id)}>
                    <Text style={[font.body, { fontWeight: '800' }]}>{p.name}</Text>
                    <Text style={[font.tiny, { color: p.licenseNo ? colors.accent : colors.orange }]}>{p.licenseNo ?? t('lic.noNumber')}</Text>
                    <Text style={font.tiny}>{p.birthDate ?? '—'}</Text>
                  </Pressable>
                  <IconBtn icon="download-outline" label={t('lic.zipOne')} onPress={() => download([p])} disabled={!!busy} />
                  <IconBtn icon="print-outline" label={t('lic.print')} onPress={() => print([p])} disabled={!!busy} />
                </Row>
              </Card>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function IconBtn({ icon, label, onPress, disabled }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      {...({ title: label } as object)}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        marginLeft: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.cardAlt,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={19} color={colors.accent} />
    </Pressable>
  );
}

export default function LicencesScreen() {
  return (
    <Guard allow="licences">
      <Licences />
    </Guard>
  );
}
