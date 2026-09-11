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

  return (
    <View
      style={[
        styles.dock,
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
              isFocused ? styles.tabOn : styles.tabOff,
            ]}
          >
            <Icon name={iconName} size={24} color="#fff" />
            {isFocused ? <Text style={styles.tabLabel}>{label}</Text> : null}
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
    color: '#fff',
  },
});
