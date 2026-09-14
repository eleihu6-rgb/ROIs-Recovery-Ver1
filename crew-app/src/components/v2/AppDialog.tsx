// AppDialog — the platform pop-up standard, React Native edition.
//
// Same anatomy as the web `@rois/ui` AppDialog (see
// docs/superpowers/specs/2026-09-13-app-popup-standard-status-card-Ver1.md):
// a tone band carrying an outline circle glyph, the title/message centred in the
// body, pill actions in the body, and a circular close disc overhanging the
// top-right corner. Colours come from the crew's carrier palette, so the pop-up
// is theme-matched like every other v2 surface.
//
// Product pop-ups use THIS component. `Alert.alert` stays only for OS-level
// prompts (keychain/permission notices) where the native sheet is the correct
// platform behaviour.
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCarrier } from '../../theme/carrier';
import { Icon, type IconName } from './icons';

export type AppDialogTone = 'neutral' | 'success' | 'warning' | 'destructive';

export interface AppDialogProps {
  visible: boolean;
  /** Close handler — the close disc, the overlay tap and the cancel pill. */
  onClose: () => void;
  title: string;
  /** Optional explanatory line under the title. */
  message?: string;
  /** Semantic colour carried by the glyph badge + primary pill. */
  tone?: AppDialogTone;
  /** Glyph shown in the header badge. Defaults to the tone's own icon; pass one
   *  to match the action (e.g. `logout` for a sign-out confirm). */
  icon?: IconName;
  /** Filled pill. Omit for a message-only pop-up. */
  confirmLabel?: string;
  onConfirm?: () => void;
  /** Outline pill left of the primary one. */
  cancelLabel?: string;
  onCancel?: () => void;
  /** Escape hatch for a custom body (rare — prefer title/message). */
  children?: React.ReactNode;
  /** Tapping the dim overlay closes the pop-up. Default `true`. */
  dismissable?: boolean;
  testID?: string;
}

/** Tone → carrier palette colour (theme-matched, never a raw hex). */
function toneColor(tone: AppDialogTone, palette: ReturnType<typeof useCarrier>): string {
  if (tone === 'success') return palette.good;
  if (tone === 'warning') return palette.warn;
  if (tone === 'destructive') return palette.crit;
  return palette.btn;
}

// Default glyph per tone. A destructive confirm reads as a caution, not a
// dismissal, so it falls back to `warning` — never a bare `close` (X). Callers
// pass `icon` to match the specific action.
const TONE_GLYPH: Record<AppDialogTone, IconName> = {
  neutral: 'info',
  success: 'check',
  warning: 'warning',
  destructive: 'warning',
};

export function AppDialog({
  visible,
  onClose,
  title,
  message,
  tone = 'neutral',
  icon,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
  children,
  dismissable = true,
  testID = 'app-dialog',
}: AppDialogProps): React.JSX.Element {
  const p = useCarrier();
  const accent = toneColor(tone, p);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={s.overlay}
        // Only the backdrop itself closes: taps that land on the card must not.
        onPress={dismissable ? onClose : undefined}
        accessibilityLabel="dismiss"
        testID={`${testID}-overlay`}
      >
        {/* The testID lives on the card, not the Modal: RN does not expose a
            Modal's own testID to the accessibility tree (Maestro could not see it). */}
        <Pressable style={[s.card, { backgroundColor: p.cardSolid }]} onPress={() => {}} testID={testID}>
          {/* Header band in the crew's carrier colour so the pop-up sits in the
              app theme, not against it. The semantic tone is carried by the
              glyph badge (and the primary pill), not by flooding the band. */}
          <View style={[s.band, { backgroundColor: p.btn }]} testID={`${testID}-band`}>
            <View style={[s.glyph, { backgroundColor: accent, borderColor: p.ink }]} testID={`${testID}-glyph`}>
              <Icon name={icon ?? TONE_GLYPH[tone]} size={30} color={p.ink} strokeWidth={2} />
            </View>
          </View>

          {/* Body: centred title, message, then the pill actions. */}
          <View style={s.body}>
            <Text style={[s.title, { color: p.cardInk }]} testID={`${testID}-title`}>{title}</Text>
            {message ? (
              <Text style={[s.message, { color: p.cardSoft }]} testID={`${testID}-message`}>{message}</Text>
            ) : null}
            {children}
            {(confirmLabel || cancelLabel) ? (
              <View style={s.actions}>
                {cancelLabel ? (
                  <Pressable
                    onPress={onCancel ?? onClose}
                    style={[s.pill, s.pillOutline, { borderColor: p.cardLine }]}
                    testID={`${testID}-cancel`}
                  >
                    <Text style={[s.pillText, { color: p.cardInk }]}>{cancelLabel}</Text>
                  </Pressable>
                ) : null}
                {confirmLabel ? (
                  <Pressable
                    onPress={onConfirm}
                    style={[s.pill, { backgroundColor: accent }]}
                    testID={`${testID}-confirm`}
                  >
                    <Text style={[s.pillText, { color: p.ink }]}>{confirmLabel}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Close disc straddling the top-right corner (the card does not clip it). */}
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={[s.closeDisc, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]}
            accessibilityLabel="close"
            testID={`${testID}-close`}
          >
            <Icon name="close" size={14} color={p.cardInk} strokeWidth={2.4} />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', padding: 24 },
  card: { width: '100%', maxWidth: 340, borderRadius: 18, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  // The band is opaque and clipped to the top corners; the close disc is a
  // sibling so it can overhang the card edge.
  band: { height: 112, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  glyph: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  message: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 18 },
  pill: { paddingVertical: 11, paddingHorizontal: 26, borderRadius: 999, alignItems: 'center' },
  pillOutline: { borderWidth: 1 },
  pillText: { fontSize: 14, fontWeight: '600' },
  closeDisc: { position: 'absolute', top: -12, right: -12, width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
});
