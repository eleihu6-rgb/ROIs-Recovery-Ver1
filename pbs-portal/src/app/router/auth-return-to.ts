const AUTH_RETURN_TO_KEY = "pbs-portal.auth.return-to";
const DEFAULT_AUTH_RETURN_TO = "/dashboard";
const SAFE_ROUTE_ROOTS = ["/dashboard", "/bid", "/award"];
const RETIRED_ROUTE_TARGETS: Record<string, string> = {
  "/layer": "/bid",
  "/portal/notices": "/bid",
  "/tier": "/bid",
};

type RouteLocation = {
  pathname: string;
  search: string;
  hash: string;
};

export const getAuthReturnToKey = () => AUTH_RETURN_TO_KEY;

export const getDefaultAuthReturnTo = () => DEFAULT_AUTH_RETURN_TO;

export const buildAuthReturnTo = ({ pathname, search, hash }: RouteLocation) =>
  `${pathname}${search}${hash}`;

export const normalizeAuthReturnTo = (target: string | null | undefined) => {
  if (!target) {
    return DEFAULT_AUTH_RETURN_TO;
  }

  try {
    const normalizedUrl = new URL(target, window.location.origin);
    if (normalizedUrl.origin !== window.location.origin) {
      return DEFAULT_AUTH_RETURN_TO;
    }

    const retiredRouteTarget = RETIRED_ROUTE_TARGETS[normalizedUrl.pathname];
    if (retiredRouteTarget) {
      return retiredRouteTarget;
    }

    if (!SAFE_ROUTE_ROOTS.includes(normalizedUrl.pathname)) {
      return DEFAULT_AUTH_RETURN_TO;
    }

    return `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`;
  } catch {
    return DEFAULT_AUTH_RETURN_TO;
  }
};

export const readAuthReturnTo = () =>
  normalizeAuthReturnTo(window.sessionStorage.getItem(AUTH_RETURN_TO_KEY));

export const storeAuthReturnTo = (target: string | null | undefined) => {
  window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, normalizeAuthReturnTo(target));
};

export const clearAuthReturnTo = () => {
  window.sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
};
