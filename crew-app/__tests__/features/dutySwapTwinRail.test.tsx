import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Line } from 'react-native-svg';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

import authReducer, { login } from '../../src/features/auth/authSlice';
import dutySwapReducer, { acceptDisclaimer, clearDutySwap } from '../../src/features/dutySwap/dutySwapSlice';
import rbotReducer from '../../src/features/rbot/rbotSlice';
import { TwinRailScreen } from '../../src/features/dutySwap/twinRail/TwinRailScreen';
import { parseApproach } from '../../src/features/dutySwap/market/marketModel';
import { submitBody, toCrews, type ApiCompare, type ApiCrewRow, type SwapFilters } from '../../src/features/dutySwap/dutySwapModel';
import { dutiesOn, monthDays, moveWindow, puckLines, railBlocks, shiftMonth, zoomForPinch } from '../../src/features/dutySwap/twinRail/twinRailModel';
import { DutySwapHost } from '../../src/features/dutySwap/market/DutySwapHost';
import { layoutFor } from '../../src/components/v2/useLayout';
import { CarrierContext, glassTint, paletteFor, type CarrierPalette } from '../../src/theme/carrier';
import { colors } from '../../src/theme';

const search: { data: ApiCrewRow[] } = require('../fixtures/dutySwap/search.json');
const compare421051: { data: ApiCompare } = require('../fixtures/dutySwap/compare-421051.json');

const mockInsets = { current: { top: 0, right: 0, bottom: 0, left: 0 } };
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets.current }));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }), useFocusEffect: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) }));
const mockLayout = { current: layoutFor(420, 912) };
jest.mock('../../src/components/v2/useLayout', () => ({ ...jest.requireActual('../../src/components/v2/useLayout'), useLayout: () => mockLayout.current }));

let mockCompareFailures = 0;
let mockSubmitResponses: Array<() => Promise<{ ok: true }>> = [];
const mockApi = {
  disclaimer: jest.fn(async () => null),
  defaultWindow: jest.fn(async () => ({ startDate: '2026-10-07', endDate: '2026-11-02' })),
  search: jest.fn(async (filters?: SwapFilters) => filters?.crewIdList.length
    ? search.data.filter((row, i) => i === 0 || filters.crewIdList.includes(row.crewId))
    : filters?.filterEmptyDutyCrew ? search.data.filter(row => row.crewId !== '421051') : search.data),
  compare: jest.fn(async (_filters: unknown, crewId: string) => {
    if (crewId === '421051' && mockCompareFailures > 0) {
      mockCompareFailures -= 1;
      throw new Error('temporary compare failure');
    }
    if (crewId === '421051') return compare421051.data;
    throw new Error(`no compare fixture for ${crewId}`);
  }),
  options: jest.fn(async () => ({ modes: ['NS'], taskTypes: [], ranks: [], crews: [{ crewId: '421051', crewName: 'Fixture crew' }], ports: [], flights: [], fleets: [] })),
  submit: jest.fn(async () => {
    const next = mockSubmitResponses.shift();
    return next ? next() : { ok: true as const };
  }),
};
jest.mock('../../src/features/dutySwap/dutySwapApi', () => ({ createDutySwapApi: () => mockApi }));

const crews = toCrews(search.data);
const mine = crews[0];
const myPairing = mine.duties.find(d => d.code === 'PR124/PR125')!;
const exam = mine.duties.find(d => d.code === 'EXAM')!;
const crewB = crews.find(c => c.crewId === '421051')!;
const standby = crewB.duties.find(d => d.code === '1HB')!;
const fourFb = crewB.duties.find(d => d.code === '4FB')!;
const nextCrew = crews.find(c => c.crewId === '402452')!;
const otherStandby = nextCrew.duties.find(d => d.code === '3FB' && d.startDt.startsWith('2026-10-11'))!;

beforeEach(() => {
  jest.clearAllMocks();
  mockCompareFailures = 0;
  mockSubmitResponses = [];
  mockLayout.current = layoutFor(420, 912);
  mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
});

const makeStore = () => configureStore({ reducer: { auth: authReducer, dutySwap: dutySwapReducer, rbot: rbotReducer } });
type Store = ReturnType<typeof makeStore>;

