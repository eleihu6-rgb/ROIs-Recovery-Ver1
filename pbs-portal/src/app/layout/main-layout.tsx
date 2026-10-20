import { Outlet } from "react-router-dom";
import { DashboardTopNav } from "@/app/layout/dashboard-top-nav";
import { useDashboardHeaderLayout } from "@/app/layout/use-dashboard-header-layout";
import { TOP_NAV_ITEMS } from "@/shared/constants/top-nav-items";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";
import { useIsMobileViewport } from "@/shared/hooks/use-is-mobile-viewport";

export const MainLayout = () => {
  const displayName = useAuthSessionStore((state) => state.user?.name ?? "Admin");
  const isMobileViewport = useIsMobileViewport();
  const { mainPaddingTopPx } = useDashboardHeaderLayout(TOP_NAV_ITEMS.length);

  if (isMobileViewport) {
    return (
      <div
        className="flex h-dvh w-full flex-col overflow-hidden bg-[#edf4fa] font-sans text-[#282c3b]"
        data-layout-mode="mobile"
        data-uiid="main-layout-root"
      >
        <DashboardTopNav displayName={displayName} items={TOP_NAV_ITEMS} />
        <main
          className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3"
          data-testid="main-layout-content"
          data-uiid="main-layout-content"
        >
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="h-dvh w-full overflow-hidden bg-[#edf4fa] font-sans text-[#282c3b]" data-uiid="main-layout-root">
      <DashboardTopNav displayName={displayName} items={TOP_NAV_ITEMS} />
      <main
        className="h-full w-full overflow-hidden px-4 pb-4"
        data-uiid="main-layout-content"
        data-testid="main-layout-content"
        style={{ paddingTop: mainPaddingTopPx }}
      >
        <Outlet />
      </main>
    </div>
  );
};
