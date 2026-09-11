// Full-screen page pushed from the tabs (mock #600): gradient ground, back
// chevron, centred title, scrolling body. Shared by every v2 detail page.
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { GradientScreen } from '../../components/v2/GradientScreen';
import { Icon } from '../../components/v2/icons';
import { DashedLine } from '../../components/v2/TicketCard';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';

export function PageShell({
  title, children, right, testID,
}: { title: string; children: React.ReactNode; right?: React.ReactNode; testID?: string }) {
  const p = useCarrier();
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  return (
    <GradientScreen palette={p} texture={false}>
      <View style={[s.head, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} style={s.iconBtn} accessibilityLabel="back" testID="page-back">
          <Icon name="back" size={24} color={p.ink} strokeWidth={1.8} />
        </Pressable>
        <Text style={[s.title, { color: p.ink }]} numberOfLines={1}>{title}</Text>
        <View style={s.iconBtn}>{right}</View>
      </View>
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} testID={testID}>
        {children}
      </ScrollView>
    </GradientScreen>
  );
}

/** Frosted intro block (mock .page .hero). */
export function Hero({ h1, h2, palette }: { h1?: string; h2?: string; palette: CarrierPalette }) {
  return (
    <View style={[s.hero, { backgroundColor: palette.frost }]}>
      {!!h1 && <Text style={[s.h1, { color: palette.ink }]}>{h1}</Text>}
      {!!h2 && <Text style={[s.h2, { color: palette.inkSoft }]}>{h2}</Text>}
    </View>
  );
}

/** White list card (mock .plist). Children are rows; dashed dividers drawn by caller rows. */
export function ListCard({ children, palette, style }: { children: React.ReactNode; palette: CarrierPalette; style?: ViewStyle }) {
  return <View style={[s.list, { backgroundColor: palette.card }, style]}>{children}</View>;
}

/** Key/value row (mock rows()). */
export function KvRow({ label, value, palette, last }: { label: string; value: string; palette: CarrierPalette; last?: boolean }) {
  return (
    <View>
      <View style={s.kv}>
        <Text style={[s.kvLabel, { color: palette.cardInk }]}>{label}</Text>
        <Text style={[s.kvValue, { color: palette.cardSoft }]}>{value}</Text>
      </View>
      {!last && <DashedLine color={palette.cardLine} />}
    </View>
  );
}

/** Primary button (mock .btn). */
export function PrimaryButton({ label, onPress, palette, testID, style }: { label: string; onPress?: () => void; palette: CarrierPalette; testID?: string; style?: ViewStyle }) {
  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => [s.btn, { backgroundColor: palette.btn, opacity: pressed ? 0.92 : 1 }, style]}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '600' },
  body: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 40 },
  hero: { borderRadius: 18, padding: 18, marginBottom: 16 },
  h1: { fontSize: 22, fontWeight: '600' },
  h2: { fontSize: 13, marginTop: 4, lineHeight: 19 },
  list: { borderRadius: 18, paddingHorizontal: 18, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingVertical: 15 },
  kvLabel: { fontSize: 14, fontWeight: '500', flex: 1 },
  kvValue: { fontSize: 13, textAlign: 'right' },
  btn: { marginTop: 22, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
