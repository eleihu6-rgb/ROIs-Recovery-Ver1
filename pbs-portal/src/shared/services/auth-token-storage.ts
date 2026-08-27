const AUTH_TOKEN_KEY = "pbs-portal.auth.token";

const readStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
};

export const getAuthTokenStorageKey = () => AUTH_TOKEN_KEY;

export const readAuthToken = () => {
  return readStorage()?.getItem(AUTH_TOKEN_KEY) ?? null;
};

export const writeAuthToken = (token: string) => {
  readStorage()?.setItem(AUTH_TOKEN_KEY, token);
};

export const clearAuthToken = () => {
  readStorage()?.removeItem(AUTH_TOKEN_KEY);
};
