import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet } from 'react-native';
import { CarrierContext, PALETTES } from '../../src/theme/carrier';
import { DutyAnalyzerScreen } from '../../src/features/dutyAnalyzer/DutyAnalyzerScreen';
import { layoutFor } from '../../src/components/v2/useLayout';
import type { Trip } from '../../src/features/travel/tripCsv';

const trip: Trip = {
  id: 'TG-BKK-CNX-BKK',
  crewId: '35459',
  checkInDateUTC: '21 Oct 2026 0000',
  legs: [
    {
      crewId: '35459', fltNumber: 'TG660', flightDateUTC: '21 Oct 2026 0100', depArp: 'BKK',
      arvDateUTC: '21 Oct 2026 0720', arvArp: 'HND', fleet: '350', hotel: 'Haneda', assignment: 'FLY',
      dutyReportUTC: '21 Oct 2026 0000', dutyFdpMinutes: 600, dutyDpMinutes: 660,
      dutyBlockMinutes: 380,
    },
    {
      crewId: '35459', fltNumber: 'TG661', flightDateUTC: '21 Oct 2026 0900', depArp: 'HND',
      arvDateUTC: '21 Oct 2026 1530', arvArp: 'BKK', fleet: '350', hotel: '', assignment: 'FLY',
      dutyReportUTC: '21 Oct 2026 0000', dutyFdpMinutes: 600, dutyDpMinutes: 660,
      dutyBlockMinutes: 770,
    },
    {
      crewId: '35459', fltNumber: 'TG670', flightDateUTC: '22 Oct 2026 0200', depArp: 'BKK',
      arvDateUTC: '22 Oct 2026 0830', arvArp: 'HKT', fleet: '350', hotel: '', assignment: 'FLY',
      dutyReportUTC: '22 Oct 2026 0100', dutyFdpMinutes: 480, dutyDpMinutes: 540,
      dutyBlockMinutes: 390, dutyRestHours: 17.67,
    },
  ],
};

const mockState = {
  auth: { airline: 'TG', crewId: '35459', base: 'BKK' },
  trips: { trips: [trip] },
};
const mockLayout = { current: layoutFor(420, 912) };
const mockNavigate = jest.fn();

jest.mock('../../src/store', () => ({
  useAppSelector: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));
jest.mock('../../src/components/v2/useLayout', () => {
  const actual = jest.requireActual('../../src/components/v2/useLayout');
  return { ...actual, useLayout: () => mockLayout.current };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

type Node = { children: Array<Node | string> };
const textOf = (node: Node): string => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');

beforeEach(async () => {
  await AsyncStorage.clear();
  mockLayout.current = layoutFor(420, 912);
  mockNavigate.mockClear();
});

it('groups a dated base-to-base pairing while keeping each duty available for what-if', async () => {
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});

  const pairings = screen.getAllByTestId(/^analyzer-pairing-/)
    .filter(node => !node.props.testID.startsWith('analyzer-pairing-date-'));
  expect(pairings).toHaveLength(1);
  expect(textOf(pairings[0] as unknown as Node)).toMatch(/BKK–HND–BKK–HKT.*2 duties.*21 Oct 2026/);
  expect(textOf(screen.getByTestId(`analyzer-pairing-date-${trip.id}`) as unknown as Node)).toBe('21 Oct 2026');

  const duties = screen.getAllByTestId(/^analyzer-duty-/);
  expect(duties).toHaveLength(2);
  expect(textOf(duties[0] as unknown as Node)).toMatch(/D1.*BKK–HND–BKK.*TG661.*FDP.*10:00.*DP.*11:00.*REST.*BLOCK.*06:20/);
  expect(textOf(duties[0] as unknown as Node)).not.toContain('Not published');
  expect(textOf(duties[1] as unknown as Node)).toMatch(/D2.*BKK–HKT.*TG670.*FDP.*08:00.*DP.*09:00.*REST.*17:40.*BLOCK.*06:30/);

  fireEvent.press(duties[0]);
  expect(screen.getByTestId('analyzer-timeline')).toBeTruthy();
  expect(screen.getByText('Duty report time')).toBeTruthy();
  expect(screen.getByTestId('analyzer-report-time')).toBeTruthy();
  expect(screen.getAllByTestId(/^analyzer-segment-(?!select-|dep-|arr-).+:segment-\d+$/)).toHaveLength(2);
  expect(screen.queryByTestId('analyzer-flight-actions')).toBeNull();
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/10:00.*Portal 10:00/);
  expect(screen.getByText(/BKK · Local 07:00 · UTC 00:00/)).toBeTruthy();
  expect(screen.getByText(/HND · Local 16:20 · UTC 07:20/)).toBeTruthy();
});

