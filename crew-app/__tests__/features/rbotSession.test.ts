// The R'Bot session: one conversation that survives R'Bot's own navigation, is
// capped and aged out, and is wiped on logout.
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

import rbotReducer, {
  MAX_STORED_ENTRIES,
  appendEntry,
  clearRbotSession,
  loadRbotThread,
  markSeen,
  saveRbotThread,
} from '../../src/features/rbot/rbotSlice';
import type { AppDispatch } from '../../src/store';

const THREAD_KEY = '@royce_rbot_thread';

function makeStore() {
  return configureStore({
    reducer: {rbot: rbotReducer},
    middleware: getDefaultMiddleware => getDefaultMiddleware({serializableCheck: false}),
  });
}

/** The store here carries one slice, so its dispatch is the plain Redux one —
 *  widen it to the app's thunk-aware type to dispatch the session thunks. */
function thunkDispatch(store: ReturnType<typeof makeStore>): AppDispatch {
  return store.dispatch as unknown as AppDispatch;
}

describe("R'Bot session slice", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('keeps the whole conversation, in order', () => {
    const store = makeStore();
    store.dispatch(appendEntry({entry: {role: 'user', content: 'change my theme'}, seen: true}));
    store.dispatch(appendEntry({entry: {role: 'assistant', content: 'Done.', applied: ['Theme set to graphite']}, seen: true}));
    store.dispatch(appendEntry({entry: {role: 'user', content: 'now show my calendar'}, seen: true}));
    expect(store.getState().rbot.entries.map(e => e.content)).toEqual([
      'change my theme', 'Done.', 'now show my calendar',
    ]);
    expect(store.getState().rbot.entries[1].applied).toEqual(['Theme set to graphite']);
  });

  it('raises the dot only for a reply the crew did not see', () => {
    const store = makeStore();
    store.dispatch(appendEntry({entry: {role: 'assistant', content: 'Done.'}, seen: true}));
    expect(store.getState().rbot.unread).toBe(false);

    // A navigation action pops the chat before the reply lands.
    store.dispatch(appendEntry({entry: {role: 'assistant', content: 'Opened your route map.'}, seen: false}));
    expect(store.getState().rbot.unread).toBe(true);

    store.dispatch(markSeen());
    expect(store.getState().rbot.unread).toBe(false);
  });

  it('never grows past the cap', () => {
    const store = makeStore();
    for (let i = 0; i < MAX_STORED_ENTRIES + 12; i++) {
      store.dispatch(appendEntry({entry: {role: 'user', content: `m${i}`}, seen: true}));
    }
    const entries = store.getState().rbot.entries;
    expect(entries).toHaveLength(MAX_STORED_ENTRIES);
    expect(entries[entries.length - 1].content).toBe(`m${MAX_STORED_ENTRIES + 11}`);
  });

  it('round-trips the conversation through storage', async () => {
    const store = makeStore();
    store.dispatch(appendEntry({entry: {role: 'user', content: 'change my theme'}, seen: true}));
    store.dispatch(appendEntry({entry: {role: 'assistant', content: 'Done.'}, seen: true}));
    await thunkDispatch(store)(saveRbotThread());

    const restarted = makeStore();
    await thunkDispatch(restarted)(loadRbotThread());
    expect(restarted.getState().rbot.entries.map(e => e.content))
      .toEqual(['change my theme', 'Done.']);
  });

  it('drops a conversation that is older than the session window', async () => {
    await AsyncStorage.setItem(THREAD_KEY, JSON.stringify({
      savedAt: Date.now() - 13 * 60 * 60 * 1000,
      entries: [{role: 'user', content: 'yesterday'}],
    }));
    const store = makeStore();
    await thunkDispatch(store)(loadRbotThread());
    expect(store.getState().rbot.entries).toEqual([]);
  });

  it('survives a corrupt thread instead of throwing', async () => {
    await AsyncStorage.setItem(THREAD_KEY, '{not json');
    const store = makeStore();
    await thunkDispatch(store)(loadRbotThread());
    expect(store.getState().rbot.entries).toEqual([]);
  });

  it('wipes the conversation on logout', async () => {
    const store = makeStore();
    store.dispatch(appendEntry({entry: {role: 'user', content: 'book tomorrow off'}, seen: true}));
    await thunkDispatch(store)(saveRbotThread());
    expect(await AsyncStorage.getItem(THREAD_KEY)).toBeTruthy();

    await thunkDispatch(store)(clearRbotSession());
    expect(store.getState().rbot.entries).toEqual([]);
    expect(store.getState().rbot.unread).toBe(false);
    expect(await AsyncStorage.getItem(THREAD_KEY)).toBeNull();
  });

  it('removes the stored thread when the conversation is emptied', async () => {
    const store = makeStore();
    await thunkDispatch(store)(saveRbotThread());
    expect(await AsyncStorage.getItem(THREAD_KEY)).toBeNull();
  });
});
