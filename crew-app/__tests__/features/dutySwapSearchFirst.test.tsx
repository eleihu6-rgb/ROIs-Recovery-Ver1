// Duty Swap starts at Search pairing (design D0), not at somebody else's duties:
// the crew finds the target crew with the filters — or R'Bot — and only then
// picks duties in the matrix. On the Duo inner screen the form sits beside a
// live preview of who matches.
import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import authReducer, { login } from '../../src/features/auth/authSlice';
import dutySwapReducer, { acceptDisclaimer, searchSucceeded, setStep, toggleGive } from '../../src/features/dutySwap/dutySwapSlice';
import rbotReducer from '../../src/features/rbot/rbotSlice';
import { DutySwapScreen } from '../../src/features/dutySwap/DutySwapScreen';
import { hhmmInput } from '../../src/features/dutySwap/components/SearchForm';
import { layoutFor } from '../../src/components/v2/useLayout';
import { toCrews, type ApiCrewRow, type SwapFilters } from '../../src/features/dutySwap/dutySwapModel';

const search: { data: ApiCrewRow[] } = require('../fixtures/dutySwap/search.json');

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined),
}));

const mockLayout = { current: layoutFor(420, 912) };
jest.mock('../../src/components/v2/useLayout', () => ({
  ...jest.requireActual('../../src/components/v2/useLayout'),
  useLayout: () => mockLayout.current,
}));

// The portal, as the PR TEST tenant answered for 392923 (fixture), behind the real API shape.
const mockApi = {
  disclaimer: jest.fn(async () => null),
  defaultWindow: jest.fn(async () => ({ startDate: '2026-10-07', endDate: '2026-11-02' })),
  search: jest.fn(async () => search.data),
  compare: jest.fn(async () => { throw new Error('not needed'); }),
  options: jest.fn(async () => ({ modes: ['NS'], taskTypes: ['HB', 'FB'], ranks: ['CP'], crews: [], ports: ['DOH', 'SEA'], flights: [], fleets: ['350', '333'] })),
};
jest.mock('../../src/features/dutySwap/dutySwapApi', () => ({ createDutySwapApi: () => mockApi }));

type Store = ReturnType<typeof makeStore>;
const makeStore = () => configureStore({ reducer: { auth: authReducer, dutySwap: dutySwapReducer, rbot: rbotReducer } });
async function open(prep?: (store: Store) => void, ready = 'search-form') {
  const store = makeStore();
  await store.dispatch(login({ airline: 'PR', crewId: '392923', password: 'pw', keepLogin: false }) as never);
  store.dispatch(acceptDisclaimer());
  prep?.(store);
  const ui = render(<Provider store={store}><DutySwapScreen /></Provider>);
  // Jest has no layout pass: give the body (and the Duo preview) a size.
  layout(ui, 'swap-area', 400, 700);
  await waitFor(() => expect(ui.getByTestId(ready)).toBeTruthy());
  await waitFor(() => expect(store.getState().dutySwap.status).toBe('ready'));
  return { store, ui };
}

const layout = (ui: ReturnType<typeof render>, id: string, width: number, height: number) =>
  fireEvent(ui.getByTestId(id), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } });

beforeEach(() => { jest.clearAllMocks(); mockLayout.current = layoutFor(420, 912); });

it.each([
  [420, 912], [912, 420], [669, 951], [951, 669], [834, 1210], [1210, 834],
])('uses the same compact Search Pairing controls at %sx%s', async (width, height) => {
  mockLayout.current = layoutFor(width, height);
  const { ui } = await open();
  expect(ui.getByTestId('search-start')).toBeTruthy();
  expect(ui.getByTestId('search-end')).toBeTruthy();
  expect(ui.getByTestId('search-briefStart').props.keyboardType).toBe('number-pad');
  expect(ui.getByTestId('search-briefStart').props.placeholder).toBe('From');
  expect(ui.getByTestId('search-briefEnd').props.placeholder).toBe('To');
  expect(ui.getByTestId('search-reset')).toBeTruthy();
  expect(ui.getByTestId('search-submit')).toBeTruthy();
});

it('normalizes plain HHMM typing for the shared report and flight-end controls', async () => {
  expect(hhmmInput('0830')).toBe('08:30');
  expect(hhmmInput('08:30')).toBe('08:30');
  expect(hhmmInput('8')).toBe('8');
  expect(hhmmInput('2561')).toBe('25:61');
  const { ui } = await open();
  fireEvent.changeText(ui.getByTestId('search-briefStart'), '0830');
  expect(ui.getByTestId('search-briefStart').props.value).toBe('08:30');
  fireEvent.changeText(ui.getByTestId('search-debriefEnd'), '1735');
  expect(ui.getByTestId('search-debriefEnd').props.value).toBe('17:35');
  fireEvent.changeText(ui.getByTestId('search-briefStart'), '2561');
  expect(ui.getByText('Report time: use HH:mm.')).toBeTruthy();
  expect(ui.getByTestId('search-submit').props.accessibilityState.disabled).toBe(true);
});

