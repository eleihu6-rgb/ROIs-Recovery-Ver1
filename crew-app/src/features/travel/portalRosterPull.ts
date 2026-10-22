import type { PortalClient } from '../portal/portalClient';
import type { PortalCapture } from './portalCapture';
import { ROSTER_MONTH_OFFSETS } from './portalInjectedJs';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Pull TG roster payloads without waiting for the portal SPA/WebView to load. */
export async function pullPortalRoster(
  client: PortalClient,
  crewId: string,
  now = new Date(),
): Promise<PortalCapture[]> {
  const requests = ROSTER_MONTH_OFFSETS.flatMap(offset => {
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    const startDateTime = `${first.getFullYear()}-${pad2(first.getMonth() + 1)}-01T00:00:00`;
    const endDateTime = `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}T23:59:59`;
    const common = { crewId, startDateTime, endDateTime };
    return [
      { source: 'roster' as const, path: '/api/rosterFlight/selectPortalCalendar', query: { ...common, type: 'rp' } },
      { source: 'net' as const, path: '/api/rosterFlight/selectCrewRosterReport', query: common },
      { source: 'net' as const, path: '/api/rosterFlight/selectPortalCalendarDetailAll', query: { ...common, type: 'rp' } },
    ];
  });
  const settled = await Promise.allSettled(requests.map(async request => {
    const body = await client.raw<unknown>('GET', request.path, { query: request.query });
    const query = new URLSearchParams(Object.entries(request.query)).toString();
    return { source: request.source, url: `${request.path}?${query}`, body } satisfies PortalCapture;
  }));
  return settled.flatMap(result => result.status === 'fulfilled' && result.value.body.code === 0 ? [result.value] : []);
}
