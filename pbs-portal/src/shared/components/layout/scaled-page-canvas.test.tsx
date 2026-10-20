import { render, screen } from "@testing-library/react";
import {
  ScaledPageCanvas,
  useScaledPageCanvasPortalTarget,
} from "@/shared/components/layout/scaled-page-canvas";

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
};

const PortalTargetProbe = () => {
  const portalTarget = useScaledPageCanvasPortalTarget();

  return (
    <output data-testid="portal-target-probe">
      {portalTarget?.dataset.testid ?? "missing"}
    </output>
  );
};

describe("ScaledPageCanvas", () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it("provides a non-interactive portal root after the business content inside the scaled canvas", () => {
    render(
      <ScaledPageCanvas
        canvasTestId="scaled-canvas"
        designHeight={968}
        designWidth={1888}
      >
        <div data-testid="business-content">Business content</div>
        <PortalTargetProbe />
      </ScaledPageCanvas>,
    );

    const canvas = screen.getByTestId("scaled-canvas");
    const businessContent = screen.getByTestId("business-content");
    const portalRoot = screen.getByTestId("scaled-page-dialog-portal-root");

    expect(canvas).toContainElement(portalRoot);
    expect(portalRoot.compareDocumentPosition(businessContent) & Node.DOCUMENT_POSITION_PRECEDING)
      .toBeTruthy();
    expect(portalRoot).toHaveClass("pointer-events-none", "absolute", "inset-0");
    expect(screen.getByTestId("portal-target-probe")).toHaveTextContent(
      "scaled-page-dialog-portal-root",
    );
  });

  it("renders natural full-width content instead of scaling the desktop canvas on phones", () => {
    setViewportWidth(390);

    render(
      <ScaledPageCanvas
        canvasTestId="scaled-canvas"
        designHeight={968}
        designWidth={1888}
        viewportTestId="scaled-viewport"
      >
        <div data-testid="business-content">Business content</div>
      </ScaledPageCanvas>,
    );

    expect(screen.getByTestId("scaled-viewport")).toHaveAttribute("data-layout-mode", "mobile");
    const canvas = screen.getByTestId("scaled-canvas");
    expect(canvas.style.getPropertyValue("--portal-page-shell-height")).toBe("auto");
    expect(canvas.style.transform).toBe("");
    expect(canvas).toContainElement(screen.getByTestId("business-content"));
  });
});
