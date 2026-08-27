import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../../config/index.js";
import { pbsUser } from "../../models/index.js";
import type { SimulatedLoginReplayGuard } from "../simulated-crew-portal/simulated-crew-portal-replay-guard.js";
import { verifySimulatedCrewPortalToken } from "../simulated-crew-portal/simulated-crew-portal-token.js";
import type {
  AuthMode,
  AuthPayload,
  AuthenticatedLoginResponse,
  AuthenticatedSession,
  PbsAuthService,
} from "./types.js";

class AuthServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AuthServiceError";
    this.statusCode = statusCode;
  }
}

const TOKEN_INVALID_MESSAGE = "Token expired or invalid. Please login again.";
const TOKEN_VALIDATION_CACHE_TTL_MS = 60_000;

type CachedAuthPayload = {
  expiresAt: number;
  payload: AuthPayload;
};

const mapUserToSessionUser = (user: typeof pbsUser.$inferSelect): AuthenticatedSession["user"] => ({
  id: String(user.id),
  name: user.userName,
  employeeNo: user.crewId,
});

const buildPayload = (
  user: typeof pbsUser.$inferSelect,
  authMode: AuthMode = "password",
): AuthPayload => ({
  ...mapUserToSessionUser(user),
  userCode: user.userCode,
  userName: user.userName,
  authMode,
  isAdmin: user.isAdmin === 1,
  tokenVersion: user.tokenVersion,
});

const buildSession = (payload: AuthPayload): AuthenticatedSession => ({
  user: {
    id: payload.id,
    name: payload.name,
    employeeNo: payload.employeeNo,
  },
  authMode: payload.authMode,
});

const hasEnabledAccess = (value: string | null) => value === "1";

const isWithinEffectiveWindow = (user: typeof pbsUser.$inferSelect, now: Date): boolean =>
  user.effDt <= now && (user.expDt === null || user.expDt > now);

const hasPortalLoginAccess = (user: typeof pbsUser.$inferSelect, now: Date): boolean =>
  user.status === 0
  && hasEnabledAccess(user.passwordAccess)
  && hasEnabledAccess(user.portalAccess)
  && isWithinEffectiveWindow(user, now);

/** SSO 门槛：不要求 passwordAccess（SSO 是认证方式本身），其余与密码登录一致 */
const hasSsoPortalLoginAccess = (user: typeof pbsUser.$inferSelect, now: Date): boolean =>
  user.status === 0
  && hasEnabledAccess(user.portalAccess)
  && isWithinEffectiveWindow(user, now);

const isKnownAuthMode = (value: unknown): value is AuthMode =>
  value === "password" || value === "sso" || value === "simulated";

const parsePayloadUserId = (payload: AuthPayload): number => {
  const userId = Number(payload.id);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new AuthServiceError(401, TOKEN_INVALID_MESSAGE);
  }

  return userId;
};

const buildTokenValidationCacheKey = (userId: number, tokenVersion: number) =>
  `${userId}:${tokenVersion}`;

const updateFailedLogin = async (
  db: ReturnType<typeof drizzle>,
  userId: number,
) => {
  await db
    .update(pbsUser)
    .set({
      failedLoginCount: sql`${pbsUser.failedLoginCount} + 1`,
      updatedAt: new Date(),
      updatedBy: "pbs-auth",
    })
    .where(eq(pbsUser.id, userId));
};

const updateSuccessfulLogin = async (
  db: ReturnType<typeof drizzle>,
  userId: number,
  ipAddress: string | null,
) => {
  await db
    .update(pbsUser)
    .set({
      failedLoginCount: 0,
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
      lockedUntil: null,
      updatedAt: new Date(),
      updatedBy: "pbs-auth",
    })
    .where(eq(pbsUser.id, userId));
};

type CreatePbsAuthServiceOptions = {
  db: ReturnType<typeof drizzle>;
  simulatedLoginReplayGuard?: SimulatedLoginReplayGuard;
};

