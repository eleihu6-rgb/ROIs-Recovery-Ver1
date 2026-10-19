// Route map ▸ share card model.
//
// The picture is generated from the same month model the map draws, so the
// share card can never disagree with the screen: same destinations, same
// distance, same countries. This module is pure (no React, no native calls) so
// the arithmetic and the stamp overflow rule are unit-testable; the capture and
// share wrappers at the bottom are thin adapters.
import { airportLabel } from '../settings/airportCoords';
import { MON, type MonthModel } from './model';
import {
  monthRoutes,
  monthStats,
  type MonthStats,
  type RouteDestination,
} from './schedView';
import { NativeModules, PixelRatio } from 'react-native';

/** Instagram feed portrait: 4:5, the largest a feed post accepts. */
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

/** One card row holds four stamps; two rows fit above the footer. */
export const SHARE_MAX_STAMPS = 8;

export interface RouteShareModel {
  /** Roster month + year, exactly as the map titles it: "Sep 2026". */
  monthLabel: string;
  /** Uppercase month + year for the card's eyebrow: "SEP 2026". */
  monthStamp: string;
  baseCode: string;
  baseLabel: string;
  /** Nearest-first, one entry per airport. */
  routes: RouteDestination[];
  stats: MonthStats;
}

export interface RouteShareStamp {
  code: string;
  /** `null` only for the "+N" overflow stamp. */
  km: number | null;
}

export function buildRouteShareModel(month: MonthModel, base: string): RouteShareModel {
  const baseCode = String(base || '').trim().toUpperCase();
  const monthLabel = `${MON[month.monthIdx]} ${month.year}`;
  return {
    monthLabel,
    monthStamp: monthLabel.toUpperCase(),
    baseCode,
    baseLabel: airportLabel(baseCode),
    routes: monthRoutes(month, baseCode),
    stats: monthStats(month, baseCode),
  };
}

/**
 * The stamps drawn under the map: one per destination while they fit, then a
 * final `+N` slot that accounts for the rest. The card never grows a third row,
 * so a crew with a very busy month still gets an honest picture.
 */
export function shareStamps(routes: RouteDestination[], max = SHARE_MAX_STAMPS): RouteShareStamp[] {
  const limit = Math.max(1, max);
  if (routes.length <= limit) {
    return routes.map(route => ({ code: route.code, km: route.km }));
  }
  return [
    ...routes.slice(0, limit - 1).map(route => ({ code: route.code, km: route.km })),
    { code: `+${routes.length - (limit - 1)}`, km: null },
  ];
}

/** A capture target exposed by react-native-svg's `Svg` instance. */
export interface SvgCaptureHandle {
  toDataURL: (
    callback: (base64: string) => void,
    options?: { width: number; height: number },
  ) => void;
}

/**
 * Layout size, in points, that rasterises to exactly `SHARE_CARD_WIDTH` ×
 * `SHARE_CARD_HEIGHT` pixels.
 *
 * react-native-svg draws the card at the native view's own bounds and only uses
 * the requested size to size the canvas (times the screen scale). A card laid
 * out at 210 pt therefore always draws 630 px wide, however large a canvas you
 * ask for — the picture lands in the corner with the rest blank. The capture
 * copy must be laid out at this size instead.
 */
export function shareCaptureSize(): { width: number; height: number } {
  const scale = PixelRatio.get() || 1;
  return {
    width: Math.round(SHARE_CARD_WIDTH / scale),
    height: Math.round(SHARE_CARD_HEIGHT / scale),
  };
}

/**
 * Rasterise the share card. `width`/`height` are the size the source view is
 * laid out at (in points), not the pixel size of the resulting file. `toDataURL`
 * can retry internally and may hand back an empty string if the view was not
 * laid out yet, so an empty result is a hard error rather than a blank picture
 * in the sheet.
 */
export function captureSvgBase64(handle: SvgCaptureHandle | null, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!handle) {
      reject(new Error('The share card is not ready yet.'));
      return;
    }
    handle.toDataURL(base64 => {
      const clean = String(base64 || '').replace(/\s+/g, '');
      if (!clean) {
        reject(new Error('The share card could not be rendered.'));
        return;
      }
      resolve(clean);
    }, { width, height });
  });
}

interface ShareImageNativeModule {
  shareImage(base64: string): Promise<boolean>;
}

/**
 * Hand a PNG (base64) to the native share sheet. The native side writes a real
 * `.png` file first: iOS share extensions type a file URL as `public.png`, while
 * a base64 data URL reaches them as raw `public.data` and is not reliably
 * accepted by Instagram.
 */
export async function shareImagePng(base64: string): Promise<void> {
  const native = NativeModules.ShareModule as ShareImageNativeModule | undefined;
  if (!native || typeof native.shareImage !== 'function') {
    throw new Error('Sharing is not available in this build.');
  }
  await native.shareImage(base64);
}
