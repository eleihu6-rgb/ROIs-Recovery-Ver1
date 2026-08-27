const resolveEnvValue = (value: string | undefined, fallback: string) => {
  return value && value.trim().length > 0 ? value : fallback;
};

const trimTrailingSlash = (value: string) => {
  return value.endsWith("/") ? value.replace(/\/+$/, "") : value;
};

export const resolveSsoLoginUrl = (
  rawSsoLoginUrl: string | undefined,
  apiBaseUrl: string,
) => {
  const configuredSsoLoginUrl = rawSsoLoginUrl?.trim();

  if (configuredSsoLoginUrl) {
    return configuredSsoLoginUrl;
  }

  return `${trimTrailingSlash(apiBaseUrl)}/auth/sso/login`;
};

const apiBaseUrl = resolveEnvValue(import.meta.env.VITE_API_BASE_URL, "/api");

export const env = {
  apiBaseUrl,
  ssoLoginUrl: resolveSsoLoginUrl(import.meta.env.VITE_SSO_LOGIN_URL, apiBaseUrl),
} as const;
