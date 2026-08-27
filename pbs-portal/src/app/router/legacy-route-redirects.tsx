import { Navigate, useLocation } from "react-router-dom";
import { NotFoundPage } from "@/app/pages/not-found-page";

const LEGACY_PORTAL_MAP: Record<string, string> = {
  "/portal": "/dashboard",
  "/portal/home": "/dashboard",
  "/portal/pbs": "/award",
  "/portal/messages": "/days-off",
  "/portal/notices": "/bid",
};

const REMOVED_LEGACY_PORTAL_ROUTES = new Set([
  "/portal/calendar",
  "/portal/settings",
]);

export const LegacyRouteRedirect = () => {
  const location = useLocation();
  const target = LEGACY_PORTAL_MAP[location.pathname];

  if (!target || REMOVED_LEGACY_PORTAL_ROUTES.has(location.pathname)) {
    return <NotFoundPage />;
  }

  return <Navigate replace to={`${target}${location.search}${location.hash}`} />;
};

export const LegacyAuthCallbackRedirect = () => {
  const location = useLocation();
  const currentSearch = new URLSearchParams(location.search);
  const nextSearch = new URLSearchParams();
  const token = currentSearch.get("token")?.trim();
  const redirect = currentSearch.get("redirect")?.trim();

  if (token) {
    nextSearch.set("token", token);
  }

  if (redirect) {
    nextSearch.set("redirect", redirect);
  }

  const search = nextSearch.toString();

  return <Navigate replace to={search ? `/login?${search}` : "/login"} />;
};
