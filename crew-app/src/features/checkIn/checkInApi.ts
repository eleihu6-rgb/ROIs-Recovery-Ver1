// Check-In · the crew portal's own task: GET /api/portal/checkIn/toCheckIn
// (the call behind the portal's /portal/page/check-in; captured on PR TEST for
// crew 421983). Read only — the app never posts a check-in to the portal.
import { createPortalClient, portalSiteFor, type PortalCredentials } from '../portal/portalClient';
import type { ApiToCheckIn } from './checkInModel';

/** The portal's next check-in task (data may carry no `dutyId` = no task), or
 *  null when this airline has no ROIS crew portal. Throws when the portal fails. */
export async function fetchToCheckIn(creds: PortalCredentials): Promise<ApiToCheckIn | null> {
  if (!portalSiteFor(creds.airline)) return null;
  const data = await createPortalClient(creds).get<ApiToCheckIn | null>('/api/portal/checkIn/toCheckIn');
  return data ?? {};
}
