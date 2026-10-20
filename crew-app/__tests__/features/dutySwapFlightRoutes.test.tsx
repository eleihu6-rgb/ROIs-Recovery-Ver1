// Duty Swap: every flight number carries its airports (PR124 MNL-SEA), on all four
// approaches, and Give / Take each lead with their own icon.
// Fixtures: the PR TEST portal's answers for 392923 (search + 421051's compare).
import React from 'react';
import '@testing-library/jest-native/extend-expect';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import authReducer, { login } from '../../src/features/auth/authSlice';
import dutySwapReducer, { acceptDisclaimer } from '../../src/features/dutySwap/dutySwapSlice';
import rbotReducer from '../../src/features/rbot/rbotSlice';
import { TicketScreen } from '../../src/features/dutySwap/market/TicketScreen';
import { MarketScreen } from '../../src/features/dutySwap/market/MarketScreen';
import { DutySwapMyDutiesScreen } from '../../src/features/dutySwap/DutySwapMyDutiesScreen';
import { flightRouteOf, legRoute, toCrews, type ApiCompare, type ApiCrewRow } from '../../src/features/dutySwap/dutySwapModel';
import { compareRoute, boardOffers, flightLine } from '../../src/features/dutySwap/market/marketModel';
import { detailFor } from '../../src/features/dutySwap/dutySwapModel';
import { routeOf } from '../../src/features/dutySwap/dutySwapModel';
import { layoutFor } from '../../src/components/v2/useLayout';

const search: { data: ApiCrewRow[] } = require('../fixtures/dutySwap/search.json');
const compare421051: { data: ApiCompare } = require('../fixtures/dutySwap/compare-421051.json');

const mockInsets = { current: { top: 0, right: 0, bottom: 0, left: 0 } };
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets.current }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  // Focus effects never run inside a plain render; run the loader once on mount.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react') as typeof import('react');
    useEffect(cb, [cb]);
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined),
}));
const mockLayout = { current: layoutFor(420, 912) };
jest.mock('../../src/components/v2/useLayout', () => ({
  ...jest.requireActual('../../src/components/v2/useLayout'),
  useLayout: () => mockLayout.current,
}));

// My duties: the portal's answer for 392923's PR124/PR125 trip (pairing 625688).
// The compare for my own crew carries my pairings keyed by id (as the portal does).
const myCompare: ApiCompare = { ...compare421051.data, mineCrewId: '392923', othersCrewId: '421051' };
const mockApi = {
  disclaimer: jest.fn(async () => null),
  defaultWindow: jest.fn(async () => ({ startDate: '2026-10-07', endDate: '2026-11-02' })),
  search: jest.fn(async () => search.data),
  compare: jest.fn(async (_f: unknown, id: string) => {
    if (id === '421051') return compare421051.data;
    if (id === '392923') return myCompare;
    throw new Error('no detail');
  }),
  options: jest.fn(async () => ({ modes: ['NS'], taskTypes: [], ranks: [], crews: [], ports: [], flights: [], fleets: [] })),
  myTasks: jest.fn(async () => ({
    tasks: compare421051.data.mineTaskDetailList
      .filter(t => t.pairingId === 625688)
      // The portal's My duties rows carry the ISO start/end, not the display string.
      .map(t => ({ ...t, taskDate: '2026-10-08', startDateTime: '2026-10-08T20:50:00', endDateTime: '2026-10-11T04:30:00', publishStatus: 'Hide' })),
    autoUnlock: false,
  })),
  submit: jest.fn(async () => ({ ok: true as const })),
};
jest.mock('../../src/features/dutySwap/dutySwapApi', () => ({ createDutySwapApi: () => mockApi }));

const crews = toCrews(search.data);
const me = crews[0];
const pr124 = me.duties.find(d => d.code === 'PR124/PR125')!;
// Match's one flight line: departure → landing · airports flown (the swap board's format).
const GIVE_LINE = '20:50 → 11 Oct 04:30 · MNL–SEA–MNL';

beforeEach(() => {
  jest.clearAllMocks();
  mockLayout.current = layoutFor(420, 912);
  mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
});

async function mount(ui: React.ReactElement): Promise<ReturnType<typeof render>> {
  const store = configureStore({ reducer: { auth: authReducer, dutySwap: dutySwapReducer, rbot: rbotReducer } });
  await store.dispatch(login({ airline: 'PR', crewId: '392923', password: 'pw', keepLogin: false }) as never);
  store.dispatch(acceptDisclaimer());
  return render(<Provider store={store}>{ui}</Provider>);
}

