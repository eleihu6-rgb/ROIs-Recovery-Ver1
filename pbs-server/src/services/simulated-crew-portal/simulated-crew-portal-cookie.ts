import type { FastifyReply, FastifyRequest } from "fastify";

export const SECURE_SIMULATED_LOGIN_COOKIE_NAME = "__Secure-pbs-simulated-login";
export const LOCAL_SIMULATED_LOGIN_COOKIE_NAME = "pbs-simulated-login-dev";

const SIMULATED_LOGIN_COOKIE_NAMES = [
  SECURE_SIMULATED_LOGIN_COOKIE_NAME,
  LOCAL_SIMULATED_LOGIN_COOKIE_NAME,
] as const;

const SIMULATED_LOGIN_COOKIE_PATHS = [
  "/pbs/api/auth/simulated-session",
  "/api/auth/simulated-session",
] as const;

const parseCookieHeader = (cookieHeader: string | string[] | undefined): Map<string, string> => {
  const headers = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader].filter(Boolean);
  const cookies = new Map<string, string>();

  for (const header of headers) {
    if (!header) {
      continue;
    }

    for (const pair of header.split(";")) {
      const separatorIndex = pair.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const rawName = pair.slice(0, separatorIndex).trim();
      const rawValue = pair.slice(separatorIndex + 1).trim();

      if (!rawName || cookies.has(rawName)) {
        continue;
      }

      try {
        cookies.set(rawName, decodeURIComponent(rawValue));
      } catch {
        cookies.set(rawName, rawValue);
      }
    }
  }

  return cookies;
};

export const readSimulatedLoginTokenFromCookie = (request: FastifyRequest): string | null => {
  const cookies = parseCookieHeader(request.headers.cookie);

  for (const name of SIMULATED_LOGIN_COOKIE_NAMES) {
    const value = cookies.get(name)?.trim();

    if (value) {
      return value;
    }
  }

  return null;
};

const buildClearCookieHeader = (name: string, path: string): string => {
  const attributes = [
    `${name}=`,
    "Max-Age=0",
    `Path=${path}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (name.startsWith("__Secure-")) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
};

export const buildClearSimulatedLoginCookieHeaders = (): string[] =>
  SIMULATED_LOGIN_COOKIE_NAMES.flatMap((name) =>
    SIMULATED_LOGIN_COOKIE_PATHS.map((path) => buildClearCookieHeader(name, path)));

export const clearSimulatedLoginCookies = (reply: FastifyReply): void => {
  reply.header("Set-Cookie", buildClearSimulatedLoginCookieHeaders());
};
