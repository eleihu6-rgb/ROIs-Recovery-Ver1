import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/index.js";

export const SIMULATED_CREW_PORTAL_PURPOSE = "pbs-simulated-crew-portal";

export interface SimulatedCrewPortalTokenClaims {
  purpose: typeof SIMULATED_CREW_PORTAL_PURPOSE;
  userCode: string;
  adminUserCode: string;
  adminUserName: string;
  jti: string;
  exp: number;
}

const simulatedTokenPayloadSchema = z.object({
  purpose: z.literal(SIMULATED_CREW_PORTAL_PURPOSE),
  userCode: z.string().trim().min(1),
  adminUserCode: z.string().trim().min(1),
  adminUserName: z.string().trim().min(1),
  jti: z.string().trim().min(1),
  exp: z.number().int().positive(),
});

export const createSimulatedCrewPortalToken = (input: {
  userCode: string;
  adminUserCode: string;
  adminUserName: string;
}, ttlSeconds = 300): { token: string; expiresAt: string; maxAgeSeconds: number } => {
  const payload: Omit<SimulatedCrewPortalTokenClaims, "exp"> = {
    purpose: SIMULATED_CREW_PORTAL_PURPOSE,
    userCode: input.userCode,
    adminUserCode: input.adminUserCode,
    adminUserName: input.adminUserName,
    jti: randomUUID(),
  };
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: ttlSeconds,
  });

  return {
    token,
    expiresAt,
    maxAgeSeconds: ttlSeconds,
  };
};

export const verifySimulatedCrewPortalToken = (token: string): SimulatedCrewPortalTokenClaims => {
  const verified = jwt.verify(token, env.JWT_SECRET);
  const parsed = simulatedTokenPayloadSchema.safeParse(verified);

  if (!parsed.success) {
    throw new Error("Invalid simulated login token.");
  }

  return parsed.data;
};
