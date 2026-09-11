import {
  fetchDiscretion,
  fetchNotifications,
  markNotificationRead,
  submitDiscretionDecision,
} from '../../src/features/notifications/notificationsApi';

const API = 'http://127.0.0.1:8000/api';
const creds = {airline: 'ek', crewId: ' c900001 ', password: 'Pier2026'};

function okJson(body: unknown) {
  return {ok: true, status: 200, json: async () => body};
}

const feed = {
  cursor: 3,
  notifications: [
    {
      notifId: 'n1',
      crewId: 'C900001',
      type: 'flight_change',
      createdUtc: '2026-08-05T00:50Z',
      title: 'Flight updated',
      body: 'EK5 changed.',
      status: 'unread',
      seq: 1,
    },
  ],
  openDiscretions: [
    {
      discretionId: 'd1',
      crewId: 'C900001',
      captainCrewId: 'C900001',
      pairingId: 'PROJ-90000503',
      dutyId: 'PROJ-90000503:1',
      createdUtc: '2026-08-05T05:50Z',
      extensionRequestedMin: 45,
      state: 'pending',
      plannedFdpMin: 585,
      actualFdpMin: 885,
      limitMin: 840,
      audit: [{event: 'created', atUtc: '2026-08-05T05:50Z'}],
    },
  ],
};

describe('crew-notify API client', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs notifications with normalized credentials and parses the feed', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okJson(feed));
    global.fetch = fetchMock as unknown as typeof fetch;

    const out = await fetchNotifications(API, creds);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/api/crew-app/v1/notifications');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      airline: 'EK',
      crewId: 'C900001', // trimmed + upper-cased
      password: 'Pier2026',
    });
    expect(out.cursor).toBe(3);
    expect(out.notifications).toHaveLength(1);
    expect(out.openDiscretions[0].extensionRequestedMin).toBe(45);
  });

  it('includes since when provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okJson(feed));
    global.fetch = fetchMock as unknown as typeof fetch;
    await fetchNotifications(API, creds, 3);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).since).toBe(3);
  });

  it('POSTs a read receipt to the notif-specific path', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okJson({ok: true}));
    global.fetch = fetchMock as unknown as typeof fetch;
    await markNotificationRead(API, creds, 'n1');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8000/api/crew-app/v1/notifications/n1/read',
    );
  });

  it('fetches a single discretion', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okJson(feed.openDiscretions[0]));
    global.fetch = fetchMock as unknown as typeof fetch;
    const d = await fetchDiscretion(API, creds, 'd1');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8000/api/crew-app/v1/discretion/d1',
    );
    expect(d.state).toBe('pending');
  });

  it('submits a decision with decision + idempotencyKey in the body', async () => {
    const accepted = {...feed.openDiscretions[0], state: 'accepted', decidedBy: 'C900001'};
    const fetchMock = jest.fn().mockResolvedValue(okJson(accepted));
    global.fetch = fetchMock as unknown as typeof fetch;

    const d = await submitDiscretionDecision(API, creds, 'd1', 'accept', 'd1:accept', 'wx');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8000/api/crew-app/v1/discretion/d1/decision',
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      airline: 'EK',
      crewId: 'C900001',
      decision: 'accept',
      idempotencyKey: 'd1:accept',
      reason: 'wx',
    });
    expect(d.state).toBe('accepted');
  });

  it('maps 401 → invalid credentials, 403 → not authorised, 409 → already decided', async () => {
    for (const [status, msg] of [
      [401, 'Invalid crew credentials'],
      [403, 'Not authorised for this request'],
      [409, 'Request already decided'],
    ] as const) {
      global.fetch = jest.fn().mockResolvedValue({ok: false, status}) as unknown as typeof fetch;
      await expect(fetchNotifications(API, creds)).rejects.toThrow(msg);
    }
  });

  it('rejects a malformed feed', async () => {
    global.fetch = jest.fn().mockResolvedValue(okJson({nope: true})) as unknown as typeof fetch;
    // notifications/openDiscretions default to [] so this still parses; force a
    // bad discretion instead (missing required extensionRequestedMin).
    global.fetch = jest
      .fn()
      .mockResolvedValue(okJson({cursor: 0, notifications: [], openDiscretions: [{discretionId: 'x'}]})) as unknown as typeof fetch;
    await expect(fetchNotifications(API, creds)).rejects.toThrow('Invalid notifications response');
  });
});
