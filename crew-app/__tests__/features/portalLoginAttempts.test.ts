import { runInNewContext } from 'node:vm';
import { buildInjectedJS } from '../../src/features/travel/portalInjectedJs';
import { clearPortalTokens, createPortalClient, PortalError } from '../../src/features/portal/portalClient';

type FakeInput = {
  value: string;
  type: string;
  form: object;
  dispatchEvent: jest.Mock;
  focus: jest.Mock;
};

function runInjected(nativeAuth: boolean, host: string) {
  const inputEvents: string[] = [];
  const inputDispatch = jest.fn((event: Event) => {
    inputEvents.push(event.type);
    return true;
  });
  const form = { addEventListener: jest.fn() };
  const inputPrototype = {};
  Object.defineProperty(inputPrototype, 'value', {
    configurable: true,
    get(this: { _value?: string }) { return this._value ?? ''; },
    set(this: { _value?: string }, value: string) { this._value = value; },
  });
  const user = Object.assign(Object.create(inputPrototype), { type: 'text', form, dispatchEvent: inputDispatch, focus: jest.fn() }) as FakeInput;
  const password = Object.assign(Object.create(inputPrototype), { type: 'password', form, dispatchEvent: inputDispatch, focus: jest.fn() }) as FakeInput;
  const button = { children: [], closest: () => null, textContent: 'Sign In', value: '', disabled: false, click: jest.fn(), addEventListener: jest.fn() };
  const querySelector = jest.fn((selector: string) => {
    if (selector === '#form_item_passwords' || selector === 'input[type=password]') return password;
    if (selector === '#form_item_userCode') return user;
    if (selector.includes('button')) return button;
    return null;
  });
  const querySelectorAll = jest.fn((selector: string) => {
    if (selector === 'input') return [user, password];
    if (selector.includes('button')) return [button];
    return [];
  });
  const posted: Array<Record<string, unknown>> = [];
  const intervalCallbacks: Array<() => void> = [];
  const timeoutCallbacks: Array<() => void> = [];
  const fetch = jest.fn(() => Promise.resolve({ json: async () => ({ code: 1 }), text: async () => '' }));
  const location = { host, hostname: host, pathname: '/crew/portal/login', origin: `https://${host}`, href: `https://${host}/crew/portal/login` };
  const document = {
    querySelector,
    querySelectorAll,
    createElement: jest.fn(() => ({ set src(_v: string) {}, set onload(_v: unknown) {}, set onerror(_v: unknown) {} })),
    head: { appendChild: jest.fn() },
    documentElement: { appendChild: jest.fn() },
    title: 'Portal',
    cookie: '',
  };
  const window: Record<string, unknown> = {
    fetch,
    __royce: undefined,
    ReactNativeWebView: { postMessage: (value: string) => posted.push(JSON.parse(value)) },
    localStorage: { length: 0 },
    sessionStorage: { length: 0 },
  };
  const sandbox = {
    window,
    document,
    location,
    fetch,
    Date,
    URL,
    URLSearchParams,
    Event: class { type: string; constructor(type: string) { this.type = type; } },
    KeyboardEvent: class { constructor(_type: string, _init: unknown) {} },
    setInterval: (fn: () => void) => { intervalCallbacks.push(fn); return 1; },
    clearInterval: jest.fn(),
    setTimeout: (fn: () => void) => { timeoutCallbacks.push(fn); return timeoutCallbacks.length; },
    Object,
    String,
    JSON,
    Math,
  };
  // The injected script reads the native HTMLInputElement.value setter.
  class FakeHTMLInputElement {}
  Object.defineProperty(FakeHTMLInputElement.prototype, 'value', Object.getOwnPropertyDescriptor(inputPrototype, 'value')!);
  Object.setPrototypeOf(user, FakeHTMLInputElement.prototype);
  Object.setPrototypeOf(password, FakeHTMLInputElement.prototype);
  window.HTMLInputElement = FakeHTMLInputElement;
  Object.defineProperty(sandbox, 'window', { value: window, configurable: true });
  runInNewContext(buildInjectedJS('CREW-TEST', 'PASSWORD-TEST', false, { nativeAuth }), sandbox);
  return {
    window, location, querySelector, user, password, button, fetch, inputEvents, posted, intervalCallbacks, timeoutCallbacks,
  };
}

