import { router } from 'expo-router';
import React from 'react';
import { Image, Linking, Switch, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { phoneLink } from '@/ui/format';
import { Button, Card, Header, ListItem, Pill, Row, Screen, Section, Segmented } from '@/ui/kit';
import { colors, font } from '@/ui/theme';

export default function ProfileScreen() {
  const { t, isOperator, user, auth, lang, setLang, theme, toggleTheme, isStaff, isAdmin, isCompany, canBook, canChamp, can, championships, config, mode, pushToken, pushPrefs, setPushPrefs, seesLeague, canBookPitch, needsVerification } = useApp();
  const toggle = (k: keyof typeof pushPrefs) => (v: boolean) => setPushPrefs({ ...pushPrefs, [k]: v });

  return (
    <Screen>
      <Header title={t('profile.title')} />
      {user ? (
        <Card>
          <Row>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: colors.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              {user.photo ? (
                <Image source={{ uri: user.photo }} style={{ width: 52, height: 52, borderRadius: 26 }} />
              ) : (
              <Text style={{ color: colors.accent, fontWeight: '900', fontSize: 20 }}>
                {user.name
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={font.h2}>{user.name}</Text>
              <Text style={font.small}>{user.phone}</Text>
              {user.email ? <Text style={font.small}>{user.email}</Text> : null}
              <View style={{ marginTop: 6 }}>
                <Pill label={t(`role.${user.role}`)} color={user.role === 'user' ? colors.muted : colors.accent} />
              </View>
            </View>
          </Row>
        </Card>
      ) : (
        <Card>
          <Text style={[font.body, { marginBottom: 12 }]}>{t('profile.guest')}</Text>
          <Button label={t('home.signup')} icon="person-add" onPress={() => router.push('/signup')} />
          <Button label={t('home.signin')} variant="secondary" icon="log-in" onPress={() => router.push('/login')} style={{ marginTop: 8 }} />
        </Card>
      )}

      {user ? (
        <Section>
          {needsVerification ? (
            <Card style={{ borderColor: colors.orange, marginBottom: 8 }} onPress={() => router.push('/verify-email')}>
              <Text style={{ color: colors.orange, fontWeight: '700' }}>{t('verify.banner')}</Text>
            </Card>
          ) : null}
          <ListItem icon="settings" title={t('account.title')} subtitle={t('account.sub')} onPress={() => router.push('/account')} />
        </Section>
      ) : null}


      {user && canBookPitch ? (
        <Section>
          <ListItem icon="receipt-outline" title={t('book.mine')} onPress={() => router.push('/bookings')} />
        </Section>
      ) : null}

      {/* Personnel (admin, agent, opérateur) et entreprise : pas de réglage, notifications fixées automatiquement */}
      {!isStaff && !isCompany ? (
      <Section title={t('notif.title')}>
        <Card>
          <Text style={[font.small, { marginBottom: 8, color: pushToken ? colors.success : colors.orange }]}>
            {pushToken ? t('notif.on') : t('notif.off')}
          </Text>
          {seesLeague ? <ToggleRow label={t('notif.matches')} value={pushPrefs.matches} onChange={toggle('matches')} /> : null}
          {seesLeague && pushPrefs.matches ? (
            <>
              <ToggleRow label={t('notif.allTeams')} sub={t('notif.allTeamsSub')} value={pushPrefs.allTeams} onChange={toggle('allTeams')} indent />
              <ToggleRow label={t('notif.goals')} value={pushPrefs.goals} onChange={toggle('goals')} indent />
              <ToggleRow label={t('notif.cards')} value={pushPrefs.cards} onChange={toggle('cards')} indent />
              <ToggleRow label={t('notif.status')} value={pushPrefs.status} onChange={toggle('status')} indent />
            </>
          ) : null}
          <ToggleRow
            label={t('notif.bookings')}
            sub={canBook ? t('notif.bookingsStaff') : t('notif.bookingsSub')}
            value={pushPrefs.bookings}
            onChange={toggle('bookings')}
          />
        </Card>
      </Section>
      ) : null}

      <Section title={t('profile.language')}>
        <Segmented
          value={lang}
          onChange={setLang}
          options={[
            { value: 'fr', label: 'Français' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Section>

      <Section title={t('theme.toggle')}>
        <Segmented
          value={theme}
          onChange={(v) => v !== theme && toggleTheme()}
          options={[
            { value: 'dark', label: t('theme.dark') },
            { value: 'light', label: t('theme.light') },
          ]}
        />
      </Section>

      <Section title={t('profile.contact')}>
        <ListItem icon="call" title={config.contactPhone} onPress={() => Linking.openURL(phoneLink(config.contactPhone))} />
      </Section>

      {user ? (
        <Section>
          <Button label={t('auth.logout')} variant="ghost" icon="log-out" onPress={() => auth.signOut()} />
        </Section>
      ) : null}

      <Text style={[font.tiny, { textAlign: 'center', marginTop: 24 }]}>
        Tunisia Golden League · v1.2 {mode === 'demo' ? `· ${t('app.demo')}` : ''}
      </Text>
    </Screen>
  );
}

function ToggleRow({ label, sub, value, onChange, indent }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; indent?: boolean }) {
  return (
    <Row style={{ paddingVertical: 8, paddingLeft: indent ? 14 : 0, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={font.body}>{label}</Text>
        {sub ? <Text style={font.tiny}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.text} />
    </Row>
  );
}
