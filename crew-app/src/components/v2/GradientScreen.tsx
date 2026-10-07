import React from 'react';
import { View, StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path, G } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CarrierPalette } from '../../theme/carrier';

export interface GradientScreenProps {
  palette: CarrierPalette;
  children?: React.ReactNode;
  texture?: boolean;
  style?: ViewStyle;
  /**
   * Keep content out of the left/right safe areas (default on). On the iPhone
   * Duo inner screen the status bar is an 84pt strip down the RIGHT edge, so
   * content would otherwise sit under the clock; on a portrait iPhone both
   * side insets are 0 and nothing moves. Pass false when the caller already
   * applies them (e.g. a SafeAreaView inside).
   */
  sideInsets?: boolean;
}

export function GradientScreen({
  palette,
  children,
  texture = true,
  style,
  sideInsets = true,
}: GradientScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  // The SVG keeps the size it first laid out at; when the iPhone Duo rotates or
  // unfolds it stopped short (grey band under the gradient). Re-mount it per window
  // size, and paint the gradient's last stop underneath as a fallback. A regular
  // iPhone never changes window size, so nothing changes there.
  const { width, height } = useWindowDimensions();
  return (
    <View style={[styles.root, { backgroundColor: palette.g4 }, style]}>
      <Svg key={`${width}x${height}`} style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="screenGradient" x1="0" y1="0" x2="0.14" y2="1">
            <Stop offset="0" stopColor={palette.g1} />
            <Stop offset="0.32" stopColor={palette.g2} />
            <Stop offset="0.68" stopColor={palette.g3} />
            <Stop offset="1" stopColor={palette.g4} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#screenGradient)" />
      </Svg>
      {texture ? (
        <View style={styles.skyWrap} pointerEvents="none">
          <Svg width={340} height={340} viewBox="0 0 200 200" fill="none" stroke="#fff">
            <Circle cx={120} cy={80} r={78} strokeWidth={1} opacity={0.1} />
            <Path
              d="M-10 175 C 60 150, 120 120, 205 15"
              strokeWidth={2.5}
              strokeDasharray="2 9"
              strokeLinecap="round"
              opacity={0.16}
              fill="none"
            />
            <G opacity={0.14} fill="#fff" stroke="none">
              <Path d="M96 96 L150 42 L156 48 L110 104 Z" />
              <Path d="M150 42 L96 96 L104 60 L138 40 Z" opacity={0.7} />
              <Path d="M110 104 L96 96 L128 118 L112 130 Z" opacity={0.7} />
              <Path d="M150 42 L156 48 L150 66 L138 54 Z" opacity={0.5} />
            </G>
          </Svg>
        </View>
      ) : null}
      {sideInsets && (insets.left > 0 || insets.right > 0) ? (
        <View style={[styles.root, { paddingLeft: insets.left, paddingRight: insets.right }]}>{children}</View>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  skyWrap: {
    position: 'absolute',
    top: -30,
    right: -70,
    width: 340,
    height: 340,
  },
});
