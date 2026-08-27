import { render, screen } from "@testing-library/react";
import {
  ScaledPageCanvas,
  useScaledPageCanvasPortalTarget,
} from "@/shared/components/layout/scaled-page-canvas";

const PortalTargetProbe = () => {
  const portalTarget = useScaledPageCanvasPortalTarget();

  return (
    <output data-testid="portal-target-probe">
      {portalTarget?.dataset.testid ?? "missing"}
    </output>
  );
};

describe("ScaledPageCanvas", () => {
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
});
