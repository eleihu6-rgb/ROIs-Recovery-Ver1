import {
  ArrowLeftStartOnRectangleIcon,
  Bars3BottomLeftIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import avatarSrc from "@/assets/images/avatar.png";
import loginLogoSrc from "@/assets/images/login-logo.png";
import type { TopNavItem } from "@/shared/constants/top-nav-items";

type MobileTopNavProps = {
  displayName: string;
  items: TopNavItem[];
  envBadge?: ReactNode;
  onRequestLogout: () => void;
};

const isItemActive = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

export const MobileTopNav = ({
  displayName,
  items,
  envBadge,
  onRequestLogout,
}: MobileTopNavProps) => {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const activeItem = items.find((item) => isItemActive(location.pathname, item.path));

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <>
      <header
        className="relative z-40 flex h-14 w-full shrink-0 items-center gap-3 bg-[#24272d] px-3 text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        data-mobile-nav="true"
        data-testid="dashboard-top-nav"
        data-uiid="dashboard-top-nav"
      >
        <img alt="Flair Airlines" className="h-7 w-auto max-w-[110px] object-contain" src={loginLogoSrc} />
        <span className="min-w-0 truncate text-sm font-semibold text-white/85">
          {activeItem?.label ?? "ROIS Crew"}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {envBadge}
          <img alt="" className="h-7 w-7 rounded-full object-cover" src={avatarSrc} />
          <button
            aria-expanded={isMenuOpen ? "true" : "false"}
            aria-label="Open navigation menu"
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            data-testid="mobile-nav-trigger"
            type="button"
            onClick={() => setIsMenuOpen(true)}
          >
            <Bars3BottomLeftIcon className="h-6 w-6" />
          </button>
        </div>
      </header>

      {isMenuOpen ? (
        <div className="fixed inset-0 z-[80]" data-testid="mobile-nav-drawer">
          <button
            aria-label="Close navigation menu"
            className="absolute inset-0 cursor-default bg-black/45"
            type="button"
            onClick={() => setIsMenuOpen(false)}
          />
          <aside
            aria-label="Portal navigation"
            className="absolute inset-y-0 right-0 flex w-[min(320px,88vw)] flex-col bg-[#24272d] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 text-white shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold uppercase tracking-[0.08em] text-white/60">
                ROIS CREW
              </span>
              <button
                aria-label="Close navigation menu"
                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
                type="button"
                onClick={() => setIsMenuOpen(false)}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-3">
              <img alt="" className="h-10 w-10 rounded-full object-cover" src={avatarSrc} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="mt-0.5 text-xs text-white/55">Crew portal</p>
              </div>
            </div>

            <nav aria-label="Portal sections" className="mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {items.map((item) => (
                <NavLink
                  key={item.key}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center rounded-2xl px-3 text-base font-semibold transition ${
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-[#c9ccd4] hover:bg-white/5 hover:text-white"
                    }`
                  }
                  data-testid={`mobile-nav-link-${item.key}`}
                  to={item.path}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <button
              className="mt-4 flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/10 px-3 text-left text-sm font-semibold text-white/80 transition hover:bg-white/5 hover:text-white"
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onRequestLogout();
              }}
            >
              <ArrowLeftStartOnRectangleIcon className="h-5 w-5" />
              Log out
            </button>
          </aside>
        </div>
      ) : null}
    </>
  );
};
