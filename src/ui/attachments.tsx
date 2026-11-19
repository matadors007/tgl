import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useApp } from '../data/AppProvider';
import type { FileKind, StoredFile } from '../domain/model';
import { printDataUri } from '../print/printing';
import { notify } from './dialogs';
import { Button, Row } from './kit';
import { colors, font, radius } from './theme';

/** Taille max d'un PDF (la pièce est stockée dans la base, limitée à 1 Mo par document). */
const MAX_PDF_BYTES = 700_000;

type Picked = Pick<StoredFile, 'mime' | 'name' | 'size' | 'data'>;

async function compressImage(uri: string, width: number, maxWidth: number): Promise<Picked | null> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width > maxWidth) ctx.resize({ width: maxWidth });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.62, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) return null;
  const data = `data:image/jpeg;base64,${out.base64}`;
  return { mime: 'image/jpeg', name: 'photo.jpg', size: Math.round(out.base64.length * 0.75), data };
}

/** Choisit une pièce jointe : photo de la galerie, appareil photo ou PDF. */
export async function pickAttachment(source: 'gallery' | 'camera' | 'pdf', maxWidth = 1400): Promise<Picked | null> {
  if (source === 'pdf') {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], base64: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return null;
    const a = res.assets[0];
    const mime = a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    if (mime.startsWith('image/')) return compressImage(a.uri, 4000, maxWidth);
    if ((a.size ?? 0) > MAX_PDF_BYTES) throw new Error('tooBig');
    let b64 = a.base64 ?? '';
    if (!b64 && Platform.OS !== 'web') b64 = await new File(a.uri).base64();
    if (b64.startsWith('data:')) b64 = b64.split(',')[1] ?? '';
    if (!b64) return null;
    if (b64.length * 0.75 > MAX_PDF_BYTES) throw new Error('tooBig');
    return { mime: 'application/pdf', name: a.name, size: Math.round(b64.length * 0.75), data: `data:application/pdf;base64,${b64}` };
  }
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('permission');
  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return compressImage(a.uri, a.width ?? maxWidth + 1, maxWidth);
}

// Petit cache mémoire : les pièces ne changent pas (une nouvelle pièce = un nouvel identifiant)
const cache = new Map<string, StoredFile>();

/** Charge une pièce jointe par son identifiant. */
export function useStoredFile(id?: string | null): StoredFile | null {
  const { services } = useApp();
  const [file, setFile] = useState<StoredFile | null>(id ? cache.get(id) ?? null : null);
  useEffect(() => {
    if (!id) return setFile(null);
    if (cache.has(id)) return setFile(cache.get(id)!);
    let alive = true;
    services
      .getFile(id)
      .then((f) => {
        if (f) cache.set(id, f);
        if (alive) setFile(f);
      })
      .catch(() => alive && setFile(null));
    return () => {
      alive = false;
    };
  }, [id, services]);
  return file;
}

export function rememberFile(f: StoredFile) {
  cache.set(f.id, f);
}

/** Aperçu plein écran d'une pièce (image ou PDF) avec impression. */
export function FilePreview({ file, onClose, title }: { file: StoredFile | null; onClose: () => void; title?: string }) {
  const { t } = useApp();
  if (!file) return null;
  const isPdf = file.mime === 'application/pdf';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', padding: 16, paddingTop: 40 }}>
        <Row style={{ marginBottom: 10 }}>
          <Text style={[font.h3, { flex: 1, color: '#fff' }]} numberOfLines={1}>
            {title ?? file.name}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </Row>
        <View style={{ flex: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
          {isPdf ? (
            Platform.OS === 'web' ? (
              React.createElement('iframe', { src: file.data, style: { border: 'none', width: '100%', height: '100%', background: '#fff' } })
            ) : (
              <View style={{ alignItems: 'center', padding: 20 }}>
                <Ionicons name="document-text" size={64} color={colors.accent} />
                <Text style={[font.body, { marginTop: 10, textAlign: 'center' }]}>{file.name}</Text>
                <Text style={[font.small, { marginTop: 4, textAlign: 'center' }]}>{t('files.pdfHint')}</Text>
              </View>
            )
          ) : (
            <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} style={{ width: '100%' }}>
              <Image source={{ uri: file.data }} style={{ width: '100%', aspectRatio: 0.75 }} resizeMode="contain" />
            </ScrollView>
          )}
        </View>
        <Button
          label={isPdf && Platform.OS !== 'web' ? t('files.openPrint') : t('files.print')}
          icon="print"
          style={{ marginTop: 12 }}
          onPress={() => printDataUri(file.data, file.mime, title ?? file.name).catch(() => notify(t('common.error')))}
        />
      </View>
    </Modal>
  );
}

