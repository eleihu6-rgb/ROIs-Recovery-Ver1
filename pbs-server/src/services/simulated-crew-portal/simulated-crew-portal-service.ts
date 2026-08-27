import { desc, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/node-postgres";
import { pbsOperationLog, pbsUser } from "../../models/index.js";
import { loadSimulatedCrewPortalConfig } from "./simulated-crew-portal-config.js";
import { SimulatedCrewPortalError } from "./simulated-crew-portal-error.js";
import { createSimulatedCrewPortalToken } from "./simulated-crew-portal-token.js";

const SIMULATED_LOGIN_OPERATION = "SIMULATED_LOGIN";
const SIMULATED_LOGIN_TARGET_TYPE = "PBS_PORTAL";

type Db = ReturnType<typeof drizzle>;

export interface CreateSimulatedCrewPortalSessionInput {
  crewCode: string;
  adminUserCode: string;
  adminUserName: string;
  ipAddress: string | null;
}

export interface SimulatedCrewPortalSessionResponse {
  cleanUrl: string;
  token: string;
  expiresAt: string;
  maxAgeSeconds: number;
}

export interface SimulatedCrewPortalLogItem {
  id: string;
  adminUser: string;
  adminUserCode: string;
  crewCode: string;
  crewName: string;
  result: string;
  loginTime: string;
}

const trimForAudit = (value: string, maxLength: number): string => {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

const hasEnabledAccess = (value: string | null): boolean => value === "1";

const canSimulateCrewPortalUser = (user: typeof pbsUser.$inferSelect, now: Date): boolean =>
  user.status === 0
  && hasEnabledAccess(user.portalAccess)
  && user.effDt <= now
  && (user.expDt === null || user.expDt > now);

const buildPortalLoginUrl = (portalPublicUrl: string): string => {
  const baseUrl = portalPublicUrl.trim().replace(/\/+$/, "");
  const url = new URL(`${baseUrl}/login`);
  url.searchParams.set("simulate", "1");
  url.searchParams.set("redirect", "/bid");
  return url.toString();
};

const parseLogValue = (value: string | null): {
  adminUser?: string;
  adminUserCode?: string;
  crewCode?: string;
  crewName?: string;
  result?: string;
} => {
  if (!value) return {};

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return {};
    const data = parsed as Record<string, unknown>;
    return {
      adminUser: typeof data.adminUser === "string" ? data.adminUser : undefined,
      adminUserCode: typeof data.adminUserCode === "string" ? data.adminUserCode : undefined,
      crewCode: typeof data.crewCode === "string" ? data.crewCode : undefined,
      crewName: typeof data.crewName === "string" ? data.crewName : undefined,
      result: typeof data.result === "string" ? data.result : undefined,
    };
  } catch {
    return {};
  }
};

export const createSimulatedCrewPortalSession = async (
  db: Db,
  input: CreateSimulatedCrewPortalSessionInput,
): Promise<SimulatedCrewPortalSessionResponse> => {
  const crewCode = input.crewCode.trim();

  if (!crewCode) {
    throw new SimulatedCrewPortalError(400, "Crew code is required.");
  }

  const result = await db
    .select()
    .from(pbsUser)
    .where(eq(pbsUser.userCode, crewCode))
    .limit(1);
  const user = result[0];

  if (!user) {
    throw new SimulatedCrewPortalError(404, "Crew portal user was not found.");
  }

  if (!canSimulateCrewPortalUser(user, new Date())) {
    throw new SimulatedCrewPortalError(403, "This PBS account cannot access the portal.");
  }

  const config = await loadSimulatedCrewPortalConfig(db);
  const simulatedToken = createSimulatedCrewPortalToken({
    userCode: user.userCode,
    adminUserCode: input.adminUserCode,
    adminUserName: input.adminUserName,
  }, config.loginTtlSeconds);
  const auditValue = JSON.stringify({
    adminUser: input.adminUserName,
    adminUserCode: input.adminUserCode,
    crewCode: user.userCode,
    crewName: user.userName,
    result: "SUCCESS",
  });
  const now = new Date();
  const auditUser = trimForAudit(input.adminUserCode, 30) || "pbs-admin";

  await db.insert(pbsOperationLog).values({
    createdBy: auditUser,
    createdAt: now,
    updatedBy: auditUser,
    updatedAt: now,
    pbsUserId: user.id,
    crewId: user.crewId,
    operation: SIMULATED_LOGIN_OPERATION,
    targetType: SIMULATED_LOGIN_TARGET_TYPE,
    newValue: auditValue,
    ipAddress: input.ipAddress,
    operatedAt: now,
  });

  return {
    cleanUrl: buildPortalLoginUrl(config.portalPublicUrl),
    token: simulatedToken.token,
    expiresAt: simulatedToken.expiresAt,
    maxAgeSeconds: simulatedToken.maxAgeSeconds,
  };
};

export const listSimulatedCrewPortalLogs = async (
  db: Db,
  limit: number,
): Promise<SimulatedCrewPortalLogItem[]> => {
  const rows = await db
    .select({
      id: pbsOperationLog.id,
      crewId: pbsOperationLog.crewId,
      newValue: pbsOperationLog.newValue,
      operatedAt: pbsOperationLog.operatedAt,
    })
    .from(pbsOperationLog)
    .where(eq(pbsOperationLog.operation, SIMULATED_LOGIN_OPERATION))
    .orderBy(desc(pbsOperationLog.operatedAt))
    .limit(limit);

  return rows.map((row) => {
    const value = parseLogValue(row.newValue);

    return {
      id: String(row.id),
      adminUser: value.adminUser ?? "-",
      adminUserCode: value.adminUserCode ?? "-",
      crewCode: value.crewCode ?? row.crewId,
      crewName: value.crewName ?? "-",
      result: value.result ?? "SUCCESS",
      loginTime: row.operatedAt.toISOString(),
    };
  });
};
