import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/lib/cn";

type PbsDialogFrameProps = {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  bodyClassName?: string;
  children: ReactNode;
  closeDisabled?: boolean;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  footer?: ReactNode;
  footerClassName?: string;
  header?: ReactNode;
  overlayClassName?: string;
  overlayTestId?: string;
  panelClassName?: string;
  portalTarget?: Element | null;
  portalToBody?: boolean;
  testId?: string;
  onClose?: () => void;
};

let lockCount = 0;
let previousBodyOverflow = "";
let previousHtmlOverflow = "";
let dialogIdSeed = 0;
const openDialogStack: number[] = [];
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const listFocusableElements = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.getAttribute("aria-hidden") !== "true");

const lockDocumentScroll = () => {
  if (lockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }

  lockCount += 1;
};

const unlockDocumentScroll = () => {
  lockCount = Math.max(0, lockCount - 1);

  if (lockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousHtmlOverflow;
  }
};

export const PbsDialogFrame = ({
  ariaLabel,
  ariaLabelledBy,
  bodyClassName,
  children,
  closeDisabled = false,
  closeOnEscape = true,
  closeOnOverlayClick = false,
  footer,
  footerClassName,
  header,
  overlayClassName,
  overlayTestId,
  panelClassName,
  portalTarget,
  portalToBody = false,
  testId,
  onClose,
}: PbsDialogFrameProps) => {
  const dialogIdRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const usesPortal = portalToBody || Boolean(portalTarget);

  if (dialogIdRef.current === null) {
    dialogIdSeed += 1;
    dialogIdRef.current = dialogIdSeed;
  }

  useEffect(() => {
    lockDocumentScroll();
    openDialogStack.push(dialogIdRef.current!);

    return () => {
      const currentId = dialogIdRef.current;
      const stackIndex = currentId === null ? -1 : openDialogStack.lastIndexOf(currentId);
      if (stackIndex >= 0) {
        openDialogStack.splice(stackIndex, 1);
      }
      unlockDocumentScroll();
    };
  }, []);

  useEffect(() => {
    if (!closeOnEscape || !onClose) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const isTopDialog = openDialogStack.at(-1) === dialogIdRef.current;
      if (event.key !== "Escape" || closeDisabled || !isTopDialog) {
        return;
      }

      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDisabled, closeOnEscape, onClose]);

  useEffect(() => {
    if (!usesPortal) {
      return undefined;
    }

    const panel = panelRef.current;
    const trigger = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    if (!panel) {
      return undefined;
    }

    const focusableElements = listFocusableElements(panel);
    (focusableElements[0] ?? panel).focus();

    const handleFocusKeyDown = (event: KeyboardEvent) => {
      const isTopDialog = openDialogStack.at(-1) === dialogIdRef.current;

      if (event.key !== "Tab" || !isTopDialog) {
        return;
      }

      const currentFocusableElements = listFocusableElements(panel);

      if (currentFocusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstElement = currentFocusableElements[0]!;
      const lastElement = currentFocusableElements.at(-1)!;
      const activeElement = document.activeElement;

      if (!panel.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener("keydown", handleFocusKeyDown);

    return () => {
      window.removeEventListener("keydown", handleFocusKeyDown);

      if (trigger?.isConnected) {
        trigger.focus();
      }
    };
  }, [usesPortal]);

  const handleOverlayClick = () => {
    if (!closeOnOverlayClick || closeDisabled || !onClose) {
      return;
    }

    onClose();
  };

  const dialog = (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[rgb(40_44_59_/_32%)] p-4",
        overlayClassName,
      )}
      data-testid={overlayTestId}
      onClick={handleOverlayClick}
    >
      <div
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className={cn(
          "flex max-h-[calc(100vh-32px)] w-[min(620px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-[#dfe4ee] bg-white p-[18px] shadow-[0_18px_50px_rgb(20_24_38_/_22%)]",
          panelClassName,
        )}
        data-testid={testId}
        ref={panelRef}
        role="dialog"
        tabIndex={usesPortal ? -1 : undefined}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        {header ? <div className="shrink-0">{header}</div> : null}
        <div className={cn("min-h-0 flex-1 overflow-y-auto pr-1", bodyClassName)}>{children}</div>
        {footer ? (
          <div className={cn("shrink-0", footerClassName)}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  if (portalTarget) {
    return createPortal(dialog, portalTarget);
  }

  return portalToBody ? createPortal(dialog, document.body) : dialog;
};
