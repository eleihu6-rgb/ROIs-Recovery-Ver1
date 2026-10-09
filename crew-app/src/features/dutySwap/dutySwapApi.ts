// Duty Swap · typed calls to the ROIS portal `/api/portal/taskSwap/*` (and the
// option lists the web Search Pairing form uses). Contract captured live on the
// PR TEST tenant — spec §2. Every call goes through the native portal client.
import { createPortalClient, type PortalClient, type PortalCredentials } from '../portal/portalClient';
import {
  searchQuery, type ApiCompare, type ApiCrewRow, type ApiMyTask, type ApiRecord, type SubmitBody, type SwapFilters, type SwapMode,
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

export interface DutySwapApi {
  disclaimer(): Promise<string | null>;
  defaultWindow(): Promise<{ startDate: string; endDate: string }>;
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
  myTasks(): Promise<{ tasks: ApiMyTask[]; autoUnlock: boolean }>;
  saveMyTasks(body: ReturnType<typeof publishBody>, autoUnlock?: boolean): Promise<void>;
}

export function createDutySwapApi(creds: PortalCredentials, client: PortalClient = createPortalClient(creds)): DutySwapApi {
  const day = (iso: string) => iso.slice(0, 10);
  return {
    async disclaimer() {
      const show = await client.get<boolean>(`${P}/getDisclaimerFlag`);
      if (!show) return null;
      const rows = await client.get<{ code: string }[]>('/api/system/dictionary/getByParentCode', { parentCode: 'DUTY_SWAP_DISCLAIMER_INFO' });
      // The dictionary stores the text in `code`, with literal "\n" separators.
      return (rows?.[0]?.code ?? '').replace(/\\n/g, '\n').trim() || null;
    },
    async defaultWindow() {
      const w = await client.get<{ startDt: string; endDt: string }>(`${P}/getTaskDefaultStartDate`);
      return { startDate: day(w.startDt), endDate: day(w.endDt) };
    },
    async search(f) {
      // A cabin crew's search is ~1 MB (120+ crews) and waits behind any other
      // call of the same crew on the portal: allow 90 s, not the client's 30 s.
      const env = await client.raw<ApiCrewRow[]>('GET', `${P}/selectOtherCrewPublishTask`, { query: searchQuery(f), timeoutMs: SEARCH_TIMEOUT_MS });
      if (env.code !== 0) throw new Error(env.message || 'The portal rejected the search.');
      return env.data ?? [];
    },
    async compare(f, othersCrewId) {
      return client.get<ApiCompare>(`${P}/selectTaskCompareList`, searchQuery(f, [othersCrewId]));
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
    async myTasks() {
      const [tasks, pref] = await Promise.all([
        client.get<ApiMyTask[]>(`${P}/selectMyTaskList`),
        client.get<boolean | null>(`${P}/findUnlockedDutyPref`),
      ]);
      return { tasks: tasks ?? [], autoUnlock: !!pref };
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