async function mountTwin(airline = 'PR', crewId = '392923', palette?: CarrierPalette): Promise<{ store: Store; r: ReturnType<typeof render> }> {
  const store = makeStore();
  await store.dispatch(login({ airline, crewId, password: 'test-password', keepLogin: false }) as never);
  store.dispatch(acceptDisclaimer());
  const screen = palette ? <CarrierContext.Provider value={palette}><TwinRailScreen /></CarrierContext.Provider> : <TwinRailScreen />;
  const r = render(<Provider store={store}>{screen}</Provider>);
  await waitFor(() => expect(r.getByTestId('twin-search')).toBeTruthy());
  return { store, r };
}

async function chooseOct8Pairing(r: ReturnType<typeof render>): Promise<void> {
  fireEvent.changeText(r.getByTestId('twin-search-startDate'), '2026-10-08');
  fireEvent.press(r.getByTestId('twin-search-submit'));
  await waitFor(() => expect(r.getByTestId('twin-rails')).toBeTruthy());
  fireEvent.press(r.getByTestId(`twin-duty-${myPairing.key}`));
  expect(r.getByTestId('twin-window').props.children.join('')).toBe('08 Oct – 14 Oct');
  fireEvent.press(r.getByTestId('twin-zoom-3'));
  expect(r.getByTestId('twin-window').props.children.join('')).toBe('08 Oct – 10 Oct');
  fireEvent.press(r.getByTestId('twin-later'));
  expect(r.getByTestId('twin-window').props.children.join('')).toBe('11 Oct – 13 Oct');
  fireEvent.press(r.getByTestId('twin-earlier'));
  expect(r.getByTestId('twin-window').props.children.join('')).toBe('08 Oct – 10 Oct');
  fireEvent.press(r.getByTestId('twin-zoom-7'));
}

async function chooseStandbys(r: ReturnType<typeof render>): Promise<void> {
  fireEvent.press(r.getByTestId(`twin-duty-${standby.key}`));
  fireEvent.press(r.getByTestId(`twin-duty-${fourFb.key}`));
  fireEvent.press(r.getByTestId('twin-review-open'));
  await waitFor(() => expect(r.getByTestId('twin-review')).toBeTruthy());
}

