// R'Bot chat client: URL resolution, the defensive action parse (a hallucinated
// action must be a no-op, not a wrong screen), and the request bounds.
import {
  parseChatResponse,
  parseRbotAction,
  resolveRbotApiBaseUrl,
  rbotChatUrl,
  sendCrewChat,
  RBOT_HISTORY_LIMIT,
} from '../../src/features/rbot/crewChatApi';

function okJson(body: unknown, status = 200) {
  return {ok: status >= 200 && status < 300, status, json: async () => body};
}

describe("R'Bot api base url", () => {
  it('falls back to the local ai-server in development', () => {
    expect(resolveRbotApiBaseUrl(undefined, true)).toBe('http://127.0.0.1:3005');
    expect(resolveRbotApiBaseUrl('  ', true)).toBe('http://127.0.0.1:3005');
  });

  it('has no default outside development — a production URL must be configured', () => {
    expect(resolveRbotApiBaseUrl(undefined, false)).toBeNull();
  });

  it('accepts https anywhere and http only in development', () => {
    expect(resolveRbotApiBaseUrl('https://ai.example.com/', false)).toBe('https://ai.example.com');
    expect(resolveRbotApiBaseUrl('http://127.0.0.1:3005', true)).toBe('http://127.0.0.1:3005');
    expect(() => resolveRbotApiBaseUrl('http://ai.example.com', false)).toThrow(/HTTPS/);
    expect(() => resolveRbotApiBaseUrl('ftp://ai.example.com', true)).toThrow(/Invalid/);
  });

  it('posts to /ai/crew/chat and refuses to build a URL with no base', () => {
    expect(rbotChatUrl('https://ai.example.com')).toBe('https://ai.example.com/ai/crew/chat');
    expect(rbotChatUrl(null)).toBeNull();
  });
});

describe("R'Bot action parse", () => {
  it('keeps a known navigation target and drops an unknown one', () => {
    expect(parseRbotAction({type: 'navigate', target: 'route_map', label: 'Route map'})).toEqual({
      type: 'navigate', target: 'route_map', label: 'Route map',
    });
    expect(parseRbotAction({type: 'navigate', target: 'open_the_thing'})).toBeNull();
    expect(parseRbotAction({type: 'navigate'})).toBeNull();
  });

  it('keeps a valid month and discards a malformed one', () => {
    expect(parseRbotAction({type: 'navigate', target: 'roster_calendar', month: '2026-09'}))
      .toEqual({type: 'navigate', target: 'roster_calendar', month: '2026-09'});
    expect(parseRbotAction({type: 'navigate', target: 'roster_calendar', month: 'September'}))
      .toEqual({type: 'navigate', target: 'roster_calendar'});
  });

  it('accepts a well-formed absence range and rejects a broken/inverted one', () => {
    expect(parseRbotAction({
      type: 'request_absence', fromDate: '2026-09-14', toDate: '2026-09-15', note: 'flu',
    })).toEqual({
      type: 'request_absence', fromDate: '2026-09-14', toDate: '2026-09-15', note: 'flu',
    });
    expect(parseRbotAction({type: 'request_absence', fromDate: '14/09/2026', toDate: '2026-09-15'})).toBeNull();
    // An inverted range would be rejected server-side anyway — drop it here.
    expect(parseRbotAction({type: 'request_absence', fromDate: '2026-09-15', toDate: '2026-09-14'})).toBeNull();
  });

  it('accepts the four alarm actions and coerces numeric strings', () => {
    expect(parseRbotAction({type: 'set_alarm', action: 'enable'})).toEqual({type: 'set_alarm', action: 'enable'});
    expect(parseRbotAction({type: 'set_alarm', action: 'set_offsets', wakeUpHours: '4', leaveHomeHours: 2}))
      .toEqual({type: 'set_alarm', action: 'set_offsets', wakeUpHours: 4, leaveHomeHours: 2});
    expect(parseRbotAction({type: 'set_alarm', action: 'set_agenda_filter', filter: 'work'}))
      .toEqual({type: 'set_alarm', action: 'set_agenda_filter', filter: 'work'});
    expect(parseRbotAction({type: 'set_alarm', action: 'launch'})).toBeNull();
    // An out-of-vocabulary filter is dropped, not guessed.
    expect(parseRbotAction({type: 'set_alarm', action: 'set_agenda_filter', filter: 'weekends'}))
      .toEqual({type: 'set_alarm', action: 'set_agenda_filter'});
  });

  it('accepts the four setting keys and rejects an unknown one', () => {
    expect(parseRbotAction({type: 'change_setting', setting: 'theme', value: 'graphite'}))
      .toEqual({type: 'change_setting', setting: 'theme', value: 'graphite'});
    expect(parseRbotAction({type: 'change_setting', setting: 'explore_interests', value: ['food', 'beach']}))
      .toEqual({type: 'change_setting', setting: 'explore_interests', value: ['food', 'beach']});
    expect(parseRbotAction({type: 'change_setting', setting: 'password', value: 'x'})).toBeNull();
    expect(parseRbotAction({type: 'change_setting', setting: 'theme'})).toBeNull();
  });
});

describe("R'Bot response parse", () => {
  it('keeps the words, drops the unusable actions', () => {
    const parsed = parseChatResponse({
      role: 'assistant',
      content: 'Here you go.',
      actions: [
        {type: 'navigate', target: 'home'},
        {type: 'navigate', target: 'nonsense'},
      ],
    });
    expect(parsed.content).toBe('Here you go.');
    expect(parsed.actions).toEqual([{type: 'navigate', target: 'home'}]);
  });

  it('throws on a payload with neither words nor actions', () => {
    expect(() => parseChatResponse({role: 'assistant', content: '', actions: []})).toThrow(/Invalid/);
    expect(() => parseChatResponse(null)).toThrow(/Invalid/);
  });
});

describe("R'Bot send", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const context = {airline: 'TG', crewId: '35459', today: '2026-09-11'};

  it('POSTs the thread + context and returns the parsed reply', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okJson({
      role: 'assistant',
      content: 'Opening your route map.',
      actions: [{type: 'navigate', target: 'route_map'}],
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const reply = await sendCrewChat([{role: 'user', content: 'route map please'}], context);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3005/ai/crew/chat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      messages: [{role: 'user', content: 'route map please'}],
      context,
    });
    expect(reply.actions).toEqual([{type: 'navigate', target: 'route_map'}]);
  });

  it('sends only the recent turns and truncates a runaway message', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okJson({content: 'ok', actions: []}));
    global.fetch = fetchMock as unknown as typeof fetch;

    const long = 'x'.repeat(5000);
    const history = Array.from({length: RBOT_HISTORY_LIMIT + 5}, (_, i) => ({
      role: 'user' as const,
      content: `m${i}${i === RBOT_HISTORY_LIMIT + 4 ? long : ''}`,
    }));
    await sendCrewChat(history, context);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(RBOT_HISTORY_LIMIT);
    expect(body.messages[0].content).toBe(`m5`);
    expect(body.messages[RBOT_HISTORY_LIMIT - 1].content).toHaveLength(4000);
  });

  it('surfaces an unreachable service as a readable error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ok: false, status: 503, json: async () => null}) as unknown as typeof fetch;
    await expect(sendCrewChat([{role: 'user', content: 'hi'}], context)).rejects.toThrow(/unavailable \(503\)/);
  });
});
