// Global tab — placeholder (mock #301).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCarrier } from '../../theme/carrier';
import { GradientScreen } from '../../components/v2/GradientScreen';
import { Icon } from '../../components/v2/icons';

export function GlobalScreen() {
  const p = useCarrier();
  const insets = useSafeAreaInsets();
  return (
    <GradientScreen palette={p}>
      <View style={{ paddingTop: insets.top + 8 }} testID="global-screen">
        <Text style={[s.title, { color: p.ink }]}>Global</Text>
        <View style={s.ph}>
          <View style={[s.globe, { backgroundColor: p.frost, borderColor: p.frostLine }]}><Icon name="globe" size={54} color={p.ink} /></View>
          <Text style={[s.h3, { color: p.ink }]}>Global view is on the way</Text>
          <Text style={[s.p, { color: p.inkSoft }]}>Fleet map, crew worldwide and network status will live here.</Text>
          <Text style={[s.tag, { color: p.ink, backgroundColor: p.frost, borderColor: p.frostLine }]}>Coming soon</Text>
        </View>
      </View>
    </GradientScreen>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '600', textAlign: 'center' },
  ph: { alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 70 },
  globe: { width: 110, height: 110, borderRadius: 55, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  h3: { fontSize: 22, fontWeight: '600', marginTop: 6 },
  p: { fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  tag: { fontSize: 12, fontWeight: '600', borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7, overflow: 'hidden' },
});
