import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { Guard } from '@/ui/Guard';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { AppError } from '@/data/services';
import type { Player, Position } from '@/domain/model';
import { ask, notify } from '@/ui/dialogs';
import { TeamBadge } from '@/ui/football';
import { Button, Card, Empty, Field, Row, Screen, Section, Segmented, Sheet } from '@/ui/kit';
import { colors, font } from '@/ui/theme';

const PALETTE = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#A855F7', '#84CC16', '#06B6D4', '#F97316', '#EC4899', '#64748B', '#FACC15', '#14B8A6'];
const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

function TeamAdmin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { t, season, teamById, players, services } = useApp();
  const team = isNew ? undefined : teamById.get(id);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [shortName, setShortName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Partial<Player> | null>(null);

  useEffect(() => {
    if (team) {
      setName(team.name);
      setCompany(team.company);
      setShortName(team.shortName);
      setColor(team.color);
    }
  }, [team]);

  if (!season) return null;
  const squad = team ? players.filter((p) => p.teamId === team.id) : [];

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      notify(e instanceof AppError ? t(e.key as 'common.error') : t('common.error'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveTeam = async () => {
    if (!name.trim()) return notify(t('auth.errFields'));
    let newId = '';
    const ok = await guard(async () => {
      newId = await services.saveTeam(season, {
        id: team?.id,
        seasonId: season.id,
        name: name.trim(),
        company: company.trim() || name.trim(),
        shortName: (shortName.trim() || name.trim().slice(0, 3)).toUpperCase().slice(0, 3),
        color,
        logoUrl: team?.logoUrl ?? null,
        captainId: team?.captainId ?? null,
      });
    });
    if (ok && isNew) router.replace(`/admin/team/${newId}`);
    else if (ok) notify(t('settings.saved'));
  };

  const removeTeam = async () => {
    if (!team) return;
    if (await ask(t('common.delete'), team.name, t('common.delete'), t('common.cancel'))) {
      const ok = await guard(() => services.deleteTeam(season, team.id));
      if (ok) router.back();
    }
  };

  const savePlayer = async () => {
    if (!team || !editing?.name?.trim()) return notify(t('auth.errFields'));
    const ok = await guard(() =>
      services.savePlayer({
        id: editing.id,
        seasonId: season.id,
        teamId: team.id,
        name: editing.name!.trim(),
        number: Number(editing.number) || 0,
        position: editing.position ?? 'MID',
        photoUrl: editing.photoUrl ?? null,
      }),
    );
    if (ok) setEditing(null);
  };

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: isNew ? t('season.addTeam') : team?.name ?? '' }} />
      <Card>
        <Row style={{ marginBottom: 14 }}>
          <TeamBadge team={{ id: '', seasonId: '', name, company, shortName: shortName || name.slice(0, 3).toUpperCase(), color }} size={48} />
          <Text style={[font.h2, { marginLeft: 12, flex: 1 }]}>{name || t('season.teamName')}</Text>
        </Row>
        <Field label={t('season.teamName')} value={name} onChangeText={setName} />
        <Field label={t('season.company')} value={company} onChangeText={setCompany} />
        <Field label={t('season.short')} value={shortName} onChangeText={(v) => setShortName(v.toUpperCase().slice(0, 3))} autoCapitalize="characters" />
        <Text style={[font.small, { marginBottom: 8, fontWeight: '600' }]}>{t('season.color')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          {PALETTE.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: 3, borderColor: color === c ? colors.white : 'transparent' }}
            />
          ))}
        </View>
        <Button label={t('common.save')} icon="save" onPress={saveTeam} loading={busy} />
        {team && season.status === 'registration' ? (
          <Button label={t('common.delete')} variant="ghost" icon="trash" style={{ marginTop: 8 }} onPress={removeTeam} />
        ) : null}
      </Card>

      {team ? (
        <Section
          title={`${t('season.players')} (${squad.length})`}
          right={<Button label={t('common.add')} icon="person-add" small onPress={() => setEditing({ position: 'MID', number: squad.length + 1 })} />}
        >
          {!squad.length ? <Empty text={t('common.empty')} icon="people-outline" /> : null}
          {squad.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setEditing(p)}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 12, borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ width: 30, color: colors.accent, fontWeight: '900' }}>{p.number}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[font.body, { fontWeight: '700' }]}>{p.name}</Text>
                <Text style={font.small}>{t(`pos.${p.position}`)}</Text>
              </View>
              <Pressable
                hitSlop={8}
                onPress={() => guard(() => services.saveTeam(season, { ...team, captainId: p.id }))}
                style={{ marginRight: 14 }}
              >
                <Ionicons name={team.captainId === p.id ? 'star' : 'star-outline'} size={18} color={team.captainId === p.id ? colors.yellow : colors.faint} />
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={async () => {
                  if (await ask(t('common.delete'), p.name, t('common.delete'), t('common.cancel'))) guard(() => services.deletePlayer(p.id));
                }}
              >
                <Ionicons name="trash-outline" size={18} color={colors.red} />
              </Pressable>
            </Pressable>
          ))}
          <Text style={[font.tiny, { marginTop: 4 }]}>★ = {t('season.captain')}</Text>
        </Section>
      ) : null}

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t('common.edit') : t('season.addPlayer')}>
        {editing ? (
          <View>
            <Field label={t('season.playerName')} value={editing.name ?? ''} onChangeText={(v) => setEditing({ ...editing, name: v })} />
            <Field
              label={t('season.number')}
              value={editing.number != null ? String(editing.number) : ''}
              onChangeText={(v) => setEditing({ ...editing, number: Number(v.replace(/[^\d]/g, '')) || 0 })}
              keyboardType="number-pad"
            />
            <Text style={[font.small, { marginBottom: 8, fontWeight: '600' }]}>{t('season.position')}</Text>
            <Segmented<Position>
              value={editing.position ?? 'MID'}
              onChange={(v) => setEditing({ ...editing, position: v })}
              options={POSITIONS.map((p) => ({ value: p, label: t(`pos.${p}`) }))}
            />
            <Button label={t('common.save')} icon="save" style={{ marginTop: 16 }} onPress={savePlayer} loading={busy} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

export default function GuardedTeamAdmin() {
  return (
    <Guard allow="champ.edit">
      <TeamAdmin />
    </Guard>
  );
}
