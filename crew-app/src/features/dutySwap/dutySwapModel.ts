// ─── Duty Swap · pure model ─────────────────────────────────────────────────
// Types + rules behind the Crew Matrix (Concept D). No React / native imports so
// it stays unit-testable (__tests__/features/dutySwap.test.ts). API shapes are
// the ROIS portal's `/api/portal/taskSwap/*` responses, captured live on the PR
// TEST tenant (spec: docs/superpowers/specs/2026-10-07-crew-app-duty-swap-concept-d-design.md §2).

// ── API shapes ──────────────────────────────────────────────────────────────
export interface ApiCell {
  taskDate: string;              // '2026-10-08'
  startDt: string;               // '2026-10-08T20:50:00' (crew-base local)
  endDt: string;
  taskType: 'PAIRING' | 'GROUND' | null;
  assignment: string | null;     // 'FLY', '1HB', 'XX', 'SIM', null = empty day
  taskDetail: string | null;     // leg flight no. for FLY ('PR124'), else the code
  pairingId: number | null;
  rosterGroundPublishId: number | null;
  status: string | null;
  hasSwap: boolean | null;
  publishStatus: 'Publish' | 'Hide' | null;
}
export interface ApiCrewRow { crewId: string; crewName: string; cellVoList: ApiCell[] }

export interface ApiSegment {
  fltDt: string;                 // '08-Oct-2026'
  fltNo: string;                 // '124'
  ac: string;                    // '350'
  dep: string;
  arr: string;
  std: string;                   // '22:35' local
  sta: string;
  blh: string;
  fdp?: string;
  layoverPort?: string;
  layoverTime?: string;
}
export interface ApiTaskDetail {
  taskDate: string;
  taskType: 'PAIRING' | 'GROUND';
  pairingId?: number | null;
  rosterGroundPublishId?: number | null;
  comp?: string;
  actingRank?: string;
  startDateTimeLocal?: string | null;   // '08-Oct-2026 20:50'
  endDateTimeLocal?: string | null;
  startDateTime: string;
  endDateTime: string;
  layoverPort?: string;
  layoverTime?: string;
  fdp: string;
  blh: string;
  crd: string;
  duration: number;
  assignment: string;
  hasDoTask?: boolean;
  segmentDetailVoList?: ApiSegment[] | null;
}
export interface ApiCompare {
  mineCrewId: string;
  othersCrewId: string;
  swapMode: string;
  mineTaskDetailList: ApiTaskDetail[];
  othersTaskDetailList: ApiTaskDetail[];
  remark?: string | null;
  comments?: string | null;
  status?: string | null;
}
export interface ApiRecord {
  id: number;
  submitTime: string;            // '07-Oct-2026 23:55:55'
  source: string;                // 'My Application' | 'Apply to me'
  status: string;                // 'Pending(OTH)' …
  remark: string | null;
  crewId: string;                // applicant
  mineSwappedDate: string;       // applicant's side
  othersSwappedDate: string;
}

// ── Duties (cells merged into whole duties) ─────────────────────────────────
export type DutyKind = 'fly' | 'standby' | 'off' | 'ground' | 'other';

export interface SwapDuty {
  key: string;
  crewId: string;
  /** pairingId, or rosterGroundPublishId when `isGround`. */
  id: number;
  isGround: boolean;
  code: string;                  // 'PR124/PR125', '1HB', 'XX'
  kind: DutyKind;
  startDt: string;               // '2026-10-08T20:50:00'
  endDt: string;
  swappable: boolean;
}

export interface SwapCrew {
  crewId: string;
  crewName: string;
  duties: SwapDuty[];
}

const OFF = /^(X|XX|XXX|DO|RDO|SDO|LDO|PDO|UDO|BDO|NO_DUTY_DAY)$/;
const STANDBY = /^(\d*[HF][B-D]|SBY|ARD)$/;

