// Duty Swap · Market (design Concept A "Swap Board") and the Matrix | Market
// switch. Spec: docs/superpowers/specs/2026-10-08-crew-app-duty-swap-market-design.md
// Fixtures: the PR TEST portal's answers for 392923 (search + 421051's compare).
import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

import authReducer, { login } from '../../src/features/auth/authSlice';
import dutySwapReducer, { acceptDisclaimer } from '../../src/features/dutySwap/dutySwapSlice';
import rbotReducer from '../../src/features/rbot/rbotSlice';
import { DutySwapHost } from '../../src/features/dutySwap/market/DutySwapHost';
import { MarketScreen } from '../../src/features/dutySwap/market/MarketScreen';
import { ticketMatches } from '../../src/features/dutySwap/market/TicketScreen';
import { ApproachSwitch } from '../../src/features/dutySwap/market/ApproachSwitch';
import { PALETTES } from '../../src/theme/carrier';
import { layoutFor } from '../../src/components/v2/useLayout';
import { toCrews, type ApiCompare, type ApiCrewRow } from '../../src/features/dutySwap/dutySwapModel';
import {
  approachKey, boardHeadline, boardOffers, defaultGive, defaultTake, marketWindow, outOfDuties, overlaps, parseApproach, precheck,
  precheckLabel, spanLabel,
} from '../../src/features/dutySwap/market/marketModel';

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
const others = crews.slice(1);
const pr124 = me.duties.find(d => d.code === 'PR124/PR125')!;

beforeEach(() => {
  jest.clearAllMocks();
  mockLayout.current = layoutFor(420, 912);
  mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async () => null);
});

// ── Model ───────────────────────────────────────────────────────────────────
describe('market model', () => {
  it('swap out of: only my unlocked duties that are not days off', () => {
    const outs = outOfDuties(me);
    expect(outs.map(d => d.code)).toContain('PR124/PR125');
    expect(outs.every(d => d.swappable && d.kind !== 'off')).toBe(true);
    expect(outs.some(d => d.code === 'EXAM')).toBe(false); // locked (Hide)
  });

  it('the board: other crews\' unlocked duties around my duty, by start; days off on request', () => {
    const offers = boardOffers(others, pr124, { daysOff: false });
    expect(offers.length).toBeGreaterThan(0);
    const w = marketWindow(pr124);
    for (const o of offers) {
      expect(o.duty.swappable).toBe(true);
      expect(overlaps(o.duty, w)).toBe(true);
      expect(o.duty.kind).not.toBe('off');
      expect(o.crewId).not.toBe(me.crewId);
    }
    expect(offers.map(o => o.duty.startDt)).toEqual([...offers.map(o => o.duty.startDt)].sort());
    // 421051's 1HB standby on 09 Oct is on the market for 08–11 Oct.
    expect(offers.some(o => o.crewId === '421051' && o.duty.code === '1HB')).toBe(true);
    const withOff = boardOffers(others, pr124, { daysOff: true });
    expect(withOff.length).toBeGreaterThanOrEqual(offers.length);
    expect(boardHeadline(offers.length, pr124)).toBe(`${offers.length} offers overlap 08–11 Oct`);
  });

  it('never lists a crew on my own pairing', () => {
    const twin = { ...others[0], duties: [{ ...pr124, key: 'x', crewId: others[0].crewId }] };
    expect(boardOffers([twin], pr124, { daysOff: true })).toEqual([]);
  });

  it('composer defaults: the tapped offer + crew B\'s duties during mine; my duty + mine during theirs', () => {
    const b = others.find(c => c.crewId === '421051')!;
    const hb = b.duties.find(d => d.code === '1HB')!;
    const take = defaultTake(b, pr124, hb);
    expect(take).toContain(hb.key);
    for (const k of take) {
      const d = b.duties.find(x => x.key === k)!;
      expect(d.key === hb.key || (d.startDt < pr124.endDt && d.endDt > pr124.startDt)).toBe(true);
    }
    expect(defaultGive(me, pr124, hb)).toEqual([pr124.key]);
  });

  it('pre-check chip: rank + fleet, flagged when they differ from my duty', () => {
    const c = compare421051.data;
    const mine = c.mineTaskDetailList.find(t => t.pairingId === pr124.id);
    const hb = c.othersTaskDetailList.find(t => t.assignment === '1HB');
    const same = precheck(hb, mine)!;
    expect(same.rank).toBe('CP');
    expect(precheckLabel(same)).toBe('CP · 333 · fleet differs');
    expect(precheck(undefined, mine)).toBeNull();
    expect(precheckLabel(precheck({ ...hb!, actingRank: 'FO' }, mine)!)).toBe('FO · rank differs');
  });

  it('labels: the end day only when it differs from the start', () => {
    expect(spanLabel({ startDt: '2026-10-29T05:15:00', endDt: '2026-10-29T13:40:00' })).toBe('05:15–13:40');
    expect(spanLabel({ startDt: '2026-10-22T21:45:00', endDt: '2026-10-26T06:30:00' })).toBe('21:45 → 26 Oct 06:30');
  });

  it('the choice is stored per airline + crew; anything else reads as no choice', () => {
    expect(approachKey('PR', '487424')).toBe('@duty_swap_approach_PR_487424');
    expect(parseApproach('market')).toBe('market');
    expect(parseApproach('ticket')).toBe('ticket');
    expect(parseApproach('matrix')).toBe('matrix');
    expect(parseApproach('board')).toBeNull();
    expect(parseApproach(null)).toBeNull();
  });

  it('Ticket ranks one published candidate per crew around the duty being given', () => {
    const matches = ticketMatches(others, pr124);
    expect(matches.length).toBeGreaterThan(0);
    expect(new Set(matches.map(x => x.crewId)).size).toBe(matches.length);
    expect(matches.some(x => x.crewId === '421051' && x.duty.code === '1HB')).toBe(true);
    expect(ticketMatches(others, undefined)).toEqual([]);
  });
});