describe('Twin Rail model', () => {
  it('pinches horizontally in and out and adapts content within two fixed-height text lines', () => {
    expect(zoomForPinch(7, 2.5)).toBe(3);
    expect(zoomForPinch(3, 0.25)).toBe(14);
    expect(zoomForPinch(14, 1)).toBe(14);
    expect(zoomForPinch(7, 0)).toBe(7);
    const detail = compare421051.data.mineTaskDetailList.find(t => t.pairingId === myPairing.id)!;
    expect(puckLines(myPairing, detail, 44)).toEqual(['PR124/125']);
    expect(puckLines(myPairing, detail, 100)[1]).toMatch(/\d\d:\d\d–\d\d:\d\d/);
    expect(puckLines(myPairing, detail, 200)[1]).toContain('MNL–SEA–MNL');
    // Every leg's flight number now carries its airports after it (MNL-SEA style).
    expect(puckLines(myPairing, detail, 440, 'PR')[1]).toContain('PR124 MNL-SEA / PR125 SEA-MNL');
    // The wide puck drops trailing pieces rather than the height (two lines, fixed);
    // the leg list replaces the old airport-only chain, which carried the same facts.
    expect(puckLines(myPairing, detail, 440, 'PR')[1]).not.toContain('MNL–SEA–MNL');
    for (const width of [200, 320, 440, 640, 900]) {
      const line = puckLines(myPairing, detail, width, 'PR')[1];
      expect(line.length).toBeLessThanOrEqual(Math.floor((width - 8) / 6.5));
    }
    for (const width of [44, 100, 200, 440]) expect(puckLines(myPairing, detail, width).length).toBeLessThanOrEqual(2);
  });
  it('clips duty blocks at midnight and the window edges, and places overlapping duties in separate lanes', () => {
    const duties = [
      { ...myPairing, key: 'before', startDt: '2026-10-07T12:00:00', endDt: '2026-10-08T12:00:00' },
      { ...myPairing, key: 'overlap', startDt: '2026-10-08T06:00:00', endDt: '2026-10-09T00:00:00' },
      { ...myPairing, key: 'touch', startDt: '2026-10-09T00:00:00', endDt: '2026-10-09T12:00:00' },
      { ...myPairing, key: 'after', startDt: '2026-10-11T00:00:00', endDt: '2026-10-12T00:00:00' },
      { ...myPairing, key: 'outside-before', startDt: '2026-10-06T00:00:00', endDt: '2026-10-07T23:59:00' },
      { ...myPairing, key: 'outside-after', startDt: '2026-10-11T00:00:00', endDt: '2026-10-11T12:00:00' },
    ];
    const blocks = railBlocks(duties, '2026-10-08', 3);
    expect(blocks.map(b => b.duty.key)).toEqual(['before', 'overlap', 'touch']);
    expect(blocks[0]).toMatchObject({ left: 0, width: 1 / 6, lane: 0 });
    expect(blocks[1]).toMatchObject({ left: 1 / 12, width: 1 / 4, lane: 1 });
    expect(blocks[2].left).toBeCloseTo(1 / 3);
    expect(blocks[2].width).toBeCloseTo(1 / 6);
    expect(blocks[2].lane).toBe(0);
  });

  it('builds six-week calendars and rolls month ranges across December and January', () => {
    expect(monthDays('2026-10-08')).toHaveLength(42);
    expect(monthDays('2026-10-08').slice(0, 2)).toEqual(['2026-09-27', '2026-09-28']);
    expect(monthDays('2026-10-08').at(-1)).toBe('2026-11-07');
    expect(shiftMonth('2026-12-15', 1)).toEqual({ startDate: '2027-01-01', endDate: '2027-01-31' });
    expect(shiftMonth('2027-01-15', -1)).toEqual({ startDate: '2026-12-01', endDate: '2026-12-31' });
    expect(moveWindow('2026-10-07', -7, 7, '2026-10-07', '2026-11-02')).toBe('2026-10-07');
    expect(dutiesOn(mine.duties, '2026-10-09')).toContain(myPairing);
  });

  it('recognizes Twin Rail as a valid remembered approach', () => {
    expect(parseApproach('twin')).toBe('twin');
    expect(parseApproach('other')).toBeNull();
  });

  it('switches from Twin Rail to Matrix, Market, and Ticket while remembering each choice for this crew', async () => {
    const store = makeStore();
    await store.dispatch(login({ airline: 'PR', crewId: '392923', password: 'test-password', keepLogin: false }) as never);
    store.dispatch(acceptDisclaimer());
    const r = render(<Provider store={store}><DutySwapHost /></Provider>);
    await waitFor(() => expect(r.getByTestId('duty-swap-screen')).toBeTruthy());

    fireEvent.press(r.getByTestId('approach-twin'));
    await waitFor(() => expect(r.getByTestId('twin-search')).toBeTruthy());
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@duty_swap_approach_PR_392923', 'twin');

    fireEvent.press(r.getByTestId('approach-market'));
    await waitFor(() => expect(r.getByTestId('market-screen')).toBeTruthy());
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('@duty_swap_approach_PR_392923', 'market');

    fireEvent.press(r.getByTestId('approach-ticket'));
    await waitFor(() => expect(r.getByTestId('ticket-screen')).toBeTruthy());
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('@duty_swap_approach_PR_392923', 'ticket');

    fireEvent.press(r.getByTestId('approach-matrix'));
    await waitFor(() => expect(r.getByTestId('duty-swap-screen')).toBeTruthy());
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('@duty_swap_approach_PR_392923', 'matrix');
  });

  it('searches from Crew with the empty-duty filter, resets it, and renders the filtered fixture results', async () => {
    const { r } = await mountTwin();
    fireEvent.press(r.getByTestId('twin-search-open'));
    await waitFor(() => expect(r.getByTestId('twin-search')).toBeTruthy());
    fireEvent.press(r.getByTestId('twin-section-Crew'));
    const hideEmpty = r.getByTestId('twin-search-hide-empty');
    expect(hideEmpty.props.value).toBe(false);
    fireEvent(hideEmpty, 'valueChange', true);
    expect(r.getByTestId('twin-search-hide-empty').props.value).toBe(true);
    fireEvent.press(r.getByTestId('twin-search-reset'));
    expect(r.getByTestId('twin-search-hide-empty').props.value).toBe(false);
    fireEvent(r.getByTestId('twin-search-hide-empty'), 'valueChange', true);
    fireEvent.press(r.getByTestId('twin-search-submit'));

    await waitFor(() => expect(r.getByTestId('twin-rails')).toBeTruthy());
    expect(mockApi.search).toHaveBeenLastCalledWith(expect.objectContaining({
      startDate: '2026-10-07', endDate: '2026-11-02', filterEmptyDutyCrew: true,
    }));
    expect(r.getByTestId('twin-crew-402452')).toBeTruthy();
    expect(r.queryByTestId('twin-crew-421051')).toBeNull();
    expect(r.getByText('5 crew · tap my block, then theirs')).toBeTruthy();
  });
});