export function dutyKind(taskType: string | null, assignment: string): DutyKind {
  if (assignment === 'FLY') return 'fly';
  if (STANDBY.test(assignment)) return 'standby';
  if (OFF.test(assignment)) return 'off';
  if (taskType === 'GROUND') return 'ground';
  return 'other';
}

/** The portal returns one cell per day of a multi-day duty and one per leg of a
 *  pairing; merge them into one duty per (pairing | ground task) + start. */
export function mergeCells(row: ApiCrewRow): SwapDuty[] {
  const byKey = new Map<string, { cells: ApiCell[] }>();
  for (const c of row.cellVoList) {
    if (!c.assignment) continue;
    const isGround = c.pairingId == null;
    const id = isGround ? c.rosterGroundPublishId : c.pairingId;
    if (id == null) continue;
    const key = `${row.crewId}:${isGround ? 'G' : 'P'}${id}:${c.startDt}`;
    const g = byKey.get(key) ?? { cells: [] };
    g.cells.push(c);
    byKey.set(key, g);
  }
  const out: SwapDuty[] = [];
  for (const [key, { cells }] of byKey) {
    const c0 = cells[0];
    const isGround = c0.pairingId == null;
    let code = c0.assignment as string;
    if (code === 'FLY') {
      const legs: string[] = [];
      for (const c of cells) {
        const d = (c.taskDetail ?? '').trim();
        if (d && d !== 'FLY' && !legs.includes(d)) legs.push(d);
      }
      if (legs.length) code = legs.join('/');
    }
    out.push({
      key,
      crewId: row.crewId,
      id: (isGround ? c0.rosterGroundPublishId : c0.pairingId) as number,
      isGround,
      code,
      kind: dutyKind(c0.taskType, c0.assignment as string),
      startDt: c0.startDt,
      endDt: c0.endDt,
      swappable: cells.some(c => c.publishStatus === 'Publish'),
    });
  }
  return out.sort((a, b) => a.startDt.localeCompare(b.startDt));
}

export function toCrews(rows: ApiCrewRow[]): SwapCrew[] {
  return rows.map(r => ({ crewId: r.crewId, crewName: r.crewName, duties: mergeCells(r) }));
}

// ── Time helpers (crew-base local wall clock, treated as naive UTC) ────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAY_MS = 86_400_000;

export function naiveMs(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
}
export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
/** '08-Oct-2026 20:50' / '08-Oct-2026' → '2026-10-08T20:50' / '2026-10-08'. */
export function portalToIso(s: string | null | undefined): string | null {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{2}:\d{2}))?/.exec(s ?? '');
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2]) + 1;
  if (mon < 1) return null;
  const d = `${m[3]}-${String(mon).padStart(2, '0')}-${m[1]}`;
  return m[4] ? `${d}T${m[4]}` : d;
}
export function hhmmOf(iso: string): string {
  return iso.slice(11, 16);
}
/** Inclusive list of ISO days from start to end. */
export function daysBetween(startDate: string, endDate: string): string[] {
  const a = naiveMs(startDate), b = naiveMs(endDate);
  if (!(a <= b)) return [];
  const out: string[] = [];
  for (let t = a; t <= b; t += DAY_MS) out.push(isoDay(t));
  return out;
}
export function dayLabel(iso: string): { day: string; dow: string; month: string } {
  const d = new Date(naiveMs(iso));
  return {
    day: String(d.getUTCDate()).padStart(2, '0'),
    dow: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getUTCDay()],
    month: MONTHS[d.getUTCMonth()],
  };
}

/** Vertical placement of a duty in a matrix column: top/height in rows. */
export function dutyRows(d: Pick<SwapDuty, 'startDt' | 'endDt'>, windowStart: string, days: number): { top: number; span: number } | null {
  const w0 = naiveMs(windowStart);
  const a = (naiveMs(d.startDt) - w0) / DAY_MS;
  const b = Math.min(days, (naiveMs(d.endDt) - w0) / DAY_MS);
  if (b <= 0 || a >= days) return null;
  const top = Math.max(0, a);
  return { top, span: Math.max(b - top, 0) };
}

