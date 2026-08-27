export type ScaledDropdownPosition = {
  designMaxOptionsHeight: number;
  designMaxPopupHeight: number;
  designWidth: number;
  openAbove: boolean;
  scale: number;
  viewportBottom: number | null;
  viewportLeft: number;
  viewportTop: number | null;
};

type AnchorRect = Pick<
  DOMRectReadOnly,
  "bottom" | "left" | "right" | "top" | "width"
>;

type ResolveScaledDropdownPositionInput = {
  anchorLayoutWidth: number;
  anchorRect: AnchorRect;
  designGap: number;
  designHeaderHeight: number;
  designMaxOptionsHeight: number;
  viewportHeight: number;
  viewportMargin: number;
  viewportWidth: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

export const resolveScaledDropdownPosition = ({
  anchorLayoutWidth,
  anchorRect,
  designGap,
  designHeaderHeight,
  designMaxOptionsHeight,
  viewportHeight,
  viewportMargin,
  viewportWidth,
}: ResolveScaledDropdownPositionInput): ScaledDropdownPosition => {
  const rawScale = anchorLayoutWidth > 0 ? anchorRect.width / anchorLayoutWidth : 1;
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  const visualGap = designGap * scale;
  const desiredVisualHeight = (designHeaderHeight + designMaxOptionsHeight) * scale;
  const spaceBelow = Math.max(
    0,
    viewportHeight - viewportMargin - anchorRect.bottom - visualGap,
  );
  const spaceAbove = Math.max(
    0,
    anchorRect.top - visualGap - viewportMargin,
  );
  const openAbove = spaceBelow < desiredVisualHeight && spaceAbove > spaceBelow;
  const availableVisualHeight = openAbove ? spaceAbove : spaceBelow;
  const designMaxPopupHeight = availableVisualHeight / scale;
  const resolvedOptionsHeight = Math.max(
    0,
    Math.min(designMaxOptionsHeight, designMaxPopupHeight - designHeaderHeight),
  );
  const maxVisualWidth = Math.max(0, viewportWidth - viewportMargin * 2);
  const visualWidth = Math.min(anchorRect.width, maxVisualWidth);
  const viewportLeft = clamp(
    anchorRect.left,
    viewportMargin,
    viewportWidth - visualWidth - viewportMargin,
  );

  return {
    designMaxOptionsHeight: resolvedOptionsHeight,
    designMaxPopupHeight,
    designWidth: visualWidth / scale,
    openAbove,
    scale,
    viewportBottom: openAbove
      ? viewportHeight - anchorRect.top + visualGap
      : null,
    viewportLeft,
    viewportTop: openAbove ? null : anchorRect.bottom + visualGap,
  };
};
