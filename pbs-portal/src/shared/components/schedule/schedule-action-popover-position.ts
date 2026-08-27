export type ScheduleActionPopoverRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export type ScheduleActionPopoverPlacement = {
  direction: "up" | "down" | "center";
  left: number;
  maxHeight: number;
  top: number;
};

type ConvertScheduleActionPopoverPlacementOptions = {
  placement: ScheduleActionPopoverPlacement;
  portalRect: ScheduleActionPopoverRect;
  scale: number;
};

type ResolveScheduleActionPopoverPlacementOptions = {
  anchorRect: ScheduleActionPopoverRect;
  boundaryRect: ScheduleActionPopoverRect;
  popoverRect: ScheduleActionPopoverRect;
  preferredDirection: ScheduleActionPopoverPlacement["direction"];
  edgePadding?: number;
  gap?: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

export const convertScheduleActionPopoverPlacementToPortal = ({
  placement,
  portalRect,
  scale,
}: ConvertScheduleActionPopoverPlacementOptions): Pick<ScheduleActionPopoverPlacement, "left" | "maxHeight" | "top"> => ({
  left: (placement.left - portalRect.left) / scale,
  maxHeight: placement.maxHeight / scale,
  top: (placement.top - portalRect.top) / scale,
});

export const resolveScheduleActionPopoverPlacement = ({
  anchorRect,
  boundaryRect,
  popoverRect,
  preferredDirection,
  edgePadding = 8,
  gap = 8,
}: ResolveScheduleActionPopoverPlacementOptions): ScheduleActionPopoverPlacement => {
  const boundaryTop = boundaryRect.top + edgePadding;
  const boundaryBottom = boundaryRect.bottom - edgePadding;
  const maxHeight = Math.max(boundaryBottom - boundaryTop, 0);
  const renderedHeight = Math.min(popoverRect.height, maxHeight);
  const minLeft = boundaryRect.left + edgePadding;
  const maxLeft = boundaryRect.right - edgePadding - popoverRect.width;
  const left = clamp(
    anchorRect.left + (anchorRect.width - popoverRect.width) / 2,
    minLeft,
    maxLeft,
  );

  if (preferredDirection === "center") {
    return {
      direction: "center",
      left,
      maxHeight,
      top: clamp(
        boundaryRect.top + (boundaryRect.height - renderedHeight) / 2,
        boundaryTop,
        boundaryBottom - renderedHeight,
      ),
    };
  }

  const spaceAbove = anchorRect.top - gap - boundaryTop;
  const spaceBelow = boundaryBottom - anchorRect.bottom - gap;
  const oppositeDirection = preferredDirection === "down" ? "up" : "down";
  const preferredSpace = preferredDirection === "down" ? spaceBelow : spaceAbove;
  const oppositeSpace = oppositeDirection === "down" ? spaceBelow : spaceAbove;
  const direction = preferredSpace >= renderedHeight
    ? preferredDirection
    : oppositeSpace >= renderedHeight
      ? oppositeDirection
      : spaceBelow >= spaceAbove
        ? "down"
        : "up";
  const desiredTop = direction === "down"
    ? anchorRect.bottom + gap
    : anchorRect.top - gap - renderedHeight;

  return {
    direction,
    left,
    maxHeight,
    top: clamp(desiredTop, boundaryTop, boundaryBottom - renderedHeight),
  };
};
