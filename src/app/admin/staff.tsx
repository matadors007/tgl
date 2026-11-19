import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, Switch, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { passwordOk } from '@/domain/password';
import { authErrorKey } from '@/data/auth';
import { hasPerm, isStaffRole, PERM_GROUPS, PERMS, roleDefaultPerm, ROLES, type Perm, type Role, type UserProfile } from '@/domain/model';
import { notify } from '@/ui/dialogs';
import { phoneLink } from '@/ui/format';
import { Guard } from '@/ui/Guard';
import { Button, Card, ChoiceGrid, Empty, Field, Pill, Row, Screen, Segmented, Sheet } from '@/ui/kit';
import { colors, font } from '@/ui/theme';

const FILTERS: Role[] = ['company', 'agent', 'admin', 'operator', 'user'];
export const DEFAULT_TEST_PASSWORD = 'Test1234';

/** Gestion du personnel : comptes par rôle (entreprise, agent, administrateur, opérateur, particulier). */
function Staff() {
  const { t, services, auth, user, allTeams } = useApp();
  const [role, setRole] = useState<Role>('company');
  const [list, setList] = useState<UserProfile[] | null>(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<UserProfile | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', companyName: '', password: DEFAULT_TEST_PASSWORD, role: 'agent' as Role });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setList(null);
    try {
      setList((await services.listUsers(role)).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setList([]);
    }
  }, [services, role]);
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list ?? []).filter((u) => !s || [u.name, u.email, u.phone, u.companyName].some((x) => x?.toLowerCase().includes(s)));
  }, [list, q]);

  const changeRole = async (u: UserProfile, r: Role) => {
    if (u.id === user?.id) return notify(t('staff.notSelf'));
    const team = r === 'company' ? allTeams.find((x) => x.id === u.teamId) ?? null : null;
    await services.setUserRole(u.id, r, team);
    setEdit({ ...u, role: r, teamId: team?.id ?? null });
    load();
  };

  const create = async () => {
    if (!form.name.trim() || !form.email.trim()) return notify(t('auth.errFields'));
    if (!passwordOk(form.password)) return notify(t('signup.short'));
    setBusy(true);
    try {
      await services.createMember((e, p) => auth.createAccountFor(e, p), {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        role: form.role,
        password: form.password,
        companyName: form.companyName.trim(),
      });
      notify(t('staff.created', { email: form.email.trim(), p: form.password }));
      setAdding(false);
      setRole(form.role);
      setForm({ ...form, name: '', phone: '', email: '', companyName: '' });
      load();
    } catch (e) {
      notify(t(authErrorKey(e) as 'common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Segmented scroll value={role} onChange={setRole} options={FILTERS.map((r) => ({ value: r, label: t(`staff.f.${r}`) }))} />
      <View style={{ height: 10 }} />
      <Field label={t('staff.search')} value={q} onChangeText={setQ} autoCapitalize="none" />
      <Button label={t('staff.add')} icon="person-add" onPress={() => setAdding(true)} />
      <Text style={[font.small, { marginVertical: 10 }]}>{list ? t('staff.count', { n: shown.length }) : t('common.loading')}</Text>
      {list && !shown.length ? <Empty text={t('settings.notFound')} icon="people-outline" /> : null}
      {shown.map((u) => {
        const team = allTeams.find((x) => x.id === u.teamId);
        return (
          <Card key={u.id} style={{ marginBottom: 8 }} onPress={() => setEdit(u)}>
            <Row>
              <View style={{ width: 42, height: 42, borderRadius: 21, overflow: 'hidden', backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                {u.photo ? (
                  <Image source={{ uri: u.photo }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={{ color: colors.accent, fontWeight: '900' }}>{u.name.slice(0, 2).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[font.body, { fontWeight: '800' }]}>{u.name}</Text>
                <Text style={font.tiny}>
                  {u.email ?? ''} {u.phone ? `· ${u.phone}` : ''}
                </Text>
                {u.role === 'company' ? <Text style={[font.tiny, { color: colors.accent }]}>{team ? team.name : u.companyName ?? t('staff.noTeam')}</Text> : null}
                {u.deletionRequestedAt ? (
                  <Text style={[font.tiny, { color: colors.red, fontWeight: '800' }]}>
                    🗑 {t('staff.deletionRequested')} · {new Date(u.deletionRequestedAt).toLocaleDateString('fr-FR')}
                  </Text>
                ) : null}
                {isStaffRole(u.role) ? (
                  <Text style={[font.tiny, { color: u.perms ? colors.orange : colors.muted }]}>
                    {u.perms ? t('perm.custom') : t('perm.roleDefault')} · {t('perm.count', { n: PERMS.filter((p) => hasPerm(u, p)).length, total: PERMS.length })}
                  </Text>
                ) : null}
              </View>
              <Pill label={t(`role.${u.role}`)} color={colors.accent} />
            </Row>
          </Card>
        );
      })}

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.name ?? ''}>
        {edit ? (
          <View>
            <Text style={[font.small, { marginBottom: 10 }]}>
              {edit.email} · {edit.phone}
            </Text>
            {edit.phone ? <Button small variant="secondary" icon="call" label={t('common.call')} onPress={() => Linking.openURL(phoneLink(edit.phone))} style={{ marginBottom: 12 }} /> : null}
            <Text style={[font.small, { fontWeight: '700', marginBottom: 6 }]}>{t('staff.role')}</Text>
            <ChoiceGrid items={ROLES} keyOf={(r) => r} labelOf={(r) => t(`role.${r}`)} selected={(r) => r === edit.role} onPick={(r) => changeRole(edit, r)} />
            {isStaffRole(edit.role) ? <PermsEditor user={edit} onSaved={(u) => { setEdit(u); load(); }} /> : null}
            {edit.role === 'company' ? (
              <View style={{ marginTop: 12 }}>
                <Text style={[font.small, { fontWeight: '700', marginBottom: 6 }]}>{t('settings.pickTeam')}</Text>
                <ChoiceGrid
                  items={allTeams}
                  keyOf={(x) => x.id}
                  labelOf={(x) => x.name}
                  selected={(x) => x.id === edit.teamId}
                  onPick={async (team) => {
                    await services.setUserRole(edit.id, 'company', team);
                    setEdit({ ...edit, teamId: team.id });
                    load();
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={adding} onClose={() => setAdding(false)} title={t('staff.add')}>
        <Text style={[font.small, { fontWeight: '700', marginBottom: 6 }]}>{t('staff.role')}</Text>
        <ChoiceGrid items={ROLES} keyOf={(r) => r} labelOf={(r) => t(`role.${r}`)} selected={(r) => r === form.role} onPick={(r) => setForm({ ...form, role: r })} />
        <View style={{ height: 12 }} />
        <Field label={t('reg.fullName')} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        {form.role === 'company' ? <Field label={t('auth.companyName')} value={form.companyName} onChangeText={(v) => setForm({ ...form, companyName: v })} /> : null}
        <Field label={t('auth.phone')} value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
        <Field label={t('auth.email')} value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" />
        <Field label={t('staff.password')} value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} autoCapitalize="none" />
        <Button label={t('staff.create')} icon="checkmark" onPress={create} loading={busy} />
      </Sheet>
    </Screen>
  );
}

/**
 * Permissions détaillées d'un compte du personnel : l'administrateur active ou désactive chaque action.
 * Une rubrique dont toutes les actions sont désactivées n'apparaît plus pour ce compte.
 */
function PermsEditor({ user: u, onSaved }: { user: UserProfile; onSaved: (u: UserProfile) => void }) {
  const { t, services, user: me } = useApp();
  const [perms, setPerms] = useState<Record<Perm, boolean>>(() => Object.fromEntries(PERMS.map((p) => [p, hasPerm(u, p)])) as Record<Perm, boolean>);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPerms(Object.fromEntries(PERMS.map((p) => [p, hasPerm(u, p)])) as Record<Perm, boolean>);
  }, [u]);
  const self = me?.id === u.id;
  const save = async (next: Record<Perm, boolean> | null) => {
    // Seuls les écarts par rapport au rôle sont enregistrés
    const diff = next ? (Object.fromEntries(PERMS.filter((p) => next[p] !== roleDefaultPerm(u.role, p)).map((p) => [p, next[p]])) as Partial<Record<Perm, boolean>>) : null;
    const stored = diff && Object.keys(diff).length ? diff : null;
    setBusy(true);
    try {
      await services.setUserPerms(u.id, stored);
      onSaved({ ...u, perms: stored });
      notify(t('perm.saved'));
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[font.h3, { marginBottom: 4 }]}>{t('perm.title')}</Text>
      <Text style={[font.small, { marginBottom: 10 }]}>{t('perm.hint')}</Text>
      {PERM_GROUPS.map((g) => (
        <Card key={g.key} style={{ marginBottom: 10 }}>
          <Row style={{ marginBottom: 6 }}>
            <Text style={[font.h3, { flex: 1 }]}>{t(`perm.group.${g.key}` as 'perm.group.pitches')}</Text>
            <Button
              small
              variant="ghost"
              label={g.perms.every((p) => perms[p]) ? t('perm.none') : t('perm.all')}
              onPress={() => {
                const on = !g.perms.every((p) => perms[p]);
                setPerms({ ...perms, ...Object.fromEntries(g.perms.map((p) => [p, on && !(self && p === 'staff') ? on : self && p === 'staff' ? true : on])) });
              }}
            />
          </Row>
          {g.perms.map((p) => (
            <Row key={p} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[font.body, { fontWeight: '600' }]}>{t(`perm.${p}` as 'perm.queue')}</Text>
                <Text style={font.tiny}>{t(`perm.${p}.hint` as 'perm.queue.hint')}</Text>
              </View>
              <Switch
                value={perms[p]}
                disabled={self && p === 'staff'}
                onValueChange={(v) => setPerms({ ...perms, [p]: v })}
                trackColor={{ true: colors.accent, false: colors.border }}
              />
            </Row>
          ))}
        </Card>
      ))}
      <Button label={t('perm.save')} icon="save" onPress={() => save(perms)} loading={busy} />
      <Button label={t('perm.reset')} variant="ghost" small style={{ marginTop: 8 }} onPress={() => save(null)} />
    </View>
  );
}

export default function StaffScreen() {
  return (
    <Guard allow="staff">
      <Staff />
    </Guard>
  );
}
