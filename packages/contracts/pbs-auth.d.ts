export declare const pbsAuthRoutes: {
  readonly session: "/auth/session";
  readonly legacyLogin: "/auth/login";
  readonly passwordPublicKey: "/auth/password-public-key";
};

export type PbsAuthMode = "password" | "sso" | "simulated";

export type PbsAuthenticatedUser = {
  id: string;
  name: string;
  employeeNo: string;
};

export type PbsAuthenticatedSession = {
  user: PbsAuthenticatedUser;
  authMode: PbsAuthMode;
};

export type PbsAuthenticatedLoginResponse = PbsAuthenticatedSession & {
  token: string;
};

export type PbsLoginRequest = {
  userCode: string;
  encryptedPassword: string;
  encryption: {
    algorithm: "RSA-OAEP-256";
    keyId: string;
  };
};

export type PbsSimulatedLoginRequest = Record<string, never>;

export type PbsPasswordPublicKeyResponse = {
  keyId: string;
  algorithm: "RSA-OAEP-256";
  publicKeyPem: string;
};

export type PbsLogoutResponse = {
  loggedOut: true;
};
