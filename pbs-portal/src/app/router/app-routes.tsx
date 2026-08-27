import type { ComponentType, LazyExoticComponent } from "react";
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "@/app/layout/main-layout";
import { SharedBiddingWorkbenchLayout } from "@/app/layout/shared-bidding-workbench-layout";
import { ForbiddenPage } from "@/app/pages/forbidden-page";
import { NotFoundPage } from "@/app/pages/not-found-page";
import { ServerErrorPage } from "@/app/pages/server-error-page";
import {
  LegacyAuthCallbackRedirect,
  LegacyRouteRedirect,
} from "@/app/router/legacy-route-redirects";
import { ProtectedRoute } from "@/app/router/protected-route";
import { LoginPage } from "@/features/auth/pages/login-page";

const DashboardPage = lazy(async () => {
  const module = await import("@/features/dashboard/pages/dashboard-page");
  return { default: module.DashboardPage };
});

const BidPage = lazy(async () => {
  const module = await import("@/features/bid/pages/bid-page");
  return { default: module.BidPage };
});

const SearchPairingsPage = lazy(async () => {
  const module = await import("@/features/pairing/pages/search-pairings-page");
  return { default: module.SearchPairingsPage };
});

const AwardPage = lazy(async () => {
  const module = await import("@/features/award/pages/award-page");
  return { default: module.AwardPage };
});

const StandingBidPage = lazy(async () => {
  const module = await import("@/features/standing-bid/pages/standing-bid-page");
  return { default: module.StandingBidPage };
});

const HelpPage = lazy(async () => {
  const module = await import("@/features/help/help-page");
  return { default: module.HelpPage };
});

const renderLazyRoute = (Page: LazyExoticComponent<ComponentType>) => (
  <Suspense fallback={null}>
    <Page />
  </Suspense>
);

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="/500" element={<ServerErrorPage />} />
      <Route path="/auth/callback" element={<LegacyAuthCallbackRedirect />} />
      <Route path="/portal/*" element={<LegacyRouteRedirect />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={renderLazyRoute(DashboardPage)} />
          <Route path="/help" element={renderLazyRoute(HelpPage)} />
          <Route path="/award" element={renderLazyRoute(AwardPage)} />
          <Route path="/standing-bid" element={renderLazyRoute(StandingBidPage)} />
          <Route path="/tier" element={<Navigate to="/bid" replace />} />
          <Route path="/layer" element={<Navigate to="/bid" replace />} />
          <Route element={<SharedBiddingWorkbenchLayout />}>
            <Route path="/bid" element={renderLazyRoute(BidPage)} />
            <Route path="/bid/pairing/search" element={renderLazyRoute(SearchPairingsPage)} />
            <Route path="/days-off" element={<Navigate to="/bid" replace />} />
            <Route path="/pairing" element={<Navigate to="/bid" replace />} />
            <Route path="/pairing/search" element={<Navigate to="/bid/pairing/search" replace />} />
            <Route path="/line" element={<Navigate to="/bid" replace />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};
