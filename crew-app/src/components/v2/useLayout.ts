// Form-factor switch for the iPhone Duo. A regular iPhone (portrait, ~390–440pt
// wide) and the Duo's outer screen stay on the existing single-column layout
// ("compact"). The Duo's unfolded inner screen gets a layout designed per page:
// "wide" when it is landscape (~951x669pt, room for two full columns) and "tall"
// when it is rotated to portrait (~669x951pt — wider than any iPhone, too narrow
// for two columns). Live window size, so fold/unfold and rotation re-render
// immediately. See docs/superpowers/specs/2026-10-07-crew-app-duo-per-page-layouts-design.md.
import { useWindowDimensions } from 'react-native';

/** Window width (pt) at which a screen switches to its wide, multi-column layout. */
export const WIDE_MIN_WIDTH = 700;
/** Window width (pt) from which a single column is given more density ("tall"). */
export const TALL_MIN_WIDTH = 560;

/**
 * Every orientation the app allows (Info.plist). React Native's iOS <Modal>
 * defaults to portrait-only, which snaps the app back to portrait when a dialog
 * opens on the landscape inner screen — every Modal must pass this.
 */
export const ALL_ORIENTATIONS: Array<'portrait' | 'landscape' | 'landscape-left' | 'landscape-right'> = [
  'portrait',
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
