// Native ROIS portal client: login (RSA + /login), envelope unwrap, one re-login
// on a dead token, query encoding, and the per-airline API base.
import {
  clearPortalTokens, createPortalClient, isAuthFailure, portalSiteFor, toQuery, PortalError,
} from '../../src/features/portal/portalClient';
import { createDutySwapApi } from '../../src/features/dutySwap/dutySwapApi';
import { emptyFilters, toCrews } from '../../src/features/dutySwap/dutySwapModel';

const creds = { airline: 'PR', crewId: '392923', password: 'pw' };
const json = (body: unknown, status = 200) => Promise.resolve({ status, json: () => Promise.resolve(body) } as Response);

function fakePortal(handlers: Record<string, (init?: RequestInit, url?: string) => unknown>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = jest.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const path = url.replace('https://crew-pal-sea-tst.roiscloud.com/pefg/apiPortal', '').split('?')[0];
    const h = handlers[path];
    if (!h) throw new Error(`unexpected ${path}`);
    const out = h(init, url) as { status?: number; body: unknown };
    return json(out.body, out.status);
  });
  return { calls, fetchImpl };
}

beforeEach(() => clearPortalTokens());

it('derives the PR API base and test email-code from the airline config', () => {
  expect(portalSiteFor('PR')).toEqual({ apiBase: 'https://crew-pal-sea-tst.roiscloud.com/pefg/apiPortal', outCaptcha: '202604' });
  expect(portalSiteFor('EK')).toBeNull();
});

it('logs in once (RSA password + outCaptcha) and sends Bearer token + userId', async () => {
  let logins = 0;
  const { calls, fetchImpl } = fakePortal({
    '/system/getPublicKey': () => ({ body: { code: 0, data: 'PUBKEY' } }),
    '/login': () => { logins++; return { body: { code: 0, data: { token: 'T1', refreshToken: 'R' } } }; },
    '/api/portal/taskSwap/getDisclaimerFlag': () => ({ body: { code: 0, data: false } }),
  });
  const encrypt = jest.fn((k: string, p: string) => `enc(${k},${p})`);
  const client = createPortalClient(creds, { fetchImpl, encrypt });
  await expect(client.get('/api/portal/taskSwap/getDisclaimerFlag')).resolves.toBe(false);
  await client.get('/api/portal/taskSwap/getDisclaimerFlag');
  expect(logins).toBe(1);
  const login = calls.find(c => c.url.endsWith('/login'))!;
  expect(JSON.parse(login.init!.body as string)).toEqual({ user: { passwords: 'enc(PUBKEY,pw)', userCode: '392923', captcha: '', uniqueCode: '', outCaptcha: '202604' } });
  const api = calls.filter(c => c.url.includes('getDisclaimerFlag'));
  expect(api[0].init!.headers).toMatchObject({ Authorization: 'Bearer T1', userId: '392923' });
});

it('accepts direct string tokens without using their length as an auth signal', async () => {
  const { fetchImpl } = fakePortal({
    '/system/getPublicKey': () => ({ body: { code: 0, data: 'K' } }),
    '/login': () => ({ body: { code: 0, data: 'short-token' } }),
    '/api/x': (init) => ({
      body: (init!.headers as Record<string, string>).Authorization === 'Bearer short-token'
        ? { code: 0, data: 'ok' }
        : { code: 1, message: 'Unauthorized', data: null },
    }),
  });
  const client = createPortalClient(creds, { fetchImpl, encrypt: () => 'e' });
  await expect(client.get('/api/x')).resolves.toBe('ok');
});

it('does not echo an unknown login string into a PortalError', async () => {
  const { fetchImpl } = fakePortal({
    '/system/getPublicKey': () => ({ body: { code: 0, data: 'K' } }),
    '/login': () => ({ body: { code: 1, data: 'opaque-sensitive-value' } }),
  });
  const client = createPortalClient(creds, { fetchImpl, encrypt: () => 'e' });
  await expect(client.get('/api/x')).rejects.toMatchObject({
    message: 'Portal sign-in failed.',
    failureCode: null,
  });
});

it('re-logs in once when the portal rejects the token (real JWT error text)', async () => {
  let n = 0;
  const { fetchImpl } = fakePortal({
    '/system/getPublicKey': () => ({ body: { code: 0, data: 'K' } }),
    '/login': () => ({ body: { code: 0, data: { token: `T${++n}` } } }),
    '/api/x': (init) => ((init!.headers as Record<string, string>).Authorization === 'Bearer T1'
      ? { body: { code: 1, message: 'Invalid serialized unsecured/JWS/JWE object: Missing part delimiters', data: null } }
      : { body: { code: 0, data: 'ok' } }),
  });
  const client = createPortalClient(creds, { fetchImpl, encrypt: () => 'e' });
  await expect(client.get('/api/x')).resolves.toBe('ok');
  expect(n).toBe(2);
});

