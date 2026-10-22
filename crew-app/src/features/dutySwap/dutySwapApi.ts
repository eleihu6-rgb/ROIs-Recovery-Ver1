// Duty Swap · typed calls to the ROIS portal `/api/portal/taskSwap/*` (and the
// option lists the web Search Pairing form uses). Contract captured live on the
// PR and TG TEST tenants — spec §2. Every call goes through the native portal client.
import { createPortalClient, PortalError, type PortalClient, type PortalCredentials } from '../portal/portalClient';
import {
  portalToIso, realLegs, searchQuery, type ApiCell, type ApiCompare, type ApiCrewRow, type ApiMyTask, type ApiRecord, type ApiTaskDetail, type SubmitBody, type SwapFilters, type SwapMode,
  type publishBody,
} from './dutySwapModel';

const P = '/api/portal/taskSwap';
export const SEARCH_TIMEOUT_MS = 90_000;

export interface SearchOptions {
  modes: SwapMode[];
  taskTypes: string[];
  ranks: string[];
  crews: { crewId: string; crewName: string }[];
  ports: string[];
  flights: string[];
  fleets: string[];
}

export interface RecordPage { records: ApiRecord[]; total: number; current: number; pages: number }
export interface TaskWindow { startDate: string; endDate: string; swapMode?: SwapMode }

// TG's Handshake payload is the older calendar-cell contract: it supplies one
// `taskDateTime` per visible day/leg instead of the PR contract's duty-wide
// `startDt` / `endDt` pair.
type TgCandidateCell = Omit<ApiCell, 'startDt' | 'endDt'> & {
  taskDateTime?: string;
  startDt?: string;
  endDt?: string;
};
type TgCandidateRow = Omit<ApiCrewRow, 'cellVoList'> & { cellVoList: TgCandidateCell[] };
type TgCompareRow = { crewId?: string; taskDetailList?: ApiTaskDetail[] | null };
type TgCompare = Omit<Partial<ApiCompare>, 'mineTaskDetailList' | 'othersTaskDetailList'> & {
  mineTaskDetailList?: ApiTaskDetail[] | null;
  othersTaskDetailList?: ApiTaskDetail[] | null;
  mineTableRowTask?: TgCompareRow | null;
  otherTableRowTask?: TgCompareRow | null;
};

/** TG Handshake keeps the detailed duties inside its two table rows, while PR
 * returns the same records in the top-level lists. Present one contract to the
 * app so routes, KPI totals and review details work identically for both. */
export function normalizeCompare(raw: TgCompare, mineCrewId: string, othersCrewId: string, swapMode: SwapMode): ApiCompare {
  return {
    ...raw,
    mineCrewId: raw.mineCrewId ?? raw.mineTableRowTask?.crewId ?? mineCrewId,
    othersCrewId: raw.othersCrewId ?? raw.otherTableRowTask?.crewId ?? othersCrewId,
    swapMode: raw.swapMode ?? swapMode,
    mineTaskDetailList: raw.mineTaskDetailList?.length
      ? raw.mineTaskDetailList
      : raw.mineTableRowTask?.taskDetailList ?? raw.mineTaskDetailList ?? [],
    othersTaskDetailList: raw.othersTaskDetailList?.length
      ? raw.othersTaskDetailList
      : raw.otherTableRowTask?.taskDetailList ?? raw.othersTaskDetailList ?? [],
  };
}

/** TG's Handshake search returns candidates only (and deliberately leaves
 * publishStatus null). Build the signed-in crew's matrix row from My Duty so
 * the native UI still has an accurate Mine column without publishing it. */
