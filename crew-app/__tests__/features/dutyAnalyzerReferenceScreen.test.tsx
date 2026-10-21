import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DutyAnalyzerReferenceScreen } from '../../src/features/dutyAnalyzer/DutyAnalyzerReferenceScreen';
import { layoutFor } from '../../src/components/v2/useLayout';
import { CarrierContext, PALETTES } from '../../src/theme/carrier';
import type { DutyAnalyzerInput } from '../../src/features/dutyAnalyzer/dutyAnalyzerTypes';

const mockLayout = { current: layoutFor(420, 912) };

jest.mock('../../src/components/v2/useLayout', () => {
  const actual = jest.requireActual('../../src/components/v2/useLayout');
  return { ...actual, useLayout: () => mockLayout.current };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }));

const input = (overrides: Partial<DutyAnalyzerInput> = {}): DutyAnalyzerInput => ({
  crewCategory: 'flight-deck',
  acclimatisation: 'acclimatised',
  composition: 'basic',
  restFacility: null,
  reportMinuteOfDay: 5 * 60 + 20,
  sectors: 1,
  fdpMinutes: 363,
  dpMinutes: 393,
  blockMinutes: 241,
  restBeforeMinutes: 720,
  restAfterMinutes: 1407,
  atHomeBase: false,
  timezoneDifferenceHours: 1,
  splitBreakMinutes: 0,
  useDiscretion: false,
  ...overrides,
});

const renderReference = (value = input()) => render(
  <CarrierContext.Provider value={PALETTES.sia}>
    <DutyAnalyzerReferenceScreen route={{ key: 'reference', name: 'DutyAnalyzerReference', params: { input: value } } as never} navigation={{} as never} />
  </CarrierContext.Provider>,
);

type Node = { children: Array<Node | string> };
const textOf = (node: Node): string => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');

beforeEach(() => {
  mockLayout.current = layoutFor(420, 912);
});

it('explains the applied reporting range, landing column and maximum FDP', () => {
  const screen = renderReference();

  expect(textOf(screen.getByTestId('easa-applied-row') as unknown as Node)).toMatch(
    /REPORT LOCAL.*05:20.*REPORTING RANGE.*05:00–05:59.*LANDINGS.*1.*MAX FDP.*12:00/,
  );
  expect(textOf(screen.getByTestId('easa-selected-cell') as unknown as Node)).toBe('12:00');
  expect(textOf(screen.getByTestId('easa-source') as unknown as Node)).toMatch(
    /ORO\.FTL\.205\(b\)\(1\).*Table 2.*Revision 24, March 2026.*airline operations manual.*authoritative/,
  );
});

it('separates the configured airline limit from the official EASA Table 2 baseline', () => {
  const screen = renderReference(input({ reportMinuteOfDay: 13 * 60 + 25, sectors: 2 }));

  expect(textOf(screen.getByTestId('easa-report-range') as unknown as Node)).toMatch('13:00–13:59');
  expect(textOf(screen.getByTestId('easa-landings') as unknown as Node)).toMatch('2');
  expect(textOf(screen.getByTestId('easa-selected-cell') as unknown as Node)).toBe('12:00');
  expect(textOf(screen.getByTestId('easa-official-range') as unknown as Node)).toMatch('06:00–13:29');
  expect(textOf(screen.getByTestId('easa-official-sectors') as unknown as Node)).toMatch('1–2');
  expect(textOf(screen.getByTestId('easa-official-max-fdp') as unknown as Node)).toMatch('13:00');
  expect(textOf(screen.getByTestId('easa-comparison-note') as unknown as Node)).toMatch(
    /more restrictive configured airline value: 12:00 instead of the EASA baseline 13:00/,
  );
});

it.each([[420, 912], [912, 420], [669, 951], [951, 669], [834, 1210], [1210, 834]])(
  'keeps the applied lookup and table available at %sx%s',
  (width, height) => {
    mockLayout.current = layoutFor(width, height);
    const screen = renderReference();
    const columns = screen.queryByTestId('easa-reference-columns');
    const single = screen.queryByTestId('easa-reference-single');

    expect(screen.getByTestId('easa-applied-row')).toBeTruthy();
    expect(screen.getByTestId('easa-fdp-table')).toBeTruthy();
    expect(screen.getByTestId('easa-selected-cell')).toBeTruthy();
    expect(Boolean(columns)).toBe(layoutFor(width, height).wide);
    expect(Boolean(single)).toBe(!layoutFor(width, height).wide);
    if (columns) expect(StyleSheet.flatten(columns.props.style).flexDirection).toBe('row');
  },
);
