import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useApp, useNow } from '@/data/AppProvider';
import { COL } from '@/data/store';
import { isBookingActivePending, isLive, type Booking, type NewsItem } from '@/domain/model';
import { LOGO } from '@/ui/brand';
import { MatchRow } from '@/ui/football';
import { Button, Card, Empty, ListItem, Pill, Screen, Section } from '@/ui/kit';
import { NewsCard } from '@/ui/news';
import { Carousel, VideoThumb, carouselSlides } from '@/ui/showcase';
import { colors, font, radius } from '@/ui/theme';
import { ThemeToggle, useWideWeb } from '@/ui/web';

export default function HomeScreen() {
  const { t, isOperator, matchesAll, championships, setChampionship, mode, store, user, season, inboxUnread, showcase, canBookPitch, seesLeague, isCompany, needsVerification } = useApp();
  const now = useNow(30_000);
  const wide = useWideWeb();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (!seesLeague) return setNews([]);
    return store.watch<NewsItem>(COL.news, [], (r) => setNews(r.sort((a, b) => b.createdAt - a.createdAt)));
  }, [store, seesLeague]);
  useEffect(() => {
    if (!user || !canBookPitch) return setMyBookings([]);
    return store.watch<Booking>(COL.bookings, [['userId', user.id]], setMyBookings);
  }, [store, user, canBookPitch]);

  const slides = useMemo(() => carouselSlides(showcase, t), [showcase, t]);
  const videos = useMemo(() => showcase.filter((i) => i.kind === 'video' && i.active), [showcase]);
  const live = matchesAll.filter(isLive);
  // Prochains matchs et derniers résultats, championnat par championnat
  const perChamp = useMemo(
    () =>
      championships.map((c) => {
        const list = matchesAll.filter((m) => m.seasonId === c.id);
        return {
          champ: c,
          upcoming: list.filter((m) => m.status === 'scheduled').slice(0, 4),
          results: list.filter((m) => m.status === 'finished').slice(-4).reverse(),
        };
      }),
    [championships, matchesAll],
  );
  const named = championships.length > 1;
  const openMatches = (id: string) => {
    setChampionship(id);
    router.push('/matches');
  };
  const pending = myBookings.filter((b) => isBookingActivePending(b, now)).length;

  const seeAll = (href: string) => (
    <Pressable onPress={() => router.push(href as never)}>
      <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 12 }}>{t('common.seeAll')}</Text>
    </Pressable>
  );

  return (
    <Screen>
      {/* En-tête : logo, nom, thème, cloche (le site affiche sa barre de navigation à la place) */}
      {wide ? null : (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Image source={LOGO} style={{ width: 66, height: 60, marginRight: 12 }} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={[font.h2, { color: colors.accent, letterSpacing: 0.5 }]}>{t('app.name').toUpperCase()}</Text>
          <Text style={font.small}>{t('app.tagline')}</Text>
        </View>
        <View style={{ marginLeft: 8, marginRight: 4 }}>
          <ThemeToggle size={18} />
        </View>
        {user ? (
          <Pressable onPress={() => router.push('/notifications')} hitSlop={10} accessibilityLabel={t('inbox.title')} style={{ padding: 6 }}>
            <Ionicons name={inboxUnread ? 'notifications' : 'notifications-outline'} size={26} color={colors.accent} />
            {inboxUnread ? (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.red,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{inboxUnread > 9 ? '9+' : inboxUnread}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
      )}
      {mode === 'demo' ? (
        <View style={{ marginBottom: 12 }}>
          <Pill label={t('app.demo')} color={colors.orange} bg={colors.orangeSoft} icon="flask" />
        </View>
      ) : null}

      {/* Carrousel des terrains (site : bandeau d'accueil en deux colonnes) */}
      {wide ? (
        <View style={{ flexDirection: 'row', gap: 32, alignItems: 'center', marginBottom: 8 }}>
          <View style={{ flex: 5 }}>
            <Text style={{ color: colors.accent, fontWeight: '800', letterSpacing: 3, fontSize: 13 }}>{t('app.tagline').toUpperCase()}</Text>
            <Text style={{ color: colors.text, fontSize: 44, lineHeight: 50, fontWeight: '900', marginTop: 10 }}>{t('app.name')}</Text>
            <Text style={[font.body, { color: colors.muted, fontSize: 17, lineHeight: 26, marginTop: 12 }]}>« Jouer avec le cœur, gagner en équipe »</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              {canBookPitch ? <Button label={t('home.bookCta')} icon="calendar" onPress={() => router.push('/book')} style={{ paddingHorizontal: 26 }} /> : null}
              {!user ? <Button label={t('home.signup')} icon="person-add" onPress={() => router.push('/signup')} style={{ paddingHorizontal: 26 }} /> : null}
              {seesLeague ? <Button label={t('tab.championship')} icon="trophy" onPress={() => router.push('/matches')} style={{ paddingHorizontal: 26 }} /> : null}
              <Button label={t('home.about')} variant="secondary" icon="information-circle" onPress={() => router.push('/about')} style={{ paddingHorizontal: 22 }} />
            </View>
          </View>
          <View style={{ flex: 7, borderRadius: radius.lg, overflow: 'hidden' }}>
            <Carousel slides={slides} height={380} />
          </View>
        </View>
      ) : (
        <Carousel slides={slides} />
      )}

      {needsVerification ? (
        <Card style={{ marginTop: 16, borderColor: colors.orange }} onPress={() => router.push('/verify-email')}>
          <Text style={{ color: colors.orange, fontWeight: '800' }}>{t('verify.banner')}</Text>
        </Card>
      ) : null}

      {/* Visiteur : créer un compte */}
      {!user && !wide ? (
        <Card style={{ marginTop: 16, borderColor: colors.accent }}>
          <Text style={font.h2}>{t('home.guestTitle')}</Text>
          <Text style={[font.small, { marginTop: 4, marginBottom: 12 }]}>{t('home.guestSub')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={t('home.signup')} icon="person-add" onPress={() => router.push('/signup')} style={{ flex: 1 }} />
            <Button label={t('home.signin')} variant="secondary" onPress={() => router.push('/login')} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      {/* Réserver (clients uniquement) */}
      {canBookPitch && (!wide || pending) ? (
        <Pressable
          onPress={() => router.push('/book')}
          style={({ pressed }) => [
            { marginTop: 16, backgroundColor: colors.accent, borderRadius: radius.lg, padding: 18, flexDirection: 'row', alignItems: 'center' },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onAccent, fontSize: 18, fontWeight: '900' }}>{t('home.bookCta')}</Text>
            <Text style={{ color: '#3A2C08', marginTop: 2, fontWeight: '600' }}>{pending ? `${pending} ${t('home.pending')}` : t('home.bookSub')}</Text>
          </View>
          <Ionicons name="calendar" size={30} color={colors.onAccent} />
        </Pressable>
      ) : null}


      {wide ? null : (
      <View style={{ marginTop: 12 }}>
        <ListItem icon="information-circle" title={t('home.about')} subtitle={t('home.aboutSub')} onPress={() => router.push('/about')} />
      </View>
      )}

      {/* Vidéos */}
      <Section title={t('home.videos')} right={videos.length ? seeAll('/videos') : undefined}>
        {videos.length && wide ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 }}>
            {videos.slice(0, 6).map((v) => (
              <View key={v.id} style={{ width: '33.33%', padding: 8 }}>
                <VideoThumb item={v} onPress={() => router.push({ pathname: '/videos', params: { id: v.id } })} />
              </View>
            ))}
          </View>
        ) : videos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {videos.slice(0, 6).map((v) => (
              <VideoThumb key={v.id} item={v} width={230} onPress={() => router.push({ pathname: '/videos', params: { id: v.id } })} />
            ))}
          </ScrollView>
        ) : (
          <Empty text={t('videos.empty')} icon="play-circle-outline" />
        )}
      </Section>

      {/* Championnat : visible par tous */}
      {seesLeague && live.length ? (
        <Section title={`● ${t('home.live')}`}>
          <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
            {live.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </View>
        </Section>
      ) : null}
      {/* Entreprise : ni prochains matchs ni derniers résultats sur l'accueil (tout est dans « Mon équipe ») */}
      {(isCompany || isOperator ? [] : perChamp).map(({ champ, upcoming, results }) => (
        <View key={champ.id} style={wide ? { flexDirection: 'row', gap: 24, alignItems: 'flex-start' } : null}>
          <Section
            style={wide ? { flex: 1 } : undefined}
            title={named ? `${t('home.upcoming')} · ${champ.name}` : t('home.upcoming')}
            right={
              <Pressable onPress={() => openMatches(champ.id)}>
                <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 12 }}>{t('common.seeAll')}</Text>
              </Pressable>
            }
          >
            {upcoming.length ? (
              <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
                {upcoming.map((m) => (
                  <MatchRow key={m.id} match={m} showDate />
                ))}
              </View>
            ) : (
              <Empty text={t('common.empty')} />
            )}
          </Section>
          {results.length ? (
            <Section style={wide ? { flex: 1 } : undefined} title={named ? `${t('home.results')} · ${champ.name}` : t('home.results')}>
              <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
                {results.map((m) => (
                  <MatchRow key={m.id} match={m} showDate />
                ))}
              </View>
            </Section>
          ) : null}
        </View>
      ))}
      {seesLeague && news.length ? (
        <Section title={t('home.news')} right={seeAll('/news')}>
          {news.slice(0, 3).map((n) => (
            <NewsCard key={n.id} item={n} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
