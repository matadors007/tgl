import type { PlayerStatus, BookingStatus } from '../domain/model';
import { colors } from './theme';

export const STATUS_COLORS: Record<BookingStatus, { fg: string; bg: string }> = {
  pending: { fg: colors.orange, bg: colors.orangeSoft },
  confirmed: { fg: colors.success, bg: colors.successSoft },
  refused: { fg: colors.red, bg: colors.liveSoft },
  expired: { fg: colors.muted, bg: 'rgba(255,255,255,0.06)' },
  cancelled: { fg: colors.muted, bg: 'rgba(255,255,255,0.06)' },
};

export const PLAYER_STATUS_COLORS: Record<PlayerStatus, { fg: string; bg: string }> = {
  draft: { fg: colors.muted, bg: 'rgba(255,255,255,0.06)' },
  pending: { fg: colors.orange, bg: colors.orangeSoft },
  approved: { fg: colors.success, bg: colors.successSoft },
  rejected: { fg: colors.red, bg: colors.liveSoft },
  removed: { fg: colors.faint, bg: 'rgba(255,255,255,0.04)' },
};
