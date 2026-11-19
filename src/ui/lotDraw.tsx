import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Team } from '@/domain/model';
import { LOGO } from './brand';
import { TeamBadge } from './football';
import { colors, radius } from './theme';

const SHUFFLE_MIN_MS = 2600;
const native = Platform.OS !== 'web';

/**
 * Tirage au sort animé : les équipes se mélangent (logo qui tourne, noms qui défilent),
 * puis l'ordre tiré apparaît rang par rang.
 */
export function LotDrawModal({
  teams,
  run,
  onClose,
  t,
}: {
  teams: Team[];
  /** Effectue le tirage et renvoie l'ordre des équipes (ids). */
  run: () => Promise<string[]>;
  onClose: (error?: unknown) => void;
  t: (k: 'lot.title' | 'lot.drawing' | 'lot.result' | 'common.close') => string;
}) {
  const [order, setOrder] = useState<Team[]>(teams);
  const [highlight, setHighlight] = useState(0);
  const [result, setResult] = useState<Team[] | null>(null);
  const spin = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;
  const rows = useRef(teams.map(() => new Animated.Value(0))).current;

  // Apparition de la fenêtre et rotation du logo pendant le mélange
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.3)), useNativeDriver: native }).start();
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: native }));
    loop.start();
    return () => loop.stop();
  }, [appear, spin]);

  // Mélange visuel + tirage réel en parallèle (durée minimale pour le suspense)
  useEffect(() => {
    let alive = true;
    const tick = setInterval(() => {
      setHighlight((h) => (h + 1) % teams.length);
      setOrder((o) => [...o].sort(() => Math.random() - 0.5));
    }, 140);
    Promise.all([run(), new Promise((r) => setTimeout(r, SHUFFLE_MIN_MS))])
      .then(([ids]) => {
        if (!alive) return;
        clearInterval(tick);
        const byId = new Map(teams.map((x) => [x.id, x]));
        setResult(ids.map((id) => byId.get(id)).filter((x): x is Team => !!x));
        Animated.stagger(
          380,
          rows.map((v) => Animated.spring(v, { toValue: 1, friction: 6, tension: 80, useNativeDriver: native })),
        ).start();
      })
      .catch((e) => {
        clearInterval(tick);
        if (alive) onClose(e);
      });
    return () => {
      alive = false;
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = appear.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => (result ? onClose() : undefined)}>
      <Animated.View style={[styles.backdrop, { opacity: appear }]}>
        <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale }] }]}>
          <View style={[styles.band, { backgroundColor: colors.accent }]} />
          <Animated.View style={[styles.logoWrap, { backgroundColor: colors.bgElevated, borderColor: colors.accent }, !result && { transform: [{ rotateY: rotate }] }]}>
            <Image source={LOGO} style={{ width: 58, height: 58 }} resizeMode="contain" />
          </Animated.View>
          <Text style={[styles.title, { color: colors.text }]}>{t('lot.title')}</Text>
          <Text style={[styles.sub, { color: colors.muted }]}>{result ? t('lot.result') : t('lot.drawing')}</Text>

          <View style={{ alignSelf: 'stretch', marginTop: 16, gap: 8 }}>
            {result
              ? result.map((team, i) => {
                  const v = rows[i] ?? new Animated.Value(1);
                  return (
                    <Animated.View
                      key={team.id}
                      style={[
                        styles.row,
                        { backgroundColor: i === 0 ? colors.accentSoft : colors.cardAlt, borderColor: i === 0 ? colors.accent : colors.border },
                        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] },
                      ]}
                    >
                      <View style={[styles.rank, { backgroundColor: i === 0 ? colors.accent : colors.border }]}>
                        <Text style={{ fontWeight: '900', color: i === 0 ? '#111' : colors.text }}>{i + 1}</Text>
                      </View>
                      <TeamBadge team={team} size={28} />
                      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                        {team.name}
                      </Text>
                      {i === 0 ? <Ionicons name="trophy" size={18} color={colors.accent} /> : null}
                    </Animated.View>
                  );
                })
              : order.map((team, i) => (
                  <View
                    key={team.id}
                    style={[styles.row, { backgroundColor: colors.cardAlt, borderColor: i === highlight ? colors.accent : colors.border, opacity: i === highlight ? 1 : 0.55 }]}
                  >
                    <View style={[styles.rank, { backgroundColor: colors.border }]}>
                      <Ionicons name="help" size={16} color={colors.muted} />
                    </View>
                    <TeamBadge team={team} size={28} />
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {team.name}
                    </Text>
                    <Ionicons name="shuffle" size={18} color={i === highlight ? colors.accent : colors.faint} />
                  </View>
                ))}
          </View>

          {result ? (
            <Pressable onPress={() => onClose()} style={({ pressed }) => [styles.btn, { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: '#111' }}>{t('common.close')}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.lg, borderWidth: 1, paddingTop: 50, paddingHorizontal: 18, paddingBottom: 18, alignItems: 'center' },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  logoWrap: { position: 'absolute', top: -40, width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1 },
  rank: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 15, fontWeight: '700' },
  btn: { alignSelf: 'stretch', minHeight: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
});
