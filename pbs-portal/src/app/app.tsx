import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { AppProviders } from "@/app/providers/app-providers";
import { AppRoutes } from "@/app/router/app-routes";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

const SessionBootstrap = () => {
  const location = useLocation();
  const initialize = useAuthSessionStore((state) => state.initialize);
  const status = useAuthSessionStore((state) => state.status);
  const searchParams = new URLSearchParams(location.search);
  const isSimulatedLoginCallback = location.pathname === "/login" && searchParams.get("simulate") === "1";
  const shouldBootstrapSession = !(
    location.pathname === "/auth/callback"
    || (location.pathname === "/login" && searchParams.has("token"))
    || isSimulatedLoginCallback
    || (location.pathname === "/login" && searchParams.has("simulateToken"))
  );

  useEffect(() => {
    if (shouldBootstrapSession && status === "idle") {
      void initialize();
    }
  }, [initialize, shouldBootstrapSession, status]);

  return <AppRoutes />;
};

export const App = () => {
  return (
    <AppProviders>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <SessionBootstrap />
      </BrowserRouter>
    </AppProviders>
  );
};
