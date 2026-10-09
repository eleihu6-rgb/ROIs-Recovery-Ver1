// Cabin crew (e.g. PR 452320, rank FS) qualify on several fleets, so a Duty Swap
// search returns 120+ candidates (the web pages them 11 × 12). The matrix mounts
// only the crew columns in view, the toolbar says where you are ("1–6 of 123"),
// and R'Bot finds "crew with US duties" from the window's own ports.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { CrewMatrix, COL_OVERSCAN, columnWindow, matrixGeometry } from '../../src/features/dutySwap/components/CrewMatrix';
import { interpretSwapLocally } from '../../src/features/dutySwap/swapRbot';
import { daysBetween, emptyFilters, toCrews, type ApiCrewRow } from '../../src/features/dutySwap/dutySwapModel';
import { paletteFor } from '../../src/theme/carrier';

const search: { data: ApiCrewRow[] } = require('../fixtures/dutySwap/search.json');

/** Me + 123 candidates, cloned from the PR fixture's rows (synthetic ids). */
function cabinSearch(n = 123): ApiCrewRow[] {
  const [me, ...rest] = search.data;
  const others = Array.from({ length: n }, (_, i) => ({ ...rest[i % rest.length], crewId: String(500000 + i) }));
  return [me, ...others];
}

describe('column window', () => {
  it('mounts the columns in view plus the overscan, clamped to the list', () => {
    expect(columnWindow(0, 100, 600, 123)).toEqual({ from: 0, to: 7 + COL_OVERSCAN });
    expect(columnWindow(5000, 100, 600, 123)).toEqual({ from: 50 - COL_OVERSCAN, to: 57 + COL_OVERSCAN });
    expect(columnWindow(12300, 100, 600, 123)).toEqual({ from: 123 - COL_OVERSCAN, to: 123 });
  });
});

describe('123-crew matrix', () => {
  const rows = cabinSearch();
  const crews = toCrews(rows);
  const [me, ...others] = crews;
  const filters = emptyFilters('2026-10-08', '2026-10-31');
  const days = daysBetween(filters.startDate, filters.endDate);
  const g = matrixGeometry(951, 600, others.length);
  const p = paletteFor('sia');

  it('turns 124 portal rows into crews quickly', () => {
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) toCrews(rows);
    expect(crews).toHaveLength(124);
    expect((Date.now() - t0) / 5).toBeLessThan(150);
  });

  it('mounts only the visible crew columns, follows the scroll, reports "1–6 of 123"', () => {
    const onRange = jest.fn();
    const ui = render(
      <CrewMatrix palette={p} me={me} others={others} days={days} geometry={g} width={951} details={{}}
        give={new Set()} take={new Set()} crewB={null} onPressDuty={jest.fn()} onPressCrew={jest.fn()}
        onVisibleCrews={jest.fn()} onRange={onRange} />,
    );
    const mounted = () => ui.queryAllByTestId(/^matrix-crew-/).map(e => e.props.testID as string);
    const first = mounted();
    expect(first.length).toBeLessThanOrEqual(Math.ceil((951 - g.mineW - g.dateW) / g.colW) + 1 + COL_OVERSCAN);
    expect(first[0]).toBe(`matrix-crew-${others[0].crewId}`);
    expect(onRange).toHaveBeenLastCalledWith(1, g.visibleCols);

    // Scroll to the 100th crew: its column mounts, the first one is gone.
    const x = 99 * g.colW;
    fireEvent.scroll(ui.getByTestId('crew-matrix-scroll'), { nativeEvent: { contentOffset: { x, y: 0 } } });
    fireEvent(ui.getByTestId('crew-matrix-scroll'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x, y: 0 } } });
    expect(mounted()).toContain(`matrix-crew-${others[99].crewId}`);
    expect(mounted()).not.toContain(`matrix-crew-${others[0].crewId}`);
    expect(onRange).toHaveBeenLastCalledWith(100, 99 + g.visibleCols);
  });
});

describe("R'Bot: crew with US duties", () => {
  const crews = toCrews(cabinSearch(10));
  const filters = emptyFilters('2026-10-08', '2026-10-31');
  // The window's ports as the portal lists them for 452320 (subset).
  const options = { ports: ['DOH', 'GUM', 'HNL', 'JFK', 'LAX', 'MNL', 'NRT', 'SEA', 'SFO', 'YVR'] };
  const screen = { filters, crews, details: {}, options };

  it('searches flights arriving at every US port of the window', () => {
    for (const ask of ['Find crew with US duties', 'who has flights to the United States?', 'show crew with duties in the USA']) {
      expect(interpretSwapLocally(ask, screen)!.actions).toEqual([
        { type: 'set_swap_search', fields: { fltArrList: ['HNL', 'JFK', 'LAX', 'SEA', 'SFO'] }, label: 'US duties · HNL, JFK, LAX, SEA, SFO' },
      ]);
    }
  });

  it('other countries by name; "us" the pronoun is not the US', () => {
    expect(interpretSwapLocally('crew with trips to Japan', screen)!.actions[0]).toMatchObject({ fields: { fltArrList: ['NRT'] } });
    expect(interpretSwapLocally('show us crew with a DOH layover', screen)!.actions[0]).toMatchObject({ fields: { layoverPortList: ['DOH'] } });
  });
});

describe('search timeout', () => {
  it('a cabin crew search may take 90 s (the client default is 30 s)', async () => {
    jest.useFakeTimers();
    const { createDutySwapApi, SEARCH_TIMEOUT_MS } = require('../../src/features/dutySwap/dutySwapApi');
    const client = {
      raw: jest.fn((_m: string, _p: string, opts: { timeoutMs?: number }) => new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Aborted')), opts.timeoutMs ?? 30_000);
        setTimeout(() => { clearTimeout(t); resolve({ code: 0, message: null, data: [] }); }, 45_000);
      })),
    };
    const api = createDutySwapApi({ airline: 'PR', crewId: '452320', password: 'x' }, client as never);
    const p = api.search(emptyFilters('2026-10-08', '2026-10-31'));
    jest.advanceTimersByTime(45_000);
    await expect(p).resolves.toEqual([]);
    expect(SEARCH_TIMEOUT_MS).toBe(90_000);
    expect(client.raw).toHaveBeenCalledWith('GET', '/api/portal/taskSwap/selectOtherCrewPublishTask', expect.objectContaining({ timeoutMs: 90_000 }));
    jest.useRealTimers();
  });
});

describe("R'Bot's result line", () => {
  it('names six crews and counts the rest (a US search finds 55)', () => {
    const { describeResult } = require('../../src/features/dutySwap/swapRbot');
    const crews = toCrews(cabinSearch(55));
    const line: string = describeResult({ crews, filters: emptyFilters('2026-10-08', '2026-10-31') });
    expect(line).toBe('55 crew on 08 Oct–31 Oct: 500000, 500001, 500002, 500003, 500004, 500005 and 49 more. They\'re in the table now.');
  });
});
