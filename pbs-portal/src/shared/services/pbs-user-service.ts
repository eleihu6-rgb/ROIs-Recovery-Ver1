import {
  pbsUserRoutes,
  type PbsUserCrewOptionsResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import { request } from "@/shared/services/request";

export const pbsUserService = {
  async searchCrewOptions(query: string, limit = 20): Promise<PbsUserCrewOptionsResponse> {
    return request.get<PbsUserCrewOptionsResponse>(
      pbsUserRoutes.crewOptions,
      {
        params: {
          query,
          limit,
        },
      },
    );
  },
};
