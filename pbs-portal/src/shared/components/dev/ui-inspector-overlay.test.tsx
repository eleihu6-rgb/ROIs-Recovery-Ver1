import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UIInspectorOverlay } from "@/shared/components/dev/ui-inspector-overlay";

describe("UIInspectorOverlay", () => {
  it("highlights the smallest hovered element while showing the nearest uiid", () => {
    render(
      <>
        <div data-uiid="parent-ui-id">
          <span>Inspector Target</span>
        </div>
        <UIInspectorOverlay enabled />
      </>,
    );

    const target = screen.getByText("Inspector Target");
    fireEvent.mouseMove(target, { clientX: 80, clientY: 40 });

    expect(screen.getByText("parent-ui-id")).toBeInTheDocument();
    expect(target).toHaveClass("ui-inspector-hover");
  });

  it("prefers the hovered element uiid when the smallest dom already has one", () => {
    render(
      <>
        <button data-uiid="leaf-ui-id">Leaf Target</button>
        <UIInspectorOverlay enabled />
      </>,
    );

    const target = screen.getByText("Leaf Target");
    fireEvent.mouseMove(target, { clientX: 64, clientY: 48 });

    expect(screen.getByText("leaf-ui-id")).toBeInTheDocument();
    expect(target).toHaveClass("ui-inspector-hover");
  });

  it("auto-stamps classed elements with generated ui ids", () => {
    render(
      <>
        <button className="auto-stamped-target">Auto Stamped Target</button>
        <UIInspectorOverlay enabled />
      </>,
    );

    const target = screen.getByText("Auto Stamped Target");
    fireEvent.mouseMove(target, { clientX: 70, clientY: 44 });

    expect(screen.getByText(/^ui-\d+$/)).toBeInTheDocument();
    expect(target).toHaveAttribute("data-uid");
    expect(target).toHaveClass("ui-inspector-hover");
  });

  it("does not fall back to data-testid when no uiid exists", () => {
    render(
      <>
        <div data-testid="fallback-test-id">Fallback Target</div>
        <UIInspectorOverlay enabled />
      </>,
    );

    const target = screen.getByText("Fallback Target");
    fireEvent.mouseMove(target, { clientX: 72, clientY: 36 });

    expect(screen.queryByTestId("ui-inspector-tooltip")).not.toBeInTheDocument();
    expect(screen.queryByText("fallback-test-id")).not.toBeInTheDocument();
    expect(target).toHaveClass("ui-inspector-hover");
  });

  it("stamps newly added classed elements after the inspector is enabled", async () => {
    const { rerender } = render(
      <>
        <div className="initial-inspector-target">Initial Target</div>
        <UIInspectorOverlay enabled />
      </>,
    );

    rerender(
      <>
        <div className="initial-inspector-target">Initial Target</div>
        <button className="late-inspector-target">Late Target</button>
        <UIInspectorOverlay enabled />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByText("Late Target")).toHaveAttribute("data-uid");
    });

    const target = screen.getByText("Late Target");
    fireEvent.mouseMove(target, { clientX: 84, clientY: 58 });

    expect(screen.getByText(/^ui-\d+$/)).toBeInTheDocument();
    expect(target).toHaveClass("ui-inspector-hover");
  });

  it("clears the tooltip and highlight when disabled", () => {
    const { rerender } = render(
      <>
        <div data-uiid="clearable-target-uiid">Clearable Target</div>
        <UIInspectorOverlay enabled />
      </>,
    );

    const target = screen.getByText("Clearable Target");
    fireEvent.mouseMove(target, { clientX: 96, clientY: 52 });

    expect(screen.getByText("clearable-target-uiid")).toBeInTheDocument();
    expect(target).toHaveClass("ui-inspector-hover");

    rerender(
      <>
        <div data-uiid="clearable-target-uiid">Clearable Target</div>
        <UIInspectorOverlay enabled={false} />
      </>,
    );

    expect(screen.queryByTestId("ui-inspector-tooltip")).not.toBeInTheDocument();
    expect(target).not.toHaveClass("ui-inspector-hover");
  });
});
