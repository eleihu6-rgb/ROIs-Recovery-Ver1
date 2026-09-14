import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Info, TriangleAlert, X } from "lucide-react";

import { cn } from "../lib/utils";

/**
 * AppDialog — the project-wide standard pop-up window.
 *
 * Every application pop-up MUST use this component so the whole platform shares
 * a single window chrome. The standard (see root CLAUDE.md「弹窗窗口标准」 and
 * docs/superpowers/specs/2026-09-13-app-popup-standard-status-card-Ver1.md):
 *
 *   1. A tone band (primary for neutral, green/yellow/red for status) tops the
 *      window and carries the state glyph.
 *   2. The glyph is an outline circle — centred and large in `status` (message
 *      and confirmation pop-ups), a small badge left of the title in `panel`
 *      (data-entry pop-ups, where information density wins).
 *   3. Actions are pills at the end of the body (no footer bar): Cancel as an
 *      outline pill, the primary action as a filled pill.
 *   4. A white circular close disc straddles the top-right corner.
 *   5. The window is movable by dragging the band.
 *   6. Opt-in: the window is resizable by dragging edges/corners (`resizable`).
 *
 * Built directly on the Radix Dialog primitives (the same primitives `Dialog`
 * exports) so it stays "the one dialog" — do not introduce Modal/Drawer
 * substitutes.
 */
export type AppDialogTone = "neutral" | "success" | "warning" | "destructive";

export interface AppDialogProps {
  /** Controlled open state. */
  open: boolean;
  /** Open-state change handler (close button, overlay click, Esc). */
  onOpenChange: (open: boolean) => void;
  /** Title. White in the band for `panel`; centred body heading for `status`. */
  title: React.ReactNode;
  /** Glyph shown in the band circle. Defaults to the tone's own glyph. */
  icon?: React.ReactNode;
  /** Optional muted description (top of the body, or centred under a status title). */
  description?: React.ReactNode;
  /** Action buttons — rendered as a centred pill row after the body. */
  footer?: React.ReactNode;
  /** Window body. */
  children?: React.ReactNode;
  /**
   * `panel` (default) keeps the dense data-entry layout: title in the band.
   * `status` is the message/confirmation layout: big centred glyph, centred
   * title + message. Use `status` for anything that only reports an outcome.
   */
  variant?: "status" | "panel";
  /** Semantic colour of the band. Never brand — it describes the outcome. */
  tone?: AppDialogTone;
  /** Extra classes for the window container (width etc., e.g. `sm:max-w-[540px]`). */
  className?: string;
  /** Extra classes for the dimming overlay (default is `bg-black/25`). */
  overlayClassName?: string;
  /** Extra classes for the scrollable body region. */
  bodyClassName?: string;
  /** Extra classes for the pill action row (e.g. the compact `py-1`). */
  footerClassName?: string;
  /** Allow dragging the window by its tone band. Default `true`. */
  draggable?: boolean;
  /**
   * Allow resizing via edge/corner handles. Default `false` (opt-in).
   * Size resets each time the dialog opens (same as drag offset).
   */
  resizable?: boolean;
  /** Show the top-right close disc. Default `true`. */
  showClose?: boolean;
  /** Close when clicking the overlay / pressing Esc. Default `true`. */
  dismissable?: boolean;
  /**
   * Modal (default `true`): renders a dimming overlay, traps focus, and blocks
   * interaction with the rest of the app. Set `false` for a navigator-style window
   * that drives the content behind it — no dim, background stays visible & interactive.
   */
  modal?: boolean;
  /** Forwarded to the window container for e2e selectors. */
  "data-testid"?: string;
}

interface DragRef {
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
}

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface ResizeRef {
  edge: ResizeEdge;
  startX: number;
  startY: number;
  baseW: number;
  baseH: number;
  baseOx: number;
  baseOy: number;
}

interface SizeState {
  width: number;
  height: number;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;
/** Leave a small margin so the window does not flush against the viewport edge. */
const VIEWPORT_MARGIN_PX = 16;

/** Band colour per tone. Literal classes so Tailwind keeps them in the build. */
const TONE_BAND: Record<AppDialogTone, string> = {
  neutral: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  destructive: "bg-destructive text-destructive-foreground",
};

/**
 * Default outline glyph per tone — the reference's check / cross, extended with
 * info and warning so every tone reads at a glance without a caller icon.
 */
const ToneGlyph = ({ tone }: { tone: AppDialogTone }): React.ReactElement => {
  if (tone === "success") return <Check className="h-full w-full" strokeWidth={2} />;
  if (tone === "destructive") return <X className="h-full w-full" strokeWidth={2} />;
  if (tone === "warning") return <TriangleAlert className="h-full w-full" strokeWidth={2} />;
  return <Info className="h-full w-full" strokeWidth={2} />;
};

const viewportMaxSize = (): { maxW: number; maxH: number } => ({
  maxW: Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN_PX * 2),
  maxH: Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN_PX * 2),
});