// ── Progressive cell detail (Ryan: compact, but add info when there is room) ──
export type CellLevel = 0 | 1 | 2 | 3;
export function cellLevel(heightPt: number, widthPt: number): CellLevel {
  if (heightPt >= 80 && widthPt >= 100) return 3;
  if (heightPt >= 48) return 2;
  if (heightPt >= 22) return 1;
  return 0;
}

/** 'MNL–SEA–MNL' from a pairing's legs (consecutive duplicates collapsed). */
/** Legs with a real flight (the portal sometimes returns an empty leg: fltNo/dep/arr null). */
export function realLegs(t: Pick<ApiTaskDetail, 'segmentDetailVoList'> | undefined): ApiSegment[] {
  return (t?.segmentDetailVoList ?? []).filter(s => !!s && !!s.dep && !!s.arr);
}

export function routeOf(detail: ApiTaskDetail | undefined): string | null {
  const segs = realLegs(detail);
  if (!segs.length) return null;
  const stops = [segs[0].dep];
  for (const s of segs) if (stops[stops.length - 1] !== s.arr) stops.push(s.arr);
  return stops.join('–');
}

export function cellLines(duty: SwapDuty, detail: ApiTaskDetail | undefined, level: CellLevel): string[] {
  const lines = [duty.code];
  if (level === 0) return lines;
  const route = duty.kind === 'fly' ? routeOf(detail) : null;
  lines.push(route ?? `${hhmmOf(duty.startDt)}–${hhmmOf(duty.endDt)}`);
  if (level === 1) return lines;
  if (duty.kind === 'fly') {
    lines.push(`${hhmmOf(duty.startDt)}L → ${hhmmOf(duty.endDt)}L`);
    if (detail?.layoverPort && detail.layoverPort !== '-') lines.push(`LO ${detail.layoverPort} ${detail.layoverTime ?? ''}`.trim());
  }
  if (level === 3 && detail && duty.kind === 'fly') {
    lines.push(`BLH ${detail.blh} · CRD ${detail.crd}`);
    const fleets = fleetsOf([detail]);
    if (fleets.length) lines.push(`Fleet ${fleets.join('/')}`);
  }
  return lines;
}

export function fleetsOf(tasks: ApiTaskDetail[]): string[] {
  const out: string[] = [];
  for (const t of tasks) for (const s of t.segmentDetailVoList ?? []) if (s.ac && !out.includes(s.ac)) out.push(s.ac);
  return out;
}

/** Detail record for a duty (matched by pairing / ground id). */
export function detailFor(duty: SwapDuty, list: ApiTaskDetail[] | undefined): ApiTaskDetail | undefined {
  return list?.find(t => (duty.isGround ? t.rosterGroundPublishId === duty.id : t.pairingId === duty.id));
}

