import { fireEvent, render, screen, within } from "@testing-library/react";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";

describe("PbsDialogFrame", () => {
  it("renders an AppDialog named from ariaLabel and forwards the test id", () => {
    render(
      <PbsDialogFrame ariaLabel="Scaled dialog" testId="scaled-dialog">
        <p>Dialog body</p>
      </PbsDialogFrame>,
    );

    const dialog = screen.getByRole("dialog", { name: "Scaled dialog" });

    expect(screen.getByTestId("scaled-dialog")).toBe(dialog);
    expect(within(dialog).getByText("Dialog body")).toBeInTheDocument();
  });

  it("renders the header inside the body and the footer as the AppDialog action row", () => {
    render(
      <PbsDialogFrame
        ariaLabel="Configure thing"
        header={<p>Header subtitle</p>}
        footer={<button type="button">APPLY</button>}
      >
        <p>Dialog body</p>
      </PbsDialogFrame>,
    );

    const dialog = screen.getByRole("dialog", { name: "Configure thing" });
    const actionRow = dialog.querySelector("[data-app-dialog-actions]");

    expect(within(dialog).getByText("Header subtitle")).toBeInTheDocument();
    expect(actionRow).not.toBeNull();
    expect(within(actionRow as HTMLElement).getByRole("button", { name: "APPLY" })).toBeInTheDocument();
  });

  it("closes through AppDialog Escape handling", () => {
    const handleClose = vi.fn();

    render(
      <PbsDialogFrame ariaLabel="Closable dialog" onClose={handleClose}>
        <p>Dialog body</p>
      </PbsDialogFrame>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open while closeDisabled blocks dismissal", () => {
    const handleClose = vi.fn();

    render(
      <PbsDialogFrame ariaLabel="Pending dialog" closeDisabled onClose={handleClose}>
        <p>Dialog body</p>
      </PbsDialogFrame>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(handleClose).not.toHaveBeenCalled();
  });

  it("accepts the legacy portal props as no-ops and still renders the dialog", () => {
    const portalTarget = document.createElement("div");
    document.body.appendChild(portalTarget);

    render(
      <PbsDialogFrame
        ariaLabel="Portal dialog"
        overlayClassName="test-overlay"
        overlayTestId="legacy-overlay"
        portalTarget={portalTarget}
        portalToBody
      >
        <button type="button">Canvas action</button>
      </PbsDialogFrame>,
    );

    const dialog = screen.getByRole("dialog", { name: "Portal dialog" });

    expect(within(dialog).getByRole("button", { name: "Canvas action" })).toBeInTheDocument();
    // AppDialog owns its own Radix portal, so the dialog is no longer nested in the caller target.
    expect(portalTarget).not.toContainElement(dialog);

    portalTarget.remove();
  });
});