it('opens on Search pairing: no other crew\'s duties until the crew searches', async () => {
  const { store, ui } = await open();
  expect(ui.getByText('Search pairing')).toBeTruthy();
  expect(ui.getByText('New swap')).toBeTruthy();
  expect(ui.queryByTestId('crew-matrix')).toBeNull();
  expect(ui.queryByTestId('matrix-crew-421051')).toBeNull();
  expect(ui.queryByTestId('search-preview')).toBeNull(); // phone: no preview pane

  fireEvent.press(ui.getByTestId('search-submit'));
  await waitFor(() => expect(ui.getByTestId('crew-matrix')).toBeTruthy());
  expect(store.getState().dutySwap.step).toBe('pick');
  expect(ui.getByTestId('matrix-crew-421051')).toBeTruthy();
  expect(ui.getByText('Duty Swap')).toBeTruthy();

  // The filter chips go back to the search step.
  fireEvent.press(ui.getByTestId('swap-filters'));
  expect(ui.getByTestId('search-form')).toBeTruthy();
  expect(ui.queryByTestId('crew-matrix')).toBeNull();
});

it('the R\'Bot bar opens R\'Bot next to the form; its search lands in the matrix', async () => {
  const { store, ui } = await open();
  fireEvent.press(ui.getByTestId('search-ask-rbot'));
  expect(ui.getByTestId('swap-rbot-panel')).toBeTruthy();
  expect(ui.queryByTestId('search-ask-rbot')).toBeNull();

  // "Swap my trip on 08 Oct for a standby" is answered on the phone: search → matrix.
  fireEvent.press(ui.getAllByTestId('swap-rbot-suggestion')[0]);
  await waitFor(() => expect(store.getState().dutySwap.step).toBe('pick'));
  await waitFor(() => expect(ui.getByTestId('crew-matrix')).toBeTruthy());
  expect(ui.getByTestId('swap-rbot-panel')).toBeTruthy();
  expect(store.getState().dutySwap.filters).toMatchObject({ startDate: '2026-10-08', endDate: '2026-10-11' });
});

it('R\'Bot applies a US flight filter and leaves matching crew duties for the user to choose', async () => {
  mockApi.options.mockResolvedValueOnce({ modes: ['NS'], taskTypes: [], ranks: [], crews: [], ports: ['MNL', 'BKK'], flights: [], fleets: [] });
  (mockApi.search as jest.Mock).mockImplementation(async (f: SwapFilters) => f.fltArrList.length
    ? search.data.filter(row => ['392923', '402452'].includes(row.crewId))
    : search.data);
  const { store, ui } = await open();
  await waitFor(() => expect(store.getState().dutySwap.options?.ports).toEqual(['MNL', 'BKK']));
  fireEvent.press(ui.getByTestId('search-ask-rbot'));
  fireEvent.changeText(ui.getByTestId('swap-rbot-input'), 'Find crew with US flight to swap');
  fireEvent.press(ui.getByTestId('swap-rbot-send'));

  await waitFor(() => expect(store.getState().dutySwap.step).toBe('pick'));
  await waitFor(() => expect(ui.getByTestId('matrix-crew-402452')).toBeTruthy());
  expect(mockApi.search).toHaveBeenLastCalledWith(expect.objectContaining({
    fltArrList: expect.arrayContaining(['LAX', 'SEA']), fltFleetList: [],
  }));
  expect(store.getState().dutySwap.take).toEqual([]);
  fireEvent.press(ui.getByTestId('duty-402452-PR124/PR125'));
  expect(store.getState().dutySwap.crewB).toBe('402452');
  expect(store.getState().dutySwap.take).toHaveLength(1);
});

