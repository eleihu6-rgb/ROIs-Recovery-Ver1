// Form-factor switch for the iPhone Duo. A regular iPhone (portrait, ~390–440pt
// wide) and the Duo's outer screen stay on the existing single-column layout;
// only the Duo's unfolded inner screen (~951x669pt landscape) is "wide" and gets
// the multi-column layouts. Live window size, so fold/unfold and rotation
// re-render immediately.
import { useWindowDimensions } from 'react-native';

/** Window width (pt) at which a screen switches to its wide, multi-column layout. */
export const WIDE_MIN_WIDTH = 700;

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

export interface Layout {
  width: number;
  height: number;
  wide: boolean;
}

export function layoutFor(width: number, height: number): Layout {
  return { width, height, wide: width >= WIDE_MIN_WIDTH };
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return layoutFor(width, height);
}
