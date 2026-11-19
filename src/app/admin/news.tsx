import { Ionicons } from '@expo/vector-icons';
import { Guard } from '@/ui/Guard';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { COL } from '@/data/store';
import type { NewsItem, NewsType } from '@/domain/model';
import { ask, notify } from '@/ui/dialogs';
import { Button, Empty, Field, Screen, Segmented, Sheet } from '@/ui/kit';
import { NEWS_COLOR, NEWS_ICON } from '@/ui/news';
import { colors, font } from '@/ui/theme';

const TYPES: NewsType[] = ['article', 'video', 'gallery', 'award'];

function NewsAdmin() {
  const { t, store, services } = useApp();
  const [list, setList] = useState<NewsItem[]>([]);
  const [edit, setEdit] = useState<Partial<NewsItem> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => store.watch<NewsItem>(COL.news, [], (r) => setList(r.sort((a, b) => b.createdAt - a.createdAt))), [store]);

  const save = async () => {
    if (!edit?.title?.trim() || !edit.body?.trim()) return notify(t('auth.errFields'));
    setBusy(true);
    try {
      await services.saveNews({
        id: edit.id,
        createdAt: edit.createdAt,
        type: edit.type ?? 'article',
        title: edit.title.trim(),
        body: edit.body.trim(),
        imageUrl: edit.imageUrl?.trim() || null,
        videoUrl: edit.videoUrl?.trim() || null,
        matchId: edit.matchId ?? null,
        teamId: edit.teamId ?? null,
      });
      setEdit(null);
    } catch {
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <Button label={t('newsAdmin.new')} icon="add" onPress={() => setEdit({ type: 'article' })} />
      <View style={{ height: 12 }} />
      {!list.length ? <Empty text={t('common.empty')} icon="newspaper-outline" /> : null}
      {list.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => setEdit(n)}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}
        >
          <Ionicons name={NEWS_ICON[n.type]} size={22} color={NEWS_COLOR[n.type]} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
              {n.title}
            </Text>
            <Text style={font.small}>{new Date(n.createdAt).toLocaleDateString()}</Text>
          </View>
          <Pressable
            hitSlop={8}
            onPress={async () => {
              if (await ask(t('common.delete'), n.title, t('common.delete'), t('common.cancel'))) services.deleteNews(n.id);
            }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.red} />
          </Pressable>
        </Pressable>
      ))}

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('common.edit') : t('newsAdmin.new')}>
        {edit ? (
          <View>
            <Text style={[font.small, { marginBottom: 8, fontWeight: '600' }]}>{t('newsAdmin.type')}</Text>
            <Segmented<NewsType>
              value={edit.type ?? 'article'}
              onChange={(v) => setEdit({ ...edit, type: v })}
              options={TYPES.map((x) => ({ value: x, label: t(`news.${x}`) }))}
            />
            <View style={{ height: 12 }} />
            <Field label={t('newsAdmin.titleField')} value={edit.title ?? ''} onChangeText={(v) => setEdit({ ...edit, title: v })} />
            <Field
              label={t('newsAdmin.body')}
              value={edit.body ?? ''}
              onChangeText={(v) => setEdit({ ...edit, body: v })}
              multiline
              style={{ minHeight: 110, textAlignVertical: 'top' }}
            />
            <Field label={t('newsAdmin.image')} value={edit.imageUrl ?? ''} onChangeText={(v) => setEdit({ ...edit, imageUrl: v })} autoCapitalize="none" />
            <Field label={t('newsAdmin.video')} value={edit.videoUrl ?? ''} onChangeText={(v) => setEdit({ ...edit, videoUrl: v })} autoCapitalize="none" />
            <Button label={t('common.save')} icon="save" onPress={save} loading={busy} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

export default function GuardedNewsAdmin() {
  return (
    <Guard allow="news">
      <NewsAdmin />
    </Guard>
  );
}