it('Duo inner screen: the form sits beside a live preview of the matching crews', async () => {
  mockLayout.current = layoutFor(951, 669);
  const { ui } = await open();
  expect(ui.getByTestId('search-preview')).toBeTruthy();
  expect(ui.getByText(/Preview · \d+ crew/)).toBeTruthy();
  expect(within(ui.getByTestId('search-submit')).getByText(/· \d+ crew/)).toBeTruthy();
  layout(ui, 'search-preview-body', 460, 560);
  expect(mockApi.search).toHaveBeenCalledTimes(1);

  // A filter edit re-runs the preview search (debounced), still on the search step.
  jest.useFakeTimers();
  fireEvent.press(ui.getByTestId('search-end-prev'));
  await act(async () => { jest.advanceTimersByTime(800); });
  jest.useRealTimers();
  await waitFor(() => expect(mockApi.search).toHaveBeenCalledTimes(2));
  expect(mockApi.search).toHaveBeenLastCalledWith(expect.objectContaining({ endDate: '2026-11-01' }));
  expect(ui.queryByTestId('crew-matrix-scroll')).toBeTruthy(); // the preview matrix
  expect(ui.getByTestId('search-form')).toBeTruthy();
});

it('each visit is a new swap: Search pairing with nothing picked (no leftover give duty)', async () => {
  // Left last time on the matrix with my 08 Oct trip picked to give.
  const crews = toCrews(search.data);
  const mine = crews[0].duties.find(d => d.code === 'PR124/PR125')!.key;
  const { store, ui } = await open(st => {
    st.dispatch(searchSucceeded(crews));
    st.dispatch(toggleGive(mine));
    st.dispatch(setStep('pick'));
  });
  expect(store.getState().dutySwap).toMatchObject({ step: 'search', give: [], take: [], crewB: null });

  fireEvent.press(ui.getByTestId('search-submit'));
  await waitFor(() => expect(ui.getByTestId('crew-matrix')).toBeTruthy());
  expect(ui.queryByTestId('swap-tray')).toBeNull(); // nothing picked → hint, no GIVE tray
});

it('the ✕ left of the star closes the filters back to the matrix, once there is a result', async () => {
  const { store, ui } = await open();
  expect(store.getState().dutySwap.crews.length).toBeGreaterThan(0); // the window's crews are loaded
  fireEvent.press(ui.getByTestId('search-submit'));
  await waitFor(() => expect(ui.getByTestId('crew-matrix')).toBeTruthy());

  fireEvent.press(ui.getByTestId('swap-filters'));
  const head = ui.getByTestId('search-form');
  const order = (n: { props: { testID?: string }; children: unknown[] }): string[] =>
    [n.props.testID, ...n.children.flatMap(c => (typeof c === 'object' && c && 'props' in c ? order(c as never) : []))].filter((x): x is string => !!x);
  const ids = order(head as never);
  expect(ids.indexOf('search-close')).toBeLessThan(ids.indexOf('search-save'));

  const calls = mockApi.search.mock.calls.length;
  fireEvent.press(ui.getByTestId('search-close'));
  expect(store.getState().dutySwap.step).toBe('pick');
  expect(ui.getByTestId('crew-matrix')).toBeTruthy();
  expect(ui.queryByTestId('search-form')).toBeNull();
  expect(mockApi.search).toHaveBeenCalledTimes(calls); // closing does not search again
});

it('Duo: R\'Bot suggestions are one-line pills that wrap, not panel-high cards', async () => {
  mockLayout.current = layoutFor(951, 669);
  const { ui } = await open();
  fireEvent.press(ui.getByTestId('search-ask-rbot'));
  const row = StyleSheet.flatten(ui.getByTestId('swap-rbot-suggestions').props.style);
  expect(row).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
  expect(row.flex ?? row.flexGrow ?? 0).toBe(0);
  for (const pill of ui.getAllByTestId('swap-rbot-suggestion')) {
    expect(within(pill).getByText(/.+/).props.numberOfLines).toBe(1);
  }
  expect(ui.getAllByTestId('swap-rbot-suggestion').length).toBeGreaterThanOrEqual(2);
});

it('the filter lists load after the first search lands (the portal queues a crew\'s calls)', async () => {
  let land: (rows: ApiCrewRow[]) => void = () => undefined;
  mockApi.search.mockImplementationOnce(() => new Promise<ApiCrewRow[]>(r => { land = r; }));
  const store = makeStore();
  await store.dispatch(login({ airline: 'PR', crewId: '392923', password: 'pw', keepLogin: false }) as never);
  store.dispatch(acceptDisclaimer());
  const ui = render(<Provider store={store}><DutySwapScreen /></Provider>);
  layout(ui, 'swap-area', 400, 700);
  await waitFor(() => expect(mockApi.search).toHaveBeenCalledTimes(1));
  await act(async () => { await new Promise(r => setTimeout(r, 50)); });
  expect(mockApi.options).not.toHaveBeenCalled(); // nothing queued in front of the search
  await act(async () => { land(search.data); });
  await waitFor(() => expect(mockApi.options).toHaveBeenCalledTimes(1));
});
