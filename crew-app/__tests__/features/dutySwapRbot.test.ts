// R'Bot in Duty Swap: whitelist parsing, the screen snapshot it "sees", local
// understanding of the common requests, and applying actions to the matrix.
import { parseRbotAction } from '../../src/features/rbot/crewChatApi';
import {
  applySwapActions, buildSwapSnapshot, dateIn, describeResult, interpretSwapLocally, parseSwapAction,
} from '../../src/features/dutySwap/swapRbot';
import { emptyFilters, toCrews, type ApiCompare, type ApiCrewRow, type SwapFilters } from '../../src/features/dutySwap/dutySwapModel';

const search: { data: ApiCrewRow[] } = require('../fixtures/dutySwap/search.json');
const cmp: { data: ApiCompare } = require('../fixtures/dutySwap/compare-421051.json');
const crews = toCrews(search.data);
const filters = emptyFilters('2026-10-07', '2026-11-02');
const screen = { filters, crews, details: { '421051': cmp.data } };

describe('parsing (dropped unless valid)', () => {
  it('accepts the three swap actions through the main R\'Bot parser', () => {
    expect(parseRbotAction({ type: 'set_swap_search', fields: { startDate: '2026-10-08', endDate: '2026-10-11', taskTypeList: ['sby'], crdStart: 20 } }))
      .toEqual({ type: 'set_swap_search', fields: { startDate: '2026-10-08', endDate: '2026-10-11', taskTypeList: ['SBY'], crdStart: '20' } });
    expect(parseRbotAction({ type: 'set_swap_crews', add: ['450673'], remove: ['bad id!'] })).toEqual({ type: 'set_swap_crews', add: ['450673'] });
    expect(parseRbotAction({ type: 'select_swap_duties', take: [{ crewId: '421051', code: '1hb' }, { code: 'x' }] }))
      .toEqual({ type: 'select_swap_duties', take: [{ crewId: '421051', code: '1HB' }] });
  });
  it('drops malformed actions', () => {
    expect(parseSwapAction({ type: 'set_swap_search', fields: { startDate: '2026-10-12', endDate: '2026-10-08' } })).toBeNull();
    expect(parseSwapAction({ type: 'set_swap_crews' })).toBeNull();
    expect(parseSwapAction({ type: 'select_swap_duties', give: [] })).toBeNull();
  });
});

describe('what R\'Bot sees', () => {
  it('snapshot carries my duties (with route/layover once known), the crews, filters and the selection', () => {
    const snap = buildSwapSnapshot({ ...screen, filters: { ...filters, fltFleetList: ['350'] }, give: [crews[0].duties[1].key], take: [], crewB: null })!;
    expect(snap.window).toEqual({ start: '2026-10-07', end: '2026-11-02' });
    expect(snap.filters).toEqual({ fltFleetList: ['350'] });
    expect(snap.me.duties.find(d => d.code === 'PR124/PR125')).toMatchObject({ start: '2026-10-08T20:50', route: 'MNL–SEA–MNL', layover: 'SEA 25:35', swappable: true });
    expect(snap.crews.map(c => c.crewId)).toEqual(['402452', '421051', '423003', '435623', '447841', '450673']);
    expect(snap.selected.give).toEqual(['PR124/PR125']);
    expect(JSON.stringify(snap).length).toBeLessThan(12000);
  });
});