it('exposes every rule modifier and recalculates the selected context', async () => {
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByTestId('analyzer-mode-new'));

  fireEvent.changeText(screen.getByTestId('analyzer-report'), '13:30');
  fireEvent(screen.getByTestId('analyzer-report'), 'blur');
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/10:00.*Limit 12:00/);

  fireEvent.press(screen.getByTestId('analyzer-category-cabin'));
  expect(textOf(screen.getByTestId('analyzer-result') as unknown as Node)).toMatch(/Needs review.*Cabin-crew limits require an approved cabin rule pack/);
  fireEvent.press(screen.getByTestId('analyzer-category-flight-deck'));
  fireEvent.press(screen.getByTestId('analyzer-composition-3P'));
  fireEvent.press(screen.getByTestId('analyzer-facility-1'));
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/Limit 16:00/);

  fireEvent.press(screen.getByTestId('analyzer-rest-location-away'));
  expect(screen.getByTestId('analyzer-timezone')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('analyzer-timezone'), '4');
  expect(textOf(screen.getByTestId('metric-rest') as unknown as Node)).toMatch(/Minimum 14:00/);

  expect(screen.queryByText('Rules')).toBeNull();
  expect(screen.queryByText(/6007|6008/)).toBeNull();
  fireEvent.press(screen.getByTestId('analyzer-composition-basic'));
  fireEvent.press(screen.getByTestId('analyzer-acclimatisation-unknown'));
  expect(screen.getByTestId('analyzer-odp-before')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('analyzer-odp-before'), '720');
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/Limit 10:00/);
});

it('creates a new duty, recalculates live, saves it, reopens it, and confirms delete', async () => {
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByTestId('analyzer-mode-new'));
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch('10:00');
  fireEvent.changeText(screen.getByTestId('analyzer-fdp'), '900');
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/15:00.*Limit 13:00/);
  expect(screen.getByText('Limit exceeded')).toBeTruthy();

  await act(async () => { fireEvent.press(screen.getByTestId('analyzer-save')); });
  expect(textOf(screen.getByTestId('analyzer-saved-dialog-title') as unknown as Node)).toBe('Scenario saved');
  fireEvent.press(screen.getByTestId('analyzer-saved-dialog-confirm'));
  fireEvent.press(screen.getByTestId('analyzer-mode-saved'));
  const saved = screen.getAllByTestId(/^analyzer-saved-/).find(node => node.props.testID !== 'analyzer-saved-list' && node.props.testID !== 'analyzer-saved-dialog');
  expect(saved).toBeTruthy();
  expect(textOf(saved as unknown as Node)).toMatch(/New duty.*Limit exceeded/);
  fireEvent.press(screen.getAllByTestId(/^analyzer-delete-/)[0]);
  expect(textOf(screen.getByTestId('analyzer-delete-dialog-title') as unknown as Node)).toBe('Delete scenario?');
  await act(async () => { fireEvent.press(screen.getByTestId('analyzer-delete-dialog-confirm')); });
  expect(screen.getByText('No saved scenarios')).toBeTruthy();
});

it('shows an in-app warning when a scenario cannot be saved', async () => {
  const setItem = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage unavailable'));
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByTestId('analyzer-mode-new'));
  await act(async () => { fireEvent.press(screen.getByTestId('analyzer-save')); });

  expect(textOf(screen.getByTestId('analyzer-storage-error-dialog-title') as unknown as Node)).toBe('Could not update scenarios');
  setItem.mockRestore();
});

it('opens the EASA reference with the current report time and landing count', async () => {
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getAllByTestId(/^analyzer-duty-/)[0]);
  fireEvent.press(screen.getByTestId('analyzer-open-reference'));

  expect(mockNavigate).toHaveBeenCalledWith('DutyAnalyzerReference', {
    input: expect.objectContaining({ reportMinuteOfDay: 7 * 60, sectors: 2 }),
  });
});

it.each(Object.keys(PALETTES) as Array<keyof typeof PALETTES>)('keeps Analyzer context and reference labels readable in the %s theme', async preset => {
  const p = PALETTES[preset];
  const screen = render(<CarrierContext.Provider value={p}><DutyAnalyzerScreen /></CarrierContext.Provider>);
  await act(async () => {});
  fireEvent.press(screen.getAllByTestId(/^analyzer-duty-/)[0]);

  for (const chip of screen.getAllByText(/Flight deck · from sign-in|Ends at home base/)) {
    expect(StyleSheet.flatten(chip.props.style).color).toBe(p.ink);
  }
  expect(StyleSheet.flatten(screen.getByText('Reference').props.style).color).toBe(p.cardInk);
  expect(StyleSheet.flatten(screen.getByText('Within limit').props.style).color).toBe(p.cardInk);
});

