// Full-screen page pushed from the tabs (mock #600): gradient ground, back
// chevron, centred title, scrolling body. Shared by every v2 detail page.
import React, { createContext, useContext } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { GradientScreen } from '../../components/v2/GradientScreen';
import { Icon, type IconName } from '../../components/v2/icons';
import { DashedLine } from '../../components/v2/TicketCard';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';
import { useLayout } from '../../components/v2/useLayout';

/** Widest a single column of settings rows / spec copy is allowed to run. */
export const SINGLE_COLUMN_MAX = 560;

/** A settings page can fill Profile's right pane on a wide Duo. */
export const EmbeddedPageContext = createContext(false);

export function PageShell({
  title, children, right, testID, scroll = true, hero, layout = 'auto', titleNode,
}: {
  title: string; children: React.ReactNode; right?: React.ReactNode; testID?: string;
  /** Replaces the title text with a control in the same place (e.g. the Duty
   *  Swap Matrix | Market switch); `title` stays the page's name. */
  titleNode?: React.ReactNode;
  /** false = a fixed body that manages its own scrolling (e.g. the Duty Swap matrix). */
  scroll?: boolean;
  /**
   * The page's explainer (Hero and whatever belongs with it). On a regular iPhone
   * it sits above the body as always; on the iPhone Duo's landscape inner screen
   * it becomes the left column, the body the right — the explainer is the second
   * kind of content these pages already carry, so it earns the column.
   */
  hero?: React.ReactNode;
  /**
   * 'auto' (default): wide + hero → two columns; wide without hero, or tall →
   * one column capped at SINGLE_COLUMN_MAX and centred (a list of settings does
   * not get split in half for symmetry). 'full': the page lays itself out.
   */
  layout?: 'auto' | 'full';
}) {
  const p = useCarrier();
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { wide, tall } = useLayout();
  const embedded = useContext(EmbeddedPageContext);
  if (embedded) {
    return (
      <ScrollView style={s.embeddedScroll} contentContainerStyle={s.embeddedBody} showsVerticalScrollIndicator={false} testID={testID}>
        <Text style={[s.embeddedTitle, { color: p.ink }]}>{title}</Text>
        {hero}{children}
      </ScrollView>
    );
  }
  const columns = layout === 'auto' && wide && !!hero;
  const centred = layout === 'auto' && !columns && (wide || tall);
  const body = columns ? (
    <View style={s.cols} testID="page-columns">
      <View style={s.colAside}>{hero}</View>
      <View style={s.colMain}>{children}</View>
    </View>
  ) : centred ? (
    <View style={s.centred} testID="page-centred">{hero}{children}</View>
  ) : (
    <>{hero}{children}</>
  );
  return (
    <GradientScreen palette={p} texture={false}>
      <View style={[s.head, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} style={s.iconBtn} accessibilityLabel="back" testID="page-back">
          <Icon name="back" size={24} color={p.ink} strokeWidth={1.8} />
        </Pressable>
        {titleNode ? <View style={s.titleNode}>{titleNode}</View> : (
          <Text style={[s.title, { color: p.ink }]} numberOfLines={1}>{title}</Text>
        )}
        <View style={s.iconBtn}>{right}</View>
      </View>
      {scroll ? (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} testID={testID}>
          {body}
        </ScrollView>
      ) : (
        <View style={[s.fixed, { paddingBottom: insets.bottom }]} testID={testID}>{body}</View>
      )}
    </GradientScreen>
  );
}

/**
 * Side-by-side columns on the iPhone Duo inner screen so a page uses the whole
 * width; each child is one column. Callers only render this when wide — the
 * compact (regular iPhone) layout keeps its own single-column order.
 */
export function Columns({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.cols}>
      {React.Children.toArray(children).map((child, i) => (
        <View key={i} style={s.col}>{child}</View>
      ))}
    </View>
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
export function KvRow({ label, value, palette, last, icon }: { label: string; value: string; palette: CarrierPalette; last?: boolean; icon?: IconName }) {
  return (
    <View>
      <View style={s.kv}>
        {/* `icon` makes a row icon-led: a thin line glyph carries the meaning so the
            label can stay short and the page scans without reading (Ryan: "trip
            details also apply the same, simple line icons for info"). */}
        {icon ? <Icon name={icon} size={17} color={palette.cardSoft} strokeWidth={1.6} /> : null}
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
  // iOS navigation bars use a 17 pt title. Keeping this separate from the
  // identity in the hero prevents a crew number from competing with the page.
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  titleNode: { flex: 1, alignItems: 'center' },
  body: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 40 },
  embeddedScroll: { flex: 1 },
  embeddedBody: { paddingHorizontal: 4, paddingBottom: 24 },
  embeddedTitle: { fontSize: 21, fontWeight: '600', marginBottom: 8 },
  fixed: { flex: 1 },
  cols: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  // PageShell's own two columns: explainer (2) | body (3); centred single column.
  colAside: { flex: 2, minWidth: 0 },
  colMain: { flex: 3, minWidth: 0 },
  centred: { width: '100%', maxWidth: SINGLE_COLUMN_MAX, alignSelf: 'center' },
  hero: { borderRadius: 18, padding: 18, marginBottom: 16 },
  // Identity is a title3, not a large-title: the page title already establishes
  // the screen and the crew number is one value in its settings context.
  h1: { fontSize: 20, fontWeight: '600' },
  h2: { fontSize: 15, marginTop: 4, lineHeight: 20 },
  list: { borderRadius: 18, paddingHorizontal: 18, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingVertical: 12 },
  // The label keeps its own width and the value wraps: in a half-width column
  // (Duo, rotated: calendar | hotel) the old flex-1 label broke mid-word
  // ("Loc-atio-n") beside a long value.
  // Native Settings presents both sides of an informational row at the body
  // size; colour, not a smaller font, establishes the secondary value.
  kvLabel: { fontSize: 17, fontWeight: '400', flexShrink: 0 },
  kvValue: { fontSize: 17, textAlign: 'right', flex: 1 },
  btn: { marginTop: 22, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
