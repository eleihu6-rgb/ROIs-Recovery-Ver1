// Route map ▸ share preview.
//
// The crew sees the exact picture before it leaves the app. The preview is the
// same SVG the rasteriser reads at 1080 × 1350, so what is shown is what is
// shared (just displayed smaller). Product pop-up rules apply: this is an
// AppDialog, not a bespoke modal.
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg from 'react-native-svg';
import { AppDialog } from '../../components/v2/AppDialog';
import type { CarrierPalette } from '../../theme/carrier';
import type { MonthModel } from './model';
import { RouteShareCard } from './RouteShareCard';
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  captureSvgBase64,
  shareCaptureSize,
  shareImagePng,
} from './routeShare';

const PREVIEW_WIDTH = 210;
const PREVIEW_HEIGHT = (PREVIEW_WIDTH * SHARE_CARD_HEIGHT) / SHARE_CARD_WIDTH;

export interface RouteShareDialogProps {
  month: MonthModel;
  base: string;
  palette: CarrierPalette;
  airlineCode?: string;
  airlineName?: string;
  onClose: () => void;
}

export function RouteShareDialog({
  month,
  base,
  palette,
  airlineCode = '',
  airlineName = '',
  onClose,
}: RouteShareDialogProps): React.JSX.Element {
  const captureRef = useRef<React.ElementRef<typeof Svg>>(null);
  const captureSize = shareCaptureSize();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // The rasteriser reads the source view's own layout bounds, so capture
      // from the print-geometry copy rather than the 210 pt on-screen preview.
      const { width, height } = captureSize;
      const png = await captureSvgBase64(captureRef.current, width, height);
      await shareImagePng(png);
      onClose();
    } catch {
      setError('Could not prepare the picture. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, captureSize.height, captureSize.width, onClose]);

  return (
    <AppDialog
      visible
      onClose={onClose}
      title="Share your route map"
      message="A 4:5 picture for your Instagram post or story."
      icon="send"
      confirmLabel={busy ? 'Sharing…' : 'Share'}
      onConfirm={handleShare}
      cancelLabel="Close"
      onCancel={onClose}
      dismissable={!busy}
      testID="route-share-dialog"
    >
      <View
        style={s.preview}
        testID="route-share-preview"
        accessible
        accessibilityLabel="Route map share preview"
      >
        <RouteShareCard
          month={month}
          base={base}
          palette={palette}
          airlineCode={airlineCode}
          airlineName={airlineName}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
        />
      </View>
      {/* Off-screen copy laid out at print geometry. react-native-svg's
          `toDataURL` draws at the native view's own bounds, so capturing the
          210 pt preview would leave most of the 1080 × 1350 canvas blank. */}
      <View
        style={s.capture}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <RouteShareCard
          ref={captureRef}
          month={month}
          base={base}
          palette={palette}
          airlineCode={airlineCode}
          airlineName={airlineName}
          width={captureSize.width}
          height={captureSize.height}
        />
      </View>
      {error ? (
        <Text style={[s.error, { color: palette.crit }]} testID="route-share-error">
          {error}
        </Text>
      ) : null}
    </AppDialog>
  );
}

const s = StyleSheet.create({
  preview: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    marginTop: 14,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  error: { fontSize: 12, lineHeight: 17, marginTop: 10, textAlign: 'center' },
  // Laid out at print geometry but parked outside the screen: the native
  // rasteriser reads these bounds, so they must not be the display size.
  capture: { position: 'absolute', left: -10000, top: 0 },
});
