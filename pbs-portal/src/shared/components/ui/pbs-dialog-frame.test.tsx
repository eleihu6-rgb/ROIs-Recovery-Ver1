import { fireEvent, render, screen } from "@testing-library/react";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";

describe("PbsDialogFrame", () => {
  it("renders inside the caller tree so workbench scaling still applies", () => {
    render(
      <div data-testid="scaled-shell" style={{ transform: "scale(0.6)" }}>
        <PbsDialogFrame ariaLabel="Scaled dialog">
          <p>Dialog body</p>
        </PbsDialogFrame>
      </div>,
    );

    expect(screen.getByRole("dialog", { name: "Scaled dialog" }).closest("[data-testid='scaled-shell']"))
      .toBe(screen.getByTestId("scaled-shell"));
  });

  it("keeps Escape close handling after inline rendering", () => {
    const handleClose = vi.fn();

    render(
      <PbsDialogFrame ariaLabel="Closable dialog" onClose={handleClose}>
        <p>Dialog body</p>
      </PbsDialogFrame>,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("portals an opted-in viewport dialog and keeps keyboard focus inside it", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open viewport dialog";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <div data-testid="scaled-shell" style={{ transform: "scale(0.6)" }}>
        <PbsDialogFrame
          ariaLabel="Viewport dialog"
          overlayTestId="viewport-overlay"
          portalToBody
        >
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </PbsDialogFrame>
      </div>,
    );

    const dialog = screen.getByRole("dialog", { name: "Viewport dialog" });
    const firstAction = screen.getByRole("button", { name: "First action" });
    const lastAction = screen.getByRole("button", { name: "Last action" });

    expect(screen.getByTestId("scaled-shell")).not.toContainElement(dialog);
    expect(screen.getByTestId("viewport-overlay").parentElement).toBe(document.body);
    expect(firstAction).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(lastAction).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(firstAction).toHaveFocus();

    unmount();

    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("portals to an explicit canvas target and preserves portal focus behavior", () => {
    const portalTarget = document.createElement("div");
    portalTarget.dataset.testid = "canvas-portal-target";
    const scaledShell = document.createElement("div");
    scaledShell.dataset.testid = "scaled-shell-target";
    scaledShell.style.transform = "scale(0.6)";
    scaledShell.appendChild(portalTarget);
    document.body.appendChild(scaledShell);

    const trigger = document.createElement("button");
    trigger.textContent = "Open canvas dialog";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <PbsDialogFrame
        ariaLabel="Canvas dialog"
        overlayTestId="canvas-overlay"
        portalTarget={portalTarget}
      >
        <button type="button">Canvas action</button>
      </PbsDialogFrame>,
    );

    const dialog = screen.getByRole("dialog", { name: "Canvas dialog" });
    expect(portalTarget).toContainElement(screen.getByTestId("canvas-overlay"));
    expect(scaledShell).toContainElement(dialog);
    expect(screen.getByRole("button", { name: "Canvas action" })).toHaveFocus();

    unmount();

    expect(trigger).toHaveFocus();
    trigger.remove();
    scaledShell.remove();
  });
});
