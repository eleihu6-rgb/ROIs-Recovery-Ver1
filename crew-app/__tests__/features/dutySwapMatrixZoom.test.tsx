import React from 'react';
import { PanResponder, StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Line } from 'react-native-svg';
import { CrewMatrix, matrixGeometry } from '../../src/features/dutySwap/components/CrewMatrix';
import { daysBetween, toCrews } from '../../src/features/dutySwap/dutySwapModel';
import { colors } from '../../src/theme';
import { paletteFor } from '../../src/theme/carrier';

const viewports = [[420, 912], [912, 420], [669, 951], [951, 669], [834, 1210], [1210, 834]] as const;

it.each(viewports)('draws start/end guides across the matrix at the selected Mine duty edges on %sx%s', (width, height) => {
  const crews = toCrews(require('../fixtures/dutySwap/search.json').data);
  const days = daysBetween('2026-10-07', '2026-10-31');
  const geometry = matrixGeometry(width, height, crews.length - 1);
  const trip = crews[0].duties.find(d => d.code === 'PR124/PR125')!;
  const standby = crews[0].duties.find(d => d.code === '2HB')!;
  const props = (give: Set<string>) => ({
    palette: paletteFor('graphite'), me: crews[0], others: crews.slice(1), days,
    geometry, width, details: {}, give, take: new Set<string>(), crewB: null,
    onPressDuty: jest.fn(), onPressCrew: jest.fn(), onVisibleCrews: jest.fn(),
  });
  const ui = render(<CrewMatrix {...props(new Set())} />);
  expect(ui.queryAllByTestId(/^matrix-guide-(start|end)$/)).toHaveLength(0);

  ui.rerender(<CrewMatrix {...props(new Set([trip.key]))} />);
  const block = StyleSheet.flatten(ui.getByTestId(`duty-${trip.crewId}-${trip.code}`).props.style);
  const start = StyleSheet.flatten(ui.getByTestId('matrix-guide-start').props.style);
  const end = StyleSheet.flatten(ui.getByTestId('matrix-guide-end').props.style);
  expect(start.top).toBeCloseTo(block.top);
  expect(end.top).toBeCloseTo(block.top + block.height);
  expect(start.left).toBe(geometry.mineW - 4);
  expect(ui.getByTestId('matrix-guides').props.pointerEvents).toBe('none');
  for (const id of ['matrix-guide-start', 'matrix-guide-end']) {
    expect(ui.getByTestId(id).findByType(Line).props).toMatchObject({
      stroke: colors.primary, strokeOpacity: 0.9, strokeWidth: 1.5, strokeDasharray: '4 4',
    });
  }

  ui.rerender(<CrewMatrix {...props(new Set([trip.key, standby.key]))} />);
  const later = StyleSheet.flatten(ui.getByTestId(`duty-${standby.crewId}-${standby.code}`).props.style);
  expect(StyleSheet.flatten(ui.getByTestId('matrix-guide-start').props.style).top).toBeCloseTo(block.top);
  expect(StyleSheet.flatten(ui.getByTestId('matrix-guide-end').props.style).top).toBeCloseTo(later.top + later.height);

  ui.rerender(<CrewMatrix {...props(new Set())} />);
  expect(ui.queryAllByTestId(/^matrix-guide-(start|end)$/)).toHaveLength(0);
  ui.unmount();
});

it('resizes rows, reveals narrow-puck details, clamps zoom and cancels selection during pinch', () => {
  const create = jest.spyOn(PanResponder, 'create');
  const crews = toCrews(require('../fixtures/dutySwap/search.json').data);
  const onPressDuty = jest.fn();
  const ui = render(<CrewMatrix palette={paletteFor('sia')} me={crews[0]} others={crews.slice(1)}
    days={daysBetween('2026-10-07', '2026-10-31')} geometry={matrixGeometry(420, 600, 6)} width={420}
    details={{ '447841': require('../fixtures/dutySwap/compare-447841.json').data }}
    give={new Set()} take={new Set()} crewB={null} onPressDuty={onPressDuty}
    onPressCrew={jest.fn()} onVisibleCrews={jest.fn()} />);
  const handlers = create.mock.calls[0][0];
  const event = (d: number) => ({ nativeEvent: { touches: [{ pageX: 100, pageY: 100 }, { pageX: 100, pageY: 100 + d }] } });
  const send = (name: keyof typeof handlers, d: number) => act(() => (handlers[name] as Function)(event(d), {}));
  const trip = () => ui.getByTestId('duty-392923-PR124/PR125');
  const height = () => StyleSheet.flatten(trip().props.style).height;
  const initial = height();
  expect(within(trip()).queryByText('Fleet 350')).toBeNull();
  expect(handlers.onStartShouldSetPanResponderCapture!({ nativeEvent: { touches: [{}] } } as never, {} as never)).toBe(false);
  send('onPanResponderGrant', 100);
  expect(ui.getByTestId('crew-matrix-days').props.scrollEnabled).toBe(false);
  fireEvent.press(trip());
  expect(onPressDuty).not.toHaveBeenCalled();
  send('onPanResponderMove', 300);
  expect(height()).toBeCloseTo((initial + 4) * 3 - 4);
  expect(within(trip()).getByText('Fleet 350')).toBeTruthy();
  expect(within(trip()).getByText('BLH 25:20 · CRD 26:20').props.numberOfLines).toBe(2);
  send('onPanResponderMove', 1000);
  const max = height();
  send('onPanResponderMove', 2000);
  expect(height()).toBe(max);
  send('onPanResponderMove', 10);
  expect(height()).toBe(initial);
  send('onPanResponderRelease', 10);
  expect(ui.getByTestId('crew-matrix-days').props.scrollEnabled).toBe(true);
  fireEvent.press(trip());
  expect(onPressDuty).toHaveBeenCalledTimes(1);
  send('onPanResponderGrant', 100);
  send('onPanResponderTerminate', 100);
  expect(ui.getByTestId('crew-matrix-scroll').props.scrollEnabled).toBe(true);
  for (const duty of ui.getAllByTestId(/^duty-/)) expect(StyleSheet.flatten(duty.props.style).height).toBeGreaterThanOrEqual(22);
  create.mockRestore();
});
