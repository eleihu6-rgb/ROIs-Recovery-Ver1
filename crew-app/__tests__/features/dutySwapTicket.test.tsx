// Ticket navigation regression: multi-duty give, retained filters and one review.
// Fixtures: the PR TEST portal's answers for 392923 (search + 421051's compare).
import React from 'react';
import '@testing-library/jest-native/extend-expect';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

import authReducer, { login } from '../../src/features/auth/authSlice';
import dutySwapReducer, { acceptDisclaimer } from '../../src/features/dutySwap/dutySwapSlice';
import rbotReducer from '../../src/features/rbot/rbotSlice';
import { TicketScreen } from '../../src/features/dutySwap/market/TicketScreen';
import { layoutFor } from '../../src/components/v2/useLayout';
import { toCrews, type ApiCompare, type ApiCrewRow } from '../../src/features/dutySwap/dutySwapModel';
import { outOfDuties } from '../../src/features/dutySwap/market/marketModel';
import { PALETTES } from '../../src/theme/carrier';

const search: { data: ApiCrewRow[] } = require('../fixtures/dutySwap/search.json');
const compare421051: { data: ApiCompare } = require('../fixtures/dutySwap/compare-421051.json');

const mockInsets = { current: { top: 0, right: 0, bottom: 0, left: 0 } };
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets.current }));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
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

const mockApi = {
  disclaimer: jest.fn(async () => null),
  defaultWindow: jest.fn(async () => ({ startDate: '2026-10-07', endDate: '2026-11-02' })),
  search: jest.fn(async () => search.data),
  compare: jest.fn(async (_f: unknown, id: string) => {
    if (id === '421051') return compare421051.data;
    throw new Error('no detail');
  }),
  options: jest.fn(async () => ({ modes: ['NS'], taskTypes: [], ranks: [], crews: [], ports: [], flights: [], fleets: [] })),
  submit: jest.fn(async () => ({ ok: true as const })),
};
jest.mock('../../src/features/dutySwap/dutySwapApi', () => ({ createDutySwapApi: () => mockApi }));

const crews = toCrews(search.data);
const me = crews[0];
const pr124 = me.duties.find(d => d.code === 'PR124/PR125')!;

beforeEach(() => {
  jest.clearAllMocks();
  mockLayout.current = layoutFor(420, 912);
  mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async () => null);
});

type Store = ReturnType<typeof makeStore>;
const makeStore = () => configureStore({ reducer: { auth: authReducer, dutySwap: dutySwapReducer, rbot: rbotReducer } });
async function mount(ui: React.ReactElement): Promise<{ store: Store; r: ReturnType<typeof render> }> {
  const store = makeStore();
  await store.dispatch(login({ airline: 'PR', crewId: '392923', password: 'pw', keepLogin: false }) as never);
  store.dispatch(acceptDisclaimer());
  const r = render(<Provider store={store}>{ui}</Provider>);
  return { store, r };
}


describe('Ticket navigation', () => {
  it.each([[420,912],[912,420],[669,951],[951,669],[834,1210],[1210,834]])('keeps numbered stages and contained duty summaries at %sx%s', async (w,h) => {
    mockLayout.current = layoutFor(w,h);
    const {r} = await mount(<TicketScreen />);
    const expectSummarySurface = (testID: string) => {
      expect(r.getByTestId(testID)).toHaveStyle({
        backgroundColor: PALETTES.sia.cardSolid,
        borderColor: PALETTES.sia.cardLine,
        borderWidth: 1,
      });
    };
    await waitFor(() => expect(r.getByTestId(`ticket-give-${pr124.key}`)).toBeTruthy());
    for (const [i, name] of ['give','want','match','send'].entries()) {
      expect(within(r.getByTestId(`ticket-stage-${name}`)).getByText(String(i+1))).toBeTruthy();
    }
    expect(r.getByTestId('ticket-next')).toBeDisabled();
    fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
    expect(r.getByTestId('ticket-give')).toBeTruthy();
    expect(r.getByTestId(`ticket-give-${pr124.key}`)).toHaveAccessibilityState({checked:true});
    fireEvent.press(r.getByTestId('ticket-next'));
    expect(within(r.getByTestId('ticket-selected-give')).getByText(pr124.code)).toBeTruthy();
    expectSummarySurface('ticket-selected-give');
    fireEvent.press(r.getByTestId('ticket-next'));
    await waitFor(() => expect(r.getByTestId('ticket-match-421051')).toBeTruthy());
    expectSummarySurface('ticket-selected-give');
    expect(r.getByTestId('ticket-match-421051')).toHaveAccessibilityState({selected:false});
    fireEvent.press(r.getByTestId('ticket-match-421051'));
    expect(r.getByTestId('ticket-match-421051')).toHaveAccessibilityState({selected:true});
    expect(r.getByTestId('ticket-matches')).toBeTruthy();
    fireEvent.press(r.getByTestId('ticket-next'));
    expect(r.getAllByTestId('swap-ticket')).toHaveLength(1);
    expect(r.getAllByTestId('ticket-send')).toHaveLength(1);
    expectSummarySurface('ticket-selected-give');
    expectSummarySurface('ticket-selected-take');
    fireEvent.changeText(r.getByTestId('ticket-note'), 'Keep my note');
    fireEvent.press(r.getByTestId('ticket-back'));
    fireEvent.press(r.getByTestId('ticket-next'));
    expect(r.getByTestId('ticket-note').props.value).toBe('Keep my note');
  });
});

