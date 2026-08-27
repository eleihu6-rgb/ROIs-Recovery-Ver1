import { useEffect, useMemo, useState } from "react";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";
import { ScaledPageCanvas } from "@/shared/components/layout/scaled-page-canvas";
import { DashboardLeftPanel } from "@/features/dashboard/components/dashboard-left-panel";
import { DashboardRightPanel } from "@/features/dashboard/components/dashboard-right-panel";
import { DashboardSchedulePanel } from "@/features/dashboard/components/dashboard-schedule-panel";
import { buildDashboardUserPanelData } from "@/features/dashboard/dashboard-user-panel-profile";
import { buildDashboardMessagePanelDataFromSummary } from "@/features/dashboard/dashboard-summary-mappers";
import { useDashboardSummary } from "@/features/dashboard/hooks/use-dashboard-summary";

const DASHBOARD_COMPACT_HEIGHT_THRESHOLD = 720;

type DashboardCalendarDensity = "regular" | "compact";

const isCompactDashboardViewport = () =>
  window.innerHeight <= DASHBOARD_COMPACT_HEIGHT_THRESHOLD;

const useDashboardCalendarDensity = (): DashboardCalendarDensity => {
  const [isCompact, setIsCompact] = useState(isCompactDashboardViewport);

  useEffect(() => {
    const handleResize = () => {
      setIsCompact(isCompactDashboardViewport());
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return isCompact ? "compact" : "regular";
};

export const DashboardPage = () => {
  const authenticatedUser = useAuthSessionStore((state) => state.user);
  const { data: dashboardSummary } = useDashboardSummary();
  const calendarDensity = useDashboardCalendarDensity();
  const userPanelData = useMemo(() => {
    return buildDashboardUserPanelData({
      bidPackage: dashboardSummary?.bidPackage,
      profile: dashboardSummary?.profile,
      sessionUser: authenticatedUser,
    });
  }, [authenticatedUser, dashboardSummary?.bidPackage, dashboardSummary?.profile]);
  const messagePanelData = useMemo(
    () => buildDashboardMessagePanelDataFromSummary(dashboardSummary),
    [dashboardSummary],
  );

  return (
    <div
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"
      data-testid="dashboard-scroll-container"
      data-uiid="dashboard-scroll-container"
    >
      <ScaledPageCanvas allowVerticalOverflow designHeight={968} designWidth={1888}>
        <div
          className="grid items-stretch gap-4"
          data-uiid="dashboard-page-layout"
          data-testid="dashboard-layout"
          style={{
            gridTemplateColumns: "436px minmax(0, 1fr) 365px",
            minHeight: "var(--portal-page-shell-height)",
          }}
        >
          <DashboardLeftPanel data={userPanelData} />
          <DashboardSchedulePanel density={calendarDensity} />
          <DashboardRightPanel data={messagePanelData} />
        </div>
      </ScaledPageCanvas>
    </div>
  );
};