describe('local understanding (the mockup conversation)', () => {
  it('reads dates in the window year', () => {
    expect(dateIn('swap my trip on 08 Oct', '2026-10-07')).toBe('2026-10-08');
    expect(dateIn('my duty Oct 20 please', '2026-10-07')).toBe('2026-10-20');
    expect(dateIn('swap my trip on the 25th', '2026-10-07')).toBe('2026-10-25');
  });

  it('"Swap my trip on 08 Oct for a standby, same fleet" → search 08–11 Oct, standby crews only, give PR124/PR125', () => {
    const plan = interpretSwapLocally('Swap my trip on 08 Oct for a standby. Same fleet please.', screen)!;
    expect(plan.actions).toEqual([
      // Not taskTypeList: the portal's Type filter also filters MY duties ("Please publish task.").
      { type: 'set_swap_search', fields: { startDate: '2026-10-08', endDate: '2026-10-11', fltFleetList: ['350'] }, reset: true, wantKind: 'standby', label: 'Searching for PR124/PR125' },
      { type: 'select_swap_duties', give: [{ date: '2026-10-08', code: 'PR124/PR125' }], label: 'Giving PR124/PR125' },
    ]);
  });

  it('crew list edits and picks', () => {
    expect(interpretSwapLocally('Also show someone with a DOH layover', screen)!.actions[0]).toEqual({ type: 'set_swap_crews', addWhere: { layoverPortList: ['DOH'] }, label: 'Added DOH layovers' });
    expect(interpretSwapLocally('remove 402452', screen)!.actions[0]).toMatchObject({ type: 'set_swap_crews', remove: ['402452'] });
    expect(interpretSwapLocally("Pick 421051's 1HB and 4FB", screen)!.actions[0]).toEqual({ type: 'select_swap_duties',
      take: [{ crewId: '421051', code: '1HB' }, { crewId: '421051', code: '4FB' }], label: 'Picked 1HB, 4FB' });
    expect(interpretSwapLocally('only A350', screen)!.actions[0]).toMatchObject({ fields: { fltFleetList: ['350'] } });
  });

  it('says so when I have no swappable duty that day, and leaves unclear text to the server', () => {
    expect(interpretSwapLocally('swap my duty on 15 Oct', screen)!.note).toMatch(/can't find a swappable duty/);
    expect(interpretSwapLocally('what is a good swap for me?', screen)).toBeNull();
  });
});

describe('applying actions', () => {
  const harness = () => {
    let state = { filters: filters as SwapFilters | null, crews };
    const searches: SwapFilters[] = [];
    const picked: { give?: string[]; take?: [string, string[]] } = {};
    return {
      searches, picked,
      deps: {
        getState: () => state,
        search: async (f: SwapFilters) => { searches.push(f); state = { ...state, filters: f }; },
        peek: async (f: SwapFilters) => (f.layoverPortList.includes('DOH') ? ['435623', '447841', '450673'] : []),
        setGive: (k: string[]) => { picked.give = k; },
        setTake: (c: string, k: string[]) => { picked.take = [c, k]; },
      },
    };
  };

  it('search + give from the first request', async () => {
    const h = harness();
    const chips = await applySwapActions(interpretSwapLocally('Swap my trip on 08 Oct for a standby', screen)!.actions, h.deps);
    expect(chips).toEqual(['Standby only', 'Searching for PR124/PR125', 'Giving PR124/PR125']);
    expect(h.searches[0]).toMatchObject({ startDate: '2026-10-08', endDate: '2026-10-11', taskTypeList: [] });
    // Then narrowed on the phone to crews with a swappable standby in 08–11 Oct.
    expect(h.searches[1].crewIdList).toEqual(['402452', '421051']);
    expect(h.picked.give).toEqual([crews[0].duties.find(d => d.code === 'PR124/PR125')!.key]);
  });

  it('"also a DOH layover" keeps the crews shown and adds the DOH ones as an explicit crew list', async () => {
    const h = harness();
    await applySwapActions([{ type: 'set_swap_crews', addWhere: { layoverPortList: ['DOH'] } }], h.deps);
    expect(h.searches[0].crewIdList).toEqual(['402452', '421051', '423003', '435623', '447841', '450673']);
    expect(h.searches[0].layoverPortList).toEqual([]);
  });

  it('picks crew B duties by code', async () => {
    const h = harness();
    await applySwapActions(interpretSwapLocally("Pick 421051's 1HB and 4FB", screen)!.actions, h.deps);
    const c = crews.find(x => x.crewId === '421051')!;
    expect(h.picked.take).toEqual(['421051', [c.duties.find(d => d.code === '1HB')!.key, c.duties.find(d => d.code === '4FB')!.key]]);
  });

  it('describes the result in one line', () => {
    expect(describeResult({ crews: crews.slice(0, 3), filters: { ...filters, startDate: '2026-10-08', endDate: '2026-10-11' } }))
      .toBe("2 crew on 08 Oct–11 Oct: 402452, 421051. They're in the table now.");
  });
});
