import type {
  PbsAuthenticatedLoginResponse,
  PbsAuthenticatedSession,
  PbsAuthenticatedUser,
} from "../../../../packages/contracts/pbs-auth.js";

export type AuthMode = "password" | "sso" | "simulated";

export type AuthenticatedUser = PbsAuthenticatedUser;

export type AuthenticatedSession = PbsAuthenticatedSession;

export type AuthenticatedLoginResponse = PbsAuthenticatedLoginResponse;

export type AuthPayload = AuthenticatedSession["user"] & {
  userCode: string;
  userName: string;
  authMode: AuthMode;
  isAdmin: boolean;
  tokenVersion: number;
};

export type LoginRequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export interface PbsAuthService {
  login: (userCode: string, password: string, context: LoginRequestContext) => Promise<AuthenticatedLoginResponse>;
  /** SSO 登录；createPbsAuthService 恒提供，接口设为可选以免破坏既有测试 mock（同 validatePayload） */
  loginViaSso?: (identity: { email?: string; userCode?: string }, context: LoginRequestContext) => Promise<AuthenticatedLoginResponse>;
  loginViaSimulation?: (simulateToken: string, context: LoginRequestContext) => Promise<AuthenticatedLoginResponse>;
  validatePayload?: (payload: AuthPayload) => Promise<AuthPayload>;
  getSessionFromPayload: (payload: AuthPayload) => AuthenticatedSession;
  logout: (payload: AuthPayload) => Promise<void>;
}
