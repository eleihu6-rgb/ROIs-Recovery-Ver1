import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme';

// "Layover X+ hrs" label — plain text in the same muted gray as the flight
// dates (one neutral, no extra accent), shared by the My Trips hotel card and
// the Explore layover card. Renders nothing when there is no positive layover.
export function LayoverBadge({ hours }: { hours?: number }) {
  if (hours == null || hours <= 0) {
    return null;
  }
  return (
    <Text style={styles.text} testID="layover-badge">
      Layover {hours}+ hrs
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
});