/** Vignette d'une pièce jointe (cliquable : aperçu). */
export function FileThumb({ id, label, size = 64, missingLabel }: { id?: string | null; label: string; size?: number; missingLabel?: string }) {
  const file = useStoredFile(id);
  const [open, setOpen] = useState(false);
  const isPdf = file?.mime === 'application/pdf';
  return (
    <Pressable disabled={!file} onPress={() => setOpen(true)} style={{ width: size + 10, alignItems: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: id ? colors.accent : colors.red,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {file && !isPdf ? <Image source={{ uri: file.data }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
        {isPdf ? <Ionicons name="document-text" size={size * 0.45} color={colors.accent} /> : null}
        {!id ? <Ionicons name="alert" size={size * 0.4} color={colors.red} /> : null}
        {id && !file ? <Ionicons name="hourglass" size={size * 0.3} color={colors.faint} /> : null}
      </View>
      <Text style={[font.tiny, { textAlign: 'center', marginTop: 3, color: id ? colors.muted : colors.red }]} numberOfLines={2}>
        {id ? label : missingLabel ?? label}
      </Text>
      {open ? <FilePreview file={file} title={label} onClose={() => setOpen(false)} /> : null}
    </Pressable>
  );
}

/**
 * Champ de pièce jointe : ajouter (galerie / photo / PDF), voir, remplacer, retirer.
 * La pièce est enregistrée tout de suite et son identifiant renvoyé par onChange.
 */
export function AttachmentField({
  label,
  hint,
  fileId,
  onChange,
  kind,
  teamId,
  required,
  imageOnly,
  maxWidth,
}: {
  label: string;
  hint?: string;
  fileId?: string | null;
  onChange: (id: string | null) => void;
  kind: FileKind;
  teamId: string;
  required?: boolean;
  imageOnly?: boolean;
  maxWidth?: number;
}) {
  const { t, services, user } = useApp();
  const file = useStoredFile(fileId);
  const [busy, setBusy] = useState(false);
  const [choose, setChoose] = useState(false);
  const [open, setOpen] = useState(false);

  const pick = async (source: 'gallery' | 'camera' | 'pdf') => {
    setChoose(false);
    setBusy(true);
    try {
      const p = await pickAttachment(source, maxWidth);
      if (!p) return;
      const id = await services.saveFile({ ...p, kind, teamId, ownerId: user?.id ?? '' });
      rememberFile({ ...p, id, kind, teamId, ownerId: user?.id ?? '', createdAt: Date.now() });
      onChange(id);
    } catch (e) {
      const m = (e as Error).message;
      notify(m === 'tooBig' ? t('files.tooBig') : m === 'permission' ? t('showcase.photoErr') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Row>
        <Pressable
          onPress={() => (file ? setOpen(true) : setChoose(true))}
          style={{
            width: 56,
            height: 56,
            borderRadius: 8,
            overflow: 'hidden',
            backgroundColor: colors.cardAlt,
            borderWidth: 1,
            borderColor: fileId ? colors.success : required ? colors.orange : colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          {file && file.mime !== 'application/pdf' ? <Image source={{ uri: file.data }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
          {file?.mime === 'application/pdf' ? <Ionicons name="document-text" size={26} color={colors.accent} /> : null}
          {!fileId ? <Ionicons name={imageOnly ? 'camera' : 'attach'} size={24} color={colors.faint} /> : null}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[font.body, { fontWeight: '700' }]}>
            {label}
            {required ? <Text style={{ color: colors.orange }}> *</Text> : null}
          </Text>
          <Text style={[font.tiny, { color: fileId ? colors.success : colors.muted }]}>{fileId ? `✓ ${t('files.added')}` : hint ?? t('files.none')}</Text>
        </View>
        {fileId ? (
          <Pressable onPress={() => onChange(null)} hitSlop={10} style={{ padding: 6 }} accessibilityLabel={t('common.delete')}>
            <Ionicons name="trash-outline" size={20} color={colors.red} />
          </Pressable>
        ) : null}
        <Button label={fileId ? t('files.replace') : t('files.add')} small variant="secondary" loading={busy} onPress={() => setChoose(!choose)} />
      </Row>
      {choose ? (
        <Row style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Button small label={t('files.gallery')} icon="images" variant="ghost" onPress={() => pick('gallery')} />
          {Platform.OS !== 'web' ? <Button small label={t('files.camera')} icon="camera" variant="ghost" onPress={() => pick('camera')} /> : null}
          {!imageOnly ? <Button small label={t('files.pdf')} icon="document-text" variant="ghost" onPress={() => pick('pdf')} /> : null}
        </Row>
      ) : null}
      {open ? <FilePreview file={file} title={label} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}