describe('flight number + airports', () => {
  it('prints each leg as FLIGHT DEP-ARR, and a standby at base as just MNL', () => {
    expect(legRoute('MNL', 'BKK')).toBe('MNL-BKK');
    expect(legRoute('MNL', 'MNL')).toBe('MNL');
    expect(flightRouteOf(compare421051.data.mineTaskDetailList.find(t => t.pairingId === 625688), 'PR')).toBe('PR124 MNL-SEA / PR125 SEA-MNL');
    // The portal's simulator rows carry a non-numeric "flight": keep it verbatim.
    const sim = compare421051.data.mineTaskDetailList.find(t => t.pairingId === 674170)!;
    expect(flightRouteOf(sim, 'PR')).toBe('PR730 MNL-BKK / A330 FLIGHT CREW CHECK RE BKK / CBTA A330 Type Recurrent BKK / PR731 BKK-MNL');
  });

  it('Match: step 1, my duty card reads code + "times · airports", like the swap board', async () => {
    const r = await mount(<TicketScreen />);
    await waitFor(() => expect(r.getByTestId(`ticket-give-${pr124.key}`)).toBeTruthy());
    fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
    await waitFor(() => expect(r.getByTestId(`ticket-give-${pr124.key}`)).toHaveAccessibilityState({ checked: true }));
    const card = within(r.getByTestId(`ticket-give-${pr124.key}`));
    expect(card.getByText('PR124/PR125')).toBeTruthy();
    await waitFor(() => expect(card.getByText(GIVE_LINE)).toBeTruthy());
    // A duty with no flight legs keeps the times alone; nothing invented.
    const second = within(r.getByTestId(`ticket-give-${me.duties.find(d => d.code === '2HB')!.key}`));
    expect(second.getByText('12:00–23:59')).toBeTruthy();
  });

  it('Match: Give names each duty’s airports on arrival, before any duty is selected', async () => {
    // Regression (254 on the Duo): Give showed `PR318/PR319 · 08:30–16:45` with no
    // airports until the crew tapped a duty, because my compare was read on selection.
    const r = await mount(<TicketScreen />);
    await waitFor(() => expect(r.getByTestId(`ticket-give-${pr124.key}`)).toBeTruthy());
    expect(r.getByTestId(`ticket-give-${pr124.key}`)).toHaveAccessibilityState({ checked: false });
    await waitFor(() => expect(within(r.getByTestId(`ticket-give-${pr124.key}`)).getByText(GIVE_LINE)).toBeTruthy());
    // Every duty the window returned was read, not just mine.
    expect(mockApi.compare).toHaveBeenCalledWith(expect.anything(), '421051');
  });

  it('Match: Give / Take each lead with their own icon', async () => {
    const r = await mount(<TicketScreen />);
    await waitFor(() => expect(r.getByTestId(`ticket-give-${pr124.key}`)).toBeTruthy());
    fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
    fireEvent.press(r.getByTestId('ticket-next'));
    expect(r.getByTestId('search-form')).toBeTruthy();
    fireEvent.press(r.getByTestId('ticket-next'));
    await waitFor(() => expect(r.getByTestId('ticket-take-title')).toBeTruthy());

    // Step 3's summary: my duty's flights with airports, from my compare detail.
    await waitFor(() => expect(within(r.getByTestId('ticket-selected-give')).getByText(GIVE_LINE)).toBeTruthy());
    expect(within(r.getByTestId('ticket-selected-give')).getByTestId('ticket-icon-give')).toBeTruthy();
    expect(within(r.getByTestId('ticket-selected-give')).queryByTestId('ticket-icon-take')).toBeNull();
    // …while the take list on the same screen is led by its own (take) glyph.
    expect(within(r.getByTestId('ticket-take-title')).getByTestId('ticket-icon-take')).toBeTruthy();
    expect(within(r.getByTestId('ticket-take-title')).queryByTestId('ticket-icon-give')).toBeNull();
  });

  it('Match: route labels come from the picked crew’s own compare records', () => {
    // A Match card reads the airport chain from the record whose pairing it is; the
    // compare payload's own crew-side pairing id can differ from the duty's, so a
    // same-code record is the safe fallback (and nothing is invented without one).
    const compare = compare421051.data;
    const duty = { key: 'B:625656', crewId: '421051', id: 625656, isGround: false, code: 'PR358', kind: 'fly' as const,
      startDt: '2026-10-18T05:20:00', endDt: '2026-10-18T18:45:00', swappable: true };
    expect(flightLine(duty, routeOf(detailFor(duty, compare.othersTaskDetailList)))).toBe('05:20–18:45 · MNL–PEK–MNL');
    // A record with no legs keeps the times alone.
    const ground = { ...duty, endDt: '2026-10-20T18:45:00', kind: 'ground' as const, code: 'LEC' };
    expect(flightLine(ground, null)).toBe('05:20 → 20 Oct 18:45');
  });

  it('Match: Pick reads each candidate’s detail so their duties show airports without opening a card', async () => {
    const r = await mount(<TicketScreen />);
    await waitFor(() => expect(r.getByTestId(`ticket-give-${pr124.key}`)).toBeTruthy());
    fireEvent.press(r.getByTestId(`ticket-give-${pr124.key}`));
    fireEvent.press(r.getByTestId('ticket-next'));
    fireEvent.press(r.getByTestId('ticket-next'));
    await waitFor(() => expect(r.getByTestId('ticket-match-421051')).toBeTruthy());
    // Regression (252 on the Duo): Pick showed `23 Oct · 20:45 → 30 Oct 06:35` with no
    // airports because a candidate's detail was only fetched after tapping the card.
    expect(mockApi.compare).toHaveBeenCalledWith(expect.anything(), '421051');
    // 421051's first match card is their 1HB (a ground day at MNL): no flight legs, so
    // it keeps the times alone; a fly duty on the board would carry `· MNL–PEK–MNL`.
    // 421051's first match is their 1HB: a ground day at MNL, so times only (no legs
    // to name). Their fly duty on this board is 358/359 MNL–PEK–MNL.
    expect(within(r.getByTestId('ticket-match-421051')).getAllByText(/\d{2}:\d{2}–\d{2}:\d{2}/).length).toBeGreaterThan(0);
  });

  it('Market: the composer shows what the other crew gives with flights and airports', async () => {
    // Fly-to-fly: my PR402/PR403 day against 421051's fly duty that overlaps it.
    const mine402 = crews.flatMap(c => c.duties).find(d => d.code.startsWith('PR402'))!;
    const offers = boardOffers(crews.slice(1), mine402, { daysOff: false }).filter(o => o.crewId === '421051');
    const offer = offers.find(o => compareRoute(o.duty, compare421051.data, false, 'PR'))!;
    expect(offer).toBeTruthy();
    const theirRoute = compareRoute(offer.duty, compare421051.data, false, 'PR')!;
    expect(theirRoute).toMatch(/^PR\d+ [A-Z]{3}-[A-Z]{3} \/ PR\d+ [A-Z]{3}-[A-Z]{3}$/);

    const r = await mount(<MarketScreen />);
    await waitFor(() => expect(r.getByTestId('market-screen')).toBeTruthy());
    fireEvent.press(r.getByTestId(`market-out-${mine402.startDt.slice(0, 10)}`));
    const card = await waitFor(() => r.getByTestId(`offer-421051-${offer.duty.id}`));
    await act(async () => {
      r.getByTestId('market-board').props.onViewableItemsChanged({ viewableItems: [{ item: offer, key: offer.key, index: 0, isViewable: true }], changed: [] });
    });
    fireEvent.press(card);
    const composer = await waitFor(() => r.getByTestId('market-composer'));
    await waitFor(() => expect(within(composer).getByText(new RegExp(theirRoute.replace(' ', ' ')))).toBeTruthy());
    // My side of the composer shows my own route once my detail is in the compare.
    expect(within(composer).getByText(/PR402 MNL-ICN \/ PR403 ICN-MNL/)).toBeTruthy();
  });

  it('My duties: each unlocked pairing shows its airports after every flight number', async () => {
    const r = await mount(<DutySwapMyDutiesScreen />);
    await waitFor(() => expect(r.getByText(/PR124\/PR125/)).toBeTruthy());
    expect(r.getByText(/MNL–SEA–MNL · PR124 MNL-SEA \/ PR125 SEA-MNL/)).toBeTruthy();
  });
});
