import React from 'react';
import {
  View,
  Pressable,
  Platform,
  StyleSheet,
  type ViewStyle,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Defs, Mask, Rect, Circle, Line } from 'react-native-svg';
import type { CarrierPalette } from '../../theme/carrier';

export interface TicketCardProps {
  palette: CarrierPalette;
  children: React.ReactNode;
  holeY?: number;
  style?: ViewStyle;
  onPress?: () => void;
  testID?: string;
}

export function TicketCard({
  palette,
  children,
  holeY,
  style,
  onPress,
  testID,
}: TicketCardProps): React.JSX.Element {
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  const hasHoles = typeof holeY === 'number';

  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const content = (
    <View
      testID={testID}
      onLayout={onLayout}
      style={[
        styles.card,
        { backgroundColor: hasHoles ? 'transparent' : palette.card },
        style,
      ]}
    >
      {hasHoles && size ? (
        <Svg
          style={StyleSheet.absoluteFill}
          width={size.width}
          height={size.height}
        >
          <Defs>
            <Mask id="ticketHoleMask" maskUnits="userSpaceOnUse" x={0} y={0} width={size.width} height={size.height}>
              <Rect x={0} y={0} width={size.width} height={size.height} fill="#fff" />
              <Circle cx={0} cy={holeY} r={10} fill="#000" />
              <Circle cx={size.width} cy={holeY} r={10} fill="#000" />
            </Mask>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={size.width}
            height={size.height}
            fill={palette.card}
            mask="url(#ticketHoleMask)"
          />
        </Svg>
      ) : null}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} testID={testID ? `${testID}-pressable` : undefined}>
        {content}
      </Pressable>
    );
  }

  return content;
}

export function DashedLine({ color }: { color: string }): React.JSX.Element {
  const [width, setWidth] = React.useState(0);

  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  return (
    <View style={styles.dashedWrap} onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={2}>
          <Line
            x1={0}
            y1={1}
            x2={width}
            y2={1}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 6,
      },
    }),
  },
  dashedWrap: {
    width: '100%',
    height: 2,
  },
});
