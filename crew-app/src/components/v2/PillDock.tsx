import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon, type IconName } from './icons';
import type { CarrierPalette } from '../../theme/carrier';

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
  // The Schedule tab scrolls near-white duty cards right up to the bar, where the
  // frosted glass look vanishes. That tab gets a solid tint of the theme instead:
  // light enough to belong to the page, dark theme ink for the icons/labels, and
  // the active tab keeps a solid theme button so the current tab still reads first.
  const onLightContent = state.routes[state.index]?.name === 'Schedule';

  return (
    <View
      style={[
        styles.dock,
        onLightContent
          ? { backgroundColor: palette.dockLight, borderColor: 'rgba(255,255,255,.55)' }
          : null,
        { bottom: Math.max(insets.bottom, 22) - 4 },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const iconName = ICON_BY_ROUTE[route.name] ?? 'home';
        const label =
          typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;

        const onPress = (): void => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityLabel={`tab-${route.name.toLowerCase()}`}
            testID={`tab-${route.name.toLowerCase()}`}
            style={[
              styles.tab,
              isFocused
                ? onLightContent
                  ? { backgroundColor: palette.btn, flex: 1.8 }
                  : styles.tabOn
                : styles.tabOff,
            ]}
          >
            <Icon
              name={iconName}
              size={24}
              color={onLightContent ? (isFocused ? '#fff' : palette.dockInk) : '#fff'}
            />
            {isFocused ? (
              <Text style={styles.tabLabel}>{label}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 22,
    right: 22,
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
