import {
  pbsAuthRoutes,
  type PbsLoginRequest,
  type PbsLogoutResponse,
  type PbsPasswordPublicKeyResponse,
} from "../../../../packages/contracts/pbs-auth.js";
import { env } from "@/shared/config/env";
import { encryptPasswordForLogin } from "@/shared/services/password-encryption";
import { request } from "@/shared/services/request";
import type { AuthenticatedLoginResponse, AuthenticatedSession } from "@/shared/types/auth";

type SsoCallbackPayload = {
  token?: string;
};

type PasswordLoginCredentials = {
  userCode: string;
  password: string;
};

export const authService = {
  async getSession(): Promise<AuthenticatedSession | null> {
    return request.get<AuthenticatedSession | null>(pbsAuthRoutes.session);
  },
  async login(credentials: PasswordLoginCredentials): Promise<AuthenticatedLoginResponse> {
    const passwordPublicKey = await request.get<PbsPasswordPublicKeyResponse>(
      pbsAuthRoutes.passwordPublicKey,
    );
    const encryptedPassword = await encryptPasswordForLogin(
      credentials.password,
      passwordPublicKey,
    );
    const payload: PbsLoginRequest = {
      userCode: credentials.userCode,
      encryptedPassword,
      encryption: {
        algorithm: passwordPublicKey.algorithm,
        keyId: passwordPublicKey.keyId,
      },
    };

    return request.post<AuthenticatedLoginResponse, PbsLoginRequest>(
      pbsAuthRoutes.session,
      payload,
    );
  },
  async handleSsoCallback(
    payload?: SsoCallbackPayload,
  ): Promise<AuthenticatedSession> {
    return request.post<AuthenticatedSession, SsoCallbackPayload>(
      "/auth/sso/callback",
      payload,
    );
  },
  async handleSimulatedLogin(): Promise<AuthenticatedLoginResponse> {
    return request.post<AuthenticatedLoginResponse>(
      "/auth/simulated-session",
    );
  },
  async logout(): Promise<void> {
    await request.delete<PbsLogoutResponse>(pbsAuthRoutes.session);
  },
  getSsoLoginUrl(): string {
    return env.ssoLoginUrl;
  },
};
