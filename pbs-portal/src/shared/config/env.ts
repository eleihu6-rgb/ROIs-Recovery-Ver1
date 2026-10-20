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

export const resolvePortalApiBaseUrl = (
  configuredApiBaseUrl: string,
  location: Pick<Location, "hostname" | "pathname"> | undefined,
) => {
  if (configuredApiBaseUrl !== "/api" || !location) {
    return configuredApiBaseUrl;
  }

  return location.hostname === "cr.rois.one" && location.pathname.startsWith("/pbs")
    ? "/pbs/api"
    : configuredApiBaseUrl;
};

const configuredApiBaseUrl = resolveEnvValue(import.meta.env.VITE_API_BASE_URL, "/api");
const apiBaseUrl = resolvePortalApiBaseUrl(
  configuredApiBaseUrl,
  typeof window !== "undefined" ? window.location : undefined,
);

export const env = {
  apiBaseUrl,
  ssoLoginUrl: resolveSsoLoginUrl(import.meta.env.VITE_SSO_LOGIN_URL, apiBaseUrl),
} as const;