it('retains multiple selected duties across target filters and submits exactly the reviewed bundle', async () => {
  const second = outOfDuties(me).find(d => d.key !== pr124.key)!;
  const {r} = await mount(<TicketScreen />);
  await waitFor(() => expect(r.getByTestId(`ticket-give-${pr124.key}`)).toBeTruthy());
  for (const d of [pr124,second]) fireEvent.press(r.getByTestId(`ticket-give-${d.key}`));
  fireEvent.press(r.getByTestId('ticket-next'));
  for (const d of [pr124,second]) expect(within(r.getByTestId('ticket-selected-give')).getByText(d.code)).toBeTruthy();
  fireEvent.press(r.getByTestId('ticket-back'));
  for (const d of [pr124,second]) expect(r.getByTestId(`ticket-give-${d.key}`)).toHaveAccessibilityState({checked:true});
  fireEvent.press(r.getByTestId('ticket-next'));
  // A target search can omit one of my selected duties; never replace it.
  mockApi.search.mockImplementationOnce(async () => search.data.map((row,i) => i ? row : {...row, cellVoList: []}));
  fireEvent.press(r.getByTestId('ticket-next'));
  await waitFor(() => expect(r.getByTestId('ticket-match-421051')).toBeTruthy());
  fireEvent.press(r.getByTestId('ticket-match-421051'));
  fireEvent.press(r.getByTestId('ticket-next'));
  for (const d of [pr124,second]) expect(within(r.getByTestId('ticket-selected-give')).getByText(d.code)).toBeTruthy();
  fireEvent.press(r.getByTestId('ticket-send'));
  await waitFor(() => expect(mockApi.submit).toHaveBeenCalled());
  expect(mockApi.submit).toHaveBeenCalledWith(expect.objectContaining({
    minePairingIdList: [pr124,second].filter(d => !d.isGround).map(d => d.id),
  }));
});
it('hides stale matches after search failure and allows editing filters', async () => {
  const {r} = await mount(<TicketScreen />);
  await waitFor(() => expect(r.getByTestId(`ticket-give-${pr124.key}`)).toBeTruthy());
  fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
  fireEvent.press(r.getByTestId('ticket-next'));
  mockApi.search.mockRejectedValueOnce(new Error('Portal unavailable') as never);
  fireEvent.press(r.getByTestId('ticket-next'));
  await waitFor(() => expect(r.getByText('Portal unavailable')).toBeTruthy());
  expect(r.queryByTestId('ticket-match-421051')).toBeNull();
  expect(r.getByTestId('ticket-next')).toBeDisabled();
  fireEvent.press(r.getByTestId('ticket-back'));
  expect(r.getByTestId('search-form')).toBeTruthy();
});
it('clears a chosen match when Give changes and supports deselecting the last duty', async () => {
  const {r} = await mount(<TicketScreen />);
  await waitFor(() => expect(r.getByTestId(`ticket-give-${pr124.key}`)).toBeTruthy());
  fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
  fireEvent.press(r.getByTestId('ticket-next'));
  fireEvent.press(r.getByTestId('search-start-next'));
  fireEvent.press(r.getByTestId('ticket-next'));
  await waitFor(() => expect(r.getByTestId('ticket-match-421051')).toBeTruthy());
  expect(mockApi.search).toHaveBeenLastCalledWith(expect.objectContaining({startDate:'2026-10-08'}));
  fireEvent.press(r.getByTestId('ticket-match-421051'));
  fireEvent.press(r.getByTestId('ticket-back'));
  expect(r.getByTestId('search-start').props.children.join('')).toContain('8');
  fireEvent.press(r.getByTestId('ticket-back'));
  fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
  expect(r.getByTestId('ticket-next')).toBeDisabled();
  fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
  fireEvent.press(r.getByTestId('ticket-next'));
  fireEvent.press(r.getByTestId('ticket-next'));
  await waitFor(() => expect(r.getByTestId('ticket-match-421051')).toBeTruthy());
  expect(r.getByTestId('ticket-next')).toBeDisabled();
});
