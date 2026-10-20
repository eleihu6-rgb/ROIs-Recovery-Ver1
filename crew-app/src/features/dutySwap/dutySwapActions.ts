// Duty Swap · async steps shared by the screen (and, in Phase 2, R'Bot).
import type { AppDispatch, RootState } from '../../store';
import { airlineByCode } from '../auth/airlines';
import { createDutySwapApi, type DutySwapApi } from './dutySwapApi';
import { emptyFilters, friendlyPortalMessage, toCrews, validateFilters, type SwapFilters } from './dutySwapModel';
import { detailLoaded, optionsLoaded, searchFailed, searchStarted, searchSucceeded } from './dutySwapSlice';

/** The signed-in airline's crew portal serves Duty Swap (PR today). */
export const selectDutySwapLive = (s: RootState): boolean => !!airlineByCode(s.auth.airline).portalConfig?.dutySwap;

const apis = new Map<string, DutySwapApi>();
/** One API (and so one cached portal token) per signed-in crew. */
export function dutySwapApiFor(auth: RootState['auth']): DutySwapApi | null {
  if (!auth.crewId || !auth.password) return null;
  const k = `${auth.airline}|${auth.crewId}`;
  let api = apis.get(k);
  if (!api) { api = createDutySwapApi({ airline: auth.airline, crewId: auth.crewId, password: auth.password }); apis.set(k, api); }
  return api;
}

const msg = (e: unknown) => (e instanceof Error && e.message ? friendlyPortalMessage(e.message) : 'Could not reach the crew portal.');

export async function runSearch(dispatch: AppDispatch, api: DutySwapApi, filters: SwapFilters): Promise<void> {
  const invalid = validateFilters(filters);
  if (invalid) { dispatch(searchFailed(invalid)); return; }
  dispatch(searchStarted(filters));
  try {
    dispatch(searchSucceeded(toCrews(await api.search(filters))));
  } catch (e) {
    dispatch(searchFailed(msg(e)));
  }
}

/** First paint: the portal's default window, then one search. */
export async function openDutySwap(dispatch: AppDispatch, getState: () => RootState, api: DutySwapApi): Promise<void> {
  const existing = getState().dutySwap.filters;
  if (existing) { await runSearch(dispatch, api, existing); return; }
  try {
    const w = await api.defaultWindow();
    await runSearch(dispatch, api, emptyFilters(w.startDate, w.endDate));
  } catch (e) {
    dispatch(searchFailed(msg(e)));
  }
}

const inflight = new Set<string>();
/** Compare detail (routes, legs, KPI fields) for crews in view — after first
 *  paint, only for visible crews, each fetched once per search. */
/** How many compare reads run at once. The portal answers ~0.3 s each; 16 at a
 *  time reads all 254 crews of a cabin search in about 5 s (measured). */
const DETAIL_CONCURRENCY = 16;
/** Every crew a screen lists gets its details, so cards name airports on arrival. */
const DETAIL_BATCH = 40;

/** Compare detail for many crews at once, with bounded concurrency. Each crew is
 *  read once per search; failures leave that crew's cards at code + times. */
export async function ensureAllDetails(dispatch: AppDispatch, getState: () => RootState, api: DutySwapApi, crewIds: string[]): Promise<void> {
  const ids = [...new Set(crewIds)];
  for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
    await Promise.all(ids.slice(i, i + DETAIL_BATCH).map(id => ensureDetails(dispatch, getState, api, [id])));
  }
}

export async function ensureDetails(dispatch: AppDispatch, getState: () => RootState, api: DutySwapApi, crewIds: string[]): Promise<void> {
  for (const id of crewIds) {
    const s = getState().dutySwap;
    if (!s.filters || s.details[id] || inflight.has(id)) continue;
    inflight.add(id);
    try {
      dispatch(detailLoaded({ crewId: id, compare: await api.compare(s.filters, id) }));
    } catch {
      // Cells stay at code + times; the compare sheet retries on open.
    } finally {
      inflight.delete(id);
    }
  }
}

export async function loadOptions(dispatch: AppDispatch, getState: () => RootState, api: DutySwapApi): Promise<void> {
  const f = getState().dutySwap.filters;
  if (!f || getState().dutySwap.options) return;
  dispatch(optionsLoaded(await api.options(f.startDate, f.endDate)));
}
