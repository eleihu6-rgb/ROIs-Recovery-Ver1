// R'Bot inside Duty Swap (Concept D, spec §6). Its three jobs here:
//  1. help the crew find the target crew to swap with,
//  2. see what is on the screen (a compact snapshot of the matrix),
//  3. take the crew's words and change the search / crews / picked duties.
// It never submits a swap — the crew presses "Check legality & send".
//
// Local-first like the rest of R'Bot (localAnswers.ts): the common requests are
// understood on the phone (instant, nothing leaves the device); anything else
// goes to `/ai/crew/chat` with the snapshot, whose swap tools return the same
// actions. Both paths are applied by `applySwapActions`.
import type {
  RbotAction, RbotSwapAction, RbotSwapSearchFields, RbotSwapSelectAction,
} from '../rbot/types';
import {
  dayLabel, detailFor, emptyFilters, fleetsOf, routeOf, toCrews,
  type ApiCompare, type SwapCrew, type SwapDuty, type SwapFilters,
} from './dutySwapModel';

// ── Parsing (whitelist, like parseRbotAction) ──────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_FIELDS = ['durationStart', 'durationEnd', 'crdStart', 'crdEnd', 'blhStart', 'blhEnd', 'briefStart', 'briefEnd',
  'debriefStart', 'debriefEnd', 'layoverTimeStart', 'layoverTimeEnd'] as const;
const LIST_FIELDS = ['taskTypeList', 'layoverPortList', 'fltNumList', 'fltArrList', 'fltFleetList', 'activeRankList'] as const;

const strList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().toUpperCase()) : undefined;

export function parseSwapFields(raw: unknown): RbotSwapSearchFields | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: RbotSwapSearchFields = {};
  if (r.swapMode === 'NS' || r.swapMode === 'FS') out.swapMode = r.swapMode;
  for (const k of ['startDate', 'endDate'] as const) {
    if (typeof r[k] === 'string' && DATE_RE.test(r[k] as string)) out[k] = r[k] as string;
  }
  for (const k of TEXT_FIELDS) {
    const v = r[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = String(v);
    else if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  for (const k of LIST_FIELDS) { const v = strList(r[k]); if (v?.length) out[k] = v; }
  if (typeof r.filterEmptyDutyCrew === 'boolean') out.filterEmptyDutyCrew = r.filterEmptyDutyCrew;
  return out;
}

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[A-Z0-9]{2,10}$/i.test(x)) : undefined);

export function parseSwapAction(a: Record<string, unknown>): RbotSwapAction | null {
  const label = typeof a.label === 'string' && a.label.trim() ? a.label : undefined;
  if (a.type === 'set_swap_search') {
    const fields = parseSwapFields(a.fields);
    if (!fields || (!Object.keys(fields).length && a.reset !== true)) return null;
    if (fields.startDate && fields.endDate && fields.startDate > fields.endDate) return null;
    const wantKind = a.wantKind === 'standby' || a.wantKind === 'fly' ? a.wantKind : undefined;
    return { type: 'set_swap_search', fields, ...(a.reset === true ? { reset: true } : {}), ...(wantKind ? { wantKind } : {}), ...(label ? { label } : {}) };
  }
  if (a.type === 'set_swap_crews') {
    const only = ids(a.only), add = ids(a.add), remove = ids(a.remove);
    const addWhere = a.addWhere ? parseSwapFields(a.addWhere) : null;
    if (!only?.length && !add?.length && !remove?.length && !(addWhere && Object.keys(addWhere).length)) return null;
    return {
      type: 'set_swap_crews',
      ...(only?.length ? { only } : {}), ...(add?.length ? { add } : {}), ...(remove?.length ? { remove } : {}),
      ...(addWhere && Object.keys(addWhere).length ? { addWhere } : {}), ...(label ? { label } : {}),
    };
  }
  if (a.type === 'select_swap_duties') {
    const pick = (v: unknown) => (Array.isArray(v) ? v : []).flatMap(x => {
      if (!x || typeof x !== 'object') return [];
      const o = x as Record<string, unknown>;
      const date = typeof o.date === 'string' && DATE_RE.test(o.date) ? o.date : undefined;
      const code = typeof o.code === 'string' && o.code.trim() ? o.code.trim().toUpperCase() : undefined;
      return date || code ? [{ date, code, crewId: typeof o.crewId === 'string' ? o.crewId : undefined }] : [];
    });
    const give = pick(a.give).map(({ date, code }) => ({ ...(date ? { date } : {}), ...(code ? { code } : {}) }));
    const take = pick(a.take).filter(t => t.crewId).map(({ date, code, crewId }) => ({ crewId: crewId as string, ...(date ? { date } : {}), ...(code ? { code } : {}) }));
    if (!give.length && !take.length) return null;
    return { type: 'select_swap_duties', ...(give.length ? { give } : {}), ...(take.length ? { take } : {}), ...(label ? { label } : {}) };
  }
  return null;
}

