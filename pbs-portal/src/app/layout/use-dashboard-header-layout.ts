import { useEffect, useMemo, useState } from "react";

const getViewportWidth = () => window.innerWidth;

export const HEADER_DESIGN_WIDTH = 1920;
export const HEADER_DESIGN_HEIGHT = 80;
export const MENU_LEFT = 430;
// 右侧 actions 簇（版本号 + 图标 + 头像 + 姓名）以真实像素定位在 right-8，
// 这里预留的真实像素宽度必须 ≥ 该簇实际宽度，否则末位菜单项（Help）会压到版本号上。
export const MENU_RIGHT_RESERVED = 384;
export const BASE_MENU_WIDTH = HEADER_DESIGN_WIDTH - MENU_LEFT - MENU_RIGHT_RESERVED;
export const MENU_ITEM_GAP = 40;
export const OVERFLOW_TRIGGER_WIDTH = 40;
export const OVERFLOW_GAP = 8;
export const MENU_ITEM_WIDTHS = [104, 79, 67, 74, 51, 61, 121, 43];

export const resolveHeaderScale = (viewportWidth: number) => {
  if (viewportWidth <= 0) {
    return 1;
  }

  return viewportWidth / HEADER_DESIGN_WIDTH;
};

const resolveVisibleCount = (
  itemCount: number,
  viewportWidth: number,
  menuRightReserved = MENU_RIGHT_RESERVED,
) => {
  const scale = resolveHeaderScale(viewportWidth);
  const effectiveMenuWidth = Math.max(
    0,
    Math.min(
      BASE_MENU_WIDTH,
      Math.max(0, viewportWidth - menuRightReserved) / Math.max(scale, 0.0001) - MENU_LEFT,
    ),
  );

  let usedWidth = 0;
  let count = 0;

  for (let index = 0; index < itemCount; index += 1) {
    const itemWidth = MENU_ITEM_WIDTHS[index] ?? 88;
    const nextWidth = count === 0 ? itemWidth : usedWidth + MENU_ITEM_GAP + itemWidth;
    const remainingItems = itemCount - (index + 1);
    const reserveWidth = remainingItems > 0 ? MENU_ITEM_GAP + OVERFLOW_TRIGGER_WIDTH : 0;

    if (nextWidth + reserveWidth > effectiveMenuWidth) {
      break;
    }

    usedWidth = nextWidth;
    count += 1;
  }

  return Math.max(1, count);
};

export const useDashboardHeaderLayout = (
  itemCount: number,
  menuRightReserved = MENU_RIGHT_RESERVED,
) => {
  const [viewportWidth, setViewportWidth] = useState(() => getViewportWidth());

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(getViewportWidth());
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return useMemo(() => {
    const scale = resolveHeaderScale(viewportWidth);
    const headerHeight = Math.round(HEADER_DESIGN_HEIGHT * scale);
    const visibleCount = resolveVisibleCount(itemCount, viewportWidth, menuRightReserved);

    return {
      scale,
      viewportWidth,
      headerHeight,
      headerHeightPx: `${headerHeight}px`,
      mainPaddingTopPx: `${headerHeight + 16}px`,
      visibleCount,
    };
  }, [itemCount, menuRightReserved, viewportWidth]);
};