function tgMineRow(creds: PortalCredentials, tasks: ApiMyTask[]): ApiCrewRow {
  const cellVoList: ApiCell[] = tasks.flatMap(task => {
    const startDt = portalToIso(task.startDateTimeLocal ?? task.startDateTime) ?? '';
    const endDt = portalToIso(task.endDateTimeLocal ?? task.endDateTime) ?? startDt;
    const legs = realLegs(task);
    const taskType = task.pairingId != null ? 'PAIRING' as const : 'GROUND' as const;
    const base = {
      startDt,
      endDt,
      taskType,
      assignment: task.assignment,
      pairingId: task.pairingId ?? null,
      rosterGroundPublishId: task.rosterGroundPublishId ?? null,
      status: null,
      hasSwap: null,
      // Eligibility in TG Handshake mode does not depend on My Duty publish.
      publishStatus: 'Publish' as const,
    };
    if (!legs.length) {
      return [{ ...base, taskDate: startDt.slice(0, 10), taskDetail: task.assignment }];
    }
    return legs.map(leg => ({
      ...base,
      taskDate: (portalToIso(leg.fltDt) ?? startDt).slice(0, 10),
      taskDetail: /^\d+$/.test(leg.fltNo) ? `${creds.airline.toUpperCase()}${leg.fltNo}` : leg.fltNo,
    }));
  });
  return { crewId: creds.crewId, crewName: creds.crewId, cellVoList };
}

function tgHandshakeRows(creds: PortalCredentials, candidates: TgCandidateRow[], mine: ApiMyTask[]): ApiCrewRow[] {
  const selectable = candidates
    .filter(row => row.crewId !== creds.crewId)
    .map(row => {
      const bounds = new Map<string, { startDt: string; endDay: string }>();
      const dutyKey = (cell: TgCandidateCell) => cell.pairingId != null
        ? `P${cell.pairingId}`
        : cell.rosterGroundPublishId != null ? `G${cell.rosterGroundPublishId}` : null;
      for (const cell of row.cellVoList) {
        const key = dutyKey(cell);
        if (!key || !cell.assignment) continue;
        const stamp = cell.startDt ?? cell.taskDateTime ?? `${cell.taskDate}T00:00:00`;
        const endDay = cell.endDt?.slice(0, 10) ?? cell.taskDate;
        const current = bounds.get(key);
        bounds.set(key, {
          startDt: !current || stamp < current.startDt ? stamp : current.startDt,
          endDay: !current || endDay > current.endDay ? endDay : current.endDay,
        });
      }
      const cellVoList: ApiCell[] = row.cellVoList.map(cell => {
        const bound = dutyKey(cell) ? bounds.get(dutyKey(cell)!) : undefined;
        const startDt = cell.startDt ?? bound?.startDt ?? cell.taskDateTime ?? `${cell.taskDate}T00:00:00`;
        const endDt = cell.endDt ?? (bound ? `${bound.endDay}T23:59:59` : startDt);
        return {
          ...cell,
          startDt,
          endDt,
          publishStatus: cell.assignment ? 'Publish' as const : cell.publishStatus,
        };
      });
      return { ...row, cellVoList };
    });
  return [tgMineRow(creds, mine), ...selectable];
}

export interface DutySwapApi {
  disclaimer(): Promise<string | null>;
  defaultWindow(): Promise<TaskWindow>;
  search(f: SwapFilters): Promise<ApiCrewRow[]>;
  compare(f: SwapFilters, othersCrewId: string): Promise<ApiCompare>;
  options(startDate: string, endDate: string): Promise<SearchOptions>;
  submit(body: SubmitBody): Promise<{ ok: true } | { ok: false; message: string }>;
  records(): Promise<RecordPage>;
  recordDetail(recordId: number): Promise<ApiCompare>;
  withdraw(recordId: number): Promise<void>;
  /** Crew B's pre-check before accepting: null = clean, else the rule message. */
  verify(recordId: number): Promise<string | null>;
  softRuleConfirm(): Promise<boolean>;
  respond(recordId: number, accept: boolean, extra?: { violationComments?: string; remark?: string }): Promise<{ ok: true } | { ok: false; message: string }>;
  myTasks(window?: TaskWindow): Promise<{ tasks: ApiMyTask[]; autoUnlock: boolean; supportsAutoUnlock: boolean }>;
  saveMyTasks(body: ReturnType<typeof publishBody>, autoUnlock?: boolean): Promise<void>;
}

