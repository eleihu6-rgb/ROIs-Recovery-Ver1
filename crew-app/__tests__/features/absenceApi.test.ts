// Crew Recovery Story 101: crew-app sick-leave submission client.
// Mirrors the fetch-stub style of notificationsApi.test.ts.
import { submitAbsence } from '../../src/features/absence/absenceApi';

// Under Jest, airlineByCode('F8'/'ET').apiBaseUrl resolves deterministically to
// the simulator fallback (no NativeModules.SettingsManager override, __DEV__
// true) — see resolveF8RosterApiBaseUrl in features/auth/airlines.ts.
const API = 'http://127.0.0.1:3000/api';

const params = {
  airline: 'f8',
  crewId: '113',
  password: 'Pier2026',
  type: 'sick' as const,
  fromDate: '2026-09-14',
  toDate: '2026-09-15',
};

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const successResult = {
  absenceId: 12,
  assignment: 'ILL',
  fromDate: '2026-09-14',
  toDate: '2026-09-15',
  removedPairingIds: [],
  retainedPairingIds: [151614],
  groundDays: 2,
  notificationId: 'absence-12',
};

describe('absence API client', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs normalized credentials + body to the F8 absence endpoint and unwraps the envelope', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      okJson({ code: 200, data: successResult, message: 'ok' }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const out = await submitAbsence({ ...params, note: '  flu  ' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3000/api/crew-app/v1/absence');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      airline: 'F8',
      crewId: '113',
      password: 'Pier2026',
      type: 'sick',
      fromDate: '2026-09-14',
      toDate: '2026-09-15',
      note: 'flu',
    });
    expect(out).toEqual(successResult);
  });

  it('omits note from the body when blank/absent', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      okJson({ code: 200, data: successResult, message: 'ok' }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await submitAbsence({ ...params, note: '   ' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.note).toBeUndefined();
  });

  it('works for ET the same as F8 (both mobile-roster airlines)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      okJson({ code: 200, data: successResult, message: 'ok' }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await submitAbsence({ ...params, airline: 'et' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.airline).toBe('ET');
  });

  it('rejects an airline the crew app does not support yet (no fetch made)', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(submitAbsence({ ...params, airline: 'TG' })).rejects.toThrow(
      /does not support absence requests yet/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a real HTTP status error to the server message when present', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: 409, data: null, message: 'An active absence already covers part of this range.' }),
    }) as unknown as typeof fetch;

    await expect(submitAbsence(params)).rejects.toThrow(
      'An active absence already covers part of this range.',
    );
  });

  it('falls back to the spec wording for 409 when the body cannot be read', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => { throw new Error('no body'); },
    }) as unknown as typeof fetch;

    await expect(submitAbsence(params)).rejects.toThrow(
      'An absence already covers part of this range.',
    );
  });

  it('maps 401/403/400 to human messages', async () => {
    for (const [status, msg] of [
      [401, 'Invalid crew credentials'],
      [403, 'Not authorised for this request'],
      [400, 'Invalid absence request.'],
    ] as const) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => { throw new Error('no body'); },
      }) as unknown as typeof fetch;
      await expect(submitAbsence(params)).rejects.toThrow(msg);
    }
  });

  it('surfaces a zod-validation failure (HTTP 200, envelope code 400)', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      okJson({ code: 400, data: null, message: 'fromDate: Invalid' }),
    ) as unknown as typeof fetch;

    await expect(submitAbsence(params)).rejects.toThrow('fromDate: Invalid');
  });

  it('rejects a malformed success payload', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      okJson({ code: 200, data: { nope: true }, message: 'ok' }),
    ) as unknown as typeof fetch;

    await expect(submitAbsence(params)).rejects.toThrow('Invalid absence response');
  });
});
