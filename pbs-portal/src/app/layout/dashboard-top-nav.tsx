import {
  ArrowLeftStartOnRectangleIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import avatarSrc from "@/assets/images/avatar.png";
import topbarSrc from "@/assets/images/login-topbar.png";
import { clearAuthReturnTo } from "@/app/router/auth-return-to";
import {
  BASE_MENU_WIDTH,
  MENU_ITEM_GAP,
  MENU_LEFT,
  MENU_RIGHT_RESERVED,
  OVERFLOW_GAP,
  OVERFLOW_TRIGGER_WIDTH,
  useDashboardHeaderLayout,
} from "@/app/layout/use-dashboard-header-layout";
import { UIInspectorOverlay } from "@/shared/components/dev/ui-inspector-overlay";
import { isUiInspectorAvailable } from "@/shared/config/dev-tools";
import { Button } from "@/shared/components/ui/button";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";
import type { TopNavItem } from "@/shared/constants/top-nav-items";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";
import { PBS_APP_VERSION } from "@/version";

const ENV_BADGE_STYLES: Record<string, string> = {
  PROD: "bg-red-600 text-white",
  UAT:  "bg-amber-500 text-black",
  SIT:  "bg-blue-600 text-white",
  DEV:  "bg-slate-500 text-white",
}
const APP_ENV = import.meta.env.VITE_APP_ENV ?? "DEV"

type DashboardTopNavProps = {
  displayName: string;
  items: TopNavItem[];
};

export const DashboardTopNav = ({
  displayName,
  items,
}: DashboardTopNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthSessionStore((state) => state.logout);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [overflowMenuPosition, setOverflowMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [actionsReservedWidth, setActionsReservedWidth] = useState(MENU_RIGHT_RESERVED);
  const [isUiInspectorEnabled, setIsUiInspectorEnabled] = useState(false);
  const overflowButtonRef = useRef<HTMLButtonElement | null>(null);
  const overflowMenuRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const { headerHeightPx, scale, visibleCount } = useDashboardHeaderLayout(items.length, actionsReservedWidth);
  const showUiInspector = isUiInspectorAvailable();

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const overflowItems = useMemo(() => items.slice(visibleCount), [items, visibleCount]);

  const updateOverflowMenuPosition = useCallback(() => {
    const trigger = overflowButtonRef.current;

    if (!trigger) {
      setOverflowMenuPosition(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 180;
    const viewportPadding = 8;
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
    );

    setOverflowMenuPosition({
      left,
      top: rect.bottom + viewportPadding,
    });
  }, []);

  useEffect(() => {
    setShowOverflowMenu(false);
    setOverflowMenuPosition(null);
  }, [location.pathname]);

  useEffect(() => {
    const actions = actionsRef.current;

    if (!actions) {
      return undefined;
    }

    const updateActionsReservedWidth = () => {
      const width = actions.getBoundingClientRect().width;
      const rightInset = 32;
      const safetyGap = 16;
      setActionsReservedWidth(Math.max(MENU_RIGHT_RESERVED, Math.ceil(width + rightInset + safetyGap)));
    };

    updateActionsReservedWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateActionsReservedWidth);
      return () => {
        window.removeEventListener("resize", updateActionsReservedWidth);
      };
    }

    const observer = new ResizeObserver(updateActionsReservedWidth);
    observer.observe(actions);
    window.addEventListener("resize", updateActionsReservedWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateActionsReservedWidth);
    };
  }, [displayName, showUiInspector]);

  useEffect(() => {
    if (!overflowItems.length) {
      setShowOverflowMenu(false);
      setOverflowMenuPosition(null);
    }
  }, [overflowItems.length]);

  useEffect(() => {
    if (!showOverflowMenu) {
      return undefined;
    }

    const handleViewportChange = () => {
      updateOverflowMenuPosition();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [showOverflowMenu, updateOverflowMenuPosition]);

  useEffect(() => {
    if (!showOverflowMenu) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (overflowButtonRef.current?.contains(target) || overflowMenuRef.current?.contains(target)) {
        return;
      }

      setShowOverflowMenu(false);
      setOverflowMenuPosition(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowOverflowMenu(false);
        setOverflowMenuPosition(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showOverflowMenu]);

  useEffect(() => {
    if (!showUiInspector && isUiInspectorEnabled) {
      setIsUiInspectorEnabled(false);
    }
  }, [isUiInspectorEnabled, showUiInspector]);

  const handleLogout = async () => {
    clearAuthReturnTo();
    await logout();
    setShowLogoutConfirm(false);
    navigate("/login", { replace: true });
  };

  const isActive = (path: string) =>
    location.pathname === path
    || location.pathname.startsWith(`${path}/`)
    || (path === "/404" && location.pathname === "/404");

  const navigateToItem = (path: string) => {
    setShowOverflowMenu(false);
    setOverflowMenuPosition(null);
    navigate(path);
  };

  const handleOverflowToggle = () => {
    setShowOverflowMenu((current) => {
      if (current) {
        setOverflowMenuPosition(null);
        return false;
      }

      updateOverflowMenuPosition();
      return true;
    });
  };

  return (
    <>
      {showUiInspector ? <UIInspectorOverlay enabled={isUiInspectorEnabled} /> : null}
      <header
        className="fixed inset-x-0 top-0 z-50 w-full overflow-hidden bg-[#24272d] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        data-uiid="dashboard-top-nav"
        data-testid="dashboard-top-nav"
        style={{ height: headerHeightPx }}
      >
        <div
          className="pointer-events-none absolute left-0 top-0 h-20 w-[1920px] origin-top-left"
          data-testid="dashboard-top-nav-canvas"
          style={{ transform: `scale(${scale})` }}
        >
          <img
            alt="Flair Airlines"
            className="absolute -bottom-px left-0 block h-[81px] w-auto max-w-none object-left"
            src={topbarSrc}
          />

          <div
            className="absolute left-0 top-0 flex h-20 items-stretch overflow-hidden"
            data-uiid="dashboard-top-nav-menu"
            style={{ left: `${MENU_LEFT}px`, width: `${BASE_MENU_WIDTH}px` }}
          >
            <nav aria-label="Portal sections" className="flex h-full shrink-0 items-stretch overflow-hidden">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.key}
                  className={`pointer-events-auto group relative flex h-full shrink-0 items-center rounded-sm border-none bg-transparent px-0 outline-none transition-colors ${
                    item.key === visibleItems[visibleItems.length - 1]?.key ? "" : `mr-[${MENU_ITEM_GAP}px]`
                  }`}
                  style={{
                    marginRight:
                      item.key === visibleItems[visibleItems.length - 1]?.key ? 0 : `${MENU_ITEM_GAP}px`,
                  }}
                  to={item.path}
                >
                  <span
                    className={`text-lg leading-[25px] transition-colors [text-shadow:0_3px_6px_rgba(0,0,0,1)] ${
                      isActive(item.path)
                        ? "font-bold text-white"
                        : "font-semibold text-[#BBBBBB] group-hover:text-white group-focus:text-white"
                    }`}
                  >
                    {item.label}
                  </span>
                  {isActive(item.path) ? (
                    <span className="absolute bottom-0 left-0 h-1 w-full bg-[#706cd5]" />
                  ) : null}
                </NavLink>
              ))}
            </nav>

            {overflowItems.length ? (
              <div className="pointer-events-auto relative z-10 flex h-full shrink-0 items-center">
                <button
                  ref={overflowButtonRef}
                  aria-controls="dashboard-top-nav-overflow-menu"
                  aria-expanded={showOverflowMenu ? "true" : "false"}
                  aria-haspopup="menu"
                  aria-label="More navigation"
                  className="flex h-full cursor-pointer items-center justify-center rounded-md border-none bg-transparent px-0 text-[#BBBBBB] outline-none transition hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white"
                  data-testid="dashboard-top-nav-overflow-trigger"
                  style={{ marginLeft: `${OVERFLOW_GAP}px`, width: `${OVERFLOW_TRIGGER_WIDTH}px` }}
                  type="button"
                  onClick={handleOverflowToggle}
                >
                  <EllipsisHorizontalIcon className="h-6 w-6" />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div
          ref={actionsRef}
          className="pointer-events-auto absolute right-8 top-0 flex h-full items-center gap-3 text-white"
          data-uiid="dashboard-top-nav-actions"
        >
          {APP_ENV && ENV_BADGE_STYLES[APP_ENV] && (
            <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${ENV_BADGE_STYLES[APP_ENV]}`}>
              {APP_ENV}
            </span>
          )}

          <span
            className="select-none font-mono tabular-nums text-xs text-white/35"
            data-testid="pbs-version-badge"
          >
            {PBS_APP_VERSION}
          </span>

          {showUiInspector ? (
            <button
              aria-label="Toggle UI Inspector"
              className={`flex h-7 w-7 items-center justify-center rounded-xl border transition ${
                isUiInspectorEnabled
                  ? "border-[#706cd5] bg-[#706cd5] text-white"
                  : "border-white/20 bg-transparent text-white/70 hover:border-white/45 hover:text-white"
              } cursor-pointer`}
              title="UI Inspector"
              type="button"
              onClick={() => setIsUiInspectorEnabled((current) => !current)}
            >
              <MagnifyingGlassIcon className="h-4 w-4 stroke-[1.8]" />
            </button>
          ) : null}
          <button
            aria-label="Log out"
            className="flex h-[22px] w-[22px] cursor-pointer items-center justify-center"
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
          >
            <ArrowLeftStartOnRectangleIcon className="h-5 w-5 stroke-[1.8]" />
          </button>
          <img alt="" className="h-6 w-6 rounded-full object-cover" src={avatarSrc} />
          <span className="text-sm font-medium leading-[18px]">{displayName}</span>
        </div>
      </header>
      {showOverflowMenu && overflowItems.length && overflowMenuPosition ? (
        <div
          ref={overflowMenuRef}
          aria-label="More navigation"
          className="fixed z-[70] min-w-[180px] rounded-3xl border border-white/10 bg-[#2b2f36] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.28)]"
          data-testid="dashboard-top-nav-overflow-menu"
          id="dashboard-top-nav-overflow-menu"
          role="menu"
          style={{
            left: `${overflowMenuPosition.left}px`,
            top: `${overflowMenuPosition.top}px`,
          }}
        >
          {overflowItems.map((item) => (
            <button
              key={`overflow-${item.key}`}
              className={`flex w-full cursor-pointer select-none items-center rounded-2xl px-3 py-2 text-left text-sm leading-5 outline-none ${
                isActive(item.path)
                  ? "bg-white/10 font-semibold text-white"
                  : "text-[#d2d4db] hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white"
              }`}
              role="menuitem"
              type="button"
              onClick={() => navigateToItem(item.path)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {showLogoutConfirm ? (
        <PbsDialogFrame
          ariaLabel="Log out of ROIS Crew"
          bodyClassName="p-0"
          closeOnOverlayClick
          footerClassName="mt-6 flex justify-end gap-3"
          overlayClassName="z-[60] bg-black/45"
          panelClassName="w-full max-w-[420px] rounded-4xl border-white/10 bg-[#2b2f36] p-6 text-white shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
          footer={(
            <>
              <Button
                className="h-10 rounded-3xl border border-white/15 bg-transparent px-4 text-sm font-medium text-white hover:bg-white/5"
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                className="h-10 rounded-3xl bg-[#706cd5] px-4 text-sm font-semibold text-white hover:bg-[#615ec1]"
                type="button"
                onClick={() => void handleLogout()}
              >
                Log Out
              </Button>
            </>
          )}
          onClose={() => setShowLogoutConfirm(false)}
        >
          <h2 className="text-xl font-semibold leading-7">Log out of ROIS Crew?</h2>
          <p className="mt-2 text-sm leading-6 text-[#d2d4db]">
            You will return to the login page and need to sign in again to keep working.
          </p>
        </PbsDialogFrame>
      ) : null}
    </>
  );
};
