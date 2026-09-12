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
import { useAppSelector } from '../../store';
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
  // R'Bot keeps working after the crew leaves the chat (an action navigated
  // them): the dot says "I replied, come back and carry on".
  const unread = useAppSelector(s => s.rbot.unread);
  const boxColor = onLight ? palette.dockLight : 'rgba(255,255,255,.2)';
  return (
    <Pressable
      onPress={() => nav.navigate('RBot')}
      hitSlop={6}
      style={[
        styles.box,
        {backgroundColor: boxColor, borderColor: onLight ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.14)'},
      ]}
      testID="dock-rbot"
      // The dot itself is inside an accessible container, so iOS folds it into
      // this label: "new reply" is what a screen reader (and Maestro) can see.
      accessibilityLabel={unread ? "R'Bot AI assistant, new reply" : "R'Bot AI assistant"}
      accessibilityRole="button"
    >
      {/* The panda sits straight on the box: no theme-coloured disc behind it
          (Ryan, 2026-09-11) — it already reads as R'Bot in the bar. */}
      <View style={styles.avatar}>
        <CrewAvatar index={RBOT_AVATAR_INDEX} size={34} bare />
        {unread ? (
          <View
            style={[styles.dot, {borderColor: boxColor, backgroundColor: palette.crit}]}
            testID="rbot-unread"
          />
        ) : null}
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
  avatar: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  tag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
