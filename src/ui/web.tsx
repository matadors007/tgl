/**
 * Mise en page « site web » (grand écran) : barre de navigation en haut, pied de page,
 * bouton thème sombre / clair. Sur téléphone, l'application garde ses onglets en bas.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useState } from 'react';
import { Image, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useApp } from '../data/AppProvider';
import { isLive } from '../domain/model';
import type { StringKey } from '../i18n/strings';
import { LOGO } from './brand';
import { colors, font, radius } from './theme';
import { ContactLinks } from './contact';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Vrai sur le site web en grand écran (ordinateur, tablette paysage). */
export function useWideWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 900;
}

const hover = Platform.OS === 'web' ? ({ cursor: 'pointer', transitionDuration: '150ms' } as object) : {};

/** Bouton rond soleil / lune. */
export function ThemeToggle({ size = 20, boxed = true }: { size?: number; boxed?: boolean }) {
  const { theme, toggleTheme, t } = useApp();
  const dark = theme === 'dark';
  const [over, setOver] = useState(false);
  return (
    <Pressable
      onPress={toggleTheme}
      onHoverIn={() => setOver(true)}
      onHoverOut={() => setOver(false)}
      accessibilityRole="button"
      accessibilityLabel={dark ? t('theme.light') : t('theme.dark')}
      {...({ title: dark ? t('theme.light') : t('theme.dark') } as object)}
      hitSlop={8}
      style={[
        boxed
          ? {
              width: size + 18,
              height: size + 18,
              borderRadius: (size + 18) / 2,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: over ? colors.accent : colors.border,
              backgroundColor: over ? colors.accentSoft : colors.card,
            }
          : { padding: 6 },
        hover,
      ]}
    >
      <Ionicons name={dark ? 'sunny' : 'moon'} size={size} color={colors.accent} />
    </Pressable>
  );
}

interface NavLink {
  href: string;
  label: StringKey;
  icon: IconName;
  show: boolean;
  badge?: number;
}

function useNavLinks(): NavLink[] {
  const { matchesAll, isCompany, canBookPitch, isStaff, isOperator } = useApp();
  const live = matchesAll.filter(isLive).length;
  return [
    { href: '/', label: 'tab.home', icon: 'home', show: true },
    { href: '/book', label: 'tab.book', icon: 'calendar', show: canBookPitch },
    // Entreprise : « Mon équipe » en 2e position, puis « Championnat »
    { href: '/company', label: 'tab.company', icon: 'business', show: isCompany },
    { href: '/matches', label: 'tab.championship', icon: 'trophy', show: true, badge: live || undefined },
    { href: '/videos', label: 'tab.videos', icon: 'play-circle', show: !isCompany && !isOperator },
    { href: '/about', label: 'tab.about', icon: 'information-circle', show: !isStaff && !isCompany },
    // Administration : tout le personnel (Terrains, Championnats… selon les permissions)
    { href: '/admin', label: 'admin.title', icon: 'shield-checkmark', show: isStaff && !isOperator },
  ].filter((l) => l.show) as NavLink[];
}

function isActive(path: string, href: string) {
  if (href === '/') return path === '/' || path === '/index';
  return path === href || path.startsWith(`${href}/`);
}