/**
 * Nested portaled layers (Radix Select / Menu / Popover) set body + lower
 * dismissable layers to `pointer-events: none`. Clicks on the Select trigger
 * (inside the dialog) then fall through onto the dialog overlay and look like
 * an "outside" interaction, which would close the whole window while the user
 * only meant to collapse the dropdown.
 *
 * Ignore outside dismiss when:
 * 1. the event landed on portaled floating content, or
 * 2. a nested floating layer is currently open (fall-through onto overlay).
 */
const NESTED_FLOATING_LAYER_SELECTOR = [
  '[role="listbox"]',
  '[role="menu"]',
  '[data-radix-menu-content]',
  '[data-radix-dropdown-menu-content]',
  '[data-radix-popover-content]',
  '[data-radix-popper-content-wrapper]',
].join(",");

const NESTED_FLOATING_LAYER_OR_VIEWPORT_SELECTOR = [
  NESTED_FLOATING_LAYER_SELECTOR,
  '[data-radix-select-viewport]',
].join(",");

const hasNestedFloatingLayer = (): boolean =>
  Boolean(document.querySelector(NESTED_FLOATING_LAYER_SELECTOR));

const shouldIgnoreOutsideInteraction = (event: Event): boolean => {
  const target = event.target;
  if (target instanceof Element) {
    if (target.closest(NESTED_FLOATING_LAYER_OR_VIEWPORT_SELECTOR)) {
      return true;
    }
  }

  // Match presence (not only data-state=open): Select may flip to closed in the
  // same pointerdown that would otherwise dismiss the dialog.
  return hasNestedFloatingLayer();
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const RESIZE_HANDLES: Array<{
  edge: ResizeEdge;
  className: string;
  cursor: string;
  testId: string;
}> = [
  { edge: "n", className: "left-3 right-3 top-0 h-2", cursor: "ns-resize", testId: "app-dialog-resize-n" },
  { edge: "s", className: "left-3 right-3 bottom-0 h-2", cursor: "ns-resize", testId: "app-dialog-resize-s" },
  { edge: "e", className: "top-3 bottom-3 right-0 w-2", cursor: "ew-resize", testId: "app-dialog-resize-e" },
  { edge: "w", className: "top-3 bottom-3 left-0 w-2", cursor: "ew-resize", testId: "app-dialog-resize-w" },
  { edge: "ne", className: "right-0 top-0 h-3.5 w-3.5", cursor: "nesw-resize", testId: "app-dialog-resize-ne" },
  { edge: "nw", className: "left-0 top-0 h-3.5 w-3.5", cursor: "nwse-resize", testId: "app-dialog-resize-nw" },
  { edge: "se", className: "right-0 bottom-0 h-3.5 w-3.5", cursor: "nwse-resize", testId: "app-dialog-resize-se" },
  { edge: "sw", className: "left-0 bottom-0 h-3.5 w-3.5", cursor: "nesw-resize", testId: "app-dialog-resize-sw" },
];

export const AppDialog = ({
  open,
  onOpenChange,
  title,
  icon,
  description,
  footer,
  children,
  className,
  overlayClassName,
  bodyClassName,
  footerClassName,
  draggable = true,
  resizable = false,
  showClose = true,
  dismissable = true,
  modal = true,
  variant = "panel",
  tone = "neutral",
  "data-testid": testId,
}: AppDialogProps): React.ReactElement => {
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [size, setSize] = React.useState<SizeState | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragRef | null>(null);
  const resizeRef = React.useRef<ResizeRef | null>(null);
  const isResizingRef = React.useRef(false);
  /** Block overlay-dismiss briefly after a resize (Radix fires outside on pointerup). */
  const resizeDismissGuardUntilRef = React.useRef(0);
  const offsetRef = React.useRef(offset);
  offsetRef.current = offset;
  const nestedLayerPointerDownRef = React.useRef(false);
  const nestedLayerPointerDownTimerRef = React.useRef<number | null>(null);

  // Re-center + reset size every time it opens — drags/resizes never persist across opens.
  React.useEffect(() => {
    if (open) {
      setOffset({ x: 0, y: 0 });
      setSize(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      nestedLayerPointerDownRef.current = false;
      if (nestedLayerPointerDownTimerRef.current !== null) {
        window.clearTimeout(nestedLayerPointerDownTimerRef.current);
        nestedLayerPointerDownTimerRef.current = null;
      }
      return;
    }

    const captureNestedLayerPointerDown = (): void => {
      nestedLayerPointerDownRef.current = hasNestedFloatingLayer();
      if (nestedLayerPointerDownTimerRef.current !== null) {
        window.clearTimeout(nestedLayerPointerDownTimerRef.current);
        nestedLayerPointerDownTimerRef.current = null;
      }
      if (nestedLayerPointerDownRef.current) {
        nestedLayerPointerDownTimerRef.current = window.setTimeout(() => {
          nestedLayerPointerDownRef.current = false;
          nestedLayerPointerDownTimerRef.current = null;
        }, 250);
      }
    };

    document.addEventListener("pointerdown", captureNestedLayerPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", captureNestedLayerPointerDown, true);
      if (nestedLayerPointerDownTimerRef.current !== null) {
        window.clearTimeout(nestedLayerPointerDownTimerRef.current);
        nestedLayerPointerDownTimerRef.current = null;
      }
    };
  }, [open]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!draggable) return;
    // Don't start a drag from the close button (or anything opting out).
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;

    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };

    const handleMove = (ev: PointerEvent | MouseEvent): void => {
      const d = dragRef.current;
      if (!d) return;
      setOffset({ x: d.baseX + (ev.clientX - d.startX), y: d.baseY + (ev.clientY - d.startY) });
    };
    const handleUp = (): void => {
      dragRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const handleResizePointerDown = (edge: ResizeEdge) => (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    const el = contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ox = offsetRef.current.x;
    const oy = offsetRef.current.y;
    isResizingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = {
      edge,
      startX: e.clientX,
      startY: e.clientY,
      baseW: rect.width,
      baseH: rect.height,
      baseOx: ox,
      baseOy: oy,
    };

    const handleMove = (ev: PointerEvent | MouseEvent): void => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      // Edge-aware caps: allow filling remaining viewport from the fixed opposite edge,
      // instead of a flat 85vh that leaves empty space below a centered dialog.
      const startLeft = window.innerWidth / 2 + r.baseOx - r.baseW / 2;
      const startTop = window.innerHeight / 2 + r.baseOy - r.baseH / 2;
      const startRight = startLeft + r.baseW;
      const startBottom = startTop + r.baseH;
      const maxByViewport = viewportMaxSize();

      let nextW = r.baseW;
      let nextH = r.baseH;
      let nextOx = r.baseOx;
      let nextOy = r.baseOy;

      const east = r.edge.includes("e");
      const west = r.edge.includes("w");
      const south = r.edge.includes("s");
      const north = r.edge.includes("n");

      if (east) {
        const maxW = Math.min(maxByViewport.maxW, window.innerWidth - startLeft - VIEWPORT_MARGIN_PX);
        nextW = clamp(r.baseW + dx, MIN_WIDTH, maxW);
        nextOx = r.baseOx + (nextW - r.baseW) / 2;
      } else if (west) {
        const maxW = Math.min(maxByViewport.maxW, startRight - VIEWPORT_MARGIN_PX);
        nextW = clamp(r.baseW - dx, MIN_WIDTH, maxW);
        nextOx = r.baseOx + (r.baseW - nextW) / 2;
      }

      if (south) {
        const maxH = Math.min(maxByViewport.maxH, window.innerHeight - startTop - VIEWPORT_MARGIN_PX);
        nextH = clamp(r.baseH + dy, MIN_HEIGHT, maxH);
        nextOy = r.baseOy + (nextH - r.baseH) / 2;
      } else if (north) {
        const maxH = Math.min(maxByViewport.maxH, startBottom - VIEWPORT_MARGIN_PX);
        nextH = clamp(r.baseH - dy, MIN_HEIGHT, maxH);
        nextOy = r.baseOy + (r.baseH - nextH) / 2;
      }

      setSize({ width: nextW, height: nextH });
      setOffset({ x: nextOx, y: nextOy });
    };

    const handleUp = (): void => {
      resizeRef.current = null;
      // Keep dismiss blocked until after Radix processes this pointerup-on-overlay.
      resizeDismissGuardUntilRef.current = performance.now() + 300;
      isResizingRef.current = false;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const isResizeDismissGuarded = (): boolean =>
    isResizingRef.current || performance.now() < resizeDismissGuardUntilRef.current;

  const handleOutside = (e: Event): void => {
    if (
      !dismissable
      || isResizeDismissGuarded()
      || nestedLayerPointerDownRef.current
      || shouldIgnoreOutsideInteraction(e)
    ) {
      e.preventDefault();
    }
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    // Outside/fall-through interactions are filtered by handleOutside. Do not
    // block explicit title-bar Close or Escape here just because another page
    // layer exists; doing so leaves the dialog visibly stuck open.
    onOpenChange(nextOpen);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal={modal}>
      <DialogPrimitive.Portal>
        {/* Modal windows dim + block the background; non-modal navigators leave it
            visible and interactive so the user can watch the panes update. */}
        {modal && (
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-0 z-50 bg-black/25 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              overlayClassName,
            )}
          />
        )}
        <DialogPrimitive.Content
          ref={contentRef}
          data-testid={testId}
          // Radix requires a description link; when we render none, tell it so to
          // avoid the dev-only "Missing Description" warning.
          {...(description ? {} : { "aria-describedby": undefined })}
          onPointerDownOutside={handleOutside}
          onInteractOutside={handleOutside}
          onFocusOutside={(e) => {
            // Nested portaled layers steal focus; do not dismiss the dialog for that.
            if (!dismissable || shouldIgnoreOutsideInteraction(e)) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            // A nested floating layer (e.g. a crew-select dropdown, Radix Select)
            // must get the first Escape — ESC collapses it, not the whole dialog.
            if (!dismissable || hasNestedFloatingLayer()) e.preventDefault();
          }}
          // Centered, then offset by the live drag delta. Inline transform/size are
          // the allowed dynamic styles (same exception as drag positioning).
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            ...(size
              ? {
                  width: size.width,
                  height: size.height,
                  maxWidth: "none",
                  maxHeight: "none",
                }
              : {}),
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-visible rounded-lg border border-border bg-background shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            className,
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg">
          {/* 1+2 — tone band: neutral/status colour, state glyph, drag handle.
              `panel` keeps the dense header (badge glyph + title inline);
              `status` is the reference layout (big centred glyph only). */}
          <div
            data-app-dialog-header
            onPointerDown={handlePointerDown}
            className={cn(
              "flex shrink-0 select-none",
              TONE_BAND[tone],
              variant === "status"
                ? "h-28 items-center justify-center px-4"
                : "items-center gap-2 px-4 py-2.5",
              draggable ? "cursor-move" : "cursor-default",
            )}
          >
            {variant === "status" ? (
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-current p-3"
                data-testid={testId ? `${testId}-glyph` : undefined}
              >
                {icon ?? <ToneGlyph tone={tone} />}
              </span>
            ) : (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current p-1.5">
                  {icon ?? <ToneGlyph tone={tone} />}
                </span>
                <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
                  {title}
                </DialogPrimitive.Title>
              </>
            )}
          </div>

          {/* Body */}
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto px-5 py-4",
              variant === "status" && "text-center",
              bodyClassName,
            )}
          >
            {variant === "status" && (
              <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                {title}
              </DialogPrimitive.Title>
            )}
            {description && (
              <DialogPrimitive.Description
                className={cn(
                  "text-xs text-muted-foreground",
                  variant === "status" ? "mt-2" : "mb-3",
                )}
              >
                {description}
              </DialogPrimitive.Description>
            )}
            {children}
          </div>

          {/* 3 — actions: centred pill row at the end of the body (no footer bar). */}
          {footer && (
            <div
              data-app-dialog-actions
              className={cn(
                "flex shrink-0 flex-wrap items-center justify-center gap-2 px-5 pb-4 pt-1",
                "[&_button]:rounded-full [&_button]:px-6",
                footerClassName,
              )}
            >
              {footer}
            </div>
          )}
          </div>

          {/* 4 — close disc straddling the top-right corner (outside the clipped
              wrapper so it can overhang the card). */}
          {showClose && (
            <DialogPrimitive.Close
              data-no-drag
              data-testid={testId ? `${testId}-close` : undefined}
              aria-label="Close"
              className="absolute -right-3.5 -top-3.5 z-40 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            </DialogPrimitive.Close>
          )}

          {resizable &&
            RESIZE_HANDLES.map((h) => (
              <div
                key={h.edge}
                data-no-drag
                data-testid={h.testId}
                aria-hidden
                onPointerDown={handleResizePointerDown(h.edge)}
                className={cn("absolute z-20 touch-none", h.className)}
                style={{ cursor: h.cursor }}
              />
            ))}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
AppDialog.displayName = "AppDialog";
