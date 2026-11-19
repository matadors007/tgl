import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, Switch, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { deleteUploadedVideo, isApiConfigured, isUploadedVideo, uploadVideo, VIDEO_MAX_MB, VIDEO_TYPES } from '@/data/api';
import { videoSource, videoThumbnail, type Pitch, type ShowcaseItem } from '@/domain/model';
import { Guard } from '@/ui/Guard';
import { ask, notify } from '@/ui/dialogs';
import { Button, Card, Empty, Field, Row, Screen, Section, Segmented, Sheet } from '@/ui/kit';
import { pickImage } from '@/ui/pickImage';
import { imageSource } from '@/ui/showcase';
import { colors, font, radius } from '@/ui/theme';

type Tab = 'slides' | 'videos' | 'about';

/** Administration → Vitrine : carrousel d'accueil, vidéos publicitaires, page « À propos ». */
function ShowcaseAdmin() {
  const { t } = useApp();
  const [tab, setTab] = useState<Tab>('slides');
  return (
    <Screen edges={['bottom']}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'slides', label: t('showcase.tabSlides') },
          { value: 'videos', label: t('showcase.tabVideos') },
          { value: 'about', label: t('showcase.tabAbout') },
        ]}
      />
      {tab === 'about' ? <AboutTab /> : <ItemsTab kind={tab === 'slides' ? 'slide' : 'video'} />}
    </Screen>
  );
}

/** Choix d'une photo : galerie du téléphone ou lien. */
export function PhotoPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useApp();
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    setBusy(true);
    try {
      const img = await pickImage();
      if (img) onChange(img);
    } catch {
      notify(t('showcase.photoErr'));
    } finally {
      setBusy(false);
    }
  };
  const isData = value.startsWith('data:');
  return (
    <View style={{ marginBottom: 6 }}>
      {value ? (
        <View style={{ marginBottom: 10 }}>
          <Image source={{ uri: value }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.cardAlt }} resizeMode="cover" />
          <Pressable onPress={() => onChange('')} style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, padding: 6 }}>
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>
        </View>
      ) : null}
      <Button label={t('showcase.pickPhoto')} icon="image" variant="secondary" onPress={pick} loading={busy} />
      <View style={{ height: 10 }} />
      <Field label={t('showcase.orUrl')} value={isData ? '' : value} onChangeText={onChange} autoCapitalize="none" placeholder="https://…" />
    </View>
  );
}

/** Type de la vidéo choisie (le PC ne le donne pas toujours : déduit de l'extension). */
function videoType(name: string, mime?: string | null): string | null {
  if (mime && VIDEO_TYPES.includes(mime)) return mime;
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'mp4' || ext === 'm4v' ? 'video/mp4' : ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : null;
}

/** Bouton « Importer depuis l'ordinateur » : envoi au serveur avec progression, puis lien rempli automatiquement. */
function VideoUploader({ onUploaded, onBusy }: { onUploaded: (url: string, name: string) => void; onBusy: (b: boolean) => void }) {
  const { t } = useApp();
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const abort = useRef<{ cancel?: () => void }>({});

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: Platform.OS === 'web' ? VIDEO_TYPES.join(',') + ',.mov,.m4v' : 'video/*', multiple: false });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    const type = videoType(asset.name ?? '', asset.mimeType);
    if (!type) return notify(t('showcase.uploadType'));
    if (asset.size && asset.size > VIDEO_MAX_MB * 1024 * 1024) return notify(t('showcase.uploadTooBig', { n: VIDEO_MAX_MB }));
    setFileName(asset.name ?? '');
    setProgress(0);
    onBusy(true);
    try {
      // Site : le fichier lui-même ; téléphone : lu depuis son adresse locale
      const blob: Blob = (asset as { file?: File }).file ?? (await (await fetch(asset.uri)).blob());
      abort.current = {};
      const url = await uploadVideo(blob, type, setProgress, abort.current);
      onUploaded(url, asset.name ?? '');
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== 'aborted')
        notify(
          code === 'too-large'
            ? t('showcase.uploadTooBig', { n: VIDEO_MAX_MB })
            : code === 'unsupported-type'
              ? t('showcase.uploadType')
              : t('showcase.uploadErr'),
        );
    } finally {
      setProgress(null);
      onBusy(false);
    }
  };

  if (progress !== null) {
    const pct = Math.round(progress * 100);
    return (
      <View style={{ marginBottom: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border }}>
        <Row style={{ marginBottom: 8 }}>
          <Ionicons name="cloud-upload" size={18} color={colors.accent} />
          <Text style={[font.small, { flex: 1, marginLeft: 8, fontWeight: '700' }]} numberOfLines={1}>
            {t('showcase.uploading', { p: pct })} · {fileName}
          </Text>
        </Row>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.accent }} />
        </View>
        <Button small variant="ghost" label={t('common.cancel')} icon="close" onPress={() => abort.current.cancel?.()} style={{ marginTop: 8 }} />
      </View>
    );
  }
  return (
    <View style={{ marginBottom: 12 }}>
      <Button label={t('showcase.uploadVideo')} icon="cloud-upload" variant="secondary" onPress={pick} />
      <Text style={[font.tiny, { marginTop: 6 }]}>{t('showcase.uploadHint', { n: VIDEO_MAX_MB })}</Text>
    </View>
  );
}