function TopLink({ link, active, compact }: { link: NavLink; active: boolean; compact: boolean }) {
  const { t } = useApp();
  const [over, setOver] = useState(false);
  return (
    <Pressable
      onPress={() => router.navigate(link.href as never)}
      onHoverIn={() => setOver(true)}
      onHoverOut={() => setOver(false)}
      accessibilityRole="link"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: compact ? 10 : 13,
          height: 40,
          borderRadius: radius.pill,
          backgroundColor: active ? colors.accentSoft : over ? colors.cardAlt : 'transparent',
        },
        hover,
      ]}
    >
      {!compact ? <Ionicons name={link.icon} size={16} color={active ? colors.accent : colors.muted} style={{ marginRight: 6 }} /> : null}
      <Text style={{ color: active ? colors.accent : over ? colors.text : colors.muted, fontWeight: active ? '800' : '600', fontSize: 14 }}>{t(link.label)}</Text>
      {link.badge ? (
        <View style={{ marginLeft: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.live, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{link.badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function RoundIcon({ icon, label, onPress, badge, active }: { icon: IconName; label: string; onPress: () => void; badge?: number; active?: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setOver(true)}
      onHoverOut={() => setOver(false)}
      accessibilityLabel={label}
      {...({ title: label } as object)}
      style={[
        {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: over || active ? colors.accent : colors.border,
          backgroundColor: over || active ? colors.accentSoft : colors.card,
        },
        hover,
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.accent} />
      {badge ? (
        <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Barre de navigation du site (grand écran). */
export function WebTopBar() {
  const { t, user, lang, setLang, inboxUnread } = useApp();
  const path = usePathname();
  const links = useNavLinks();
  const { width } = useWindowDimensions();
  const compact = width < 1100 + links.length * 60;
  const initials = (user?.name ?? '?')
    .split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View
      style={[
        {
          height: 70,
          backgroundColor: colors.nav,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          zIndex: 10,
        },
        Platform.OS === 'web' ? ({ backdropFilter: 'blur(10px)', boxShadow: `0 2px 18px ${colors.shadow}` } as object) : null,
      ]}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 24, gap: 12 }}>
        <Pressable onPress={() => router.navigate('/')} style={[{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }, hover]} accessibilityRole="link">
          <Image source={LOGO} style={{ width: 50, height: 46 }} resizeMode="contain" />
          {width >= 1100 ? (
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: colors.accent, fontWeight: '900', fontSize: 15, letterSpacing: 1 }}>TUNISIA</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 11, letterSpacing: 2.2, marginTop: -1 }}>GOLDEN LEAGUE</Text>
            </View>
          ) : null}
        </Pressable>

        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, flexWrap: 'nowrap', overflow: 'hidden' }}>
          {links.map((l) => (
            <TopLink key={l.href} link={l} active={isActive(path, l.href)} compact={compact} />
          ))}
        </View>

        <Pressable
          onPress={() => setLang(lang === 'fr' ? 'en' : 'fr')}
          style={[{ height: 38, paddingHorizontal: 10, borderRadius: 19, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.card }, hover]}
          accessibilityLabel="Langue / Language"
        >
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>{lang === 'fr' ? 'FR' : 'EN'}</Text>
        </Pressable>
        <ThemeToggle size={18} />
        {user ? (
          <>
            <RoundIcon icon={inboxUnread ? 'notifications' : 'notifications-outline'} label={t('inbox.title')} badge={inboxUnread} onPress={() => router.navigate('/notifications')} active={path === '/notifications'} />
            <Pressable
              onPress={() => router.navigate('/profile')}
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  height: 40,
                  paddingLeft: 4,
                  paddingRight: 12,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: isActive(path, '/profile') ? colors.accent : colors.border,
                  backgroundColor: colors.card,
                },
                hover,
              ]}
              accessibilityLabel={t('tab.profile')}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                <Text style={{ color: colors.onAccent, fontWeight: '900', fontSize: 12 }}>{initials}</Text>
              </View>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, maxWidth: 130 }} numberOfLines={1}>
                {user.name.split(' ')[0]}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={() => router.push('/login')} style={[{ height: 40, paddingHorizontal: 14, justifyContent: 'center' }, hover]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{t('home.signin')}</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/signup')} style={[{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.accent, justifyContent: 'center' }, hover]}>
              <Text style={{ color: colors.onAccent, fontWeight: '800' }}>{t('home.signup')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

/** Pied de page du site. */
export function WebFooter() {
  const { t } = useApp();
  return (
    <View style={{ marginTop: 48, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 22, flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <Image source={LOGO} style={{ width: 40, height: 36 }} resizeMode="contain" />
      <View style={{ flex: 1, minWidth: 220 }}>
        <Text style={[font.h3, { color: colors.accent }]}>Tunisia Golden League</Text>
        <Text style={font.small}>{t('web.footer')}</Text>
      </View>
      <Text style={[font.small, { fontStyle: 'italic' }]}>« Jouer avec le cœur, gagner en équipe »</Text>
      <ContactLinks />
      <Pressable onPress={() => router.navigate('/confidentialite' as never)}>
        <Text style={[font.tiny, { textDecorationLine: 'underline' }]}>{t('legal.privacy')}</Text>
      </Pressable>
      <Pressable onPress={() => router.navigate('/suppression-compte' as never)}>
        <Text style={[font.tiny, { textDecorationLine: 'underline' }]}>{t('legal.deletion')}</Text>
      </Pressable>
      <Text style={font.tiny}>© {new Date().getFullYear()} TGL</Text>
    </View>
  );
}
