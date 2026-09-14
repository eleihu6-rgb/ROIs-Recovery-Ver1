// Home ▸ Quick actions ▸ Discretion — the crew's own FDP-discretion page.
// Covers: the pending section (actionable) + terminal history, the duty-level
// detail, the Yes/No decision round-trip, and the load path.
import React from 'react';
import {render, fireEvent, act} from '@testing-library/react-native';

import {DiscretionScreen} from '../../src/features/v2/DiscretionScreen';
import {loadDiscretionHistory, decideDiscretion} from '../../src/features/notifications/notificationsSlice';

const mockDispatch = jest.fn();
const pending = {
  discretionId: 'req-pending', dutyId: '1', extensionRequestedMin: 60, state: 'pending',
  plannedFdpMin: 660, actualFdpMin: 780,
  duty: {
    pairingId: '152548', pairingLabel: 'PI201/PI202', dutySeq: '1',
    reportUtc: '2026-09-28T04:00:00Z', releaseUtc: '2026-09-28T17:15:00Z',
    fdpBeforeMin: 660, fdpAfterMin: 780,
    legs: [{fltNum: 'PI202', depArp: 'HKG', arvArp: 'SIN', schDepUtc: '2026-09-28T11:00:00Z', schArvUtc: '2026-09-28T15:00:00Z', revisedDepUtc: '2026-09-28T13:00:00Z', revisedArvUtc: '2026-09-28T17:00:00Z', delayMin: 120, operated: false}],
  },
};
const decided = {
  discretionId: 'req-done', dutyId: '2', extensionRequestedMin: 30, state: 'accepted',
  plannedFdpMin: 600, actualFdpMin: 600, decidedUtc: '2026-09-12T09:00:00Z',
};
const mockState = {
  auth: {airline: 'F8', crewId: 'S21001', password: 'ephemeral-test-session'},
  notifications: {discretionHistory: [pending, decided], decidingId: null},
};
jest.mock('../../src/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn()}),
  useFocusEffect: (cb: () => void) => {require('react').useEffect(cb, [cb]);},
}));
jest.mock('../../src/features/notifications/notificationsSlice', () => ({
  loadDiscretionHistory: jest.fn(),
  decideDiscretion: jest.fn(),
}));
beforeEach(() => jest.clearAllMocks());

it('loads the crew history and shows pending + terminal sections with duty detail', async () => {
  (loadDiscretionHistory as jest.Mock).mockResolvedValue([pending, decided]);
  const screen = render(<DiscretionScreen />);
  await act(async () => {});
  expect(loadDiscretionHistory).toHaveBeenCalledWith(mockDispatch, {credentials: mockState.auth});
  expect(screen.getByTestId('disc-leg-rev-PI202')).toBeTruthy();
  expect(screen.getByTestId('btn-accept')).toBeTruthy();
  // The terminal request renders its outcome instead of the Yes/No pills.
  expect(screen.getByTestId('disc-state')).toBeTruthy();
});

it('sends an explicit decision and reloads the history', async () => {
  (loadDiscretionHistory as jest.Mock).mockResolvedValue([pending, decided]);
  (decideDiscretion as jest.Mock).mockResolvedValue({...pending, state: 'accepted'});
  const screen = render(<DiscretionScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByTestId('btn-accept'));
  expect(screen.getByText('Yes FDP discretion?')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByTestId('discretion-dialog-confirm')); });
  expect(decideDiscretion).toHaveBeenCalledWith(mockDispatch, {
    discretionId: 'req-pending', decision: 'accept', credentials: mockState.auth,
  });
  expect(loadDiscretionHistory).toHaveBeenCalledTimes(2);
});
