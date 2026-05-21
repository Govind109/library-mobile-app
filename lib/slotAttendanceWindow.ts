/** Minutes before slot start/end when punch actions become available. */
export const PUNCH_EARLY_MINUTES = 10;
const DAY_MINUTES = 24 * 60;

function normalizeMinutes(value: number): number {
  return ((value % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

function isWithinDailyWindow(nowM: number, startsM: number, endsM: number, includeEnd = false): boolean {
  const now = normalizeMinutes(nowM);
  const start = normalizeMinutes(startsM);
  const end = normalizeMinutes(endsM);
  if (start === end) return true;
  if (start < end) {
    return includeEnd ? now >= start && now <= end : now >= start && now < end;
  }
  return includeEnd ? now >= start || now <= end : now >= start || now < end;
}

export function slotMinutes(t: string | null | undefined): number {
  const s = String(t ?? '').slice(0, 5);
  const [hh, mm] = s.split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

export function minutesNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function formatMinutesAsHi(t: number): string {
  const normalized = normalizeMinutes(t);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${`${h}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')}`;
}

export function checkInOpensMinutes(slot: { slot_start?: string | null }): number {
  return normalizeMinutes(slotMinutes(slot.slot_start) - PUNCH_EARLY_MINUTES);
}

export function checkOutOpensMinutes(slot: { slot_end?: string | null }): number {
  return normalizeMinutes(slotMinutes(slot.slot_end) - PUNCH_EARLY_MINUTES);
}

export function isCheckInWindow(
  slot: { slot_start?: string | null; slot_end?: string | null },
  nowM = minutesNow(),
): boolean {
  const opens = checkInOpensMinutes(slot);
  const end = slotMinutes(slot.slot_end);
  return isWithinDailyWindow(nowM, opens, end);
}

export function isCheckOutWindow(
  slot: { slot_end?: string | null },
  nowM = minutesNow(),
): boolean {
  const opens = checkOutOpensMinutes(slot);
  const end = slotMinutes(slot.slot_end);
  return isWithinDailyWindow(nowM, opens, end, true);
}

export function sortedSlots<T extends { slot_start?: string | null }>(timeSlots: T[]): T[] {
  return [...timeSlots].sort((a, b) => slotMinutes(a.slot_start) - slotMinutes(b.slot_start));
}

/** Next slot whose check-in window has not opened yet. */
export function findUpcomingSlot<T extends { slot_start?: string | null }>(
  timeSlots: T[],
  nowM = minutesNow(),
): T | null {
  for (const slot of sortedSlots(timeSlots)) {
    if (nowM < checkInOpensMinutes(slot)) {
      return slot;
    }
  }
  return null;
}

export function slotTimingLabel(
  slot: { slot_start?: string | null; slot_end?: string | null; label?: string | null; slot_label?: string | null },
  kind: 'check_in' | 'check_out',
): string {
  const opens =
    kind === 'check_in' ? checkInOpensMinutes(slot) : checkOutOpensMinutes(slot);
  const action = kind === 'check_in' ? 'Check-in' : 'Check-out';
  return `${action} opens at ${formatMinutesAsHi(opens)}`;
}

function timeKey(t: string | null | undefined): string {
  return String(t ?? '').slice(0, 5);
}

/** Consecutive slots where previous end === next start (same seat assumed in sorted list). */
export function partitionSlotChains<T extends { slot_start?: string | null; slot_end?: string | null }>(
  timeSlots: T[],
): T[][] {
  const list = sortedSlots(timeSlots);
  if (!list.length) return [];

  const chains: T[][] = [];
  let current: T[] = [list[0]];
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1];
    const cur = list[i];
    if (timeKey(prev.slot_end) === timeKey(cur.slot_start)) {
      current.push(cur);
    } else {
      chains.push(current);
      current = [cur];
    }
  }
  chains.push(current);

  return chains;
}

export function chainDisplayName(chain: { slot_start?: string | null; slot_end?: string | null; label?: string | null }[]): string {
  if (!chain.length) return '';
  const first = chain[0];
  const last = chain[chain.length - 1];
  if (chain.length === 1) {
    const label = first.label;
    const range =
      first.slot_start && first.slot_end ? `${first.slot_start}–${first.slot_end}` : '';
    return [label, range].filter(Boolean).join(' · ') || 'Time slot';
  }
  return `${chain.length} slots · ${first.slot_start}–${last.slot_end}`;
}

export function isCheckInWindowForChain(
  chain: { slot_start?: string | null; slot_end?: string | null }[],
  nowM = minutesNow(),
): boolean {
  if (!chain.length) return false;
  const first = chain[0];
  const last = chain[chain.length - 1];
  return isWithinDailyWindow(nowM, checkInOpensMinutes(first), slotMinutes(last.slot_end));
}

export function isFullCheckOutWindowForChain(
  chain: { slot_end?: string | null }[],
  nowM = minutesNow(),
): boolean {
  if (!chain.length) return false;
  const last = chain[chain.length - 1];
  return isCheckOutWindow(last, nowM);
}

export function activeChainSegment<T extends { id?: number }>(
  chain: T[],
  todayRows: { seat_time_slot_id?: number | null; punch_in_at?: string | null; punch_out_at?: string | null }[],
): T[] {
  for (let i = 0; i < chain.length; i++) {
    const slot = chain[i];
    const row = todayRows.find((r) => Number(r.seat_time_slot_id) === Number(slot.id));
    const done = Boolean(row?.punch_in_at && row?.punch_out_at);
    if (!done) {
      return chain.slice(i);
    }
  }
  return [];
}

export function segmentFullyDone(
  segment: { id?: number }[],
  todayRows: { seat_time_slot_id?: number | null; punch_in_at?: string | null; punch_out_at?: string | null }[],
): boolean {
  return segment.length > 0 && segment.every((s) => {
    const row = todayRows.find((r) => Number(r.seat_time_slot_id) === Number(s.id));
    return Boolean(row?.punch_in_at && row?.punch_out_at);
  });
}
