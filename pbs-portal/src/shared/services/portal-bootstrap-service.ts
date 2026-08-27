import {
  pbsPortalBootstrapRoutes,
  type PbsPortalBootstrapResponse,
} from "../../../../packages/contracts/pbs-portal-bootstrap.js";
import { request } from "@/shared/services/request";

export const portalBootstrapService = {
  async getCurrent(): Promise<PbsPortalBootstrapResponse> {
    return request.get<PbsPortalBootstrapResponse>(pbsPortalBootstrapRoutes.current);
  },
};