function ItemsTab({ kind }: { kind: 'slide' | 'video' }) {
  const { t, showcase, services } = useApp();
  const items = showcase.filter((i) => i.kind === kind);
  const [edit, setEdit] = useState<Partial<ShowcaseItem> | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** Vidéo envoyée pendant cette édition mais pas encore enregistrée (supprimée si on abandonne). */
  const pendingUpload = useRef<string | null>(null);

  const dropPending = (keep?: string | null) => {
    if (pendingUpload.current && pendingUpload.current !== keep) void deleteUploadedVideo(pendingUpload.current);
    pendingUpload.current = null;
  };
  const closeSheet = () => {
    if (uploading) return;
    dropPending();
    setEdit(null);
  };

  const save = async () => {
    if (!edit) return;
    if (kind === 'slide' && !edit.image) return notify(t('showcase.needImage'));
    if (kind === 'video' && !videoSource(edit.videoUrl)) return notify(t('showcase.invalidVideo'));
    if (kind === 'video' && !edit.title?.trim()) return notify(t('auth.errFields'));
    setBusy(true);
    try {
      const previous = edit.id ? items.find((i) => i.id === edit.id)?.videoUrl : null;
      const nextUrl = kind === 'video' ? edit.videoUrl?.trim() ?? null : null;
      await services.saveShowcase({
        id: edit.id,
        createdAt: edit.createdAt,
        kind,
        title: edit.title?.trim() ?? '',
        subtitle: edit.subtitle?.trim() || null,
        image: edit.image || null,
        videoUrl: kind === 'video' ? edit.videoUrl?.trim() : null,
        order: edit.order ?? (items.length ? Math.max(...items.map((i) => i.order)) + 1 : 0),
        active: edit.active ?? true,
      });
      // Vidéo remplacée : l'ancien fichier hébergé est supprimé ; une vidéo envoyée puis remplacée par un lien aussi
      if (previous && previous !== nextUrl) void deleteUploadedVideo(previous);
      dropPending(nextUrl);
      setEdit(null);
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const move = async (i: number, dir: -1 | 1) => {
    const a = items[i];
    const b = items[i + dir];
    if (!a || !b) return;
    // Échange des positions (si égales, on force un ordre distinct)
    const oa = a.order === b.order ? i : a.order;
    const ob = a.order === b.order ? i + dir : b.order;
    await Promise.all([services.saveShowcase({ ...a, order: ob }), services.saveShowcase({ ...b, order: oa })]);
  };

  const remove = async (it: ShowcaseItem) => {
    if (!(await ask(t('common.delete'), it.title || '', t('common.delete'), t('common.cancel')))) return;
    await services.deleteShowcase(it.id);
    void deleteUploadedVideo(it.videoUrl);
  };

  return (
    <Section>
      <Button
        label={kind === 'slide' ? t('showcase.addSlide') : t('showcase.addVideo')}
        icon="add"
        onPress={() => setEdit({ title: '', subtitle: '', image: '', videoUrl: '' })}
      />
      {kind === 'slide' && !items.length ? <Text style={[font.small, { marginTop: 10 }]}>{t('showcase.defaultsInfo')}</Text> : null}
      {kind === 'video' && !items.length ? <Empty text={t('videos.empty')} icon="play-circle-outline" /> : null}
      <View style={{ marginTop: 12 }}>
        {items.map((it, i) => {
          const thumb = kind === 'video' ? videoThumbnail(it) : it.image;
          return (
            <Card key={it.id} style={{ marginBottom: 8, padding: 10 }} onPress={() => setEdit(it)}>
              <Row>
                <View style={{ width: 96, aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                  {thumb ? <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Ionicons name="play" size={22} color={colors.accent} />}
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
                    {it.title || '—'}
                  </Text>
                  {it.subtitle ? (
                    <Text style={font.tiny} numberOfLines={1}>
                      {it.subtitle}
                    </Text>
                  ) : null}
                  <Row style={{ marginTop: 6, gap: 14 }}>
                    <Pressable onPress={() => move(i, -1)} disabled={i === 0} hitSlop={8}>
                      <Ionicons name="arrow-up" size={18} color={i === 0 ? colors.faint : colors.text} />
                    </Pressable>
                    <Pressable onPress={() => move(i, 1)} disabled={i === items.length - 1} hitSlop={8}>
                      <Ionicons name="arrow-down" size={18} color={i === items.length - 1 ? colors.faint : colors.text} />
                    </Pressable>
                    <Pressable onPress={() => remove(it)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.red} />
                    </Pressable>
                  </Row>
                </View>
                <Switch
                  value={it.active}
                  onValueChange={(v) => { services.saveShowcase({ ...it, active: v }).catch(() => notify(t("common.error"))); }}
                  trackColor={{ true: colors.accent, false: colors.border }}
                />
              </Row>
            </Card>
          );
        })}
      </View>

      <Sheet visible={!!edit} onClose={closeSheet} title={kind === 'slide' ? t('showcase.addSlide') : t('showcase.addVideo')}>
        {edit ? (
          <View>
            {kind === 'video' && isApiConfigured ? (
              <VideoUploader
                onBusy={setUploading}
                onUploaded={(url, name) => {
                  dropPending();
                  pendingUpload.current = url;
                  setEdit((e) => (e ? { ...e, videoUrl: url, title: e.title?.trim() ? e.title : name.replace(/\.[^.]+$/, '') } : e));
                }}
              />
            ) : null}
            {kind === 'video' && isUploadedVideo(edit.videoUrl) ? (
              <Row style={{ marginBottom: 12, gap: 8 }}>
                <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                <Text style={[font.small, { flex: 1, fontWeight: '700' }]}>{t('showcase.uploadDone')}</Text>
              </Row>
            ) : null}
            {kind === 'video' ? (
              <Field label={t('showcase.videoUrl')} value={edit.videoUrl ?? ''} onChangeText={(v) => setEdit({ ...edit, videoUrl: v })} autoCapitalize="none" placeholder="https://youtu.be/…" />
            ) : null}
            <Field label={t('showcase.title')} value={edit.title ?? ''} onChangeText={(v) => setEdit({ ...edit, title: v })} />
            <Field label={t('showcase.subtitle')} value={edit.subtitle ?? ''} onChangeText={(v) => setEdit({ ...edit, subtitle: v })} />
            {kind === 'video' ? <Text style={[font.small, { marginBottom: 8 }]}>{t('showcase.thumbHint')}</Text> : null}
            <PhotoPicker value={edit.image ?? ''} onChange={(v) => setEdit({ ...edit, image: v })} />
            <Button label={t('common.save')} icon="save" onPress={save} loading={busy} disabled={uploading} />
          </View>
        ) : null}
      </Sheet>
    </Section>
  );
}

function AboutTab() {
  const { t, config, pitches, services } = useApp();
  const [aboutText, setAbout] = useState(config.aboutText);
  const [address, setAddress] = useState(config.address);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setAbout(config.aboutText);
    setAddress(config.address);
  }, [config.aboutText, config.address]);

  const saveGeneral = async () => {
    setBusy(true);
    try {
      await services.saveConfig({ ...config, aboutText: aboutText.trim(), address: address.trim() });
      notify(t('showcase.saved'));
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section>
        <Card>
          <Field label={t('showcase.aboutText')} value={aboutText} onChangeText={setAbout} multiline style={{ minHeight: 110, textAlignVertical: 'top' }} />
          <Field label={t('showcase.address')} value={address} onChangeText={setAddress} />
          <Button label={t('common.save')} icon="save" onPress={saveGeneral} loading={busy} />
        </Card>
      </Section>
      <Section title={t('about.pitches')}>
        {pitches.map((p, i) => (
          <PitchAbout key={p.id} pitch={p} index={i} />
        ))}
      </Section>
    </>
  );
}

function PitchAbout({ pitch, index }: { pitch: Pitch; index: number }) {
  const { t, services } = useApp();
  const [form, setForm] = useState({
    description: pitch.description ?? '',
    surface: pitch.surface ?? '',
    dimensions: pitch.dimensions ?? '',
    features: (pitch.features ?? []).join(', '),
    photo: pitch.photo ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await services.savePitch({
        ...pitch,
        description: form.description.trim() || null,
        surface: form.surface.trim() || null,
        dimensions: form.dimensions.trim() || null,
        features: form.features
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        photo: form.photo || null,
      });
      notify(t('showcase.saved'));
      setOpen(false);
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen(!open)}>
        <Image source={imageSource(form.photo, index)} style={{ width: '100%', height: 120 }} resizeMode="cover" />
        <Row style={{ padding: 12 }}>
          <Text style={[font.h3, { flex: 1 }]}>
            {pitch.name} · {pitch.type}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'create-outline'} size={18} color={colors.accent} />
        </Row>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          <Text style={[font.small, { marginBottom: 8 }]}>{t('showcase.pitchPhoto')}</Text>
          <PhotoPicker value={form.photo} onChange={(v) => setForm({ ...form, photo: v })} />
          <Field label={t('showcase.pitchDesc')} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
          <Field label={t('showcase.surface')} value={form.surface} onChangeText={(v) => setForm({ ...form, surface: v })} placeholder={t('about.defaultSurface')} />
          <Field label={t('showcase.dimensions')} value={form.dimensions} onChangeText={(v) => setForm({ ...form, dimensions: v })} />
          <Field label={t('showcase.features')} value={form.features} onChangeText={(v) => setForm({ ...form, features: v })} placeholder="Éclairage LED, Vestiaires, Douches" />
          <Button label={t('common.save')} icon="save" onPress={save} loading={busy} />
        </View>
      ) : null}
    </Card>
  );
}

export default function ShowcaseScreen() {
  return (
    <Guard allow="showcase">
      <ShowcaseAdmin />
    </Guard>
  );
}
