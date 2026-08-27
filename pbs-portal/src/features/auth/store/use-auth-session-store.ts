import { create } from "zustand";
import { authService } from "@/shared/services/auth-service";
import { clearAuthToken, readAuthToken, writeAuthToken } from "@/shared/services/auth-token-storage";
import { queryClient } from "@/shared/query/query-client";
import { useBiddingCalendarStore } from "@/shared/store/use-bidding-calendar-store";
import type {
  AuthMode,
  AuthenticatedLoginResponse,
  AuthenticatedUser,
  SessionStatus,
} from "@/shared/types/auth";

type AuthSessionState = {
  status: SessionStatus;
  user: AuthenticatedUser | null;
  authMode: AuthMode | null;
  initialize: () => Promise<void>;
  login: (credentials: { userCode: string; password: string }) => Promise<void>;
  completeSsoFromToken: (token: string) => Promise<void>;
  completeSimulatedLogin: () => Promise<void>;
  redirectToSsoLogin: () => void;
  logout: () => Promise<void>;
  setSession: (user: AuthenticatedUser, authMode: AuthMode) => void;
  clearSession: () => void;
};

const clearAuthenticatedClientState = () => {
  queryClient.clear();
  useBiddingCalendarStore.getState().resetActiveTierLabel();
};

export const useAuthSessionStore = create<AuthSessionState>((set) => ({
  status: "idle",
  user: null,
  authMode: null,
  initialize: async () => {
    if (!readAuthToken()) {
      clearAuthenticatedClientState();
      set({ status: "unauthenticated", user: null, authMode: null });
      return;
    }

    set({ status: "loading" });
    try {
      const session = await authService.getSession();
      if (session) {
        set({
          status: "authenticated",
          user: session.user,
          authMode: session.authMode,
        });
        return;
      }
      clearAuthToken();
      clearAuthenticatedClientState();
      set({ status: "unauthenticated", user: null, authMode: null });
    } catch {
      clearAuthToken();
      clearAuthenticatedClientState();
      set({ status: "unauthenticated", user: null, authMode: null });
    }
  },
  login: async (credentials) => {
    clearAuthToken();
    clearAuthenticatedClientState();
    set({ status: "loading" });
    try {
      const session = await authService.login(credentials);
      if (session.token) {
        writeAuthToken(session.token);
      }
      set({
        status: "authenticated",
        user: session.user,
        authMode: session.authMode,
      });
    } catch (error) {
      clearAuthToken();
      clearAuthenticatedClientState();
      set({ status: "unauthenticated", user: null, authMode: null });
      throw error;
    }
  },
  completeSsoFromToken: async (token) => {
    clearAuthToken();
    clearAuthenticatedClientState();
    set({ status: "loading" });
    try {
      const session = await authService.handleSsoCallback({ token }) as AuthenticatedLoginResponse;
      if (session.token) {
        writeAuthToken(session.token);
      }
      set({
        status: "authenticated",
        user: session.user,
        authMode: session.authMode,
      });
    } catch (error) {
      clearAuthToken();
      clearAuthenticatedClientState();
      set({ status: "unauthenticated", user: null, authMode: null });
      throw error;
    }
  },
  completeSimulatedLogin: async () => {
    clearAuthToken();
    clearAuthenticatedClientState();
    set({ status: "loading" });
    try {
      const session = await authService.handleSimulatedLogin();
      if (session.token) {
        writeAuthToken(session.token);
      }
      set({
        status: "authenticated",
        user: session.user,
        authMode: session.authMode,
      });
    } catch (error) {
      clearAuthToken();
      clearAuthenticatedClientState();
      set({ status: "unauthenticated", user: null, authMode: null });
      throw error;
    }
  },
  redirectToSsoLogin: () => {
    window.location.assign(authService.getSsoLoginUrl());
  },
  logout: async () => {
    try {
      await authService.logout();
    } finally {
      clearAuthToken();
      clearAuthenticatedClientState();
      set({ status: "unauthenticated", user: null, authMode: null });
    }
  },
  setSession: (user, authMode) => {
    clearAuthenticatedClientState();
    set({ status: "authenticated", user, authMode });
  },
  clearSession: () => {
    clearAuthToken();
    clearAuthenticatedClientState();
    set({ status: "unauthenticated", user: null, authMode: null });
  },
}));
