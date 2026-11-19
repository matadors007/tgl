import { useEffect, useState } from 'react';
import type { Booking, SlotDoc } from '../domain/model';
import { useApp } from './AppProvider';
import { COL } from './store';

/** Demandes en attente (toutes dates) — écoute temps réel. */
export function usePendingBookings(): Booking[] {
  const { store } = useApp();
  const [list, setList] = useState<Booking[]>([]);
  useEffect(() => store.watch<Booking>(COL.bookings, [['status', 'pending']], setList), [store]);
  return list;
}

export function useBookingsByDate(date: string): Booking[] {
  const { store } = useApp();
  const [list, setList] = useState<Booking[]>([]);
  useEffect(() => store.watch<Booking>(COL.bookings, [['date', date]], setList), [store, date]);
  return list;
}

export function useSlotsByDate(date: string): SlotDoc[] {
  const { store } = useApp();
  const [list, setList] = useState<SlotDoc[]>([]);
  useEffect(() => store.watch<SlotDoc>(COL.slots, [['date', date]], setList), [store, date]);
  return list;
}

/** Réservations confirmées (toutes dates) — écoute temps réel. */
export function useConfirmedBookings(): Booking[] {
  const { store } = useApp();
  const [list, setList] = useState<Booking[]>([]);
  useEffect(() => store.watch<Booking>(COL.bookings, [['status', 'confirmed']], setList), [store]);
  return list;
}
