// Match mode (the approach formerly labelled Ticket) + per-duty saved wants.
// Spec: docs/superpowers/specs/2026-10-19-crew-app-match-mode-want-Ver1.md
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
import { ApproachSwitch } from '../../src/features/dutySwap/market/ApproachSwitch';
import { PALETTES } from '../../src/theme/carrier';
import { layoutFor } from '../../src/components/v2/useLayout';
import {
  emptyFilters, toCrews, type ApiCompare, type ApiCrewRow, type SwapFilters,
} from '../../src/features/dutySwap/dutySwapModel';
import {
  hasWantCriteria, parseWants, savedWantFor, wantCriteria, wantLabel, wantStoreKey,
} from '../../src/features/dutySwap/market/marketModel';

const search: { data: ApiCrewRow[] } = require('../fixtures/dutySwap/search.json');
const compare421051: { data: ApiCompare } = require('../fixtures/dutySwap/compare-421051.json');

const mockInsets = { current: { top: 0, right: 0, bottom: 0, left: 0 } };
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets.current }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));
const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStorage[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStorage[k] = v; }),
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
const second = me.duties.find(d => d.swappable && d.kind !== 'off' && d.key !== pr124.key)!;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  mockLayout.current = layoutFor(420, 912);
  mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
});

type Store = ReturnType<typeof makeStore>;
const makeStore = () => configureStore({ reducer: { auth: authReducer, dutySwap: dutySwapReducer, rbot: rbotReducer } });
async function mount(): Promise<{ store: Store; r: ReturnType<typeof render> }> {
  const store = makeStore();
  await store.dispatch(login({ airline: 'PR', crewId: '392923', password: 'pw', keepLogin: false }) as never);
  store.dispatch(acceptDisclaimer());
  const r = render(<Provider store={store}><TicketScreen /></Provider>);
  await waitFor(() => expect(r.getByTestId(`ticket-give-${pr124.key}`)).toBeTruthy());
  return { store, r };
}

const wantKey = wantStoreKey('PR', '392923');
const dateText = (r: ReturnType<typeof render>, id: string) => r.getByTestId(id).props.children.join('');

// ── Model ───────────────────────────────────────────────────────────────────
describe('saved-want model', () => {
  const base = (): SwapFilters => ({ ...emptyFilters('2026-10-19', '2026-10-31'), taskTypeList: ['SBY'], fltFleetList: ['320'] });

  it('summarises the used criteria with Start/End first and caps the step-1 line', () => {
    const c = wantCriteria(base());
    expect(c.start).toBe('19 Oct');
    expect(c.end).toBe('31 Oct');
    expect(c.range).toBe('19–31 Oct');
    expect(c.others).toEqual(['SBY', '320']);
    expect(wantLabel(base())).toBe('19–31 Oct · SBY · 320');

    const many = { ...base(), taskTypeList: ['SBY', 'HB'], fltFleetList: ['320', '350'], layoverPortList: ['DOH'] };
    expect(wantCriteria(many).others).toEqual(['SBY', 'HB', '320', '350', 'DOH']);
    expect(wantLabel(many)).toBe('19–31 Oct · SBY · HB · 320 · +2');
  });

  it('a want needs something beyond the untouched window', () => {
    const defaults = { startDate: '2026-10-19', endDate: '2026-10-31' };
    expect(hasWantCriteria(emptyFilters(defaults.startDate, defaults.endDate), defaults)).toBe(false);
    expect(hasWantCriteria({ ...emptyFilters(defaults.startDate, defaults.endDate), startDate: '2026-10-20' }, defaults)).toBe(true);
    expect(hasWantCriteria({ ...emptyFilters(defaults.startDate, defaults.endDate), swapMode: 'FS' }, defaults)).toBe(true);
    expect(hasWantCriteria({ ...emptyFilters(defaults.startDate, defaults.endDate), taskTypeList: ['SBY'] }, defaults)).toBe(true);
  });

  it('keeps wants per duty and applies the most recently selected one', () => {
    const a = base(), b = { ...base(), endDate: '2026-11-02' };
    const wants = { [pr124.key]: a, [second.key]: b };
    expect(savedWantFor([pr124, second], wants)).toBe(b);
    expect(savedWantFor([second, pr124], wants)).toBe(a);
    expect(savedWantFor([pr124], {})).toBeNull();
  });

  it('reads storage safely and keys it by airline + crew', () => {
    expect(wantStoreKey('PR', '392923')).toBe('@duty_swap_want_PR_392923');
    expect(parseWants('not json')).toEqual({});
    expect(parseWants('[]')).toEqual({});
    expect(parseWants(null)).toEqual({});
    const f = base();
    expect(parseWants(JSON.stringify({ [pr124.key]: f }))).toEqual({ [pr124.key]: f });
  });
});

