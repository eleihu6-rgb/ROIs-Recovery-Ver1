import { Outlet } from "react-router-dom";
import { DashboardTopNav } from "@/app/layout/dashboard-top-nav";
import { useDashboardHeaderLayout } from "@/app/layout/use-dashboard-header-layout";
import { TOP_NAV_ITEMS } from "@/shared/constants/top-nav-items";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

export const MainLayout = () => {
  const displayName = useAuthSessionStore((state) => state.user?.name ?? "Admin");
  const { mainPaddingTopPx } = useDashboardHeaderLayout(TOP_NAV_ITEMS.length);

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
