import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, Switch, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
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

function ItemsTab({ kind }: { kind: 'slide' | 'video' }) {
  const { t, showcase, services } = useApp();
  const items = showcase.filter((i) => i.kind === kind);
  const [edit, setEdit] = useState<Partial<ShowcaseItem> | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit) return;
    if (kind === 'slide' && !edit.image) return notify(t('showcase.needImage'));
    if (kind === 'video' && !videoSource(edit.videoUrl)) return notify(t('showcase.invalidVideo'));
    if (kind === 'video' && !edit.title?.trim()) return notify(t('auth.errFields'));
    setBusy(true);
    try {
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

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={kind === 'slide' ? t('showcase.addSlide') : t('showcase.addVideo')}>
        {edit ? (
          <View>
            {kind === 'video' ? (
              <Field label={t('showcase.videoUrl')} value={edit.videoUrl ?? ''} onChangeText={(v) => setEdit({ ...edit, videoUrl: v })} autoCapitalize="none" placeholder="https://youtu.be/…" />
            ) : null}
            <Field label={t('showcase.title')} value={edit.title ?? ''} onChangeText={(v) => setEdit({ ...edit, title: v })} />
            <Field label={t('showcase.subtitle')} value={edit.subtitle ?? ''} onChangeText={(v) => setEdit({ ...edit, subtitle: v })} />
            {kind === 'video' ? <Text style={[font.small, { marginBottom: 8 }]}>{t('showcase.thumbHint')}</Text> : null}
            <PhotoPicker value={edit.image ?? ''} onChange={(v) => setEdit({ ...edit, image: v })} />
            <Button label={t('common.save')} icon="save" onPress={save} loading={busy} />
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
