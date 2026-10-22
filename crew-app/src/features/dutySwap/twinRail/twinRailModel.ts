import { DAY_MS, dayLabel, hhmmOf, isoDay, naiveMs, routeOf, type ApiTaskDetail, type SwapDuty } from '../dutySwapModel';

export const RAIL_ZOOMS = [3, 7, 14] as const;
export type RailZoom = typeof RAIL_ZOOMS[number];

export function zoomForPinch(initial: RailZoom, scale: number): RailZoom {
  if (!Number.isFinite(scale) || scale <= 0) return initial;
  const target = initial / scale;
  return RAIL_ZOOMS.reduce((best, z) => Math.abs(Math.log(z / target)) < Math.abs(Math.log(best / target)) ? z : best, initial);
}

/** Progressive information within the fixed 40pt puck; never change its height. */
export function puckLines(duty: SwapDuty, detail: ApiTaskDetail | undefined, width: number): string[] {
  const code = width < 100 ? duty.code.replace(/\/([A-Z]{2})(\d+)/g, '/$2') : duty.code;
  if (width < 78) return [code];
  const time = `${hhmmOf(duty.startDt)}–${hhmmOf(duty.endDt)}`;
  if (width < 140) return [code, time];
  const start = dayLabel(duty.startDt);
  const heading = `${start.day} ${start.month} · ${code}`;
  const capacity = Math.floor((width - 8) / 6.5);
  const pieces = [routeOf(detail), time, detail ? `BLH ${detail.blh}` : null, detail ? `CRD ${detail.crd}` : null].filter((v): v is string => !!v);
  let line = '';
  for (const piece of pieces) {
    const next = line ? `${line} · ${piece}` : piece;
    if (next.length <= capacity) line = next;
  }
  return [heading, line || time];
}

/** Exact local-time geometry, clipped to the visible window; never split a pairing. */
export function railBlocks(duties: SwapDuty[], start: string, days: number): Array<{ duty: SwapDuty; left: number; width: number; lane: number }> {
  const from = naiveMs(start), span = days * DAY_MS;
  const ends: number[] = [];
  return [...duties].sort((a, b) => a.startDt.localeCompare(b.startDt)).flatMap(duty => {
    const a = Math.max(0, (naiveMs(duty.startDt) - from) / span);
    const b = Math.min(1, (naiveMs(duty.endDt) - from) / span);
    if (a >= 1 || b <= 0 || b <= a) return [];
    let lane = ends.findIndex(end => end <= a);
    if (lane < 0) lane = ends.length;
    ends[lane] = b;
    return [{ duty, left: a, width: b - a, lane }];
  });
}

export function monthDays(month: string): string[] {
  const first = naiveMs(`${month.slice(0, 7)}-01`);
  const start = first - new Date(first).getUTCDay() * DAY_MS;
  return Array.from({ length: 42 }, (_, i) => isoDay(start + i * DAY_MS));
}

export function shiftMonth(month: string, step: number): { startDate: string; endDate: string } {
  const date = new Date(naiveMs(`${month.slice(0, 7)}-01`));
  date.setUTCMonth(date.getUTCMonth() + step);
  const startDate = isoDay(date.getTime());
  date.setUTCMonth(date.getUTCMonth() + 1);
  return { startDate, endDate: isoDay(date.getTime() - DAY_MS) };
}

export function dutiesOn(duties: SwapDuty[], day: string): SwapDuty[] {
  const start = naiveMs(day);
  return duties.filter(d => naiveMs(d.startDt) < start + DAY_MS && naiveMs(d.endDt) > start);
}

export function moveWindow(start: string, step: number, zoom: number, from: string, to: string): string {
  const last = Math.max(naiveMs(from), naiveMs(to) - (zoom - 1) * DAY_MS);
  return isoDay(Math.max(naiveMs(from), Math.min(last, naiveMs(start) + step * DAY_MS)));
}
