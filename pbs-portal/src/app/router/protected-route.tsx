import { Navigate, Outlet, useLocation } from "react-router-dom";
import { buildAuthReturnTo, storeAuthReturnTo } from "@/app/router/auth-return-to";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

export const ProtectedRoute = () => {
  const location = useLocation();
  const status = useAuthSessionStore((state) => state.status);

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Restoring your session...
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    const returnTo = buildAuthReturnTo(location);

    storeAuthReturnTo(returnTo);

    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  return <Outlet />;
};
