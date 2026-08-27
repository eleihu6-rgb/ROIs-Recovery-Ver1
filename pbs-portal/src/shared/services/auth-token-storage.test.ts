import {
  clearAuthToken,
  getAuthTokenStorageKey,
  readAuthToken,
  writeAuthToken,
} from "@/shared/services/auth-token-storage";

describe("auth-token-storage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("writes and reads the auth token from sessionStorage", () => {
    writeAuthToken("jwt-token");

    expect(readAuthToken()).toBe("jwt-token");
    expect(window.sessionStorage.getItem(getAuthTokenStorageKey())).toBe("jwt-token");
  });

  it("clears the auth token", () => {
    writeAuthToken("jwt-token");

    clearAuthToken();

    expect(readAuthToken()).toBeNull();
  });
});