// ── Screen ──────────────────────────────────────────────────────────────────
describe('Match mode screen', () => {
  it('is named Match and stage 3 is Pick', async () => {
    const switchView = render(<ApproachSwitch palette={PALETTES.graphite} value="ticket" onChange={() => {}} variant="header" />);
    expect(within(switchView.getByTestId('approach-ticket')).getByText('Match')).toBeTruthy();

    const { r } = await mount();
    expect(within(r.getByTestId('ticket-stage-match')).getByText('Pick')).toBeTruthy();
    expect(within(r.getByTestId('ticket-stage-give')).getByText('Give')).toBeTruthy();
  });

  it('enables the star only once a want is expressed, saves it per duty and shows it on step 1', async () => {
    const { r } = await mount();
    fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
    fireEvent.press(r.getByTestId('ticket-next'));

    // Untouched window: Start/End are shown but there is nothing to save yet.
    expect(r.getByTestId('search-want-summary')).toBeTruthy();
    expect(r.getByText('Start 07 Oct')).toBeTruthy();
    expect(r.getByText('End 02 Nov')).toBeTruthy();
    expect(r.getByTestId('search-save-want')).toBeDisabled();

    fireEvent.press(r.getByTestId('search-start-next'));
    expect(r.getByText('Start 08 Oct')).toBeTruthy();
    await waitFor(() => expect(r.getByTestId('search-save-want')).not.toBeDisabled());
    fireEvent.press(r.getByTestId('search-save-want'));

    await waitFor(() => expect(mockStorage[wantKey]).toBeTruthy());
    expect(parseWants(mockStorage[wantKey])[pr124.key]).toMatchObject({ startDate: '2026-10-08', endDate: '2026-11-02' });
    expect(r.getByTestId('search-save-want')).toHaveAccessibilityState({ selected: true });

    fireEvent.press(r.getByTestId('ticket-back'));
    const chip = r.getByTestId(`ticket-want-${pr124.key}`);
    expect(within(chip).getByText('08 Oct → 02 Nov')).toBeTruthy();
  });

  it('applies the saved want in step 2 when the duty is selected again', async () => {
    const { r } = await mount();
    fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
    fireEvent.press(r.getByTestId('ticket-next'));
    fireEvent.press(r.getByTestId('search-start-next'));
    await waitFor(() => expect(r.getByTestId('search-save-want')).not.toBeDisabled());
    fireEvent.press(r.getByTestId('search-save-want'));
    await waitFor(() => expect(mockStorage[wantKey]).toBeTruthy());
    fireEvent.press(r.getByTestId('ticket-back'));

    // Selection changed → the draft is dropped, then the saved want is applied.
    fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
    fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
    fireEvent.press(r.getByTestId('ticket-next'));
    expect(dateText(r, 'search-start')).toBe('08 Oct 2026');
    expect(r.getByText('Start 08 Oct')).toBeTruthy();
    expect(r.getByTestId('search-save-want')).toHaveAccessibilityState({ selected: true });
  });

  it('does not leak one duty\'s want onto another duty', async () => {
    const { r } = await mount();
    fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
    fireEvent.press(r.getByTestId('ticket-next'));
    fireEvent.press(r.getByTestId('search-start-next'));
    await waitFor(() => expect(r.getByTestId('search-save-want')).not.toBeDisabled());
    fireEvent.press(r.getByTestId('search-save-want'));
    await waitFor(() => expect(mockStorage[wantKey]).toBeTruthy());
    fireEvent.press(r.getByTestId('ticket-back'));

    fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
    fireEvent.press(r.getByTestId(`ticket-give-${second.key}`));
    expect(r.queryByTestId(`ticket-want-${second.key}`)).toBeNull();
    expect(r.getByTestId(`ticket-want-${pr124.key}`)).toBeTruthy();
    fireEvent.press(r.getByTestId('ticket-next'));
    expect(dateText(r, 'search-start')).toBe('07 Oct 2026');
  });

  it('keeps the saved wants after the app remounts, keyed by airline and crew', async () => {
    const first = await mount();
    fireEvent.press(first.r.getByTestId(`ticket-give-${pr124.key}`));
    fireEvent.press(first.r.getByTestId('ticket-next'));
    fireEvent.press(first.r.getByTestId('search-end-prev'));
    await waitFor(() => expect(first.r.getByTestId('search-save-want')).not.toBeDisabled());
    fireEvent.press(first.r.getByTestId('search-save-want'));
    await waitFor(() => expect(mockStorage[wantKey]).toBeTruthy());
    first.r.unmount();

    const second = await mount();
    expect(second.r.getByTestId(`ticket-want-${pr124.key}`)).toBeTruthy();
    fireEvent.press(second.r.getByTestId(`ticket-give-${pr124.key}`));
    fireEvent.press(second.r.getByTestId('ticket-next'));
    expect(dateText(second.r, 'search-end')).toBe('01 Nov 2026');
    // A TG account never sees the PR want.
    expect(wantStoreKey('TG', '392923')).not.toBe(wantKey);
  });
});
