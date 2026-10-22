import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Text } from 'react-native';
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
const mockInsets = { current: { top: 0, right: 0, bottom: 0, left: 0 } };
const mockNavigate = jest.fn();

jest.mock('../../src/store', () => ({
  useAppSelector: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));
jest.mock('../../src/components/v2/useLayout', () => {
  const actual = jest.requireActual('../../src/components/v2/useLayout');
  return { ...actual, useLayout: () => mockLayout.current };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets.current }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

type Node = { children: Array<Node | string> };
const textOf = (node: Node): string => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');

beforeEach(async () => {
  jest.useRealTimers();
  await AsyncStorage.clear();
  mockLayout.current = layoutFor(420, 912);
  mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
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

it('uses the optimized iOS duty facts and calculates FDP immediately from chock-on', async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 21, 13, 30));
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByTestId('analyzer-mode-new'));

  expect(screen.getByTestId('analyzer-basic-scroll')).toBeTruthy();
  expect(screen.getByTestId('analyzer-report').props.value).toBe('13:30');
  expect(screen.getByTestId('analyzer-chock-on').props.value).toBe('');
  expect(textOf(screen.getByTestId('analyzer-new-form') as unknown as Node)).not.toContain('MAX FDP');
  expect(textOf(screen.getByTestId('analyzer-new-duty-projection') as unknown as Node)).toMatch(/MAX FDP.*12:00.*LATEST CHOCK-ON.*01:30 \+1 day/);
  expect(textOf(screen.getByTestId('analyzer-result') as unknown as Node)).toMatch(/Enter chock-on for actual FDP/);
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/Awaiting last chock-on time.*Limit 12:00/);
  expect(textOf(screen.getByTestId('metric-dp') as unknown as Node)).toMatch(/Awaiting last chock-on time.*Limit 16:00/);
  expect(screen.getAllByText('Awaiting last chock-on time')).toHaveLength(2);
  expect(screen.getAllByText('Awaiting last chock-on time')[0].props.numberOfLines).toBe(2);
  expect(screen.queryByTestId('analyzer-fdp')).toBeNull();
  expect(screen.queryByTestId('analyzer-dp')).toBeNull();
  expect(screen.queryByTestId('analyzer-acclimatisation-unknown')).toBeNull();
  expect(screen.queryByTestId('analyzer-timezone')).toBeNull();
  expect(screen.queryByTestId('analyzer-block')).toBeNull();
  expect(screen.queryByTestId('metric-block')).toBeNull();
  expect(screen.queryByTestId('analyzer-rest')).toBeNull();
  expect(screen.queryByTestId('analyzer-split')).toBeNull();
  expect(textOf(screen.getByTestId('metric-rest') as unknown as Node)).toMatch(/Awaiting DP.*Required after duty.*From DP/);
  expect(StyleSheet.flatten(screen.getByTestId('analyzer-sectors-value').props.style).width).toBe(48);

  fireEvent.changeText(screen.getByTestId('analyzer-chock-on'), '2345');
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/10:15.*Limit 12:00/);
  fireEvent(screen.getByTestId('analyzer-chock-on'), 'blur');
  expect(screen.getByTestId('analyzer-chock-on').props.value).toBe('23:45');
  expect(textOf(screen.getByTestId('metric-dp') as unknown as Node)).toMatch(/10:15.*Limit 16:00/);
  expect(textOf(screen.getByTestId('metric-rest') as unknown as Node)).toMatch(/12:00.*Required after duty.*From DP/);

  fireEvent.press(screen.getByTestId('analyzer-composition-3P'));
  expect(screen.getByTestId('analyzer-facility-2').props.accessibilityState).toEqual({ selected: true });
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/Limit 15:00/);
  fireEvent.press(screen.getByTestId('analyzer-facility-1'));
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/Limit 16:00/);

  fireEvent.changeText(screen.getByTestId('analyzer-chock-on'), '');
  expect(textOf(screen.getByTestId('analyzer-result') as unknown as Node)).toMatch(/Enter chock-on for actual FDP/);
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toContain('Awaiting last chock-on time');
  expect(textOf(screen.getByTestId('metric-dp') as unknown as Node)).toContain('Awaiting last chock-on time');
});

it('resets every new-duty value to a fresh scenario', async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 21, 13, 30));
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByTestId('analyzer-mode-new'));
  fireEvent.changeText(screen.getByTestId('analyzer-report'), '07:00');
  fireEvent.changeText(screen.getByTestId('analyzer-chock-on'), '22:00');
  fireEvent.press(screen.getByTestId('analyzer-sectors-increase'));
  fireEvent.press(screen.getByTestId('analyzer-composition-3P'));
  fireEvent.press(screen.getByTestId('analyzer-facility-1'));
  fireEvent.press(screen.getByTestId('analyzer-rest-location-away'));

  fireEvent.press(screen.getByTestId('analyzer-reset'));
  await act(async () => {});

  expect(screen.getByTestId('analyzer-report').props.value).toBe('13:30');
  expect(screen.getByTestId('analyzer-chock-on').props.value).toBe('');
  expect(textOf(screen.getByTestId('analyzer-sectors-value') as unknown as Node)).toBe('2');
  expect(screen.getByTestId('analyzer-composition-basic').props.accessibilityState).toEqual({ selected: true });
  expect(screen.queryByTestId('analyzer-facility-1')).toBeNull();
  expect(screen.getByTestId('analyzer-rest-location-home').props.accessibilityState).toEqual({ selected: true });
});

