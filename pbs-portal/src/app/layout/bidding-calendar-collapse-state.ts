import { useCallback, useEffect, useState } from "react";

export const BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY = "pbs.workbench.biddingCalendarCollapsed";

const BIDDING_CALENDAR_MOTION = "400ms cubic-bezier(0.22, 1, 0.36, 1)";

export const BIDDING_CALENDAR_LAYOUT_TRANSITION = `gap ${BIDDING_CALENDAR_MOTION}`;
export const BIDDING_CALENDAR_PANEL_TRANSITION = `width ${BIDDING_CALENDAR_MOTION}, flex-basis ${BIDDING_CALENDAR_MOTION}`;
export const BIDDING_CALENDAR_BODY_TRANSITION = `padding-left ${BIDDING_CALENDAR_MOTION}`;
export const BIDDING_CALENDAR_CONTENT_TRANSITION = `transform ${BIDDING_CALENDAR_MOTION}`;

const readPersistedBiddingCalendarCollapsed = () => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const writePersistedBiddingCalendarCollapsed = (collapsed: boolean) => {
  try {
    window.localStorage.setItem(
      BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY,
      collapsed ? "true" : "false",
    );
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
  }
};

export const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    if (!mediaQuery) {
      return;
    }

    const handleChange = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return prefersReducedMotion;
};

export const usePersistentBiddingCalendarCollapse = () => {
  const [isBiddingCalendarCollapsed, setIsBiddingCalendarCollapsed] = useState(
    readPersistedBiddingCalendarCollapsed,
  );
  const setBiddingCalendarCollapsed = useCallback((collapsed: boolean) => {
    setIsBiddingCalendarCollapsed(collapsed);
    writePersistedBiddingCalendarCollapsed(collapsed);
  }, []);

  return {
    isBiddingCalendarCollapsed,
    setBiddingCalendarCollapsed,
  };
};
