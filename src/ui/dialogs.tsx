import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LOGO } from './brand';
import { colors, radius } from './theme';

/**
 * Fenêtres de dialogue de l'application (confirmation et information), aux couleurs de Tunisia Golden League.
 * `ask` et `notify` s'utilisent partout ; `<DialogHost />` (monté une fois à la racine) les affiche.
 * Sans hôte monté, on retombe sur les boîtes du système.
 */

type Dialog = {
  id: number;
  title: string;
  message: string;
  okLabel: string;
  cancelLabel?: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
};

let nextId = 1;
let queue: Dialog[] = [];
let listener: ((d: Dialog | null) => void) | null = null;

function emit() {
  listener?.(queue[0] ?? null);
}

function push(d: Omit<Dialog, 'id'>) {
  queue = [...queue, { ...d, id: nextId++ }];
  emit();
}

/** Les actions destructives (supprimer, réinitialiser…) ont un bouton rouge. */
const DANGER = /suppr|delete|réinitialis|reset|effac|retir|remove|annuler le|refus/i;

/** Confirmation Oui/Non. */
export function ask(title: string, message: string, okLabel = 'OK', cancelLabel = 'Annuler', opts: { danger?: boolean } = {}): Promise<boolean> {
  if (!listener) return systemAsk(title, message, okLabel, cancelLabel);
  return new Promise((resolve) => push({ title, message, okLabel, cancelLabel, danger: opts.danger ?? DANGER.test(okLabel), resolve }));
}

/** Information (un seul bouton). */
export function notify(message: string, title = 'Tunisia Golden League'): Promise<void> {
  if (!listener) {
    systemNotify(message, title);
    return Promise.resolve();
  }
  return new Promise((resolve) => push({ title, message, okLabel: 'OK', danger: false, resolve: () => resolve() }));
}

/** Affiche les dialogues les uns après les autres, avec une animation d'entrée et de sortie. */
export function DialogHost() {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [visible, setVisible] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    listener = (d) => {
      setDialog(d);
      if (d) {
        closing.current = false;
        setVisible(true);
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.4)), useNativeDriver: Platform.OS !== 'web' }).start();
      } else setVisible(false);
    };
    emit();
    return () => {
      listener = null;
    };
  }, [anim]);

  const close = (ok: boolean) => {
    if (!dialog || closing.current) return;
    closing.current = true;
    const d = dialog;
    Animated.timing(anim, { toValue: 0, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start(() => {
      queue = queue.filter((x) => x.id !== d.id);
      d.resolve(ok);
      emit();
    });
  };

  if (!dialog) return null;
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const okColor = dialog.danger ? colors.red : colors.accent;
  const single = !dialog.cancelLabel;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={() => close(false)}>
      <Animated.View style={[styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => (single ? close(true) : undefined)} accessibilityLabel={dialog.cancelLabel ?? dialog.okLabel} />
        <Animated.View
          accessibilityRole="alert"
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: anim, transform: [{ scale }] }]}
        >
          <View style={[styles.band, { backgroundColor: colors.accent }]} />
          <View style={[styles.logoWrap, { backgroundColor: colors.bgElevated, borderColor: colors.accent }]}>
            <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{dialog.title}</Text>
          {dialog.message ? <Text style={[styles.message, { color: colors.muted }]}>{dialog.message}</Text> : null}
          <View style={styles.actions}>
            {dialog.cancelLabel ? (
              <Pressable
                onPress={() => close(false)}
                style={({ pressed }) => [styles.btn, { backgroundColor: colors.cardAlt, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
              >
                <Text style={[styles.btnText, { color: colors.text }]}>{dialog.cancelLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => close(true)}
              style={({ pressed }) => [styles.btn, { backgroundColor: okColor, borderColor: okColor, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={[styles.btnText, { color: dialog.danger ? '#fff' : '#111' }]}>{dialog.okLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function systemAsk(title: string, message: string, okLabel: string, cancelLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : true);
  }
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, onPress: () => resolve(true) },
    ]),
  );
}

function systemNotify(message: string, title: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined') window.alert(message);
    return;
  }
  Alert.alert(title, message);
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 400, borderRadius: radius.lg, borderWidth: 1, paddingTop: 44, paddingHorizontal: 22, paddingBottom: 20, alignItems: 'center', overflow: 'visible' },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  logoWrap: { position: 'absolute', top: -34, width: 68, height: 68, borderRadius: 34, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 50, height: 50 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20, alignSelf: 'stretch' },
  btn: { flex: 1, minHeight: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnText: { fontSize: 15, fontWeight: '800' },
});
