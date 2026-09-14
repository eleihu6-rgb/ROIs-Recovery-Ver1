// Regression for Ryan's Case-2 crew-app Discretion-card bugs (2026-09-14):
//   Bug 3 — "gantt shows proposed fdp 1530, but app shows 1700": the proposed
//     FDP was recalculated + requested (930 + 90 = 1020 = 17h00) instead of the
//     recalculated value itself (930 = 15h30). requested = recalculated − current,
//     so adding it again double-counts the delay.
//   Bug 1 — the card title read the whole-PAIRING label
//     (ET2681/ET2682/ET2683/ET2684, all four legs across two duties) on a card
//     that only holds duty 1 (ET2681/ET2682) → phantom flights.
import React from 'react';
import {render} from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';

import {DiscretionCard, fdpExtension, fmtHm} from '../../src/features/notifications/DiscretionCard';
import {PALETTES} from '../../src/theme/carrier';
import type {DiscretionRequest} from '../../src/features/notifications/notificationsApi';

// Exact Case-2 shape: ET2681 on-time, ET2682 delayed +90 ⇒ FDP 840 → 930 (+90).
// The stored pairingLabel is the whole pairing (all four legs) as the backend keeps it.
const CASE2: DiscretionRequest = {
  discretionId: 'req-case2', crewId: 'T2001', captainCrewId: '', pairingId: '152675',
  dutyId: '1', createdUtc: '2026-09-14T20:00:00Z', extensionRequestedMin: 90, state: 'rejected',
  plannedFdpMin: 840, actualFdpMin: 930,
  duty: {
    pairingId: '152675', pairingLabel: 'ET2681/ET2682/ET2683/ET2684', dutySeq: '1',
    reportUtc: '2026-09-29T02:00:00Z', releaseUtc: '2026-09-29T17:45:00Z',
    fdpBeforeMin: 840, fdpAfterMin: 930,
    legs: [
      {fltNum: 'ET2681', depArp: 'ADD', arvArp: 'DXB', schDepUtc: '2026-09-29T04:00:00Z', schArvUtc: '2026-09-29T08:00:00Z', revisedDepUtc: '2026-09-29T04:00:00Z', revisedArvUtc: '2026-09-29T08:00:00Z', delayMin: 0, operated: false},
      {fltNum: 'ET2682', depArp: 'DXB', arvArp: 'ADD', schDepUtc: '2026-09-29T12:00:00Z', schArvUtc: '2026-09-29T16:00:00Z', revisedDepUtc: '2026-09-29T13:30:00Z', revisedArvUtc: '2026-09-29T17:30:00Z', delayMin: 90, operated: false},
    ],
  },
} as unknown as DiscretionRequest;

it('Bug 3 — proposed FDP is the recalculated value (15h30), not recalculated + requested (17h00)', () => {
  const {current, recalculated, proposed, requested} = fdpExtension(CASE2);
  expect(current).toBe(840);      // 14h00
  expect(recalculated).toBe(930); // 15h30
  expect(requested).toBe(90);
  expect(proposed).toBe(930);     // 15h30 — matches the gantt Proposed FDP, NOT 1020 (17h00)
  expect(fmtHm(proposed)).toBe('15h30');
});

it('Bug 3 — proposed falls back to current + requested when there is no recalculated value', () => {
  const noRecalc = {...CASE2, actualFdpMin: null, duty: {...CASE2.duty!, fdpAfterMin: null}} as unknown as DiscretionRequest;
  const {proposed} = fdpExtension(noRecalc);
  expect(proposed).toBe(930); // 840 + 90
});

it('Bug 1 — the card title is scoped to THIS duty (ET2681/ET2682), not the whole-pairing label', () => {
  const screen = render(<DiscretionCard request={CASE2} palette={PALETTES.emerald} showActions={false} />);
  const title = screen.getByTestId('disc-title');
  expect(title).toHaveTextContent('ET2681/ET2682');
  // The other two legs live in duty 2 and must NOT appear as phantom flights here.
  expect(title).not.toHaveTextContent('ET2683');
  expect(title).not.toHaveTextContent('ET2684');
  // And the proposed FDP renders as 15h30 on screen.
  expect(screen.getByTestId('disc-fdp-proposed')).toHaveTextContent('15h30');
});
