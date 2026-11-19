import { toDateKey } from '../domain/model';
export { dayLabel } from './format';

export function toDateKeySafe(ms: number): string {
  return toDateKey(new Date(ms));
}