export const isSwapAction = (a: RbotAction): a is RbotSwapAction =>
  a.type === 'set_swap_search' || a.type === 'set_swap_crews' || a.type === 'select_swap_duties';

// ── What R'Bot sees (snapshot sent as context.swap) ────────────────────────
export interface SwapSnapshot {
  window: { start: string; end: string };
  mode: string;
  filters: Record<string, unknown>;
  me: { crewId: string; fleets: string[]; duties: SnapDuty[] };
  crews: { crewId: string; fleets: string[]; duties: SnapDuty[] }[];
  selected: { crewB: string | null; give: string[]; take: string[] };
}
interface SnapDuty { start: string; end: string; code: string; kind: string; swappable: boolean; route?: string; layover?: string }

const MAX_CREWS = 8;
export function buildSwapSnapshot(s: {
  filters: SwapFilters | null; crews: SwapCrew[]; details: Record<string, ApiCompare>;
  give: string[]; take: string[]; crewB: string | null;
}): SwapSnapshot | null {
  if (!s.filters || !s.crews.length) return null;
  const me = s.crews[0];
  const mine = Object.values(s.details)[0]?.mineTaskDetailList;
  const snap = (d: SwapDuty, list?: ApiCompare['mineTaskDetailList']): SnapDuty => {
    const det = detailFor(d, list);
    const route = d.kind === 'fly' ? routeOf(det) : null;
    return {
      start: d.startDt.slice(0, 16), end: d.endDt.slice(0, 16), code: d.code, kind: d.kind, swappable: d.swappable,
      ...(route ? { route } : {}), ...(det?.layoverPort && det.layoverPort !== '-' ? { layover: `${det.layoverPort} ${det.layoverTime}` } : {}),
    };
  };
  const filters: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s.filters)) {
    if (['swapMode', 'startDate', 'endDate'].includes(k)) continue;
    if ((Array.isArray(v) && v.length) || (typeof v === 'string' && v) || v === true) filters[k] = v;
  }
  const keyCode = (k: string) => s.crews.flatMap(c => c.duties).find(d => d.key === k);
  return {
    window: { start: s.filters.startDate, end: s.filters.endDate },
    mode: s.filters.swapMode,
    filters,
    me: { crewId: me.crewId, fleets: fleetsOf(mine ?? []), duties: me.duties.map(d => snap(d, mine)) },
    crews: s.crews.slice(1, 1 + MAX_CREWS).map(c => {
      const list = s.details[c.crewId]?.othersTaskDetailList;
      return { crewId: c.crewId, fleets: fleetsOf(list ?? []), duties: c.duties.map(d => snap(d, list)) };
    }),
    selected: {
      crewB: s.crewB,
      give: s.give.map(k => keyCode(k)?.code ?? k),
      take: s.take.map(k => keyCode(k)?.code ?? k),
    },
  };
}

