import type { Pool } from "pg";
import type { PbsUserCrewOptionsResponse } from "../../../../packages/contracts/pbs-search-pairings.js";
import type { CrewSearchActor } from "../crew-search-scope.js";

export interface PbsUserService {
  searchCrewOptions: (
    actor: CrewSearchActor,
    request: {
      query?: string;
      limit?: number;
    },
  ) => Promise<PbsUserCrewOptionsResponse>;
}

export type CreatePbsUserServiceOptions = {
  pgPool: Pool;
  pbsSchema: string;
};
