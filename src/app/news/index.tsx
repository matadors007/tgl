import React, { useEffect, useState } from 'react';
import { useApp } from '@/data/AppProvider';
import { COL } from '@/data/store';
import type { NewsItem } from '@/domain/model';
import { Empty, Screen } from '@/ui/kit';
import { NewsCard } from '@/ui/news';

export default function NewsListScreen() {
  const { t, store } = useApp();
  const [news, setNews] = useState<NewsItem[]>([]);
  useEffect(() => store.watch<NewsItem>(COL.news, [], (r) => setNews(r.sort((a, b) => b.createdAt - a.createdAt))), [store]);
  return (
    <Screen edges={[]}>
      {news.length ? news.map((n) => <NewsCard key={n.id} item={n} />) : <Empty text={t('common.empty')} icon="newspaper-outline" />}
    </Screen>
  );
}