it('edits airport-local time and updates UTC plus duty metrics together', async () => {
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getAllByTestId(/^analyzer-duty-/)[0]);
  const arrival = screen.getAllByTestId(/^analyzer-segment-arr-.*:segment-0$/)[0];
  fireEvent.changeText(arrival, '16:30');
  fireEvent(arrival, 'blur');

  expect(screen.getByText(/Now · Local 16:30 · UTC 07:30/)).toBeTruthy();
  expect(textOf(screen.getByTestId('metric-block') as unknown as Node)).toMatch(/06:30.*Portal 06:20/);
});

it('reveals contextual actions only after selecting a flight and moves linked times', async () => {
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getAllByTestId(/^analyzer-duty-/)[0]);
  const secondSelect = screen.getAllByTestId(/^analyzer-segment-select-/)[1];
  fireEvent.press(secondSelect);
  expect(screen.getByTestId('analyzer-flight-actions')).toBeTruthy();
  expect(screen.queryByTestId('analyzer-move-form')).toBeNull();
  fireEvent.press(screen.getByTestId('analyzer-action-move'));
  expect(screen.getByTestId('analyzer-move-form')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('analyzer-shift-minutes'), '60');
  fireEvent.press(screen.getByTestId('analyzer-shift-apply'));
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/11:00.*Portal 10:00/);
  expect(textOf(screen.getByTestId('metric-block') as unknown as Node)).toMatch(/06:20.*Portal 06:20/);
  fireEvent.press(screen.getByTestId('analyzer-action-cancel'));
  expect(screen.queryByTestId('analyzer-flight-actions')).toBeNull();
});

it('adds one diversion recovery segment and shows an exceeded FDP warning', async () => {
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getAllByTestId(/^analyzer-duty-/)[0]);
  fireEvent.press(screen.getAllByTestId(/^analyzer-segment-select-/)[1]);
  fireEvent.press(screen.getByTestId('analyzer-action-diversion'));
  fireEvent.changeText(screen.getByTestId('analyzer-divert-airport'), 'CNX');
  fireEvent.changeText(screen.getByTestId('analyzer-divert-arrival'), '23:00');
  fireEvent.changeText(screen.getByTestId('analyzer-recovery-departure'), '23:30');
  fireEvent.changeText(screen.getByTestId('analyzer-recovery-arrival'), '05:30');
  fireEvent.press(screen.getByTestId('analyzer-apply-diversion'));

  expect(screen.getByText('TG661R')).toBeTruthy();
  expect(screen.getByText('CNX → BKK · 350')).toBeTruthy();
  expect(screen.getAllByTestId(/^analyzer-segment-(?!select-|dep-|arr-).+:segment-\d+(?::recovery)?$/)).toHaveLength(3);
  expect(screen.getByTestId('metric-fdp-warning')).toBeTruthy();
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/17:00.*Portal 10:00.*Over 04:00/);
  fireEvent.press(screen.getByTestId('analyzer-apply-diversion'));
  expect(screen.getAllByTestId(/^analyzer-segment-(?!select-|dep-|arr-).+:segment-\d+(?::recovery)?$/)).toHaveLength(3);
});

it.each([[420, 912], [912, 420], [669, 951], [951, 669], [834, 1210], [1210, 834]])('uses the approved what-if structure at %sx%s', async (width, height) => {
  mockLayout.current = layoutFor(width, height);
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getAllByTestId(/^analyzer-duty-/)[0]);
  const columns = screen.queryByTestId('analyzer-columns');
  const single = screen.queryByTestId('analyzer-single-column');
  expect(Boolean(columns)).toBe(layoutFor(width, height).wide);
  expect(Boolean(single)).toBe(!layoutFor(width, height).wide);
  if (columns) expect(StyleSheet.flatten(columns.props.style).flexDirection).toBe('row');
  expect(screen.getByTestId('analyzer-editor-pane')).toBeTruthy();
  expect(screen.getByTestId('analyzer-summary-pane')).toBeTruthy();
  expect(screen.getByTestId('analyzer-result')).toBeTruthy();
  expect(screen.getByTestId('analyzer-change-log')).toBeTruthy();
  expect(screen.getByText(/Simulations stay on this device/)).toBeTruthy();
});
