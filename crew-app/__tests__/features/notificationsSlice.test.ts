import {configureStore} from '@reduxjs/toolkit';

import notificationsReducer, {
  decideDiscretion,
  loadNotifications,
} from '../../src/features/notifications/notificationsSlice';
import * as api from '../../src/features/notifications/notificationsApi';
import {airlineByCode} from '../../src/features/auth/airlines';
import {loadEkRosterSavedSession} from '../../src/features/auth/ekRosterSnapshot';

jest.mock('../../src/features/notifications/notificationsApi');
jest.mock('../../src/features/auth/airlines');
jest.mock('../../src/features/auth/ekRosterSnapshot');

const mockedApi = api as jest.Mocked<typeof api>;
const mockedAirline = airlineByCode as jest.MockedFunction<typeof airlineByCode>;
const mockedSaved = loadEkRosterSavedSession as jest.MockedFunction<typeof loadEkRosterSavedSession>;

const pending: api.DiscretionRequest = {
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
  audit: [],
} as unknown as api.DiscretionRequest;

const feed: api.NotificationsFeed = {
  cursor: 2,
  notifications: [
    {notifId: 'n1', crewId: 'C900001', type: 'flight_change', createdUtc: 't', title: 'x', body: 'y', status: 'unread', seq: 1},
  ],
  openDiscretions: [pending],
} as unknown as api.NotificationsFeed;

function freshStore() {
  return configureStore({reducer: {notifications: notificationsReducer}});
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedAirline.mockImplementation(code => ({
    code,
    name: code === 'F8' ? 'Flair Airlines' : 'Emirates',
    apiBaseUrl: code === 'F8'
      ? 'https://cr.rois.one/api'
      : 'http://127.0.0.1:8000/api',
    portalKind: 'rois-api',
  } as ReturnType<typeof airlineByCode>));
  mockedSaved.mockResolvedValue({
    airline: 'EK',
    crewId: 'C900001',
    password: 'Pier2026',
    keepLogin: true,
  });
});

describe('notificationsSlice orchestrators', () => {
  it('loadNotifications resolves saved creds and stores the feed', async () => {
    mockedApi.fetchNotifications.mockResolvedValue(feed);
    const store = freshStore();

    await loadNotifications(store.dispatch);

    expect(mockedApi.fetchNotifications).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api',
      {airline: 'EK', crewId: 'C900001', password: 'Pier2026'},
      undefined,
      undefined,
    );
    const s = store.getState().notifications;
    expect(s.status).toBe('ready');
    expect(s.notifications).toHaveLength(1);
    expect(s.openDiscretions[0].discretionId).toBe('d1');
  expect(s.cursor).toBe(2);
});

it('loadNotifications uses the saved F8 airline API base', async () => {
  mockedSaved.mockResolvedValue({
    airline: 'F8',
    crewId: '113',
    password: 'test-password',
    keepLogin: true,
  });
  mockedApi.fetchNotifications.mockResolvedValue(feed);
  const store = freshStore();

  await loadNotifications(store.dispatch);

  expect(mockedAirline).toHaveBeenCalledWith('F8');
  expect(mockedApi.fetchNotifications).toHaveBeenCalledWith(
    'https://cr.rois.one/api',
    {airline: 'F8', crewId: '113', password: 'test-password'},
    undefined,
    undefined,
  );
});

  it('surfaces an error and does not throw', async () => {
    mockedApi.fetchNotifications.mockRejectedValue(new Error('Invalid crew credentials'));
    const store = freshStore();
    await loadNotifications(store.dispatch);
    const s = store.getState().notifications;
    expect(s.status).toBe('error');
    expect(s.error).toBe('Invalid crew credentials');
  });

  it('errors clearly when no session is saved', async () => {
    mockedSaved.mockResolvedValue(null);
    const store = freshStore();
    await loadNotifications(store.dispatch);
  expect(store.getState().notifications.error).toBe('Sign in to view notifications');
});

  it('decideDiscretion submits, removes the open request, and refreshes history', async () => {
    // seed an open discretion first
    mockedApi.fetchNotifications.mockResolvedValueOnce(feed);
    const store = freshStore();
    await loadNotifications(store.dispatch);
    expect(store.getState().notifications.openDiscretions).toHaveLength(1);

    const accepted = {...pending, state: 'accepted', decidedBy: 'C900001'} as api.DiscretionRequest;
    mockedApi.submitDiscretionDecision.mockResolvedValue(accepted);
    // the refresh after decide returns a feed with no open discretions + an fdp_update
    mockedApi.fetchNotifications.mockResolvedValueOnce({
      cursor: 3,
      notifications: [
        ...feed.notifications,
        {notifId: 'n2', crewId: 'C900001', type: 'fdp_update', createdUtc: 't', title: 'FDP discretion accepted', body: 'z', status: 'unread', seq: 2},
      ],
      openDiscretions: [],
    } as unknown as api.NotificationsFeed);

    const res = await decideDiscretion(store.dispatch, {discretionId: 'd1', decision: 'accept'});

    expect(res.state).toBe('accepted');
    // idempotency key is stable per (discretion, decision)
    expect(mockedApi.submitDiscretionDecision).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api',
      {airline: 'EK', crewId: 'C900001', password: 'Pier2026'},
      'd1',
      'accept',
      'd1:accept',
      undefined,
      undefined,
    );
    const s = store.getState().notifications;
    expect(s.openDiscretions).toHaveLength(0);
    expect(s.decidingId).toBeNull();
    expect(s.notifications.some(n => n.type === 'fdp_update')).toBe(true);
  });

  it('decideDiscretion clears the deciding flag and rethrows on failure', async () => {
    mockedApi.submitDiscretionDecision.mockRejectedValue(new Error('Request already decided'));
    const store = freshStore();
    await expect(
      decideDiscretion(store.dispatch, {discretionId: 'd1', decision: 'reject'}),
    ).rejects.toThrow('Request already decided');
    expect(store.getState().notifications.decidingId).toBeNull();
  });
});
