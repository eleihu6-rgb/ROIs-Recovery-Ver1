// Duty Swap · the Matrix | Market switch. Two looks of one control:
// - `rail`: a glass pill of 44×44 icon buttons for the Duo inner screen's
//   right-edge status strip, under the clock (the Schedule roster-view rail).
// - `header`: a two-segment pill in the page header (compact / tall), where the
//   page title sits — the page already says Duty Swap on Home, and the switch
//   names both ways of swapping, so the header gains no extra row.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Icon, type IconName } from '../../../components/v2/icons';
import { CrewAvatar } from '../../settings/avatars';
import { RBOT_AVATAR_INDEX } from '../../rbot/RBotEntry';
import type { CarrierPalette } from '../../../theme/carrier';
import { APPROACHES, APPROACH_LABEL, approachKey, parseApproach, type SwapApproach } from './marketModel';

/** Toolbar column width and its top in the Duo's right-edge status strip —
 *  the same place as the Schedule roster-view rail (ScheduleScreen RAIL_W / RAIL_TOP). */
export const RAIL_W = 56;
export const RAIL_TOP = 116;

const ICON: Record<SwapApproach, IconName> = { matrix: 'grid', market: 'market', ticket: 'ticket' };

/** The crew's last choice (default Matrix). `null` while it is being read. */
export function useSwapApproach(airline: string, crewId: string | null): [SwapApproach | null, (a: SwapApproach) => void] {
  const [approach, setApproach] = useState<SwapApproach | null>(null);
  const key = crewId ? approachKey(airline, crewId) : null;
  useEffect(() => {
    let live = true;
    setApproach(null);
    (async () => {
      let stored: SwapApproach | null = null;
      try {
        stored = key ? parseApproach(await AsyncStorage.getItem(key)) : null;
      } catch {
        // Unreadable storage: fall back to the default.
      }
      if (live) setApproach(stored ?? 'matrix');
    })();
    return () => { live = false; };
  }, [key]);
  const choose = useCallback((a: SwapApproach) => {
    setApproach(a);
    if (!key) return;
    (async () => {
      try { await AsyncStorage.setItem(key, a); } catch { /* the choice still applies for this visit */ }
    })();
  }, [key]);
  return [approach, choose];
}

export function ApproachSwitch({ palette: p, value, onChange, variant }: {
  palette: CarrierPalette;
  value: SwapApproach;
  onChange: (a: SwapApproach) => void;
  variant: 'rail' | 'header';
}): React.JSX.Element {
  if (variant === 'rail') {
    return (
      <View style={s.rail} testID="swap-approach-rail">
        <View style={[s.railPill, { backgroundColor: p.frost, borderColor: p.frostLine }]}>
          {APPROACHES.map(a => {
            const on = a === value;
            return (
              <Pressable key={a} onPress={() => onChange(a)} testID={`approach-${a}`} accessibilityLabel={APPROACH_LABEL[a]}
                accessibilityState={{ selected: on }} hitSlop={4} style={[s.railBtn, on && { backgroundColor: p.cardInset }]}>
                <Icon name={ICON[a]} size={20} color={on ? (p.isLight ? p.btn : p.g1) : p.ink} />
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
  return (
    <View style={[s.seg, { backgroundColor: p.frost, borderColor: p.frostLine }]} testID="swap-approach-header">
      {APPROACHES.map(a => {
        const on = a === value;
        return (
          <Pressable key={a} onPress={() => onChange(a)} testID={`approach-${a}`} accessibilityLabel={APPROACH_LABEL[a]}
            accessibilityState={{ selected: on }} hitSlop={4} style={[s.segBtn, on && { backgroundColor: p.cardInset }]}>
            <Icon name={ICON[a]} size={15} color={on ? (p.isLight ? p.btn : p.g1) : p.ink} strokeWidth={2} />
            <Text style={[s.segText, { color: on ? (p.isLight ? p.btn : p.g1) : p.ink }]}>{APPROACH_LABEL[a]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Page actions share the Duo status strip with the approach switch, but stay
 * in their own glass group so the two navigation levels are easy to scan. */
export function SwapRailActions({ palette: p, rbotOpen, onRecords, onMyDuties, onToggleRbot }: {
  palette: CarrierPalette;
  rbotOpen?: boolean;
  onRecords: () => void;
  onMyDuties: () => void;
  onToggleRbot?: () => void;
}): React.JSX.Element {
  return (
    <View style={[s.railActions, { backgroundColor: p.frost, borderColor: p.frostLine }]} testID="swap-rail-actions">
      <Pressable onPress={onRecords} testID="swap-records" accessibilityLabel="swap requests" hitSlop={4} style={s.railBtn}>
        <Icon name="history" size={22} color={p.ink} strokeWidth={1.8} />
      </Pressable>
      <Pressable onPress={onMyDuties} testID="swap-my-duties" accessibilityLabel="my duties" hitSlop={4} style={s.railBtn}>
        <Icon name="lock" size={20} color={p.ink} strokeWidth={1.8} />
      </Pressable>
      {onToggleRbot ? (
        <Pressable onPress={onToggleRbot} testID="swap-rbot-open" accessibilityLabel="R'Bot" hitSlop={4}
          style={[s.railBtn, rbotOpen && { backgroundColor: p.cardInset }]}>
          <CrewAvatar index={RBOT_AVATAR_INDEX} size={24} bare />
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  rail: { width: RAIL_W, alignItems: 'center' },
  railPill: { borderRadius: 26, borderWidth: 1, padding: 4, gap: 4, alignItems: 'center' },
  railBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  railActions: { borderRadius: 26, borderWidth: 1, padding: 4, gap: 4, alignItems: 'center', marginTop: 16 },
  seg: { flexDirection: 'row', alignSelf: 'center', borderRadius: 18, borderWidth: 1, padding: 3, gap: 2 },
  segBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 8, borderRadius: 15 },
  segText: { fontSize: 13, fontWeight: '700' },
});