it('surfaces a business error (code 1) as PortalError and a failed login', async () => {
  const { fetchImpl } = fakePortal({
    '/system/getPublicKey': () => ({ body: { code: 0, data: 'K' } }),
    '/login': () => ({ body: { code: 0, data: { token: 'T' } } }),
    '/api/portal/taskSwap/selectOtherCrewPublishTask': () => ({ body: { code: 1, message: 'No friends were found.', data: null } }),
  });
  const client = createPortalClient(creds, { fetchImpl, encrypt: () => 'e' });
  await expect(client.get('/api/portal/taskSwap/selectOtherCrewPublishTask')).rejects.toEqual(expect.objectContaining({ message: 'No friends were found.', code: 1 }));

  clearPortalTokens();
  const bad = fakePortal({
    '/system/getPublicKey': () => ({ body: { code: 0, data: 'K' } }),
    '/login': () => ({ body: { code: 1, message: 'Wrong password', data: null } }),
  });
  await expect(createPortalClient(creds, { fetchImpl: bad.fetchImpl, encrypt: () => 'e' }).get('/api/y')).rejects.toBeInstanceOf(PortalError);
});

it('encodes queries: arrays repeat, empties dropped', () => {
  expect(toQuery({ a: 'x y', b: '', c: undefined, d: ['1', '2'], e: false })).toBe('?a=x%20y&d=1&d=2&e=false');
  expect(isAuthFailure(200, 'No friends were found.')).toBe(false);
  expect(isAuthFailure(401, null)).toBe(true);
});

describe('dutySwapApi', () => {
  it('prefers the TG web portal window and treats its missing disclaimer as none', async () => {
    const client = {
      get: jest.fn(async (path: string) => {
        if (path.endsWith('getMyLatestTaskDate')) return { startDate: '2026-10-22', endDate: '2026-11-30' };
        throw new PortalError('Portal error (HTTP 404).', -1, 404);
      }),
    } as unknown as Parameters<typeof createDutySwapApi>[1];
    const api = createDutySwapApi({ airline: 'TG', crewId: '35459', password: 'pw' }, client);

    await expect(api.defaultWindow()).resolves.toEqual({ startDate: '2026-10-22', endDate: '2026-11-30', swapMode: 'FS' });
    await expect(api.disclaimer()).resolves.toBeNull();
  });

  it('falls back to the legacy window and keeps TG My duties usable without auto-unlock', async () => {
    const client = {
      get: jest.fn(async (path: string, query?: unknown) => {
        if (path.endsWith('getMyLatestTaskDate') || path.endsWith('findUnlockedDutyPref')) {
          throw new PortalError('Portal error (HTTP 404).', -1, 404);
        }
        if (path.endsWith('getTaskDefaultStartDate')) return '2026-10-22';
        if (path.endsWith('selectMyTaskList')) {
          expect(query).toEqual({ startDate: '2026-10-22', endDate: '2026-11-30' });
          return [{ pairingId: 375245156, publishStatus: 'Hide' }];
        }
        return null;
      }),
    } as unknown as Parameters<typeof createDutySwapApi>[1];
    const api = createDutySwapApi({ airline: 'TG', crewId: '35459', password: 'pw' }, client);

    await expect(api.defaultWindow()).resolves.toEqual({ startDate: '2026-10-22', endDate: '2026-10-22', swapMode: 'FS' });
    await expect(api.myTasks({ startDate: '2026-10-22', endDate: '2026-11-30' })).resolves.toMatchObject({
      tasks: [{ pairingId: 375245156, publishStatus: 'Hide' }], autoUnlock: false, supportsAutoUnlock: false,
    });
  });

  it('uses TG Handshake candidates without requiring My Duty publication', async () => {
    const get = jest.fn(async (path: string) => path.endsWith('selectMyTaskList') ? [{
      pairingId: 375245156, rosterGroundPublishId: null, assignment: 'FLY', publishStatus: 'Hide',
      startDateTimeLocal: '29-Oct-2026 16:35', endDateTimeLocal: '31-Oct-2026 20:10',
      startDateTime: '29-Oct-2026 16:35', endDateTime: '31-Oct-2026 20:10',
      segmentDetailVoList: [{ fltDt: '29-Oct-2026', fltNo: '465', dep: 'BKK', arr: 'MEL' }],
    }] : null);
    const client = {
      raw: jest.fn(async () => ({ code: 0, message: null, data: [{
        crewId: '25324', crewName: 'Candidate', cellVoList: [{
          taskDate: '2026-10-29', taskDateTime: '2026-10-29T18:20',
          taskType: 'PAIRING', assignment: 'FLY', taskDetail: 'TG936', pairingId: 800,
          rosterGroundPublishId: null, status: null, hasSwap: null, publishStatus: null,
        }, {
          taskDate: '2026-10-31', taskDateTime: '2026-10-31T00:00',
          taskType: 'PAIRING', assignment: 'FLY', taskDetail: null, pairingId: 800,
          rosterGroundPublishId: null, status: null, hasSwap: null, publishStatus: null,
        }],
      }] })),
      get,
    } as unknown as Parameters<typeof createDutySwapApi>[1];
    const api = createDutySwapApi({ airline: 'TG', crewId: '35459', password: 'pw' }, client);

    const rows = await api.search(emptyFilters('2026-10-22', '2026-11-30', 'FS'));
    expect(rows.map(row => row.crewId)).toEqual(['35459', '25324']);
    expect(get).toHaveBeenCalledWith('/api/portal/taskSwap/selectMyTaskList', {
      startDate: '2026-10-22', endDate: '2026-11-30',
    });
    const crews = toCrews(rows);
    expect(crews[0].duties[0]).toMatchObject({ code: 'TG465', swappable: true });
    expect(crews[1].duties[0]).toMatchObject({
      code: 'TG936', swappable: true,
      startDt: '2026-10-29T18:20', endDt: '2026-10-31T23:59:59',
    });
  });

  it('search sends the web params; submit returns the legality message instead of throwing', async () => {
    const { calls, fetchImpl } = fakePortal({
      '/system/getPublicKey': () => ({ body: { code: 0, data: 'K' } }),
      '/login': () => ({ body: { code: 0, data: { token: 'T' } } }),
      '/api/portal/taskSwap/selectOtherCrewPublishTask': () => ({ body: { code: 0, data: [] } }),
      '/api/portal/taskSwap/submitTaskSwap': () => ({ body: { code: 1, message: '[RuleCheck]Others\r\n08-Oct-2026~12-Oct-2026,Rule ID:8004036,Basic Competency', data: null } }),
      '/api/portal/taskSwap/withdrawnRequest': () => ({ body: { code: 0, data: true } }),
    });
    const api = createDutySwapApi(creds, createPortalClient(creds, { fetchImpl, encrypt: () => 'e' }));
    await api.search({ ...emptyFilters('2026-10-07', '2026-11-02'), fltFleetList: ['350'] });
    expect(calls.find(c => c.url.includes('selectOther'))!.url)
      .toBe('https://crew-pal-sea-tst.roiscloud.com/pefg/apiPortal/api/portal/taskSwap/selectOtherCrewPublishTask?swapMode=NS&startDate=2026-10-07&endDate=2026-11-02&filterEmptyDutyCrew=false&fltFleetList=350');
    const r = await api.submit({ mineCrewId: '392923', minePairingIdList: [625688], mineRosterGroundPublishIdList: [], othersCrewId: '447841',
      othersPairingIdList: [625779], othersRosterGroundPublishIdList: [], swapMode: 'NS', comments: '' });
    expect(r).toEqual({ ok: false, message: expect.stringContaining('Basic Competency') });
    await api.withdraw(2167248303953152);
    const w = calls.find(c => c.url.includes('withdrawnRequest'))!;
    expect([w.init!.method, w.url.split('?')[1]]).toEqual(['PUT', 'recordId=2167248303953152']);
  });
});

