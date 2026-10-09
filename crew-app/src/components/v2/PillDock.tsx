import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon, type IconName } from './icons';
import { RBotEntry } from '../../features/rbot/RBotEntry';
import { sourceFromRoute } from '../../features/rbot/pageContext';
import { glassTint, type CarrierPalette } from '../../theme/carrier';
import { duoActionStripWidth, useLayout } from './useLayout';
import { useAppSelector } from '../../store';

export interface PillDockProps extends BottomTabBarProps {
  palette: CarrierPalette;
}

const ICON_BY_ROUTE: Record<string, IconName> = {
  Home: 'home',
  Schedule: 'plane',
  Global: 'globe',
  Profile: 'user',
};

export function PillDock({ state, descriptors, navigation, palette }: PillDockProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  // Duo inner and outer displays use one right-edge navigation group. Regular
  // iPhones and iPads retain the bottom dock.
  const { wide, width, height } = useLayout();
  const actionStrip = duoActionStripWidth(width, height, insets.right);
  const duoRightRail = actionStrip > 0;
  // Centre within the safe area: the Duo's status bar takes the right edge.
  const wideLeft = Math.max(22, insets.left + (width - insets.left - insets.right - WIDE_DOCK_WIDTH) / 2);
  const wideRight = Math.max(22, width - wideLeft - WIDE_DOCK_WIDTH);
  // The Schedule tab scrolls near-white duty cards right up to the bar, where the
  // frosted glass look vanishes. That tab gets a stronger tint of the theme instead:
  // light enough to belong to the page, dark theme ink for the icons/labels, and
  // the active tab keeps a solid theme button so the current tab still reads first.
  const onLightContent = state.routes[state.index]?.name === 'Schedule';
  const tintedDock = onLightContent || palette.isLight;
  const activeRoute = state.routes[state.index];
  const source = sourceFromRoute(activeRoute.name, activeRoute.params as Record<string, unknown> | undefined);
  const scheduleView = useAppSelector(s => s.rbot.scheduleView);
  if (activeRoute.name === 'Schedule') source.view = scheduleView;

  const tabs = state.routes.map((route, index) => {
    const { options } = descriptors[route.key];
    const isFocused = state.index === index;
    const iconName = ICON_BY_ROUTE[route.name] ?? 'home';
    const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;
    const onPress = (): void => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={`tab-${route.name.toLowerCase()}`}
        testID={`tab-${route.name.toLowerCase()}`}
        style={duoRightRail
          ? [styles.railTab, isFocused && { backgroundColor: palette.btn }]
          : [styles.tab, isFocused ? tintedDock ? { backgroundColor: palette.btn, flex: 1.8 } : styles.tabOn : styles.tabOff]}
      >
        <Icon
          name={iconName}
          size={duoRightRail ? 22 : 24}
          color={duoRightRail
            ? isFocused ? '#fff' : palette.ink
            : tintedDock ? isFocused ? '#fff' : palette.dockInk : '#fff'}
        />
        {!duoRightRail && isFocused ? <Text style={styles.tabLabel}>{label}</Text> : null}
      </Pressable>
    );
  });

  if (duoRightRail) {
    // Keep the four destination tabs as one group. Page actions occupy the
    // upper strip; the AI entry retains its own control below the tabs.
    const railRight = Math.max(0, (actionStrip - RAIL_WIDTH) / 2);
    const railBottom = Math.max(insets.bottom, 12) + 8;
    return (
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View
          style={[styles.rail, { right: railRight, bottom: railBottom + 54,
            backgroundColor: palette.isLight ? glassTint(palette.dockLight) : palette.frost,
            borderColor: palette.frostLine }]}
          testID="duo-nav-rail"
        >
          {tabs}
        </View>
        <View style={[styles.railAi, { right: railRight + 6, bottom: railBottom }]}>
          <RBotEntry palette={palette} onLight={palette.isLight} variant="rail" source={source} />
        </View>
      </View>
    );
  }

  const dock = (
      <View
        style={[
          styles.dock,
          tintedDock
            ? { backgroundColor: glassTint(palette.dockLight), borderColor: palette.isLight ? palette.cardLine : 'rgba(255,255,255,.55)' }
            : null,
        ]}
      >
        {tabs}
      </View>
  );
  const aiEntry = <RBotEntry palette={palette} onLight={tintedDock} source={source} />;

  return (
    <View
      style={[styles.row, { bottom: Math.max(insets.bottom, 22) - 4, left: wide ? wideLeft : 22, right: wide ? wideRight : 22 }]}
      pointerEvents="box-none"
    >
      {dock}
      {/* R'Bot is its OWN box beside the bar — same glass treatment, separate box,
          so it can never be mistaken for a fifth tab (Ryan, 2026-09-11). */}
      {aiEntry}
    </View>
  );
}

/** Dock row width on the wide (Duo inner) layout — about a regular iPhone's bar. */
const WIDE_DOCK_WIDTH = 460;
const RAIL_WIDTH = 56;

const styles = StyleSheet.create({
  // The floating row: the pill dock owns the four tabs, R'Bot owns its own box.
  row: {
    position: 'absolute',
    left: 22,
    right: 22,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  rail: {
    position: 'absolute',
    width: RAIL_WIDTH,
    padding: 5,
    gap: 2,
    borderWidth: 1,
    borderRadius: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  railTab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railAi: {
    position: 'absolute',
  },
  dock: {
    flex: 1,
    height: 66,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.14)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 6,
    // Lifts the glass pill off whatever it floats over (fade scrim on Schedule,
    // photos on Home) so the dock still reads as a bar, not as content.
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tab: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tabOn: {
    backgroundColor: 'rgba(255,255,255,.3)',
    flex: 1.8,
  },
  tabOff: {},
  tabLabel: {
    fontSize: 15,
    fontWeight: '500',
    // White reads on both backings: the frosted pill and (on Schedule) the solid
    // theme button behind the focused tab.
    color: '#fff',
  },
});
