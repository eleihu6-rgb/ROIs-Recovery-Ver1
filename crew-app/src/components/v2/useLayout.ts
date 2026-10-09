// Window-size switch for iPhone, Duo, and iPad. A regular iPhone (~390–440pt
// wide) and the Duo's outer screen stay on the existing single-column layout
// ("compact"). The Duo's unfolded inner screen gets a layout designed per page:
// "wide" when it is landscape (~951x669pt, room for two full columns) and "tall"
// when it is rotated to portrait (~669x951pt — wider than any iPhone, too narrow
// for two columns). Live window size, so fold/unfold and rotation re-render
// immediately. iPad uses wide in full screen and the same breakpoints when resized.
// See docs/superpowers/specs/2026-10-07-crew-app-duo-per-page-layouts-design.md.
import { useWindowDimensions } from 'react-native';

/** Window width (pt) at which a screen switches to its wide, multi-column layout. */
export const WIDE_MIN_WIDTH = 700;
/** Window width (pt) from which a single column is given more density ("tall"). */
export const TALL_MIN_WIDTH = 560;

/** Duo inner and cover displays reserve an action strip even when iOS reports
 * zero right safe-area inset. Regular iPhones and iPads keep their bottom dock. */
export function duoActionStripWidth(width: number, height: number, rightInset: number): number {
  if (rightInset >= 64 && width >= TALL_MIN_WIDTH) return rightInset;
  if (width >= 600 && width < WIDE_MIN_WIDTH && height >= 850) return 84;
  if (width >= 450 && width < TALL_MIN_WIDTH && height < 760) return rightInset >= 64 ? rightInset : 84;
  return 0;
}

/**
 * Every orientation the app allows (Info.plist). React Native's iOS <Modal>
 * defaults to portrait-only, which snaps the app back to portrait when a dialog
 * opens on the landscape inner screen — every Modal must pass this.
 */
export const ALL_ORIENTATIONS: Array<'portrait' | 'portrait-upside-down' | 'landscape' | 'landscape-left' | 'landscape-right'> = [
  'portrait',
  'portrait-upside-down',
  'landscape',
  'landscape-left',
  'landscape-right',
];

export type LayoutClass = 'compact' | 'tall' | 'wide';

export interface Layout {
  width: number;
  height: number;
  /** Duo inner screen, landscape: two-column layouts. */
  wide: boolean;
  /** Duo inner screen, rotated to portrait: one denser column. */
  tall: boolean;
  layout: LayoutClass;
}

export function layoutClassFor(width: number): LayoutClass {
  if (width >= WIDE_MIN_WIDTH) return 'wide';
  if (width >= TALL_MIN_WIDTH) return 'tall';
  return 'compact';
}

export function layoutFor(width: number, height: number): Layout {
  const layout = layoutClassFor(width);
  return { width, height, wide: layout === 'wide', tall: layout === 'tall', layout };
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return layoutFor(width, height);
}