// ── Local understanding of the common requests ─────────────────────────────
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** First date in the text, in the window's year: "08 Oct", "Oct 8", "8th", "2026-10-08". */
export function dateIn(text: string, windowStart: string): string | null {
  const y = +windowStart.slice(0, 4), m0 = +windowStart.slice(5, 7);
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i.exec(text);
  if (m) return iso(y, MONTHS[m[2].toLowerCase()], +m[1]);
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i.exec(text);
  if (m) return iso(y, MONTHS[m[1].toLowerCase()], +m[2]);
  m = /\b(?:on\s+the\s+|on\s+)(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(text);
  if (m) return iso(y, m0, +m[1]);
  return null;
}

const covers = (d: Pick<SwapDuty, 'startDt' | 'endDt'>, day: string) => d.startDt.slice(0, 10) <= day && day <= d.endDt.slice(0, 10);
const crewIdsIn = (text: string, crews: SwapCrew[]) => crews.slice(1).map(c => c.crewId).filter(id => new RegExp(`\\b${id}\\b`).test(text));

export interface LocalSwapPlan { actions: RbotSwapAction[]; note?: string }

/** Understand a request on the phone, or null to ask the server. Conservative:
 *  only clear phrasings are handled here. */
export function interpretSwapLocally(text: string, s: { filters: SwapFilters | null; crews: SwapCrew[]; details: Record<string, ApiCompare> }): LocalSwapPlan | null {
  if (!s.filters || !s.crews.length) return null;
  const t = text.trim();
  const low = t.toLowerCase();
  const me = s.crews[0];
  const mine = Object.values(s.details)[0]?.mineTaskDetailList;
  const actions: RbotSwapAction[] = [];

  // "reset" / "clear the filters"
  if (/\b(reset|clear)\b.*\b(filter|search)s?\b|^reset$/.test(low)) {
    return { actions: [{ type: 'set_swap_search', fields: {}, reset: true, label: 'Filters cleared' }] };
  }

  // "swap my trip on 08 Oct for a standby (same fleet)"
  const swapMine = /\b(swap|trade|give( away)?|get rid of)\b.*\bmy\b/.test(low);
  const day = dateIn(t, s.filters.startDate);
  if (swapMine && day) {
    const duty = me.duties.find(d => covers(d, day) && d.swappable && d.kind !== 'off');
    if (!duty) return { actions: [], note: `I can't find a swappable duty of yours on ${dayLabel(day).day} ${dayLabel(day).month}.` };
    const fields: RbotSwapSearchFields = { startDate: duty.startDt.slice(0, 10), endDate: duty.endDt.slice(0, 10) };
    const wantKind = /\bfor (a |an )?(standby|reserve|home ?standby|hb|fb|sby)\b/.test(low) ? 'standby'
      : /\bfor (a |an )?(fly|flying|flight|trip|pairing)\b/.test(low) ? 'fly' : undefined;
    // "Same fleet" = the fleet of the duty being given (standby rows carry an aircraft too).
    const fleets = fleetsOf([detailFor(duty, mine)].filter((x): x is NonNullable<typeof x> => !!x));
    if (/\bsame (fleet|aircraft|type)\b/.test(low) && fleets.length) fields.fltFleetList = fleets;
    actions.push({ type: 'set_swap_search', fields, reset: true, ...(wantKind ? { wantKind } : {}), label: `Searching for ${duty.code}` });
    actions.push({ type: 'select_swap_duties', give: [{ date: day, code: duty.code }], label: `Giving ${duty.code}` });
    return { actions };
  }

  // "only A350" / "fleet 333"
  const fleet = /\b(?:only\s+|fleet\s+|a)(3[0-9]{2}|7[0-9]{2})\b/i.exec(t);
  if (fleet && /\b(only|fleet|same)\b/.test(low)) {
    return { actions: [{ type: 'set_swap_search', fields: { fltFleetList: [fleet[1]] }, label: `Fleet ${fleet[1]} only` }] };
  }

  // "also show someone with a DOH layover" / "layover in SEA"
  const port = /\b([A-Z]{3})\s+layover\b|\blayover (?:in|at)\s+([A-Z]{3})\b/.exec(t);
  if (port) {
    const p = (port[1] ?? port[2]).toUpperCase();
    if (/\b(also|add|plus|too)\b/.test(low)) {
      return { actions: [{ type: 'set_swap_crews', addWhere: { layoverPortList: [p] }, label: `Added ${p} layovers` }] };
    }
    return { actions: [{ type: 'set_swap_search', fields: { layoverPortList: [p] }, label: `${p} layovers` }] };
  }

  // "remove 402452" / "add 450673" / "only 421051 and 402452"
  const named = crewIdsIn(t, s.crews);
  const allIds = [...new Set([...(t.match(/\b\d{6}\b/g) ?? [])])];
  if (/\b(remove|drop|hide)\b/.test(low) && named.length) return { actions: [{ type: 'set_swap_crews', remove: named, label: `Removed ${named.join(', ')}` }] };
  if (/\b(add|include)\b/.test(low) && allIds.length) return { actions: [{ type: 'set_swap_crews', add: allIds, label: `Added ${allIds.join(', ')}` }] };
  if (/\bonly\b/.test(low) && allIds.length) return { actions: [{ type: 'set_swap_crews', only: allIds, label: `Showing ${allIds.join(', ')}` }] };

  // "pick 421051's 1HB and 4FB" / "take 1HB and 4FB from 421051"
  if (/\b(pick|select|take|choose)\b/.test(low) && named.length === 1) {
    const crew = s.crews.find(c => c.crewId === named[0])!;
    const codes = crew.duties.map(d => d.code).filter(c => new RegExp(`\\b${c.replace('/', '\\/')}\\b`, 'i').test(t));
    if (codes.length) {
      const sel: RbotSwapSelectAction = { type: 'select_swap_duties', take: [...new Set(codes)].map(code => ({ crewId: crew.crewId, code: code.toUpperCase() })), label: `Picked ${codes.join(', ')}` };
      return { actions: [sel] };
    }
  }
  return null;
}

// ── Applying actions ───────────────────────────────────────────────────────
export interface SwapActionDeps {
  getState: () => { filters: SwapFilters | null; crews: SwapCrew[] };
  search: (f: SwapFilters) => Promise<void>;
  /** Search without showing it (for addWhere). Returns the crew ids found. */
  peek: (f: SwapFilters) => Promise<string[]>;
  setGive: (keys: string[]) => void;
  setTake: (crewId: string, keys: string[]) => void;
}

function merge(f: SwapFilters, fields: RbotSwapSearchFields, reset?: boolean): SwapFilters {
  const base = reset ? emptyFilters(f.startDate, f.endDate, f.swapMode) : f;
  return { ...base, ...(fields as Partial<SwapFilters>) } as SwapFilters;
}

const matchDuty = (duties: SwapDuty[], want: { date?: string; code?: string }) => duties.find(d =>
  d.swappable && (!want.date || covers(d, want.date)) && (!want.code || d.code.toUpperCase() === want.code || d.code.toUpperCase().split('/').includes(want.code)));

/** Applies R'Bot's swap actions in order; returns the confirmation chips. */
export async function applySwapActions(actions: RbotAction[], deps: SwapActionDeps): Promise<string[]> {
  const chips: string[] = [];
  for (const a of actions) {
    if (!isSwapAction(a)) continue;
    const f = deps.getState().filters;
    if (!f) break;
    if (a.type === 'set_swap_search') {
      const next = merge(f, a.fields, a.reset);
      await deps.search(next);
      if (a.wantKind) {
        // Keep crews with a swappable duty of the wanted kind inside the window.
        const kind = a.wantKind;
        const keep = deps.getState().crews.slice(1)
          .filter(c => c.duties.some(d => d.swappable && d.kind === kind && d.startDt.slice(0, 10) <= next.endDate && d.endDt.slice(0, 10) >= next.startDate))
          .map(c => c.crewId);
        await deps.search({ ...next, crewIdList: keep.length ? keep : ['-'] });
        chips.push(kind === 'standby' ? 'Standby only' : 'Flying only');
      }
      chips.push(a.label ?? 'Search updated');
    } else if (a.type === 'set_swap_crews') {
      const shown = deps.getState().crews.slice(1).map(c => c.crewId);
      let next = a.only ?? shown;
      if (a.add) next = [...new Set([...next, ...a.add])];
      if (a.addWhere) {
        const found = await deps.peek(merge({ ...emptyFilters(f.startDate, f.endDate, f.swapMode) }, a.addWhere));
        next = [...new Set([...next, ...found])];
      }
      if (a.remove) next = next.filter(id => !a.remove!.includes(id));
      // An explicit crew list is the crew's own choice: keep dates + mode only.
      await deps.search({ ...emptyFilters(f.startDate, f.endDate, f.swapMode), crewIdList: next.length ? next : ['-'] });
      chips.push(a.label ?? 'Crews updated');
    } else {
      const crews = deps.getState().crews;
      const me = crews[0];
      if (a.give && me) {
        const keys = a.give.map(g => matchDuty(me.duties, g)?.key).filter((k): k is string => !!k);
        if (keys.length) deps.setGive(keys);
      }
      if (a.take?.length) {
        const crewId = a.take[0].crewId;
        const crew = crews.find(c => c.crewId === crewId);
        const keys = crew ? a.take.filter(x => x.crewId === crewId).map(x => matchDuty(crew.duties, x)?.key).filter((k): k is string => !!k) : [];
        if (keys.length) deps.setTake(crewId, keys);
      }
      chips.push(a.label ?? 'Duties picked');
    }
  }
  return chips;
}

/** One-line summary of the screen after R'Bot acted (the reply under the chips). */
export function describeResult(s: { crews: SwapCrew[]; filters: SwapFilters | null }): string {
  const others = s.crews.slice(1).map(c => c.crewId);
  if (!s.filters) return '';
  const w = `${dayLabel(s.filters.startDate).day} ${dayLabel(s.filters.startDate).month}–${dayLabel(s.filters.endDate).day} ${dayLabel(s.filters.endDate).month}`;
  if (!others.length) return `No crew match on ${w}. Try widening the dates or removing a filter.`;
  return `${others.length} crew on ${w}: ${others.join(', ')}. They're in the table now.`;
}

/** Re-export so the screen can turn a raw search into crews for `peek`. */
export { toCrews };
