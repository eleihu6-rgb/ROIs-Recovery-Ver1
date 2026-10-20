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

/**
 * Bottom clearance for scrolling page content. Phones and iPads keep the
 * floating bottom dock, so their content must stop above it; on the Duo the
 * navigation becomes the right-edge rail and only the home-indicator inset is
 * left, letting the page use the full height.
 */
export function bottomDockClearance(
  width: number,
  height: number,
  insets: { bottom: number; right: number },
  dockClearance: number,
): number {
  return duoActionStripWidth(width, height, insets.right) > 0 ? Math.max(insets.bottom, 16) : dockClearance;
}

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

// ─── Schedule floating KPI panel ────────────────────────────────────────────

export interface KpiPanelGeometry {
  /** Panel width in layout points. */
  width: number;
  /** Distance from the content area's right edge. */
  margin: number;
  /** Distance from the content area's bottom edge (above the dock). */
  bottom: number;
  padding: number;
  /** Gap between the three metric groups. */
  gap: number;
  headerSize: number;
  valueSize: number;
  labelSize: number;
  subSize: number;
  barHeight: number;
  /** True when the enlarged landscape treatment applies. */
  landscape: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Geometry for the floating limit summary. Portrait keeps the selected
 * Floating Summary size (a ~355–420pt card above the dock); landscape enlarges
 * the panel and its contents. The enlargement is driven by the usable geometry,
 * not by device names: the short iPhone Air landscape (420pt tall) stays at the
 * low end, while the taller Duo and the iPad grow.
 *
 * `width` is the window width (the reference targets are stated per device
 * viewport). The card is still clamped to the content area left by the Duo's
 * right-edge action strip. `rail` = that strip is in use, so the panel sits
 * just above the home indicator instead of above a bottom dock.
 */
export function kpiPanelGeometry(
  width: number,
  height: number,
  insets: { bottom: number; right?: number },
  rail: boolean,
): KpiPanelGeometry {
  const strip = duoActionStripWidth(width, height, insets.right ?? 0);
  const contentWidth = Math.max(280, width - (rail ? strip : 0));
  const bottom = rail ? Math.max(insets.bottom, 8) + 12 : Math.max(insets.bottom, 0) + 82;
  const landscape = width > height;
  if (!landscape) {
    return {
      width: Math.max(280, Math.min(contentWidth - 32, 420)),
      margin: 16,
      bottom,
      padding: 14,
      gap: 10,
      headerSize: 11,
      valueSize: 21,
      labelSize: 10,
      subSize: 9,
      barHeight: 4,
      landscape: false,
    };
  }
  // Short landscape screens must not let the panel dwarf the duty grid; a
  // height-weighted size score keeps Air small, Duo medium and iPad large.
  const score = Math.min(width, height * 1.5);
  return {
    width: Math.max(320, Math.min(contentWidth - 36, clamp(Math.round(width * 0.55), 420, 660))),
    margin: 18,
    bottom,
    padding: clamp(Math.round(18 + (score - 630) * 0.008), 18, 22),
    gap: clamp(Math.round(14 + (score - 630) * 0.01), 14, 20),
    headerSize: clamp(Math.round(12 + (score - 630) * 0.002), 12, 13),
    valueSize: clamp(Math.round(22 + (score - 630) * 0.0103), 22, 28),
    labelSize: clamp(Math.round(11 + (score - 630) * 0.0034), 11, 13),
    subSize: clamp(Math.round(10 + (score - 630) * 0.0034), 10, 12),
    barHeight: clamp(Math.round(4 + (score - 630) * 0.0034), 4, 6),
    landscape: true,
  };
}