// ── Screens ─────────────────────────────────────────────────────────────────
type Store = ReturnType<typeof makeStore>;
const makeStore = () => configureStore({ reducer: { auth: authReducer, dutySwap: dutySwapReducer, rbot: rbotReducer } });
async function mount(ui: React.ReactElement): Promise<{ store: Store; r: ReturnType<typeof render> }> {
  const store = makeStore();
  await store.dispatch(login({ airline: 'PR', crewId: '392923', password: 'pw', keepLogin: false }) as never);
  store.dispatch(acceptDisclaimer());
  const r = render(<Provider store={store}>{ui}</Provider>);
  return { store, r };
}

describe('Matrix | Market switch', () => {
  it('keeps the selected mode readable in Daylight and the existing dark palette', () => {
    for (const palette of [PALETTES.light, PALETTES.sia]) {
      const view = render(<ApproachSwitch palette={palette} value="matrix" onChange={() => {}} variant="header" />);
      const selected = within(view.getByTestId('approach-matrix')).getByText('Matrix');
      const style = Object.assign({}, ...selected.props.style);
      expect(style.color).toBe(palette.isLight ? palette.btn : palette.g1);
      view.unmount();
    }
  });
  it('phone: Matrix by default, the switch in the header; Market is remembered per crew', async () => {
    const { r } = await mount(<DutySwapHost />);
    await waitFor(() => expect(r.getByTestId('duty-swap-screen')).toBeTruthy());
    const head = r.getByTestId('swap-approach-header');
    expect(within(head).getByText('Matrix')).toBeTruthy();
    expect(r.getByTestId('approach-matrix').props.accessibilityState).toEqual({ selected: true });
    expect(r.queryByTestId('swap-approach-rail-edge')).toBeNull();
    // The header keeps its one row: the switch replaces the title text.
    expect(r.queryByText('New swap')).toBeNull();

    fireEvent.press(r.getByTestId('approach-market'));
    await waitFor(() => expect(r.getByTestId('market-screen')).toBeTruthy());
    expect(r.queryByTestId('duty-swap-screen')).toBeNull();
    expect(r.getByTestId('approach-market').props.accessibilityState).toEqual({ selected: true });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@duty_swap_approach_PR_392923', 'market');
  });

  it('Ticket is a third remembered approach and begins with the guided Give step', async () => {
    const { r } = await mount(<DutySwapHost />);
    await waitFor(() => expect(r.getByTestId('duty-swap-screen')).toBeTruthy());
    fireEvent.press(r.getByTestId('approach-ticket'));
    await waitFor(() => expect(r.getByTestId('ticket-screen')).toBeTruthy());
    expect(r.getByTestId('ticket-give')).toBeTruthy();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@duty_swap_approach_PR_392923', 'ticket');
  });

  it('opens on the remembered approach', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => (k === '@duty_swap_approach_PR_392923' ? 'market' : null));
    const { r } = await mount(<DutySwapHost />);
    await waitFor(() => expect(r.getByTestId('market-screen')).toBeTruthy());
    expect(r.queryByTestId('duty-swap-screen')).toBeNull();
  });

  it('unreadable storage falls back to the Matrix', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async () => { throw new Error('denied'); });
    const { r } = await mount(<DutySwapHost />);
    await waitFor(() => expect(r.getByTestId('duty-swap-screen')).toBeTruthy());
  });

  it('Duo inner landscape: the switch is a rail in the right-edge status strip, not in the header', async () => {
    mockLayout.current = layoutFor(951, 669);
    mockInsets.current = { top: 0, right: 84, bottom: 20, left: 0 };
    const { r } = await mount(<DutySwapHost />);
    await waitFor(() => expect(r.getByTestId('swap-approach-rail-edge')).toBeTruthy());
    const edge = r.getByTestId('swap-approach-rail-edge');
    const style = Object.assign({}, ...[edge.props.style].flat());
    expect(style).toMatchObject({ position: 'absolute', right: 0, top: 116, width: 84 });
    expect(r.queryByTestId('swap-approach-header')).toBeNull();
    expect(r.getByText('New swap')).toBeTruthy(); // the title stays when the rail holds the switch
    fireEvent.press(within(edge).getByTestId('approach-market'));
    await waitFor(() => expect(r.getByTestId('market-screen')).toBeTruthy());
    expect(within(r.getByTestId('swap-approach-rail-edge')).getByTestId('approach-market').props.accessibilityState).toEqual({ selected: true });
  });

  it('Duo inner landscape: swap requests, My duties, and R\'Bot form their own group below the approach switch', async () => {
    mockLayout.current = layoutFor(951, 669);
    mockInsets.current = { top: 0, right: 84, bottom: 20, left: 0 };
    const { r } = await mount(<DutySwapHost />);
    await waitFor(() => expect(r.getByTestId('swap-approach-rail-edge')).toBeTruthy());
    const edge = r.getByTestId('swap-approach-rail-edge');
    const actions = within(edge).getByTestId('swap-rail-actions');
    expect(within(actions).getByTestId('swap-records')).toBeTruthy();
    expect(within(actions).getByTestId('swap-my-duties')).toBeTruthy();
    expect(within(actions).getByTestId('swap-rbot-open')).toBeTruthy();
    expect(within(actions).queryByTestId('approach-matrix')).toBeNull();
    expect(within(actions).queryByTestId('approach-market')).toBeNull();
    expect(r.getAllByTestId('swap-records')).toHaveLength(1);
    expect(r.getAllByTestId('swap-my-duties')).toHaveLength(1);
    expect(r.getAllByTestId('swap-rbot-open')).toHaveLength(1);

    fireEvent.press(within(actions).getByTestId('swap-records'));
    expect(mockNavigate).toHaveBeenCalledWith('DutySwapRecords');
    fireEvent.press(within(actions).getByTestId('swap-my-duties'));
    expect(mockNavigate).toHaveBeenCalledWith('DutySwapMyDuties');
    fireEvent.press(within(actions).getByTestId('swap-rbot-open'));
    expect(r.getByTestId('swap-rbot-panel')).toBeTruthy();
    fireEvent.press(within(actions).getByTestId('swap-rbot-open'));
    expect(r.queryByTestId('swap-rbot-panel')).toBeNull();
  });

  it('Duo Market: history and My duties stay in the lower rail group; R\'Bot remains Matrix-only', async () => {
    mockLayout.current = layoutFor(951, 669);
    mockInsets.current = { top: 0, right: 84, bottom: 20, left: 0 };
    const { r } = await mount(<DutySwapHost />);
    await waitFor(() => expect(r.getByTestId('swap-approach-rail-edge')).toBeTruthy());
    fireEvent.press(within(r.getByTestId('swap-approach-rail-edge')).getByTestId('approach-market'));
    await waitFor(() => expect(r.getByTestId('market-screen')).toBeTruthy());

    const actions = within(r.getByTestId('swap-approach-rail-edge')).getByTestId('swap-rail-actions');
    expect(within(actions).getByTestId('swap-records')).toBeTruthy();
    expect(within(actions).getByTestId('swap-my-duties')).toBeTruthy();
    expect(within(actions).queryByTestId('swap-rbot-open')).toBeNull();
    expect(r.queryByTestId('market-my-duties')).toBeNull();
    expect(r.getAllByTestId('swap-records')).toHaveLength(1);
    fireEvent.press(within(actions).getByTestId('swap-records'));
    expect(mockNavigate).toHaveBeenCalledWith('DutySwapRecords');
    fireEvent.press(within(actions).getByTestId('swap-my-duties'));
    expect(mockNavigate).toHaveBeenCalledWith('DutySwapMyDuties');
  });

  it('Duo inner portrait (tall): the switch stays in the header', async () => {
    mockLayout.current = layoutFor(669, 951);
    mockInsets.current = { top: 24, right: 0, bottom: 20, left: 0 };
    const { r } = await mount(<DutySwapHost />);
    await waitFor(() => expect(r.getByTestId('swap-approach-header')).toBeTruthy());
    expect(r.queryByTestId('swap-approach-rail-edge')).toBeNull();
  });
});