it('rsaEncrypt (bundled jsencrypt) encrypts with the PR portal public key', () => {
  // Public key served by PR TEST /system/getPublicKey (public by definition).
  const { rsaEncrypt } = require('../../src/features/portal/rsa');
  const pk = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDhqm+PZbPLnH169PLE8jBagre3EIgu4aEJmj3kHf+VivBQcqVnVeDG7mmOGIN2Fk0gbXVAhV27PdPS8shkoq9XhdiL/3m4lxBkRr5/P7UEfI88zXrcRzmCLG/U39vUtJ7pYlDGFdv+ZYmAP7Rf1TVv9uQC1i5AXgxew2cyU0ZOgQIDAQAB';
  const a = rsaEncrypt(pk, 'secret');
  expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
  expect(Buffer.from(a, 'base64')).toHaveLength(128); // 1024-bit modulus
  expect(rsaEncrypt(pk, 'secret')).not.toBe(a);      // random PKCS#1 v1.5 padding
});

it('explains a wrong password (real portal reply: code 0, loginSuccess false)', async () => {
  const { fetchImpl } = fakePortal({
    '/system/getPublicKey': () => ({ body: { code: 0, data: 'K' } }),
    '/login': () => ({ body: { code: 0, message: null, data: { token: null, loginSuccess: false, failMessage: 'ERROR_WRONG_PASSWORD' } } }),
  });
  await expect(createPortalClient(creds, { fetchImpl, encrypt: () => 'e' }).get('/api/z')).rejects.toThrow('The crew portal did not accept your password.');
});

it('token() returns the session token for the roster capture WebView (one login, cached after)', async () => {
  let logins = 0;
  const { fetchImpl } = fakePortal({
    '/system/getPublicKey': () => ({ body: { code: 0, data: 'PUBKEY' } }),
    '/login': () => { logins++; return { body: { code: 0, data: { token: 'T9' } } }; },
  });
  const client = createPortalClient({ ...creds, crewId: '392923-token' }, { fetchImpl, encrypt: () => 'enc' });
  await expect(client.token()).resolves.toBe('T9');
  await expect(client.token()).resolves.toBe('T9');
  expect(logins).toBe(1);
});