// ── KPI delta (what I take − what I give), as the web computes it ───────────
export function hhmmToMin(v: string | null | undefined): number {
  const m = /^(-)?(\d+):(\d{2})$/.exec((v ?? '').trim());
  if (!m) return 0;
  const n = +m[2] * 60 + +m[3];
  return m[1] ? -n : n;
}
export function signedHhmm(min: number): string {
  if (min === 0) return '00:00';
  const a = Math.abs(min);
  return `${min < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
export interface KpiDelta { fdp: number; blh: number; crd: number; dayOff: number }
export function kpiDelta(give: ApiTaskDetail[], take: ApiTaskDetail[]): KpiDelta {
  const sum = (xs: ApiTaskDetail[], k: 'fdp' | 'blh' | 'crd') => xs.reduce((n, t) => n + hhmmToMin(t[k]), 0);
  const dos = (xs: ApiTaskDetail[]) => xs.filter(t => t.hasDoTask || OFF.test(t.assignment)).length;
  return {
    fdp: sum(take, 'fdp') - sum(give, 'fdp'),
    blh: sum(take, 'blh') - sum(give, 'blh'),
    crd: sum(take, 'crd') - sum(give, 'crd'),
    dayOff: dos(take) - dos(give),
  };
}

// ── Search filters (every field of the web "Search Pairing") ───────────────
export type SwapMode = 'NS' | 'FS' | 'AS';
export const SWAP_MODE_LABEL: Record<SwapMode, string> = { NS: 'Target', FS: 'Handshake', AS: 'General' };

export interface SwapFilters {
  swapMode: SwapMode;
  startDate: string;             // 'YYYY-MM-DD', required
  endDate: string;               // required
  durationStart: string; durationEnd: string;      // days
  crdStart: string; crdEnd: string;                // whole hours
  blhStart: string; blhEnd: string;                // whole hours
  briefStart: string; briefEnd: string;            // report time HH:mm
  debriefStart: string; debriefEnd: string;        // flight end HH:mm
  taskTypeList: string[];
  layoverPortList: string[];
  layoverTimeStart: string; layoverTimeEnd: string; // whole hours
  fltNumList: string[];
  fltArrList: string[];
  fltFleetList: string[];
  crewIdList: string[];
  activeRankList: string[];
  filterEmptyDutyCrew: boolean;
}

export function emptyFilters(startDate: string, endDate: string, swapMode: SwapMode = 'NS'): SwapFilters {
  return {
    swapMode, startDate, endDate,
    durationStart: '', durationEnd: '', crdStart: '', crdEnd: '', blhStart: '', blhEnd: '',
    briefStart: '', briefEnd: '', debriefStart: '', debriefEnd: '',
    taskTypeList: [], layoverPortList: [], layoverTimeStart: '', layoverTimeEnd: '',
    fltNumList: [], fltArrList: [], fltFleetList: [], crewIdList: [], activeRankList: [],
    filterEmptyDutyCrew: false,
  };
}

const LIST_KEYS = ['taskTypeList', 'layoverPortList', 'fltNumList', 'fltArrList', 'fltFleetList', 'crewIdList', 'activeRankList'] as const;
const TEXT_KEYS = ['durationStart', 'durationEnd', 'crdStart', 'crdEnd', 'blhStart', 'blhEnd', 'briefStart', 'briefEnd',
  'debriefStart', 'debriefEnd', 'layoverTimeStart', 'layoverTimeEnd'] as const;

/** Query for `selectOtherCrewPublishTask` / `selectTaskCompareList`; lists are
 *  comma-joined like the web form, empty fields omitted. */
export function searchQuery(f: SwapFilters, crewIdList?: string[]): Record<string, string | boolean> {
  const q: Record<string, string | boolean> = {
    swapMode: f.swapMode, startDate: f.startDate, endDate: f.endDate, filterEmptyDutyCrew: f.filterEmptyDutyCrew,
  };
  for (const k of TEXT_KEYS) if (f[k].trim()) q[k] = f[k].trim();
  for (const k of LIST_KEYS) if (f[k].length) q[k] = f[k].join(',');
  if (crewIdList) q.crewIdList = crewIdList.join(',');
  return q;
}

/** Number of optional filters set (for the Filters chip badge). */
export function activeFilterCount(f: SwapFilters): number {
  let n = 0;
  for (const k of TEXT_KEYS) if (f[k].trim()) n++;
  for (const k of LIST_KEYS) if (f[k].length) n++;
  if (f.filterEmptyDutyCrew) n++;
  return n;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const INT = /^\d+$/;
export function validateFilters(f: SwapFilters): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(f.endDate)) return 'Start and End dates are required.';
  if (f.startDate > f.endDate) return 'Start must be on or before End.';
  const pairs: [string, string, string, RegExp][] = [
    ['Duration', f.durationStart, f.durationEnd, INT], ['CRD', f.crdStart, f.crdEnd, INT], ['BLH', f.blhStart, f.blhEnd, INT],
    ['Layover hours', f.layoverTimeStart, f.layoverTimeEnd, INT],
    ['Report time', f.briefStart, f.briefEnd, HHMM], ['Flight end', f.debriefStart, f.debriefEnd, HHMM],
  ];
  for (const [label, a, b, re] of pairs) {
    for (const v of [a, b]) if (v.trim() && !re.test(v.trim())) return `${label}: ${re === HHMM ? 'use HH:mm' : 'whole numbers only'}.`;
    if (re === INT && a.trim() && b.trim() && +a > +b) return `${label}: the first value must not be larger than the second.`;
  }
  return null;
}

// ── Legality messages (server rule check on submit / accept) ───────────────
export interface RuleItem { side?: 'Mine' | 'Others'; from?: string; to?: string; ruleId?: string; rule?: string; text: string }
export interface RuleResult { soft: boolean; items: RuleItem[] }

/** `[RuleCheck]Others\r\n08-Oct-2026~12-Oct-2026,Rule ID:8004036,Basic Competency`
 *  and plain business lines ("The swap hour difference … is over …"). */
export function parseRuleMessage(message: string): RuleResult {
  const soft = message.includes('[CBA]');
  const lines = message.replace(/\[CBA\]|\[RuleCheck\]/g, '\n').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const items: RuleItem[] = [];
  let side: RuleItem['side'];
  for (const l of lines) {
    if (l === 'Mine' || l === 'Others') { side = l; continue; }
    const m = /^(\d{2}-[A-Za-z]{3}-\d{4})\s*~\s*(\d{2}-[A-Za-z]{3}-\d{4})\s*,\s*Rule ID\s*:\s*([^,]+),\s*(.+)$/.exec(l);
    if (m) items.push({ side, from: m[1], to: m[2], ruleId: m[3].trim(), rule: m[4].trim(), text: l });
    else items.push({ side, text: l });
  }
  return { soft, items };
}

/** The portal's terse business errors, in crew language. */
export function friendlyPortalMessage(message: string): string {
  if (/^Please publish task\.?$/i.test(message.trim())) {
    return 'You have no unlocked duties that match this search. Unlock the duties other crew may request (the Type filter applies to your own duties too).';
  }
  if (/^No friends were found\.?$/i.test(message.trim())) {
    return 'No friends allow Handshake swaps with you yet. Switch to Target to search all crew.';
  }
  return message;
}

// ── My duties (web "My Duty": lock / unlock for swapping) ─────────────────
export interface ApiMyTask extends ApiTaskDetail { publishStatus: 'Publish' | 'Hide' | null }

/** 'PR684/PR685' for a pairing, else the assignment code ('1HB', 'XX'). */
export function myTaskCode(t: ApiMyTask, carrier: string): string {
  if (t.assignment !== 'FLY') return t.assignment;
  const legs = realLegs(t).map(l => (/^\d+$/.test(l.fltNo) ? `${carrier}${l.fltNo}` : l.fltNo));
  return legs.length ? [...new Set(legs)].join('/') : 'FLY';
}
export const myTaskId = (t: Pick<ApiMyTask, 'pairingId' | 'rosterGroundPublishId'>): string =>
  t.pairingId != null ? `P${t.pairingId}` : `G${t.rosterGroundPublishId}`;

/** Body for `batchUpdateTaskPublishStatus` (same as the web): every task, plus the unlocked ones. */
export function publishBody(tasks: ApiMyTask[], unlocked: Set<string>) {
  const pairingIdList: number[] = [], rosterGroundPublishIdList: number[] = [];
  const publishPairingIdList: number[] = [], publishRosterGroundPublishIdList: number[] = [];
  for (const t of tasks) {
    const on = unlocked.has(myTaskId(t));
    if (t.pairingId != null) { pairingIdList.push(t.pairingId); if (on) publishPairingIdList.push(t.pairingId); }
    if (t.rosterGroundPublishId != null) { rosterGroundPublishIdList.push(t.rosterGroundPublishId); if (on) publishRosterGroundPublishIdList.push(t.rosterGroundPublishId); }
  }
  return { pairingIdList, rosterGroundPublishIdList, publishPairingIdList, publishRosterGroundPublishIdList };
}

// ── Records ────────────────────────────────────────────────────────────────
export const RECORD_STATUS_LABEL: Record<string, string> = {
  'Pending(OTH)': 'Waiting for the other crew',
  'Pending(ME)': 'Waiting for you',
  'Pending(ADM)': 'With crew control',
  'Withdrawn(OTH)': 'Withdrawn by the other crew',
  'Withdrawn(ME)': 'Withdrawn by you',
  Unsuccess: 'Not successful',
  Approved: 'Approved',
  Chanced: 'Changed',
  Canceled: 'Canceled',
};
export function recordStatusLabel(status: string): string {
  return RECORD_STATUS_LABEL[status] ?? status;
}
export type RecordAction = 'withdraw' | 'accept' | 'reject';
/** What the signed-in crew may do with a record (as the web offers it). */
export function recordActions(r: Pick<ApiRecord, 'status'>): RecordAction[] {
  if (r.status === 'Pending(OTH)') return ['withdraw'];
  if (r.status === 'Pending(ME)') return ['accept', 'reject'];
  return [];
}

// ── Submit body ────────────────────────────────────────────────────────────
export interface SubmitBody {
  mineCrewId: string;
  minePairingIdList: number[];
  mineRosterGroundPublishIdList: number[];
  othersCrewId: string;
  othersPairingIdList: number[];
  othersRosterGroundPublishIdList: number[];
  swapMode: SwapMode;
  comments: string;
}
export function submitBody(meId: string, othersId: string, give: SwapDuty[], take: SwapDuty[], swapMode: SwapMode, comments: string): SubmitBody {
  return {
    mineCrewId: meId,
    minePairingIdList: give.filter(d => !d.isGround).map(d => d.id),
    mineRosterGroundPublishIdList: give.filter(d => d.isGround).map(d => d.id),
    othersCrewId: othersId,
    othersPairingIdList: take.filter(d => !d.isGround).map(d => d.id),
    othersRosterGroundPublishIdList: take.filter(d => d.isGround).map(d => d.id),
    swapMode,
    comments: comments.trim(),
  };
}

// ── Compare view rows (the web's date-aligned Pairing Info + Duty Info) ─────
export interface CompareSide { task?: ApiTaskDetail; legs: ApiSegment[] }
export interface CompareRow { date: string; mine: CompareSide; others: CompareSide }

function taskDays(t: ApiTaskDetail): string[] {
  const a = portalToIso(t.startDateTimeLocal ?? t.startDateTime);
  const b = portalToIso(t.endDateTimeLocal ?? t.endDateTime) ?? a;
  return a && b ? daysBetween(a.slice(0, 10), b.slice(0, 10)) : [];
}

/** Rows for every day touched by the given tasks; a task's summary sits on its
 *  first day, each leg on its flight date. */
export function compareRows(mine: ApiTaskDetail[], others: ApiTaskDetail[]): CompareRow[] {
  const days = new Set<string>();
  for (const t of [...mine, ...others]) for (const d of taskDays(t)) days.add(d);
  const side = (list: ApiTaskDetail[], date: string): CompareSide => {
    const task = list.find(t => taskDays(t)[0] === date);
    const legs = list.flatMap(t => realLegs(t).filter(s => portalToIso(s.fltDt) === date));
    return { task, legs };
  };
  return [...days].sort().map(date => ({ date, mine: side(mine, date), others: side(others, date) }));
}
