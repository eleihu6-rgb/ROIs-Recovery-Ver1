// Marks the environment as a React act() environment for tests using createRoot/act.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Node 26 exposes `localStorage` as a configurable getter that returns undefined,
// shadowing the jsdom implementation. Polyfill with an in-memory store so tests that
// exercise code using bare `localStorage` work correctly in the jsdom environment.
if (typeof localStorage === 'undefined') {
  const store: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = String(v) },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
      get length() { return Object.keys(store).length },
      key: (i: number) => Object.keys(store)[i] ?? null,
    },
  })
}
