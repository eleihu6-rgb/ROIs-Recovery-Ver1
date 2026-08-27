import { useEffect, useMemo, type CSSProperties } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ExpandBiddingCalendarButton } from "@/app/layout/bidding-calendar-expand-button";
import {
  BIDDING_CALENDAR_BODY_TRANSITION,
  BIDDING_CALENDAR_CONTENT_TRANSITION,
  BIDDING_CALENDAR_LAYOUT_TRANSITION,
  BIDDING_CALENDAR_PANEL_TRANSITION,
  usePersistentBiddingCalendarCollapse,
  usePrefersReducedMotion,
} from "@/app/layout/bidding-calendar-collapse-state";
import { DashboardSchedulePanel } from "@/features/dashboard/components/dashboard-schedule-panel";
import { ScaledPageCanvas } from "@/shared/components/layout/scaled-page-canvas";
import {
  SHARED_SCHEDULE_PANEL_CONTENT_MIN_WIDTH,
  SHARED_SCHEDULE_PANEL_PANEL_WIDTH,
} from "@/app/layout/shared-bidding-workbench-layout.constants";
import { queryClient } from "@/shared/query/query-client";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import {
  biddingCalendarQueryKey,
  fetchBiddingCalendar,
} from "@/features/dashboard/hooks/use-bidding-calendar";
import {
  dashboardUserProfileQueryKey,
  fetchDashboardUserProfile,
} from "@/features/dashboard/hooks/use-dashboard-user-profile";
import {
  fetchTierPageData,
  tierPageDataQueryKey,
} from "@/features/tier/hooks/use-tier-page-data";

const SHARED_BIDDING_WORKBENCH_LAYOUT_GAP = 16;
const COLLAPSED_CALENDAR_EXPAND_BUTTON_SPACE = 48;

export const SharedBiddingWorkbenchLayout = () => {
  const location = useLocation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const {
    isBiddingCalendarCollapsed,
    setBiddingCalendarCollapsed,
  } = usePersistentBiddingCalendarCollapse();
  const layoutStyle = useMemo<CSSProperties>(() => ({
    display: "flex",
    gap: isBiddingCalendarCollapsed ? "0px" : `${SHARED_BIDDING_WORKBENCH_LAYOUT_GAP}px`,
    minHeight: "var(--portal-page-shell-height)",
    transition: prefersReducedMotion ? undefined : BIDDING_CALENDAR_LAYOUT_TRANSITION,
  }), [isBiddingCalendarCollapsed, prefersReducedMotion]);
  const calendarColumnStyle = useMemo<CSSProperties>(() => ({
    flex: "0 0 auto",
    flexBasis: isBiddingCalendarCollapsed ? "0px" : `${SHARED_SCHEDULE_PANEL_PANEL_WIDTH}px`,
    width: isBiddingCalendarCollapsed ? "0px" : `${SHARED_SCHEDULE_PANEL_PANEL_WIDTH}px`,
    transition: prefersReducedMotion ? undefined : BIDDING_CALENDAR_PANEL_TRANSITION,
    willChange: prefersReducedMotion ? undefined : "width, flex-basis",
  }), [isBiddingCalendarCollapsed, prefersReducedMotion]);
  const calendarContentStyle = useMemo<CSSProperties>(() => ({
    minWidth: SHARED_SCHEDULE_PANEL_CONTENT_MIN_WIDTH,
    pointerEvents: isBiddingCalendarCollapsed ? "none" : undefined,
    transform: isBiddingCalendarCollapsed ? "translateX(-8px)" : "translateX(0)",
    transition: prefersReducedMotion ? undefined : BIDDING_CALENDAR_CONTENT_TRANSITION,
  }), [isBiddingCalendarCollapsed, prefersReducedMotion]);
  const workbenchBodyStyle = useMemo<CSSProperties>(() => ({
    paddingLeft: isBiddingCalendarCollapsed ? `${COLLAPSED_CALENDAR_EXPAND_BUTTON_SPACE}px` : "0px",
    transition: prefersReducedMotion ? undefined : BIDDING_CALENDAR_BODY_TRANSITION,
  }), [isBiddingCalendarCollapsed, prefersReducedMotion]);

  // Warm the shared workbench queries once at layout entry so overseas users
  // do not pay a fresh round trip when navigating into each sub-route.
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: biddingCalendarQueryKey,
      queryFn: fetchBiddingCalendar,
      staleTime: workbenchQueryDefaults.staleTime,
    });
    void queryClient.prefetchQuery({
      queryKey: dashboardUserProfileQueryKey,
      queryFn: fetchDashboardUserProfile,
      staleTime: workbenchQueryDefaults.staleTime,
    });
    void queryClient.prefetchQuery({
      queryKey: tierPageDataQueryKey,
      queryFn: fetchTierPageData,
      staleTime: workbenchQueryDefaults.staleTime,
    });
  }, []);

  return (
    <ScaledPageCanvas
      canvasTestId="shared-bidding-workbench-canvas"
      designHeight={968}
      designWidth={1888}
      viewportTestId="shared-bidding-workbench-viewport"
    >
      <div
        className="relative grid items-stretch gap-4"
        data-calendar-collapsed={isBiddingCalendarCollapsed ? "true" : "false"}
        data-testid="shared-bidding-workbench-layout"
        data-uiid="shared-bidding-workbench-layout"
        style={layoutStyle}
      >
        <div
          className="relative min-w-0 overflow-visible"
          data-testid="shared-bidding-calendar-column"
          style={calendarColumnStyle}
        >
          <div
            className="h-full min-w-0 overflow-hidden"
            data-testid="shared-bidding-calendar-clipper"
          >
            <div
              aria-hidden={isBiddingCalendarCollapsed ? "true" : undefined}
              className="h-full min-w-0"
              data-testid="shared-bidding-calendar-content"
              inert={isBiddingCalendarCollapsed ? true : undefined}
              style={calendarContentStyle}
            >
              <DashboardSchedulePanel
                contentMinWidth={SHARED_SCHEDULE_PANEL_CONTENT_MIN_WIDTH}
                editableDaysOffCalendar={
                  location.pathname === "/bid" || location.pathname === "/days-off"
                }
                pairingCalendarAwardBid={
                  location.pathname === "/bid" || location.pathname === "/pairing"
                }
                onCollapse={() => setBiddingCalendarCollapsed(true)}
              />
            </div>
          </div>
          {isBiddingCalendarCollapsed ? (
            <div className="absolute left-2 top-6 z-20">
              <ExpandBiddingCalendarButton onExpand={() => setBiddingCalendarCollapsed(false)} />
            </div>
          ) : null}
        </div>
        <div
          className="min-w-0 flex-1"
          data-testid="shared-bidding-workbench-body"
          style={workbenchBodyStyle}
        >
          <Outlet />
        </div>
      </div>
    </ScaledPageCanvas>
  );
};