export const createPbsAuthService = ({
  db,
  simulatedLoginReplayGuard,
}: CreatePbsAuthServiceOptions): PbsAuthService => {
  const validatedPayloadCache = new Map<string, CachedAuthPayload>();

  const readCachedPayload = (cacheKey: string, now: number): AuthPayload | null => {
    const cached = validatedPayloadCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= now) {
      validatedPayloadCache.delete(cacheKey);
      return null;
    }

    return { ...cached.payload };
  };

  const writeCachedPayload = (cacheKey: string, payload: AuthPayload, now: number): void => {
    validatedPayloadCache.set(cacheKey, {
      expiresAt: now + TOKEN_VALIDATION_CACHE_TTL_MS,
      payload: { ...payload },
    });
  };

  return {
    async login(userCode, password, context): Promise<AuthenticatedLoginResponse> {
      const normalizedUserCode = userCode.trim();

      const result = await db
        .select()
        .from(pbsUser)
        .where(eq(pbsUser.userCode, normalizedUserCode))
        .limit(1);

      const user = result[0];

      if (!user) {
        throw new AuthServiceError(401, "Invalid user code or password.");
      }

      if (!hasPortalLoginAccess(user, new Date())) {
        throw new AuthServiceError(403, "This PBS account cannot access the portal.");
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new AuthServiceError(423, "This PBS account is locked.");
      }

      const passwordMatches = await bcrypt.compare(password, user.passwordHash);

      if (!passwordMatches) {
        await updateFailedLogin(db, user.id);
        throw new AuthServiceError(401, "Invalid user code or password.");
      }

      await updateSuccessfulLogin(db, user.id, context.ipAddress);

      const payload = buildPayload(user);
      const token = jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
      });
      writeCachedPayload(
        buildTokenValidationCacheKey(user.id, payload.tokenVersion),
        payload,
        Date.now(),
      );

      return {
        token,
        ...buildSession(payload),
      };
    },
    async loginViaSso(identity, context): Promise<AuthenticatedLoginResponse> {
      let user: typeof pbsUser.$inferSelect | undefined;

      if (identity.email) {
        const r = await db
          .select()
          .from(pbsUser)
          .where(sql`lower(${pbsUser.email}) = lower(${identity.email})`)
          .limit(1);
        user = r[0];
      }

      if (!user && identity.userCode) {
        const r = await db
          .select()
          .from(pbsUser)
          .where(sql`${pbsUser.userCode} = ${identity.userCode}`)
          .limit(1);
        user = r[0];
      }

      if (!user) {
        throw new AuthServiceError(401, "No PBS account matches the SSO identity. Contact administrator.");
      }

      if (!hasSsoPortalLoginAccess(user, new Date())) {
        throw new AuthServiceError(403, "This PBS account cannot access the portal.");
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new AuthServiceError(423, "This PBS account is locked.");
      }

      await updateSuccessfulLogin(db, user.id, context.ipAddress);

      const payload = buildPayload(user, "sso");
      const token = jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
      });
      writeCachedPayload(
        buildTokenValidationCacheKey(user.id, payload.tokenVersion),
        payload,
        Date.now(),
      );

      return { token, ...buildSession(payload) };
    },
    async loginViaSimulation(simulateToken, context): Promise<AuthenticatedLoginResponse> {
      let claims: ReturnType<typeof verifySimulatedCrewPortalToken>;
      try {
        claims = verifySimulatedCrewPortalToken(simulateToken);
      } catch {
        throw new AuthServiceError(401, "Simulated login token is invalid or expired.");
      }

      if (simulatedLoginReplayGuard) {
        try {
          const secondsUntilExpiry = claims.exp - Math.floor(Date.now() / 1000);
          const consumed = await simulatedLoginReplayGuard.consume(
            claims.jti,
            Math.max(1, secondsUntilExpiry),
          );

          if (!consumed) {
            throw new AuthServiceError(401, "Simulated login token is invalid or expired.");
          }
        } catch (error) {
          if (error instanceof AuthServiceError) {
            throw error;
          }

          throw new AuthServiceError(500, "Simulated login is not available.");
        }
      }

      const result = await db
        .select()
        .from(pbsUser)
        .where(eq(pbsUser.userCode, claims.userCode))
        .limit(1);
      const user = result[0];

      if (!user) {
        throw new AuthServiceError(401, "Simulated login token is invalid.");
      }

      if (!hasSsoPortalLoginAccess(user, new Date())) {
        throw new AuthServiceError(403, "This PBS account cannot access the portal.");
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new AuthServiceError(423, "This PBS account is locked.");
      }

      await updateSuccessfulLogin(db, user.id, context.ipAddress);

      const payload = buildPayload(user, "simulated");
      const token = jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
      });
      writeCachedPayload(
        buildTokenValidationCacheKey(user.id, payload.tokenVersion),
        payload,
        Date.now(),
      );

      return { token, ...buildSession(payload) };
    },
    async validatePayload(payload): Promise<AuthPayload> {
      if (!Number.isInteger(payload.tokenVersion)) {
        throw new AuthServiceError(401, TOKEN_INVALID_MESSAGE);
      }
      if (!isKnownAuthMode(payload.authMode)) {
        throw new AuthServiceError(401, TOKEN_INVALID_MESSAGE);
      }

      const userId = parsePayloadUserId(payload);
      const cacheKey = buildTokenValidationCacheKey(userId, payload.tokenVersion);
      const now = Date.now();
      const cachedPayload = readCachedPayload(cacheKey, now);

      if (cachedPayload) {
        return cachedPayload;
      }

      const result = await db
        .select()
        .from(pbsUser)
        .where(eq(pbsUser.id, userId))
        .limit(1);
      const user = result[0];

      if (!user || user.tokenVersion !== payload.tokenVersion) {
        throw new AuthServiceError(401, TOKEN_INVALID_MESSAGE);
      }

      const hasAccess = payload.authMode === "password"
        ? hasPortalLoginAccess(user, new Date())
        : hasSsoPortalLoginAccess(user, new Date());

      if (!hasAccess) {
        throw new AuthServiceError(403, "This PBS account cannot access the portal.");
      }

      const validatedPayload = buildPayload(user, payload.authMode);
      writeCachedPayload(cacheKey, validatedPayload, now);

      return validatedPayload;
    },
    getSessionFromPayload(payload) {
      return buildSession(payload);
    },
    async logout(payload) {
      const userId = parsePayloadUserId(payload);
      validatedPayloadCache.delete(buildTokenValidationCacheKey(userId, payload.tokenVersion));

      await db
        .update(pbsUser)
        .set({
          tokenVersion: sql`${pbsUser.tokenVersion} + 1`,
          updatedAt: new Date(),
          updatedBy: "pbs-auth",
        })
        .where(eq(pbsUser.id, userId));
    },
  };
};

export { AuthServiceError, TOKEN_INVALID_MESSAGE };