describe('Market', () => {
  async function openMarket() {
    const m = await mount(<MarketScreen />);
    await waitFor(() => expect(m.store.getState().dutySwap.status).toBe('ready'));
    await waitFor(() => expect(m.r.getByTestId('market-headline')).toBeTruthy());
    return m;
  }

  it('first paint: one search, no compare per card until cards are in view', async () => {
    const { r } = await openMarket();
    expect(mockApi.search).toHaveBeenCalledTimes(1);
    expect(mockApi.compare).not.toHaveBeenCalled();
    const offers = boardOffers(others, pr124, { daysOff: false });
    expect(r.getByTestId('market-headline').props.children).toBe(boardHeadline(offers.length, pr124));
    expect(r.getByTestId('market-out-2026-10-08').props.accessibilityState).toEqual({ selected: true });
    expect(r.getByTestId(`offer-421051-${offers.find(o => o.crewId === '421051')!.duty.id}`)).toBeTruthy();

    // Cards scrolled into view fetch their crew's detail (once per crew).
    const board = r.getByTestId('market-board');
    await act(async () => {
      board.props.onViewableItemsChanged({ viewableItems: offers.slice(0, 3).map(item => ({ item, key: item.key, index: 0, isViewable: true })), changed: [] });
    });
    const ids = [...new Set(offers.slice(0, 3).map(o => o.crewId))];
    await waitFor(() => expect(mockApi.compare).toHaveBeenCalledTimes(ids.length));
  });

  it('drops the Matrix filters: the market is every crew in the window', async () => {
    const m = await mount(<MarketScreen />);
    await waitFor(() => expect(mockApi.search).toHaveBeenCalled());
    const f = (mockApi.search.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
    expect(f).toMatchObject({ startDate: '2026-10-07', endDate: '2026-11-02', swapMode: 'NS', fltFleetList: [], crewIdList: [] });
    await waitFor(() => expect(m.store.getState().dutySwap.status).toBe('ready'));
  });

  it('phone: tap an offer → composer sheet → send → "Request sent to 421051"; the card reads Offered', async () => {
    const { r } = await openMarket();
    const hb = others.find(c => c.crewId === '421051')!.duties.find(d => d.code === '1HB')!;
    fireEvent.press(r.getByTestId(`offer-421051-${hb.id}`));
    const composer = await waitFor(() => r.getByTestId('market-composer'));
    expect(within(composer).getByText('Offer to 421051')).toBeTruthy();
    await waitFor(() => expect(r.getByTestId('market-delta')).toBeTruthy());
    expect(r.getByTestId(`market-take-${hb.key}`).props.accessibilityState).toEqual({ checked: true });
    expect(r.getByTestId(`market-give-${pr124.key}`).props.accessibilityState).toEqual({ checked: true });

    fireEvent.changeText(r.getByTestId('market-note'), 'Happy to take your standby');
    fireEvent.press(r.getByTestId('market-send'));
    await waitFor(() => expect(r.getByText('Request sent to 421051')).toBeTruthy());
    expect(mockApi.submit).toHaveBeenCalledWith(expect.objectContaining({
      mineCrewId: '392923', othersCrewId: '421051', minePairingIdList: [pr124.id], swapMode: 'NS', comments: 'Happy to take your standby',
    }));
    const body = (mockApi.submit.mock.calls[0] as unknown as [{ othersPairingIdList: number[] }])[0];
    expect(body.othersPairingIdList).toContain(hb.id);
    expect(r.getByTestId(`offer-421051-${hb.id}`).props.accessibilityLabel).toMatch(/offered$/);
  });

  it('a refused offer shows the rule, and the composer stays to edit', async () => {
    mockApi.submit.mockImplementationOnce(async () => ({ ok: false, message: '[RuleCheck]Others\r\n09-Oct-2026~09-Oct-2026,Rule ID:8004036,Basic Competency' }) as never);
    const { r } = await openMarket();
    const hb = others.find(c => c.crewId === '421051')!.duties.find(d => d.code === '1HB')!;
    fireEvent.press(r.getByTestId(`offer-421051-${hb.id}`));
    await waitFor(() => expect(r.getByTestId('market-delta')).toBeTruthy());
    fireEvent.press(r.getByTestId('market-send'));
    await waitFor(() => expect(r.getByText('Swap not allowed')).toBeTruthy());
    expect(r.getByText('Basic Competency')).toBeTruthy();
    expect(r.getByTestId('market-composer')).toBeTruthy();
    expect(r.getByTestId(`offer-421051-${hb.id}`).props.accessibilityLabel).not.toMatch(/offered$/);
  });

  it('nothing of mine unlocked ("Please publish task."): the fix is My duties', async () => {
    mockApi.search.mockImplementationOnce(async () => { throw new Error('Please publish task.'); });
    const { r } = await mount(<MarketScreen />);
    await waitFor(() => expect(r.getByTestId('market-error')).toBeTruthy());
    expect(r.getByText('Unlock a duty to swap out of')).toBeTruthy();
    fireEvent.press(r.getByTestId('market-unlock'));
    expect(mockNavigate).toHaveBeenCalledWith('DutySwapMyDuties');
    fireEvent.press(r.getByTestId('market-retry'));
    await waitFor(() => expect(r.getByTestId('market-headline')).toBeTruthy());
  });

  it('Duo inner landscape: board left, composer pane right — no sheet', async () => {
    mockLayout.current = layoutFor(951, 669);
    mockInsets.current = { top: 0, right: 84, bottom: 20, left: 0 };
    const { r } = await openMarket();
    expect(r.getByTestId('market-composer-empty')).toBeTruthy();
    const hb = others.find(c => c.crewId === '421051')!.duties.find(d => d.code === '1HB')!;
    fireEvent.press(r.getByTestId(`offer-421051-${hb.id}`));
    await waitFor(() => expect(r.getByTestId('market-composer')).toBeTruthy());
    expect(r.queryByTestId('market-composer-empty')).toBeNull();
    // The board ends at the hinge (951 / 2 − 12 pad − 6 half gap).
    expect(r.UNSAFE_root.findAll((n: { props?: { style?: unknown } }) => Object.assign({}, ...[n.props?.style].flat()).width === 951 / 2 - 18).length).toBeGreaterThan(0);
  });

  it('Duo inner portrait: two columns of offers above the composer pane', async () => {
    mockLayout.current = layoutFor(669, 951);
    const { r } = await openMarket();
    expect(r.UNSAFE_getByType(FlatList).props.numColumns).toBe(2);
    expect(r.getByTestId('market-composer-empty')).toBeTruthy();
  });
});
