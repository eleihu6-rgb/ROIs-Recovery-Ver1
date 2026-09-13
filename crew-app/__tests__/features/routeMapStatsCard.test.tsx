// Schedule ▸ Route map · the month summary card.
//
// Ryan's review of the shipped card: "routes, airports, countries are not aligned
// with the 20 flights row". Measured on the simulator that was real — the totals
// were left-aligned inside equal columns while the breakdown was three stacked
// rows whose value hugged the card's right edge (1088 px vs 1145 px @3x), i.e. two
// alignment rules in one card.
//
// The card is now ONE grid in two tiers (option A of
// docs/mockups/route-stats-card-options.html): the breakdown became a 3-up row
// inside the same 14 pt card padding, so both tiers share the card's content edges
// and the numbers use tabular figures so a changing count cannot shift a column.
import React from 'react';
import { render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { RouteMapView } from '../../src/features/v2/RouteMapView';
import { PALETTES } from '../../src/theme/carrier';
import { buildMonth } from '../../src/features/v2/model';
import type { Trip } from '../../src/features/travel/tripCsv';

const BASE = 'BKK';
const MODE = 'airport' as const;
const BASE_TZ = 'Asia/Bangkok';
/** Mid-month so nothing depends on "today". */
const NOW = new Date('2026-09-12T09:00:00Z');

const lhrTrip: Trip = {
  id: 'pair-lhr',
  crewId: '35459',
  checkInDateUTC: '19 Sep 2026 1400',
  legs: [
    {
      crewId: '35459', fltNumber: 'TG920', flightDateUTC: '19 Sep 2026 1545',
      depArp: 'BKK', arvDateUTC: '20 Sep 2026 0445', arvArp: 'LHR', fleet: 'Boeing 777-300',
      hotel: 'Hilton Heathrow', localDepTime: '2026-09-19 22:45', localArvTime: '2026-09-20 05:45',
      assignment: 'FLY',
    },
    {
      crewId: '35459', fltNumber: 'TG911', flightDateUTC: '21 Sep 2026 1030',
      depArp: 'LHR', arvDateUTC: '21 Sep 2026 2230', arvArp: 'BKK', fleet: 'Boeing 777-300',
      hotel: '', localDepTime: '2026-09-21 11:30', localArvTime: '2026-09-22 05:30',
      assignment: 'FLY',
    },
  ],
};

const sinTrip: Trip = {
  id: 'pair-sin',
  crewId: '35459',
  checkInDateUTC: '26 Sep 2026 1700',
  legs: [
    {
      crewId: '35459', fltNumber: 'TG403', flightDateUTC: '26 Sep 2026 1730',
      depArp: 'BKK', arvDateUTC: '26 Sep 2026 2000', arvArp: 'SIN', fleet: 'Airbus A350-900',
      hotel: '', localDepTime: '2026-09-27 00:30', localArvTime: '2026-09-27 04:00', assignment: 'FLY',
    },
    {
      crewId: '35459', fltNumber: 'TG402', flightDateUTC: '27 Sep 2026 1210',
      depArp: 'SIN', arvDateUTC: '27 Sep 2026 1435', arvArp: 'BKK', fleet: 'Airbus A350-900',
      hotel: '', localDepTime: '2026-09-27 20:10', localArvTime: '2026-09-27 21:35', assignment: 'FLY',
    },
  ],
};

function month() {
  return buildMonth(
    2026, 8, [lhrTrip, sinTrip], [], [],
    MODE, BASE_TZ, {}, NOW, { minutesBefore: 8, mutedIds: [], deviceTz: BASE_TZ },
  );
}

/** Flattened style of a rendered node, typed so the assertions can read style keys. */
const style = (node: { props: { style?: StyleProp<ViewStyle | TextStyle> } }): ViewStyle & TextStyle =>
  (StyleSheet.flatten(node.props.style) ?? {}) as ViewStyle & TextStyle;

/** Every node under `node`, so the suite can prove a rule is gone anywhere in the card. */
function descendants(node: any): any[] {
  const out: any[] = [node];
  for (const child of node.children ?? []) {
    if (child && typeof child === 'object') out.push(...descendants(child));
  }
  return out;
}

/** The testIDs above a node. A host instance's parent is its own composite, so the
 *  first entries repeat the node's own id — harmless for a "is this inside X" check. */
function ancestorIds(node: any, maxDepth = 6): string[] {
  const ids: string[] = [];
  let current = node;
  for (let i = 0; i < maxDepth && current; i++) {
    const id = current.props?.testID;
    if (typeof id === 'string') ids.push(id);
    current = current.parent;
  }
  return ids;
}

const renderCard = () => render(<RouteMapView month={month()} base={BASE} palette={PALETTES.sia} />);

describe('route map · month summary card', () => {
  it('renders both tiers as equal-column rows inside the same padded card', () => {
    const { getByTestId } = renderCard();
    const card = getByTestId('route-stats');
    const totals = getByTestId('route-stat-totals');
    const counts = getByTestId('route-stat-counts');

    // Same layout rule for both tiers…
    expect(style(totals).flexDirection).toBe('row');
    expect(style(counts).flexDirection).toBe('row');
    expect(style(counts).gap).toBe(style(totals).gap);

    // …and both sit inside the card itself, so they inherit the same 14 pt padding
    // and share the table's two outer edges. The breakdown used to be three rows
    // whose value was pushed to the card's right edge — 19 pt away from where the
    // totals above it end.
    expect(within(card).getByTestId('route-stat-totals')).toBeTruthy();
    expect(within(card).getByTestId('route-stat-counts')).toBeTruthy();
    expect(ancestorIds(totals)).toContain('route-stats');
    expect(ancestorIds(counts)).toContain('route-stats');
  });

  it('gives all seven cells the same flexible column width', () => {
    const { getByTestId } = renderCard();
    for (const id of ['flights', 'distance', 'block', 'duty', 'routes', 'airports', 'countries']) {
      expect(style(getByTestId(`route-stat-${id}`)).flex).toBe(1);
    }
  });

  it('keeps the month numbers readable, with tabular figures so columns cannot shift', () => {
    const { getByTestId } = renderCard();
    const cell = (id: string) => within(getByTestId(`route-stat-${id}`));

    // Totals: 4 legs over 2 trips, so 2 routes / 3 airports / 3 countries.
    expect(cell('flights').getByText('4')).toBeTruthy();
    expect(cell('distance').getByText(/^[\d,]+$/)).toBeTruthy();
    expect(cell('block').getByText(/^\d+:\d{2}$/)).toBeTruthy();
    expect(cell('duty').getByText(/^\d+:\d{2}$/)).toBeTruthy();
    expect(cell('routes').getByText('2')).toBeTruthy();
    expect(cell('airports').getByText('3')).toBeTruthy();
    expect(cell('countries').getByText('3')).toBeTruthy();

    // Labels stay with their own number, in both tiers.
    expect(cell('flights').getByText('Flights')).toBeTruthy();
    expect(cell('distance').getByText('Distance km')).toBeTruthy();
    expect(cell('block').getByText('Block')).toBeTruthy();
    expect(cell('duty').getByText('Duty')).toBeTruthy();
    expect(cell('routes').getByText('Routes')).toBeTruthy();
    expect(cell('airports').getByText('Airports')).toBeTruthy();
    expect(cell('countries').getByText('Countries')).toBeTruthy();

    // Tabular figures in both tiers, so `1` and `8` occupy the same width and a
    // count that changes during the month cannot shift its column.
    for (const [id, value] of [['flights', '4'], ['routes', '2'], ['airports', '3']] as const) {
      expect(style(cell(id).getByText(value)).fontVariant).toEqual(['tabular-nums']);
    }
  });

  it('draws one hairline between the tiers and never ends the card on a rule', () => {
    const { getByTestId, queryByTestId } = renderCard();
    const counts = getByTestId('route-stat-counts');

    // The separator between the tiers…
    expect(style(counts).borderTopWidth).toBe(1);
    // …and the old stacked rows (three label/value lines, each with a bottom
    // border, the last one landing on the card's own edge) are gone.
    expect(queryByTestId('route-stat-rows')).toBeNull();
    expect(descendants(getByTestId('route-stats')).filter(n => style(n).borderBottomWidth !== undefined)).toEqual([]);
  });
});
