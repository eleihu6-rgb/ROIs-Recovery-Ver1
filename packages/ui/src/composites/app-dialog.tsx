import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "../lib/utils";

/**
 * AppDialog — the project-wide standard pop-up window.
 *
 * Every application pop-up MUST use this component so the whole platform shares
 * a single window chrome. The standard (see root CLAUDE.md「弹窗窗口标准」):
 *
 *   1. An icon sits in the top-left corner of the title bar.
 *   2. The title bar uses the primary (blue) background with white title text.
 *   3. A close button sits in the top-right corner.
 *   4. All action buttons sit at the bottom-right (the `footer`).
 *   5. The window is movable by dragging the title bar.
 *   6. Opt-in: the window is resizable by dragging edges/corners (`resizable`).
 *
 * Built directly on the Radix Dialog primitives (the same primitives `Dialog`
 * exports) so it stays "the one dialog" — do not introduce Modal/Drawer
 * substitutes.
 */
export interface AppDialogProps {
  /** Controlled open state. */
  open: boolean;
  /** Open-state change handler (close button, overlay click, Esc). */
  onOpenChange: (open: boolean) => void;
  /** White title text shown in the blue title bar. */
  title: React.ReactNode;
  /** Icon shown in the top-left corner of the title bar. */
  icon?: React.ReactNode;
  /** Optional muted description rendered at the top of the body. */
  description?: React.ReactNode;
  /** Action buttons — rendered bottom-right. Omit for a footer-less window. */
  footer?: React.ReactNode;
  /** Window body. */
  children?: React.ReactNode;
  /** Extra classes for the window container (width etc., e.g. `sm:max-w-[540px]`). */
  className?: string;
  /** Extra classes for the dimming overlay (default is `bg-black/25`). */
  overlayClassName?: string;
  /** Extra classes for the scrollable body region. */
  bodyClassName?: string;
  /** Extra classes for the footer action bar (e.g. compact `py-1`). */
  footerClassName?: string;
  /** Allow dragging the window by its title bar. Default `true`. */
  draggable?: boolean;
  /**
   * Allow resizing via edge/corner handles. Default `false` (opt-in).
   * Size resets each time the dialog opens (same as drag offset).
   */
  resizable?: boolean;
  /** Show the top-right close button. Default `true`. */
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
          {/* 1+2+3 — blue title bar: icon (left), white title, close (right). Doubles as the drag handle. */}
          <div
            data-app-dialog-header
            onPointerDown={handlePointerDown}
            className={cn(
              "flex shrink-0 select-none items-center gap-2 bg-primary px-4 py-2.5 text-primary-foreground",
              draggable ? "cursor-move" : "cursor-default",
            )}
          >
            {icon && (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-primary-foreground">
                {icon}
              </span>
            )}
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              {title}
            </DialogPrimitive.Title>
            {showClose && (
              <DialogPrimitive.Close
                data-no-drag
                data-testid={testId ? `${testId}-close` : undefined}
                aria-label="Close"
                className="relative z-30 -mr-1 rounded-sm p-0.5 text-primary-foreground opacity-80 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-primary-foreground/60"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            )}
          </div>

          {/* Body */}
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>
            {description && (
              <DialogPrimitive.Description className="mb-3 text-xs text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            )}
            {children}
          </div>

          {/* 4 — footer: all action buttons bottom-right. */}
          {footer && (
            <div className={cn("flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3", footerClassName)}>
              {footer}
            </div>
          )}
          </div>

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
