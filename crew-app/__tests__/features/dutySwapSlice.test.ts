// Duty Swap screen state: selection rules, re-search hygiene, and logout
// clearing PR portal data (no PR crews/duties leak into the next account).
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { login, logout } from '../../src/features/auth/authSlice';
import dutySwapReducer, {
  acceptDisclaimer, detailLoaded, searchStarted, searchSucceeded, toggleGive, toggleTake,
} from '../../src/features/dutySwap/dutySwapSlice';
import { emptyFilters, toCrews, type ApiCompare, type ApiCrewRow } from '../../src/features/dutySwap/dutySwapModel';

const search: { data: ApiCrewRow[] } = require('../fixtures/dutySwap/search.json');
const cmp: { data: ApiCompare } = require('../fixtures/dutySwap/compare-421051.json');
const crews = toCrews(search.data);
const key = (crewId: string, code: string) => crews.find(c => c.crewId === crewId)!.duties.find(d => d.code === code)!.key;
const makeStore = () => configureStore({ reducer: { auth: authReducer, dutySwap: dutySwapReducer } });

it('taking a duty from a different crew makes them crew B and drops the previous take', () => {
  const store = makeStore();
  store.dispatch(searchSucceeded(crews));
  store.dispatch(toggleTake({ crewId: '421051', key: key('421051', '1HB') }));
  store.dispatch(toggleTake({ crewId: '421051', key: key('421051', '4FB') }));
  expect(store.getState().dutySwap).toMatchObject({ crewB: '421051', take: [key('421051', '1HB'), key('421051', '4FB')] });
  store.dispatch(toggleTake({ crewId: '402452', key: key('402452', 'PR124/PR125') }));
  expect(store.getState().dutySwap).toMatchObject({ crewB: '402452', take: [key('402452', 'PR124/PR125')] });
  store.dispatch(toggleTake({ crewId: '402452', key: key('402452', 'PR124/PR125') }));
  expect(store.getState().dutySwap.take).toEqual([]);
});

it('a new search keeps selections that still exist, drops compare detail when filters change', () => {
  const store = makeStore();
  const f = emptyFilters('2026-10-07', '2026-11-02');
  store.dispatch(searchStarted(f));
  store.dispatch(searchSucceeded(crews));
  store.dispatch(toggleGive(key('392923', 'PR124/PR125')));
  store.dispatch(toggleTake({ crewId: '421051', key: key('421051', '1HB') }));
  store.dispatch(detailLoaded({ crewId: '421051', compare: cmp.data }));
  // Narrower search: 421051 no longer in the result.
  store.dispatch(searchStarted({ ...f, fltFleetList: ['333'] }));
  store.dispatch(searchSucceeded(crews.filter(c => c.crewId !== '421051')));
  const s = store.getState().dutySwap;
  expect(s.details).toEqual({});
  expect(s.give).toEqual([key('392923', 'PR124/PR125')]);
  expect([s.crewB, s.take]).toEqual([null, []]);
});

it('logout clears every Duty Swap result (account switch keeps PR data out of the next crew)', async () => {
  const store = makeStore();
  await store.dispatch(login({ airline: 'PR', crewId: '392923', password: 'pw', keepLogin: false }) as never);
  store.dispatch(searchStarted(emptyFilters('2026-10-07', '2026-11-02')));
  store.dispatch(searchSucceeded(crews));
  store.dispatch(detailLoaded({ crewId: '421051', compare: cmp.data }));
  store.dispatch(acceptDisclaimer());
  await store.dispatch(logout() as never);
  expect(store.getState().dutySwap).toMatchObject({ crews: [], details: {}, filters: null, give: [], take: [], crewB: null, disclaimerAccepted: false });
});

it('keeps the R\'Bot thread in the store (rotation/fold remounts the panel) and clears it on logout', async () => {
  const { rbotAppend } = require('../../src/features/dutySwap/dutySwapSlice');
  const store = makeStore();
  await store.dispatch(login({ airline: 'PR', crewId: '392923', password: 'pw', keepLogin: false }) as never);
  store.dispatch(rbotAppend({ role: 'user', content: 'Swap my trip on 08 Oct for a standby' }));
  store.dispatch(rbotAppend({ role: 'assistant', content: '2 crew on 08 Oct–11 Oct', chips: ['Standby only'], local: true }));
  expect(store.getState().dutySwap.rbot).toHaveLength(2);
  await store.dispatch(logout() as never);
  expect(store.getState().dutySwap.rbot).toEqual([]);
});
