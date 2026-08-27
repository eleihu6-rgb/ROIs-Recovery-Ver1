vi.mock("@/shared/services/request", () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/shared/services/password-encryption", () => ({
  encryptPasswordForLogin: vi.fn(),
}));

import {
  pbsAuthRoutes,
  type PbsLoginRequest,
  type PbsPasswordPublicKeyResponse,
} from "../../../../packages/contracts/pbs-auth.js";
import { authService } from "@/shared/services/auth-service";
import { encryptPasswordForLogin } from "@/shared/services/password-encryption";
import { request } from "@/shared/services/request";

const passwordPublicKey: PbsPasswordPublicKeyResponse = {
  keyId: "pbs-login-test-key",
  algorithm: "RSA-OAEP-256",
  publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
};

describe("authService", () => {
  beforeEach(() => {
    vi.mocked(request.get).mockResolvedValue(passwordPublicKey);
    vi.mocked(encryptPasswordForLogin).mockResolvedValue("encrypted-secret");
    vi.mocked(request.post).mockResolvedValue({
      token: "jwt-token",
      authMode: "password",
      user: {
        id: "1",
        name: "Casey Crew",
        employeeNo: "F8030",
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("encrypts password login requests before posting to the auth session route", async () => {
    await authService.login({
      userCode: "casey.crew",
      password: "super-secret",
    });

    expect(request.get).toHaveBeenCalledWith(pbsAuthRoutes.passwordPublicKey);
    expect(encryptPasswordForLogin).toHaveBeenCalledWith("super-secret", passwordPublicKey);
    expect(request.post).toHaveBeenCalledWith(
      pbsAuthRoutes.session,
      {
        userCode: "casey.crew",
        encryptedPassword: "encrypted-secret",
        encryption: {
          algorithm: "RSA-OAEP-256",
          keyId: "pbs-login-test-key",
        },
      },
    );

    const [, postedBody] = vi.mocked(request.post).mock.calls[0] as [
      string,
      PbsLoginRequest,
    ];
    expect("password" in postedBody).toBe(false);
    expect(JSON.stringify(postedBody)).not.toContain("super-secret");
  });

  it("posts simulated login requests without exposing the handoff token", async () => {
    await authService.handleSimulatedLogin();

    expect(request.post).toHaveBeenCalledWith(
      "/auth/simulated-session",
    );
  });
});
