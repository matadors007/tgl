import { addDays, toDateKey, type Lang, type Match } from '../domain/model';
import type { TFn } from '../data/AppProvider';

const DAYS = {
  fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const MONTHS = {
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export function parseKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Aujourd'hui", "Demain", ou "sam. 3 oct." */
export function dayLabel(k: string, lang: Lang, t: TFn, now = Date.now()): string {
  const today = toDateKey(new Date(now));
  if (k === today) return t('common.today');
  if (k === addDays(today, 1)) return t('common.tomorrow');
  const d = parseKey(k);
  return lang === 'fr'
    ? `${DAYS.fr[d.getDay()]} ${d.getDate()} ${MONTHS.fr[d.getMonth()]}`
    : `${DAYS.en[d.getDay()]} ${d.getDate()} ${MONTHS.en[d.getMonth()]}`;
}

export function shortDay(k: string, lang: Lang): { dow: string; day: string } {
  const d = parseKey(k);
  return { dow: DAYS[lang][d.getDay()].replace('.', ''), day: String(d.getDate()) };
}

export function shortDate(k: string): string {
  const [, m, d] = k.split('-');
  return `${d}/${m}`;
}

export function timeOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function matchStatusLabel(m: Match, t: TFn): string {
  return t(`match.${m.status}` as Parameters<TFn>[0]);
}

export function relativeMinutes(from: number, now: number): number {
  return Math.max(0, Math.floor((now - from) / 60000));
}

export function phoneLink(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function whatsappLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
}
