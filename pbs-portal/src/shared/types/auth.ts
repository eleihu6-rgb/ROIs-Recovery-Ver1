import type {
  PbsAuthenticatedSession,
  PbsAuthenticatedUser,
  PbsAuthMode,
} from "../../../../packages/contracts/pbs-auth.js";

export type AuthMode = PbsAuthMode;
export type SessionStatus =
  | "idle"
  | "loading"
  | "authenticated"
  | "unauthenticated";

export type AuthenticatedUser = PbsAuthenticatedUser;

export type AuthenticatedSession = PbsAuthenticatedSession;

export type AuthenticatedLoginResponse = AuthenticatedSession & {
  token?: string;
};
