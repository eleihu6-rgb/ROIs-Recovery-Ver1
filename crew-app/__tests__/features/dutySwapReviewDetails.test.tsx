import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CompareSheet } from '../../src/features/dutySwap/components/CompareSheet';
import { TwinReview } from '../../src/features/dutySwap/twinRail/TwinReview';
import { realLegs, type ApiCompare } from '../../src/features/dutySwap/dutySwapModel';
import { paletteFor } from '../../src/theme/carrier';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) }));
const fixture: { data: ApiCompare } = require('../fixtures/dutySwap/compare-447841.json');
const mine = [fixture.data.mineTaskDetailList.find(t => t.pairingId === 625688)!];
const others = [fixture.data.othersTaskDetailList.find(t => t.pairingId === 625779)!];
const p = paletteFor('sia');

function assertDetails(ui: ReturnType<typeof render>): void {
  for (const task of [...mine, ...others]) {
    expect(ui.getByText(`FDP ${task.fdp}`).props.numberOfLines).toBeUndefined();
    expect(ui.getByText(`RPT ${task.startDateTimeLocal ?? task.startDateTime}`)).toBeTruthy();
    expect(ui.getByText(`End ${task.endDateTimeLocal ?? task.endDateTime}`)).toBeTruthy();
    for (const leg of realLegs(task)) {
      const metadata = ui.getByTestId(`review-flight-metadata-${leg.fltNo}`);
      expect(metadata.props.children.join('')).toBe(`Aircraft ${leg.ac} · BLH ${leg.blh}`);
      expect(metadata.props.numberOfLines).toBeUndefined();
      expect(ui.getByTestId(`review-flight-times-${leg.fltNo}`).props.children.join('')).toBe(`${leg.std}–${leg.sta}`);
    }
  }
}

it('renders every leg and duty FDP without truncation in Compare & send and keeps note submission intact', () => {
  const submit = jest.fn();
  const ui = render(<CompareSheet visible onClose={jest.fn()} palette={p} carrier="PR"
    meId="392923" othersId="447841" mine={mine} others={others} picked mode="swap" onSubmit={submit} />);
  assertDetails(ui);
  expect(ui.getByText('PR124 MNL→SEA').props.numberOfLines).toBeUndefined();
  expect(ui.getByText('PR125 SEA→MNL')).toBeTruthy();
  fireEvent.changeText(ui.getByTestId('swap-comment'), 'Please review the complete duties');
  fireEvent.press(ui.getByTestId('swap-submit'));
  expect(submit).toHaveBeenCalledWith('Please review the complete duties');
  expect(ui.getByTestId('swap-delta')).toBeTruthy();
});

it('keeps complete metadata in both Twin Review tabs without altering send readiness', () => {
  const submit = jest.fn();
  const ui = render(<TwinReview p={p} crewB="447841" carrier="PR" give={[]} take={[]} mine={mine} theirs={others}
    ready loading={false} error={null} onRetry={jest.fn()} note="" setNote={jest.fn()} submitting={false} onSubmit={submit} />);
  assertDetails(ui);
  fireEvent.press(ui.getByTestId('twin-review-details'));
  assertDetails(ui);
  expect(ui.getByText('124 MNL→SEA').props.numberOfLines).toBeUndefined();
  expect(ui.getByTestId('twin-note')).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
});

it('shows a published layover once when the same value occurs at task and leg level', () => {
  const task = mine[0];
  const legs = realLegs(task);
  const withLegLayover = { ...task, segmentDetailVoList: legs.map((leg, i) => i === 0
    ? { ...leg, layoverPort: task.layoverPort, layoverTime: task.layoverTime } : leg) };
  const ui = render(<CompareSheet visible onClose={jest.fn()} palette={p} carrier="PR"
    meId="392923" othersId="447841" mine={[withLegLayover]} others={[]} picked mode="record" />);
  expect(ui.getAllByText(`Layover ${task.layoverPort} ${task.layoverTime}`)).toHaveLength(1);
  expect(ui.queryByTestId('swap-submit')).toBeNull();
});
