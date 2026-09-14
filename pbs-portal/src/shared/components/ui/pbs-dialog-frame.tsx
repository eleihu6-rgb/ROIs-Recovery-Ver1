import { useEffect, type ReactNode } from "react";
import { AppDialog } from "@rois/ui";

/**
 * PbsDialogFrame — thin compatibility adapter over the shared `@rois/ui` AppDialog.
 *
 * The bespoke createPortal / focus-trap / scroll-lock frame it used to be is gone: the one
 * legal pop-up implementation is AppDialog (root CLAUDE.md §弹窗窗口标准,
 * docs/superpowers/specs/2026-09-13-app-popup-standard-status-card-Ver1.md), so this
 * component only maps the historical prop surface onto it, keeping ~15 pbs-portal call
 * sites compiling and behaving unchanged.
 *
 * Mapping:
 *   onClose        → AppDialog onOpenChange(false)
 *   closeDisabled  → disables both close gestures
 *   closeOnOverlayClick → AppDialog dismissable (outside click closes only when asked)
 *   closeOnEscape  → a document keydown listener (AppDialog's dismissable also governs
 *                    outside clicks, so Escape is handled here to keep the two gestures
 *                    independent exactly as the legacy frame had them)
 *   testId         → AppDialog data-testid
 *   ariaLabel      → AppDialog title (the band title = dialog accessible name)
 *   header         → rendered at the top of the body (the band already shows the title)
 *   footer         → AppDialog footer (the centred pill action row)
 *   panelClassName → AppDialog className; bodyClassName/overlayClassName/footerClassName
 *                    map to the like-named AppDialog props
 *
 * `portalTarget`, `portalToBody` and `overlayTestId` are accepted for prop-surface
 * compatibility but are no-ops: AppDialog owns its own Radix portal and overlay.
 *
 * The AppDialog close disc is intentionally not shown here. Every legacy caller renders
 * its own (Playwright-tested) close control inside `header` / `footer`; adding the disc
 * would render two competing close buttons and break those selectors. Dialogs migrated
 * directly to AppDialog (the Pairing Filters dialog, the Bid Review popover) do use the
 * standard overhanging disc.
 */
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

export const PbsDialogFrame = ({
  ariaLabel,
  bodyClassName,
  children,
  closeDisabled = false,
  closeOnEscape = true,
  closeOnOverlayClick = false,
  footer,
  footerClassName,
  header,
  overlayClassName,
  panelClassName,
  testId,
  onClose,
}: PbsDialogFrameProps) => {
  // AppDialog has a single `dismissable` flag that governs outside clicks *and* Escape.
  // The legacy frame had two independent gestures, so:
  //  - `dismissable` mirrors the old `closeOnOverlayClick` (default false: clicking the
  //    dimmed background does nothing, so clicks into a nested popover never dismiss the
  //    window), and
  //  - Escape (default true) is wired here so it keeps working independently.
  const dismissable = !closeDisabled && closeOnOverlayClick;

  useEffect(() => {
    if (!closeOnEscape || closeDisabled || !onClose) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
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

  return (
    <AppDialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose?.();
        }
      }}
      title={ariaLabel ?? ""}
      className={panelClassName}
      overlayClassName={overlayClassName}
      bodyClassName={bodyClassName}
      footerClassName={footerClassName}
      footer={footer}
      dismissable={dismissable}
      showClose={false}
      data-testid={testId}
    >
      {header ? <div className="shrink-0">{header}</div> : null}
      {children}
    </AppDialog>
  );
};
