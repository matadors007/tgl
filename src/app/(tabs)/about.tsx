import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { minutesToHHmm, pitchSchedule } from '@/domain/model';
import { phoneLink } from '@/ui/format';
import { Button, Card, Header, Pill, Row, Screen, Section } from '@/ui/kit';
import { Carousel, carouselSlides, imageSource } from '@/ui/showcase';
import { ContactCard } from '@/ui/contact';
import { colors, font, radius } from '@/ui/theme';

/** « À propos » : présentation du complexe et de chaque terrain. */
export default function AboutScreen() {
  const { t, config, pitches, showcase, canBookPitch } = useApp();
  const slides = useMemo(() => carouselSlides(showcase, t), [showcase, t]);
  const active = pitches.filter((p) => p.active);

  return (
    <Screen>
      <Header title={t('about.title')} subtitle={t('app.name')} />
      <Carousel slides={slides} height={180} />
      <Text style={[font.body, { marginTop: 16, lineHeight: 21 }]}>{config.aboutText}</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        <Info icon="time" label={t('about.hours')} value={`${minutesToHHmm(config.openMinutes)} – ${minutesToHHmm(config.closeMinutes)}`} sub={t('about.everyDay')} />
        <Info icon="cash" label={t('about.price')} value={`${config.price6v6}–${config.price7v7} ${t('common.tnd')}`} sub={`${config.slotMinutes} ${t('common.min')}`} />
        <Info icon="location" label={t('about.address')} value={config.address} />
        <Info icon="call" label={t('about.contact')} value={config.contactPhone} onPress={() => Linking.openURL(phoneLink(config.contactPhone))} />
      </View>
      <ContactCard />

      <Section title={t('about.pitches')}>
        {active.map((p, i) => {
          const price = p.type === '7v7' ? config.price7v7 : config.price6v6;
          const minutes = pitchSchedule(config, p).minutes;
          return (
            <Card key={p.id} style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
              <Image source={imageSource(p.photo, i)} style={{ width: '100%', height: 170 }} resizeMode="cover" />
              <View style={{ padding: 14 }}>
                <Row>
                  <Text style={[font.h2, { flex: 1 }]}>{p.name}</Text>
                  <Pill label={p.type} color={colors.onAccent} bg={colors.accent} />
                </Row>
                <Text style={[font.small, { marginTop: 4 }]}>
                  {t('about.surface')} : {p.surface || t('about.defaultSurface')}
                  {p.dimensions ? ` · ${t('about.size')} : ${p.dimensions}` : ''}
                </Text>
                {p.description ? <Text style={[font.body, { marginTop: 8, lineHeight: 20 }]}>{p.description}</Text> : null}
                {p.features?.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {p.features.map((f) => (
                      <Pill key={f} label={f} color={colors.accent} bg={colors.accentSoft} icon="checkmark" />
                    ))}
                  </View>
                ) : null}
                <Row style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.accent, fontWeight: '900', fontSize: 16, flex: 1 }}>{t('about.perSlot', { p: price, n: minutes })}</Text>
                  {canBookPitch ? (
                    <Button small label={t('about.bookThis')} icon="calendar" onPress={() => router.push({ pathname: '/book', params: { pitch: p.id } })} />
                  ) : null}
                </Row>
              </View>
            </Card>
          );
        })}
      </Section>
    </Screen>
  );
}

function Info({ icon, label, value, sub, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; sub?: string; onPress?: () => void }) {
  return (
    <Card onPress={onPress} style={{ width: '48.5%', padding: 12, borderRadius: radius.md }}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={[font.tiny, { marginTop: 6, textTransform: 'uppercase' }]}>{label}</Text>
      <Text style={[font.body, { fontWeight: '800', marginTop: 2 }]} numberOfLines={2}>
        {value}
      </Text>
      {sub ? <Text style={font.tiny}>{sub}</Text> : null}
    </Card>
  );
}
