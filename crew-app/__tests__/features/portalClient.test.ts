// Native ROIS portal client: login (RSA + /login), envelope unwrap, one re-login
// on a dead token, query encoding, and the per-airline API base.
import {
  clearPortalTokens, createPortalClient, isAuthFailure, portalSiteFor, toQuery, PortalError,
} from '../../src/features/portal/portalClient';
import { createDutySwapApi } from '../../src/features/dutySwap/dutySwapApi';
import { emptyFilters } from '../../src/features/dutySwap/dutySwapModel';

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