export function createDutySwapApi(creds: PortalCredentials, client: PortalClient = createPortalClient(creds)): DutySwapApi {
  const day = (iso: string) => iso.slice(0, 10);
  return {
    async disclaimer() {
      let show: boolean;
      try {
        show = await client.get<boolean>(`${P}/getDisclaimerFlag`);
      } catch (error) {
        // TG's older task-swap service has no disclaimer endpoint. Absence means
        // there is nothing to acknowledge; all other portal failures still surface.
        if (error instanceof PortalError && error.status === 404) return null;
        throw error;
      }
      if (!show) return null;
      const rows = await client.get<{ code: string }[]>('/api/system/dictionary/getByParentCode', { parentCode: 'DUTY_SWAP_DISCLAIMER_INFO' });
      // The dictionary stores the text in `code`, with literal "\n" separators.
      return (rows?.[0]?.code ?? '').replace(/\\n/g, '\n').trim() || null;
    },
    async defaultWindow() {
      type PortalWindow = { startDate?: string; endDate?: string; startDt?: string; endDt?: string } | string;
      let w: PortalWindow;
      try {
        // TG's current web portal uses this endpoint. Unlike the legacy call it
        // returns the complete searchable window (22 Oct–30 Nov in the live
        // test account), so the crew's own later duty is not clipped out.
        w = await client.get<PortalWindow>(`${P}/getMyLatestTaskDate`);
      } catch (error) {
        if (!(error instanceof PortalError) || error.status !== 404) throw error;
        w = await client.get<PortalWindow>(`${P}/getTaskDefaultStartDate`);
      }
      let swapMode: SwapMode | undefined;
      if (creds.airline.toUpperCase() === 'TG') {
        try {
          // TG currently advertises FS only. Hard-coding the PR default (NS)
          // makes the same portal answer "Please publish task" even though TG
          // does not require publishing before candidate search.
          swapMode = (await client.get<SwapMode[]>(`${P}/selectSearchModeList`))?.[0] ?? 'FS';
        } catch {
          swapMode = 'FS';
        }
      }
      if (typeof w === 'string') return { startDate: day(w), endDate: day(w), swapMode };
      const startDate = w.startDate ?? w.startDt;
      const endDate = w.endDate ?? w.endDt;
      if (!startDate || !endDate) throw new Error('The crew portal returned an invalid Duty Swap window.');
      return { startDate: day(startDate), endDate: day(endDate), swapMode };
    },
    async search(f) {
      // A cabin crew's search is ~1 MB (120+ crews) and waits behind any other
      // call of the same crew on the portal: allow 90 s, not the client's 30 s.
      const tgHandshake = creds.airline.toUpperCase() === 'TG' && f.swapMode === 'FS';
      const minePromise = tgHandshake
        ? client.get<ApiMyTask[]>(`${P}/selectMyTaskList`, { startDate: f.startDate, endDate: f.endDate })
        : Promise.resolve<ApiMyTask[]>([]);
      const [env, mine] = await Promise.all([
        client.raw<TgCandidateRow[]>('GET', `${P}/selectOtherCrewPublishTask`, { query: searchQuery(f), timeoutMs: SEARCH_TIMEOUT_MS }),
        minePromise,
      ]);
      if (env.code !== 0) throw new Error(env.message || 'The portal rejected the search.');
      const rows = env.data ?? [];
      return tgHandshake ? tgHandshakeRows(creds, rows, mine ?? []) : rows as ApiCrewRow[];
    },
    async compare(f, othersCrewId) {
      const raw = await client.get<TgCompare>(`${P}/selectTaskCompareList`, searchQuery(f, [othersCrewId]));
      return normalizeCompare(raw, creds.crewId, othersCrewId, f.swapMode);
    },
    async options(startDate, endDate) {
      const range = { startDateTime: `${startDate} 00:00:00`, endDateTime: `${endDate} 23:59:59` };
      const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return (await p) ?? fallback; } catch { return fallback; } };
      const [modes, taskTypes, ranks, crews, ports, flights, fleets] = await Promise.all([
        safe(client.get<SwapMode[]>(`${P}/selectSearchModeList`), ['NS'] as SwapMode[]),
        safe(client.get<string[]>(`${P}/selectTaskTypeList`), []),
        safe(client.get<string[]>(`${P}/getCrewRankList`), []),
        safe(client.get<{ crewId: string; crewName: string }[]>(`${P}/selectCrewList`), []),
        safe(client.get<string[]>('/api/airport/findAirportListByPairingDt', { ...range, isRoster: false }), []),
        safe(client.get<string[]>('/api/flight/findFltNumListByDt', range), []),
        safe(client.get<string[]>('/api/crew/findFleetListByDt', range), []),
      ]);
      return { modes, taskTypes, ranks, crews, ports, flights, fleets };
    },
    async submit(body) {
      // Legality runs server-side here; the web allows it 2 minutes.
      const env = await client.raw<boolean>('POST', `${P}/submitTaskSwap`, { body, timeoutMs: 120_000 });
      return env.code === 0 ? { ok: true } : { ok: false, message: env.message ?? 'The swap was not accepted.' };
    },
    async records() {
      // Same call the web makes on load (no filter): the latest page of records.
      const r = await client.get<RecordPage>(`${P}/selectRequestRecordList`);
      return { records: r?.records ?? [], total: r?.total ?? 0, current: r?.current ?? 1, pages: r?.pages ?? 0 };
    },
    async recordDetail(recordId) {
      return client.get<ApiCompare>(`${P}/selectRecordDetail`, { recordId: String(recordId) });
    },
    async withdraw(recordId) {
      await client.send<boolean>('PUT', `${P}/withdrawnRequest`, { query: { recordId: String(recordId) } });
    },
    async verify(recordId) {
      const env = await client.raw<boolean>('GET', `${P}/verifyTaskStatus`, { query: { recordId: String(recordId) } });
      return env.code === 0 ? null : env.message ?? 'The swap no longer passes the rule check.';
    },
    async softRuleConfirm() {
      return !!(await client.get<boolean>(`${P}/getSoftCrewViolationFlag`));
    },
    async myTasks(window) {
      const tasks = await client.get<ApiMyTask[]>(`${P}/selectMyTaskList`, window ? { ...window } : undefined);
      let pref: boolean | null = null;
      let supportsAutoUnlock = true;
      try {
        pref = await client.get<boolean | null>(`${P}/findUnlockedDutyPref`);
      } catch (error) {
        // TG's current portal deliberately has no auto-unlock preference. Its
        // web UI only exposes per-duty Publish switches, which remain supported.
        if (!(error instanceof PortalError) || error.status !== 404) throw error;
        supportsAutoUnlock = false;
      }
      return { tasks: tasks ?? [], autoUnlock: !!pref, supportsAutoUnlock };
    },
    async saveMyTasks(body, autoUnlock) {
      if (autoUnlock !== undefined) await client.send<boolean>('PUT', `${P}/updateUnlockedDutyPref`, { query: { unlockedDutyPref: autoUnlock } });
      await client.send<boolean>('PUT', `${P}/batchUpdateTaskPublishStatus`, { body });
    },
    async respond(recordId, accept, extra = {}) {
      const env = await client.raw<boolean>('PUT', `${P}/respondentApproval`, { body: { recordId, approveState: accept, ...extra } });
      return env.code === 0 ? { ok: true } : { ok: false, message: env.message ?? 'The portal rejected the reply.' };
    },
  };
}
