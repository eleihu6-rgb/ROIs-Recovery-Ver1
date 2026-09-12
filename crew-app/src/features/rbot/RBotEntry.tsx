// R'Bot's entry next to the nav bar (mock: Alipay's "阿宝" ball).
//
// Its OWN box, beside the four tabs — the same glass treatment, the same height
// and corner radius, but a separate box so it never reads as a fifth tab
// (Ryan, 2026-09-11). Inside: the panda crew avatar on the theme accent disc
// plus the "AI" tag, so it is recognisably the assistant.
import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CrewAvatar } from '../settings/avatars';
import type { CarrierPalette } from '../../theme/carrier';
import type { V2Nav } from '../v2/nav';

/** Width of R'Bot's own box. The dock keeps its own box to the left of it. */
export const RBOT_ENTRY_WIDTH = 60;

/** The avatar character R'Bot uses — the panda (index 5 in the avatar set). */
export const RBOT_AVATAR_INDEX = 5;

export function RBotEntry({
  palette,
  onLight,
}: {
  palette: CarrierPalette;
  /** True while the dock sits on near-white content (Schedule): the tag flips to
   *  the theme ink so it stays readable on the light dock. */
  onLight: boolean;
}): React.JSX.Element {
  // The entry is rendered by the tab bar, but R'Bot is a stack screen — the
  // action bubbles to the parent navigator, which owns 'RBot'.
  const nav = useNavigation<V2Nav>();
  return (
    <Pressable
      onPress={() => nav.navigate('RBot')}
      hitSlop={6}
      style={[
        styles.box,
        {
          backgroundColor: onLight ? palette.dockLight : 'rgba(255,255,255,.2)',
          borderColor: onLight ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.14)',
        },
      ]}
      testID="dock-rbot"
      accessibilityLabel="R'Bot AI assistant"
      accessibilityRole="button"
    >
      <View style={[styles.disc, { backgroundColor: palette.btn, borderColor: palette.frostLine }]}>
        <CrewAvatar index={RBOT_AVATAR_INDEX} size={32} bare />
      </View>
      <Text style={[styles.tag, { color: onLight ? palette.dockInk : '#fff' }]}>AI</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Same height / radius / shadow as the pill dock — a sibling box, not a tab.
  box: {
    width: RBOT_ENTRY_WIDTH,
    height: 66,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  disc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
