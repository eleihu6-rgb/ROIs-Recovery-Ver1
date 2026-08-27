import { describe, expect, it } from "vitest";
import {
  convertScheduleActionPopoverPlacementToPortal,
  resolveScheduleActionPopoverPlacement,
} from "@/shared/components/schedule/schedule-action-popover-position";

const boundaryRect = {
  bottom: 968,
  height: 968,
  left: 0,
  right: 688,
  top: 0,
  width: 688,
};

const popoverRect = {
  bottom: 420,
  height: 420,
  left: 0,
  right: 380,
  top: 0,
  width: 380,
};

describe("resolveScheduleActionPopoverPlacement", () => {
  it("uses the preferred downward placement when the popover fits", () => {
    const placement = resolveScheduleActionPopoverPlacement({
      anchorRect: { bottom: 300, height: 100, left: 200, right: 300, top: 200, width: 100 },
      boundaryRect,
      popoverRect,
      preferredDirection: "down",
    });

    expect(placement).toMatchObject({ direction: "down", top: 308 });
  });

  it("flips upward when there is not enough space below", () => {
    const placement = resolveScheduleActionPopoverPlacement({
      anchorRect: { bottom: 760, height: 100, left: 200, right: 300, top: 660, width: 100 },
      boundaryRect,
      popoverRect,
      preferredDirection: "down",
    });

    expect(placement).toMatchObject({ direction: "up", top: 232 });
  });

  it("uses the larger side and clamps within the boundary when neither side fits", () => {
    const placement = resolveScheduleActionPopoverPlacement({
      anchorRect: { bottom: 550, height: 100, left: 200, right: 300, top: 450, width: 100 },
      boundaryRect: { ...boundaryRect, bottom: 700, height: 700 },
      popoverRect,
      preferredDirection: "down",
    });

    expect(placement.direction).toBe("up");
    expect(placement.top).toBe(22);
    expect(placement.top).toBeGreaterThanOrEqual(8);
    expect(placement.top + popoverRect.height).toBeLessThanOrEqual(692);
  });

  it("keeps wide popovers inside the horizontal boundary", () => {
    const leftPlacement = resolveScheduleActionPopoverPlacement({
      anchorRect: { bottom: 300, height: 100, left: 0, right: 98, top: 200, width: 98 },
      boundaryRect,
      popoverRect,
      preferredDirection: "down",
    });
    const rightPlacement = resolveScheduleActionPopoverPlacement({
      anchorRect: { bottom: 300, height: 100, left: 590, right: 688, top: 200, width: 98 },
      boundaryRect,
      popoverRect,
      preferredDirection: "down",
    });

    expect(leftPlacement.left).toBe(8);
    expect(rightPlacement.left).toBe(300);
  });

  it("reports the available height when the popover is taller than the boundary", () => {
    const placement = resolveScheduleActionPopoverPlacement({
      anchorRect: { bottom: 400, height: 100, left: 200, right: 300, top: 300, width: 100 },
      boundaryRect: { ...boundaryRect, bottom: 500, height: 500 },
      popoverRect: { ...popoverRect, bottom: 800, height: 800 },
      preferredDirection: "down",
    });

    expect(placement.maxHeight).toBe(484);
    expect(placement.top).toBe(8);
  });

  it("converts screen coordinates into a non-1:1 scaled portal coordinate system", () => {
    const portalPosition = convertScheduleActionPopoverPlacementToPortal({
      placement: { direction: "up", left: 260, maxHeight: 480, top: 140 },
      portalRect: { bottom: 500, height: 480, left: 20, right: 964, top: 20, width: 944 },
      scale: 0.5,
    });

    expect(portalPosition).toEqual({ left: 480, maxHeight: 960, top: 240 });
  });
});