describe('Twin Rail screen', () => {
  it.each([[951, 669], [1210, 834]])('moves the complete range toolbar into the landscape header at %sx%s', async (width, height) => {
    mockLayout.current = layoutFor(width, height);
    const { r } = await mountTwin();
    await chooseOct8Pairing(r);
    const header = r.getByTestId('page-header');
    const accessory = within(header).getByTestId('page-header-accessory');
    expect(within(accessory).getByTestId('twin-range-controls')).toBeTruthy();
    expect(within(accessory).getByTestId('twin-earlier')).toBeTruthy();
    expect(within(accessory).getByTestId('twin-window')).toBeTruthy();
    expect(within(accessory).getByTestId('twin-later')).toBeTruthy();
    for (const zoom of [3, 7, 14]) {
      const control = within(accessory).getByTestId(`twin-zoom-${zoom}`);
      expect(StyleSheet.flatten(control.props.style)).toMatchObject({ minWidth: 44, height: 44 });
    }
    expect(StyleSheet.flatten(within(accessory).getByTestId('twin-earlier').props.style)).toMatchObject({ width: 44, height: 44 });
    expect(StyleSheet.flatten(accessory.props.style).alignItems).toBe('stretch');
    expect(within(r.getByTestId('twin-rails')).queryByTestId('twin-range-controls')).toBeNull();
  });

  it('opens search directly with its header search icon and never renders the removed calendar', async () => {
    const { r } = await mountTwin();
    expect(r.getByTestId('twin-search-open')).toBeTruthy();
    expect(r.queryByTestId('twin-calendar')).toBeNull();
    expect(r.queryByTestId('twin-new')).toBeNull();
    fireEvent.press(r.getByTestId('twin-search-open'));
    expect(r.getByTestId('twin-search')).toBeTruthy();
    fireEvent.press(r.getByTestId('twin-search-submit'));
    await waitFor(() => expect(r.getByTestId('twin-rails')).toBeTruthy());
    expect(r.queryByTestId('twin-calendar')).toBeNull();
    fireEvent.press(r.getByTestId('twin-search-open'));
    expect(r.getByTestId('twin-search')).toBeTruthy();
  });

  it('draws exactly two shared guides for my selection, follows outer bounds and zoom, and removes them on deselect or clear', async () => {
    const { r } = await mountTwin('PR', '392923', paletteFor('graphite'));
    fireEvent.press(r.getByTestId('twin-search-submit'));
    await waitFor(() => expect(r.getByTestId('twin-rails')).toBeTruthy());
    const guides = () => r.queryAllByTestId(/^twin-guide-(start|end)$/);
    const left = (id: string) => StyleSheet.flatten(r.getByTestId(id).props.style).left;
    const right = (id: string) => {
      const style = StyleSheet.flatten(r.getByTestId(id).props.style);
      return parseFloat(String(style.left)) + parseFloat(String(style.width));
    };
    expect(guides()).toHaveLength(0);
    fireEvent.press(r.getByTestId(`twin-duty-${myPairing.key}`));
    expect(guides()).toHaveLength(2);
    const originalStart = left('twin-guide-start');
    const originalEnd = left('twin-guide-end');
    const selectedStyle = StyleSheet.flatten(r.getByTestId(`twin-duty-${myPairing.key}`).props.style);
    const railBorder = StyleSheet.flatten(r.getByTestId('twin-me-rail').props.style).borderColor;
    for (const id of ['twin-guide-start', 'twin-guide-end']) {
      const line = r.getByTestId(id).findByType(Line);
      expect(line.props).toMatchObject({ stroke: colors.primary, strokeOpacity: 0.9, strokeWidth: 1.5, strokeDasharray: '4 4' });
      expect(line.props.stroke).not.toEqual(railBorder);
      expect(line.props.stroke).not.toEqual(selectedStyle.backgroundColor);
    }
    const dateGrids = r.UNSAFE_getAllByType(View).filter(view => {
      const style = StyleSheet.flatten(view.props.style);
      return style?.opacity === 0.22 && style?.gap === 0;
    });
    expect(dateGrids.length).toBeGreaterThan(1);
    for (const grid of dateGrids) {
      const firstCell = grid.findAllByType(View).find(view => StyleSheet.flatten(view.props.style)?.borderLeftWidth === 1)!;
      const gridColor = StyleSheet.flatten(firstCell.props.style).borderColor;
      expect(railBorder).toEqual(glassTint(String(gridColor), 0.22));
    }
    expect(originalStart).toEqual(left(`twin-duty-${myPairing.key}`));
    expect(parseFloat(String(originalEnd))).toBeCloseTo(right(`twin-duty-${myPairing.key}`));
    fireEvent.press(r.getByTestId('twin-zoom-14'));
    expect(guides()).toHaveLength(2);
    expect(left('twin-guide-start')).not.toEqual(originalStart);
    expect(left('twin-guide-end')).not.toEqual(originalEnd);
    fireEvent.press(r.getByTestId('twin-zoom-7'));
    const laterDuty = mine.duties.find(d => d.code === '2HB')!;
    fireEvent.press(r.getByTestId(`twin-duty-${laterDuty.key}`));
    expect(guides()).toHaveLength(2);
    expect(left('twin-guide-start')).toEqual(originalStart);
    expect(left('twin-guide-end')).not.toEqual(originalEnd);
    expect(parseFloat(String(left('twin-guide-end')))).toBeCloseTo(right(`twin-duty-${laterDuty.key}`));
    fireEvent.press(r.getByTestId(`twin-duty-${laterDuty.key}`));
    expect(left('twin-guide-end')).toEqual(originalEnd);
    fireEvent.press(r.getByTestId(`twin-duty-${myPairing.key}`));
    expect(guides()).toHaveLength(0);
    fireEvent.press(r.getByTestId(`twin-duty-${myPairing.key}`));
    expect(guides()).toHaveLength(2);
    fireEvent.press(r.getByTestId('twin-clear'));
    expect(guides()).toHaveLength(0);
  });

  it.each([[1210, 834], [834, 1210], [669, 951]])('folds review on %sx%s until both sides are selected, and preserves the draft on Hide', async (width, height) => {
    mockLayout.current = layoutFor(width, height);
    const { r } = await mountTwin();
    fireEvent.press(r.getByTestId('twin-search-submit'));
    await waitFor(() => expect(r.getByTestId('twin-rails')).toBeTruthy());
    expect(r.queryByTestId('twin-review')).toBeNull();
    expect(r.queryByTestId('twin-review-pane')).toBeNull();
    expect(StyleSheet.flatten(r.getByTestId('twin-compact-selection').props.style)).toMatchObject({ maxWidth: '60%' });
    fireEvent.press(r.getByTestId(`twin-duty-${myPairing.key}`));
    expect(r.queryByTestId('twin-review')).toBeNull();
    fireEvent.press(r.getByTestId(`twin-duty-${standby.key}`));
    await waitFor(() => expect(r.getByTestId('twin-delta')).toBeTruthy());
    expect(r.getByText('Review with 421051')).toBeTruthy();
    expect(r.getByText('Hide')).toBeTruthy();
    if (width >= 700) {
      expect(StyleSheet.flatten(r.getByTestId('twin-review-pane').props.style)).toMatchObject({ width: 320, maxWidth: '40%', flex: 0 });
    }
    fireEvent.changeText(r.getByTestId('twin-note'), 'Keep this note while browsing');
    fireEvent.press(r.getByTestId('twin-review-back'));
    expect(r.queryByTestId('twin-review')).toBeNull();
    expect(r.getByTestId(`twin-duty-${myPairing.key}`).props.accessibilityState.selected).toBe(true);
    expect(r.getByTestId(`twin-duty-${standby.key}`).props.accessibilityState.selected).toBe(true);
    fireEvent.press(r.getByTestId('twin-review-open'));
    expect(r.getByTestId('twin-note').props.value).toBe('Keep this note while browsing');
    fireEvent.press(r.getByTestId('twin-review-back'));
    fireEvent.press(r.getByTestId(`twin-duty-${standby.key}`));
    expect(r.queryByTestId('twin-review')).toBeNull();
    fireEvent.press(r.getByTestId(`twin-duty-${standby.key}`));
    expect(r.getByTestId('twin-review')).toBeTruthy();
    fireEvent.press(r.getByTestId('twin-clear'));
    expect(r.queryByTestId('twin-review')).toBeNull();
    expect(r.getByText('Give —')).toBeTruthy();
    expect(r.getByText('Take —')).toBeTruthy();
    expect(mockApi.submit).not.toHaveBeenCalled();
  });

  it.each([[812, 375], [667, 375], [375, 667]])('keeps the compact tray beside selection on a %sx%s phone and preserves review actions', async (width, height) => {
    mockLayout.current = layoutFor(width, height);
    const { r } = await mountTwin();
    await chooseOct8Pairing(r);
    expect(r.getByTestId('twin-compact-selection')).toBeTruthy();
    expect(StyleSheet.flatten(r.getByTestId('twin-tray').props.style)).toMatchObject({ flexDirection: 'row', flexShrink: 0 });
    expect(StyleSheet.flatten(r.getByTestId('twin-candidates').props.style)).toMatchObject({ flex: 1, minHeight: 0 });
    expect(r.getByTestId('twin-review-open').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(r.getByTestId(`twin-duty-${standby.key}`));
    await waitFor(() => expect(r.getByTestId('twin-review-open').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(r.getByTestId('twin-review-open'));
    await waitFor(() => expect(r.getByText('Review with 421051')).toBeTruthy());
    expect(r.getByText(/You give: PR124\/PR125/)).toBeTruthy();
    fireEvent.press(r.getByTestId('twin-review-back'));
    expect(r.getByTestId('twin-compact-selection')).toBeTruthy();
    fireEvent.press(r.getByTestId('twin-clear'));
    expect(r.getByText('Give —')).toBeTruthy();
    expect(r.getByText('Take —')).toBeTruthy();
    expect(r.getByTestId('twin-review-open').props.accessibilityState.disabled).toBe(true);
  });

  it('filters to a specific crew before inspecting and selecting their duty on the rails', async () => {
    const { r } = await mountTwin();
    fireEvent.press(r.getByTestId('twin-search-open'));
    fireEvent.press(r.getByTestId('twin-section-Crew'));
    fireEvent.press(r.getByTestId('twin-search-crewIdList'));
    await waitFor(() => expect(r.getByTestId('twin-choice-crewIdList-421051')).toBeTruthy());
    fireEvent.press(r.getByTestId('twin-choice-crewIdList-421051'));
    fireEvent.press(r.getByTestId('twin-search-submit'));
    await waitFor(() => expect(r.getByText('1 crew · tap my block, then theirs')).toBeTruthy());
    expect(mockApi.search).toHaveBeenLastCalledWith(expect.objectContaining({ crewIdList: ['421051'] }));
    expect(r.queryByTestId('twin-crew-402452')).toBeNull();
    fireEvent.press(r.getByTestId('twin-zoom-14'));
    fireEvent.press(r.getByTestId(`twin-duty-${myPairing.key}`));
    fireEvent.press(r.getByTestId(`twin-duty-${standby.key}`));
    fireEvent.press(r.getByTestId('twin-review-open'));
    await waitFor(() => expect(r.getByText('Review with 421051')).toBeTruthy());
    expect(r.getByText(/You take: 1HB/)).toBeTruthy();
  });
  it('selects duties on the rails, reviews both views, and retains the draft after a failed send before retry success', async () => {
    const { r } = await mountTwin();
    fireEvent.press(r.getByTestId('twin-search-submit'));
    await waitFor(() => expect(r.getByTestId('twin-rails')).toBeTruthy());
    const lockedExam = r.getByTestId(`twin-duty-${exam.key}`);
    fireEvent.press(lockedExam);
    expect(lockedExam.props.accessibilityState.selected).toBe(false);
    fireEvent.press(r.getByTestId(`twin-duty-${myPairing.key}`));
    await chooseStandbys(r);

    expect(r.getByText(/You give: PR124\/PR125/)).toBeTruthy();
    expect(r.getByText(/You take: 1HB, 4FB/)).toBeTruthy();
    fireEvent.press(r.getByTestId('twin-review-details'));
    expect(r.getByText(/124 MNL→SEA/)).toBeTruthy();
    fireEvent.press(r.getByTestId('twin-review-date'));
    expect(r.getByText(/ME · GIVE/)).toBeTruthy();
    fireEvent.changeText(r.getByTestId('twin-note'), ' Please consider this swap. ');

    mockSubmitResponses = [
      async () => { throw new Error('temporary send failure'); },
      async () => ({ ok: true }),
    ];
    fireEvent.press(r.getByTestId('twin-send'));
    await waitFor(() => expect(r.getByTestId('twin-result-title').props.children).toBe('Could not send request'));
    expect(mockApi.submit).toHaveBeenCalledTimes(1);
    expect(mockApi.submit).toHaveBeenLastCalledWith(submitBody('392923', '421051', [myPairing], [standby, fourFb], 'NS', ' Please consider this swap. '));
    expect(r.getByText(/You give: PR124\/PR125/)).toBeTruthy();
    fireEvent.press(r.getByTestId('twin-result-confirm'));
    await waitFor(() => expect(r.getByTestId('twin-review')).toBeTruthy());
    expect(r.getByText(/You take: 1HB, 4FB/)).toBeTruthy();
    fireEvent.press(r.getByTestId('twin-send'));
    await waitFor(() => expect(r.getByTestId('twin-result-title').props.children).toBe('Swap request sent'));
    expect(mockApi.submit).toHaveBeenCalledTimes(2);
    expect(mockApi.submit).toHaveBeenLastCalledWith(submitBody('392923', '421051', [myPairing], [standby, fourFb], 'NS', ' Please consider this swap. '));
  });

  it('blocks review while selected-crew details fail, retries the compare, and replaces the take when another crew is picked', async () => {
    const { r } = await mountTwin();
    await chooseOct8Pairing(r);
    mockCompareFailures = 100;
    fireEvent.press(r.getByTestId(`twin-duty-${standby.key}`));
    await waitFor(() => expect(r.getByTestId('twin-tray')).toBeTruthy());
    fireEvent.press(r.getByTestId('twin-review-open'));
    await waitFor(() => expect(r.getByTestId('twin-review')).toBeTruthy());
    await waitFor(() => expect(r.getByText('Could not load duty details · Retry details')).toBeTruthy());
    fireEvent.press(r.getByTestId('twin-send'));
    expect(mockApi.submit).not.toHaveBeenCalled();
    mockCompareFailures = 0;
    fireEvent.press(r.getByText('Could not load duty details · Retry details'));
    await waitFor(() => expect(r.getByTestId('twin-delta')).toBeTruthy());
    fireEvent.press(r.getByTestId('twin-review-back'));
    fireEvent.press(r.getByTestId(`twin-duty-${fourFb.key}`));
    await waitFor(() => expect(r.getByTestId(`twin-duty-${otherStandby.key}`)).toBeTruthy());
    fireEvent.press(r.getByTestId(`twin-duty-${otherStandby.key}`));
    await waitFor(() => expect(r.getByText(/Take 3FB · 402452/)).toBeTruthy());
    expect(r.getByTestId(`twin-duty-${standby.key}`).props.accessibilityState.selected).toBe(false);
    expect(r.getByTestId(`twin-duty-${otherStandby.key}`).props.accessibilityState.selected).toBe(true);
  });

  it('keeps the PR fixture out of a TG session', async () => {
    const { store, r } = await mountTwin();
    expect(r.getByTestId('twin-search')).toBeTruthy();
    await act(async () => {
      store.dispatch(clearDutySwap());
      await store.dispatch(login({ airline: 'TG', crewId: '35459', password: 'test-password', keepLogin: false }) as never);
    });
    await waitFor(() => expect(r.getByText('Duty Swap is not available for this account.')).toBeTruthy());
    expect(r.queryByTestId('twin-search')).toBeNull();
    expect(r.queryByTestId('twin-crew-421051')).toBeNull();
    expect(mockApi.search).toHaveBeenCalledTimes(1);
  });
});