function poll(ctx: ReturnType<typeof runInjected>, ticks: number) {
  for (let i = 0; i < ticks; i += 1) {
    ctx.intervalCallbacks.forEach(fn => fn());
    while (ctx.timeoutCallbacks.length) ctx.timeoutCallbacks.shift()!();
  }
}

describe('injected portal login attempts', () => {
  it('keeps native-auth capture on its document and fetches each month only once', () => {
    const ctx = runInjected(true, 'crew.roiscloud.com');
    // Account/SSO choices have no password input but do not mean SPA authentication.
    ctx.querySelector.mockReturnValue(null);
    const originalUrl = ctx.location.href;
    (ctx.window.__royceSetToken as (token: string) => void)('native-test-token');
    poll(ctx, 10);
    expect(ctx.location.href).toBe(originalUrl);
    expect(ctx.fetch).toHaveBeenCalledTimes(9);
    expect(ctx.button.click).not.toHaveBeenCalled();
  });

  it('leaves form and direct authentication to native auth across polling ticks', () => {
    const ctx = runInjected(true, 'crew.roiscloud.com');
    poll(ctx, 10);

    expect(ctx.user.value).toBe('');
    expect(ctx.password.value).toBe('');
    expect(ctx.button.click).not.toHaveBeenCalled();
    expect(ctx.fetch).not.toHaveBeenCalled();
    expect(ctx.posted.filter(m => m.type === 'login')).toHaveLength(0);
  });

  it('fills and submits the fallback form once across repeated polling ticks', () => {
    const ctx = runInjected(false, 'portal.example.test');
    poll(ctx, 10);

    expect(ctx.user.value).toBe('CREW-TEST');
    expect(ctx.password.value).toBe('PASSWORD-TEST');
    expect(ctx.button.click).toHaveBeenCalledTimes(1);
    expect(ctx.inputEvents).toContain('input');
    expect(ctx.posted.filter(m => m.type === 'login' && m.state === 'filled')).toHaveLength(1);
  });
});

describe('native portal login failure and timeout', () => {
  beforeEach(() => clearPortalTokens());

  it('preserves ERROR_WRONG_PASSWORD from HTTP 200 code 0 and sends one login request', async () => {
    const calls: string[] = [];
    const fetchImpl = jest.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/system/getPublicKey')) return { status: 200, json: async () => ({ code: 0, data: 'KEY' }) } as Response;
      if (url.endsWith('/login')) return {
        status: 200,
        json: async () => ({ code: 0, message: null, data: { token: null, loginSuccess: false, failMessage: 'ERROR_WRONG_PASSWORD' } }),
      } as Response;
      throw new Error('Unexpected test request');
    });
    const client = createPortalClient(
      { airline: 'PR', crewId: 'crew-test', password: 'password-test' },
      { site: { apiBase: 'https://portal.example.test/apiPortal' }, fetchImpl, encrypt: () => 'encrypted-test' },
    );

    const error = await client.token().catch(e => e);
    expect(error).toBeInstanceOf(PortalError);
    expect(error).toMatchObject({ failureCode: 'ERROR_WRONG_PASSWORD', status: 200, code: 0 });
    expect(calls.filter(url => url.endsWith('/login'))).toHaveLength(1);
  });

  it('aborts a pending login after its 30-second deadline', async () => {
    jest.useFakeTimers();
    try {
      let loginSignal: AbortSignal | undefined;
      const fetchImpl = jest.fn((url: string, init?: RequestInit) => {
        if (url.endsWith('/system/getPublicKey')) {
          return Promise.resolve({ status: 200, json: async () => ({ code: 0, data: 'KEY' }) } as Response);
        }
        loginSignal = init?.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          loginSignal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      });
      const client = createPortalClient(
        { airline: 'PR', crewId: 'crew-timeout-test', password: 'password-test' },
        { site: { apiBase: 'https://portal.example.test/apiPortal' }, fetchImpl, encrypt: () => 'encrypted-test' },
      );
      const pending = client.token();
      const settled = pending.then(value => ({ value }), error => ({ error }));
      await jest.advanceTimersByTimeAsync(0);
      expect(loginSignal).toBeDefined();
      await jest.advanceTimersByTimeAsync(30_000);
      const result = await settled;
      expect(result).toMatchObject({ error: { message: 'Portal sign-in timed out.', status: 0 } });
      expect(loginSignal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