it('creates a new duty, recalculates live, saves it, reopens it, and confirms delete', async () => {
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByTestId('analyzer-mode-new'));
  fireEvent.changeText(screen.getByTestId('analyzer-report'), '07:00');
  fireEvent(screen.getByTestId('analyzer-report'), 'blur');
  fireEvent.changeText(screen.getByTestId('analyzer-chock-on'), '22:00');
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/15:00.*Limit 13:00/);
  expect(screen.getByText('Limit exceeded')).toBeTruthy();

  await act(async () => { fireEvent.press(screen.getByTestId('analyzer-save')); });
  expect(textOf(screen.getByTestId('analyzer-saved-dialog-title') as unknown as Node)).toBe('Scenario saved');
  fireEvent.press(screen.getByTestId('analyzer-saved-dialog-confirm'));
  fireEvent.press(screen.getByTestId('analyzer-mode-saved'));
  const saved = screen.getAllByTestId(/^analyzer-saved-/).find(node => node.props.testID !== 'analyzer-saved-list' && node.props.testID !== 'analyzer-saved-dialog');
  expect(saved).toBeTruthy();
  expect(textOf(saved as unknown as Node)).toMatch(/New duty.*Limit exceeded/);
  fireEvent.press(saved!);
  expect(screen.getByTestId('analyzer-chock-on').props.value).toBe('22:00');
  expect(textOf(screen.getByTestId('metric-fdp') as unknown as Node)).toMatch(/15:00.*Limit 13:00/);
  fireEvent.press(screen.getByTestId('analyzer-mode-saved'));
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

it('uses compact timeline controls and the right-edge action rail only on Duo wide', async () => {
  mockLayout.current = layoutFor(951, 669);
  mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByTestId('analyzer-mode-new'));
  expect(screen.getByTestId('analyzer-action-rail-edge')).toBeTruthy();
  expect(screen.queryByTestId('analyzer-content-actions')).toBeNull();
  fireEvent.press(screen.getByTestId('analyzer-reset'));
  expect(screen.getByTestId('analyzer-report').props.value).toMatch(/^\d{2}:\d{2}$/);

  fireEvent.press(screen.getByTestId('analyzer-mode-roster'));
  fireEvent.press(screen.getAllByTestId(/^analyzer-duty-/)[0]);

  expect(screen.getByTestId('analyzer-action-rail-edge')).toBeTruthy();
  expect(screen.queryByTestId('analyzer-reset-top')).toBeNull();
  expect(screen.queryByTestId('analyzer-content-actions')).toBeNull();
  expect(screen.getByTestId('analyzer-rule-context-compact')).toBeTruthy();
  const segment = screen.getAllByTestId(/^analyzer-segment-(?!select-|dep-|arr-|times-).+:segment-\d+$/)[0];
  const segmentId = segment.props.testID.replace('analyzer-segment-', '');
  const compactTimes = screen.getByTestId(`analyzer-segment-times-compact-${segmentId}`);
  expect(StyleSheet.flatten(compactTimes.props.style).flexWrap).toBe('nowrap');
  const departureField = screen.getByTestId(`analyzer-segment-dep-${segmentId}-field`);
  const arrivalField = screen.getByTestId(`analyzer-segment-arr-${segmentId}-field`);
  expect(StyleSheet.flatten(departureField.props.style).minWidth).toBe(0);
  expect(departureField.findAllByType(Text).some(node => StyleSheet.flatten(node.props.style).minHeight === 40)).toBe(true);
  expect(arrivalField.findAllByType(Text).some(node => StyleSheet.flatten(node.props.style).minHeight === 40)).toBe(true);
  expect(StyleSheet.flatten(screen.getByTestId(`analyzer-segment-dep-${segmentId}-earlier`).props.style).height).toBe(44);
  expect(StyleSheet.flatten(screen.getByTestId(`analyzer-segment-dep-${segmentId}`).props.style).height).toBe(44);

  screen.unmount();
  mockLayout.current = layoutFor(1210, 834);
  mockInsets.current = { top: 24, right: 0, bottom: 20, left: 0 };
  const ipad = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(ipad.getAllByTestId(/^analyzer-duty-/)[0]);
  expect(ipad.queryByTestId('analyzer-action-rail-edge')).toBeNull();
  expect(ipad.getByTestId('analyzer-content-actions')).toBeTruthy();
  expect(ipad.queryByTestId('analyzer-rule-context-compact')).toBeNull();
});

it.each([[420, 912], [912, 420], [669, 951], [951, 669], [834, 1210], [1210, 834]])('uses the approved what-if and optimized new-duty structures at %sx%s', async (width, height) => {
  mockLayout.current = layoutFor(width, height);
  const screen = render(<DutyAnalyzerScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByTestId('analyzer-mode-new'));
  expect(screen.getByTestId('analyzer-new-form')).toBeTruthy();
  expect(screen.getByTestId('analyzer-new-duty-projection')).toBeTruthy();
  expect(screen.getByTestId('analyzer-result')).toBeTruthy();
  const newDutyColumns = screen.queryByTestId('analyzer-columns');
  expect(Boolean(newDutyColumns)).toBe(layoutFor(width, height).wide);
  if (newDutyColumns) {
    expect(StyleSheet.flatten(screen.getByTestId('analyzer-sectors-value').props.style).width).toBe(48);
    expect(StyleSheet.flatten(screen.getByTestId('analyzer-new-duty-editor-column').props.style).flex).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId('analyzer-new-duty-summary-column').props.style).flex).toBe(1);
  }
  fireEvent.press(screen.getByTestId('analyzer-mode-roster'));
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
