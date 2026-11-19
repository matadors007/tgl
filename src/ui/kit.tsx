import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, radius, space, themedStyles } from './theme';
import { useWideWeb, WebFooter } from './web';
import { Loader } from './Loader';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  // Site web : contenu centré, plus large sur ordinateur, avec pied de page
  const wide = useWideWeb();
  const web = Platform.OS === 'web' ? ({ width: '100%', maxWidth: wide ? 1240 : 980, alignSelf: 'center' } as const) : null;
  const pad = wide ? { paddingHorizontal: 32, paddingTop: 28, paddingBottom: 32 } : { padding: space.lg, paddingBottom: 40 };
  const inner = [padded ? pad : { paddingBottom: 40 }, web];
  return (
    <SafeAreaView style={styles.screen} edges={wide ? [] : edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled">
          {children}
          {wide ? <WebFooter /> : null}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padded && { padding: space.lg }, web]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Écran complet, ou simple bloc quand le contenu est intégré dans un onglet (ex. « Réservations »). */
export function MaybeScreen({ embedded, edges = [], children }: { embedded?: boolean; edges?: ('top' | 'bottom')[]; children: React.ReactNode }) {
  if (embedded) return <View>{children}</View>;
  return <Screen edges={edges}>{children}</Screen>;
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={font.h1}>{title}</Text>
        {subtitle ? <Text style={[font.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Section({ title, right, children, style }: { title?: string; right?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: space.lg }, style]}>
      {title ? (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }, style]}>
        {children}
      </Pressable>
    );
  return <View style={[styles.card, style]}>{children}</View>;
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  small,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const bg: Record<BtnVariant, string> = {
    primary: colors.accent,
    secondary: colors.cardAlt,
    danger: colors.red,
    ghost: 'transparent',
    warning: colors.orange,
  };
  const fg = variant === 'secondary' || variant === 'ghost' ? colors.text : colors.onAccent;
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg[variant] },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.border },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 15 : 18} color={fg} style={{ marginRight: 6 }} /> : null}
          <Text style={[styles.btnText, small && { fontSize: 13 }, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  scroll,
}: {
  options: { value: T; label: string; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
  scroll?: boolean;
}) {
  const content = options.map((o) => {
    const active = o.value === value;
    return (
      <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.seg, active && styles.segActive]}>
        <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
        {o.badge ? (
          <View style={styles.segBadge}>
            <Text style={styles.segBadgeText}>{o.badge}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  });
  if (scroll)
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {content}
      </ScrollView>
    );
  return <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{content}</View>;
}

export function Pill({ label, color = colors.muted, bg, icon }: { label: string; color?: string; bg?: string; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg ?? 'rgba(255,255,255,0.06)' }]}>
      {icon ? <Ionicons name={icon} size={11} color={color} style={{ marginRight: 4 }} /> : null}
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

/** Point rouge "LIVE" qui pulse. */
export function LiveDot() {
  const v = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.25, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[styles.liveDot, { opacity: v }]} />;
}

export function Empty({ text, icon = 'football-outline' }: { text: string; icon?: IconName }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={32} color={colors.faint} />
      <Text style={[font.small, { marginTop: 8, textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.faint} style={[styles.input, style]} {...props} />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export function ListItem({
  icon,
  title,
  subtitle,
  onPress,
  right,
  badge,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  badge?: number;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.listItem, pressed && { opacity: 0.75 }]}>
      {icon ? (
        <View style={styles.listIcon}>
          <Ionicons name={icon} size={20} color={colors.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={font.h3}>{title}</Text>
        {subtitle ? <Text style={[font.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={[styles.segBadge, { marginRight: 8 }]}>
          <Text style={styles.segBadgeText}>{badge}</Text>
        </View>
      ) : null}
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null)}
    </Pressable>
  );
}

/** Feuille modale en bas d'écran. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={[font.h2, { flex: 1 }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Grille de choix (joueurs, équipes…) dans une feuille modale. */
export function ChoiceGrid<T>({
  items,
  keyOf,
  labelOf,
  sublabelOf,
  onPick,
  selected,
  disabledOf,
}: {
  items: T[];
  keyOf: (x: T) => string;
  labelOf: (x: T) => string;
  sublabelOf?: (x: T) => string | undefined;
  onPick: (x: T) => void;
  selected?: (x: T) => boolean;
  disabledOf?: (x: T) => boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((x) => {
        const sel = selected?.(x);
        const dis = disabledOf?.(x);
        return (
          <Pressable
            key={keyOf(x)}
            disabled={dis}
            onPress={() => onPick(x)}
            style={({ pressed }) => [
              styles.choice,
              sel && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
              dis && { opacity: 0.35 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[font.h3, { fontSize: 14 }]} numberOfLines={1}>
              {labelOf(x)}
            </Text>
            {sublabelOf?.(x) ? (
              <Text style={font.tiny} numberOfLines={1}>
                {sublabelOf(x)}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Chargement plein écran : loader animé du logo. */
export function Loading() {
  return <Loader />;
}

export const styles = themedStyles(() =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
  sectionTitle: { ...font.small, flex: 1, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  btn: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmall: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.sm },
  btnText: { fontSize: 15, fontWeight: '700' },
  seg: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  segActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  segTextActive: { color: colors.onAccent },
  segBadge: {
    marginLeft: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.live,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segBadgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '700' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live, marginRight: 5 },
  empty: { alignItems: 'center', paddingVertical: 32 },
  fieldLabel: { ...font.small, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  listIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: space.lg,
    maxHeight: '88%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  choice: {
    minWidth: '47%',
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  }),
);
