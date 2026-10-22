import { createDutySwapApi } from '../../src/features/dutySwap/dutySwapApi';
import { clearDutySwapApis, dutySwapApiFor, openDutySwap } from '../../src/features/dutySwap/dutySwapActions';

jest.mock('../../src/features/dutySwap/dutySwapApi', () => ({
  createDutySwapApi: jest.fn(credentials => ({ credentials })),
}));

const createApi = createDutySwapApi as jest.MockedFunction<typeof createDutySwapApi>;

describe('Duty Swap API credential cache', () => {
  beforeEach(() => {
    clearDutySwapApis();
    createApi.mockClear();
  });

  it('reuses the client while credentials are unchanged', () => {
    const auth = { airline: 'TG', crewId: 'cache-same', password: 'current' } as never;

    expect(dutySwapApiFor(auth)).toBe(dutySwapApiFor(auth));
    expect(createApi).toHaveBeenCalledTimes(1);
  });

  it('recreates the client when the same crew receives a new password', () => {
    const oldApi = dutySwapApiFor({ airline: 'TG', crewId: 'cache-change', password: 'old' } as never);
    const newApi = dutySwapApiFor({ airline: 'TG', crewId: 'cache-change', password: 'new' } as never);

    expect(newApi).not.toBe(oldApi);
    expect(createApi).toHaveBeenCalledTimes(2);
    expect(createApi).toHaveBeenLastCalledWith({
      airline: 'TG',
      crewId: 'cache-change',
      password: 'new',
    });
  });

  it('drops password-bearing client closures when the crew logs out', () => {
    const auth = { airline: 'PR', crewId: 'same-id', password: 'secret' } as never;
    const beforeLogout = dutySwapApiFor(auth);

    clearDutySwapApis();

    expect(dutySwapApiFor(auth)).not.toBe(beforeLogout);
    expect(createApi).toHaveBeenCalledTimes(2);
  });
});

describe('Duty Swap initial search', () => {
  it('uses the search mode supplied by the carrier portal', async () => {
    const api = {
      defaultWindow: jest.fn(async () => ({ startDate: '2026-10-22', endDate: '2026-11-30', swapMode: 'FS' })),
      search: jest.fn(async () => []),
    } as never;
    const dispatch = jest.fn();
    const getState = () => ({ dutySwap: { filters: null } }) as never;

    await openDutySwap(dispatch as never, getState, api);

    expect((api as { search: jest.Mock }).search).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2026-10-22', endDate: '2026-11-30', swapMode: 'FS' }),
    );
  });
});
