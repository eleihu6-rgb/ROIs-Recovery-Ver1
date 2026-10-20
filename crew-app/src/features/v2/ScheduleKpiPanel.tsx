// Floating limit summary on the Schedule ▸ Timeline view (design: Option 02).
//
// Three figures stay visible above the navigation dock — 28-day flight hours,
// 7-day duty hours, and 90-day take-offs / landings — anchored to the selected
// calendar day. Tapping opens the existing-style detail sheet with all six hour
// windows and both recency lines.
//
// The panel never covers the dock or the date strip: the screen reserves its
// measured height as list padding so the last duty can scroll above it.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useCarrier, glassTint, type CarrierPalette } from '../../theme/carrier';
import { ALL_ORIENTATIONS, type KpiPanelGeometry } from '../../components/v2/useLayout';
import { Icon } from '../../components/v2/icons';
import type { KpiCountMetric, KpiHoursMetric, ScheduleKpi } from './scheduleKpi';
import { hoursText } from './scheduleKpi';

export interface ScheduleKpiPanelProps {
  kpi: ScheduleKpi;
  geometry: KpiPanelGeometry;
  /** Reports the rendered card height so the list can scroll past it. */
  onMeasure?: (height: number) => void;
}

type Tone = 'ok' | 'at-limit' | 'over' | 'short' | 'unavailable';

function toneColor(tone: Tone, p: CarrierPalette): string {
  if (tone === 'over') return p.crit;
  if (tone === 'short') return p.warn;
  return p.cardInk;
}

function barColor(tone: Tone, p: CarrierPalette): string {
  if (tone === 'over') return p.crit;
  if (tone === 'short') return p.warn;
  if (tone === 'unavailable') return 'transparent';
  return p.btn;
}

function Bar({ pct, tone, height, palette }: {
  pct: number; tone: Tone; height: number; palette: CarrierPalette;
}) {
  return (
    <View style={[s.track, { height, backgroundColor: palette.cardLine }]}>
      <View style={{
        height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`,
        backgroundColor: barColor(tone, palette), borderRadius: height,
      }} />
    </View>
  );
}

/** One of the two hour figures on the floating card. */
function FloatHours({ metric, geometry, palette }: {
  metric: KpiHoursMetric; geometry: KpiPanelGeometry; palette: CarrierPalette;
}) {
  return (
    <View style={s.metric} testID={`kpi-${metric.id}`}>
      <Text
        numberOfLines={1}
        style={[s.label, { fontSize: geometry.labelSize, color: palette.cardSoft }]}
      >
        {metric.id === 'flight28' ? '28-day flight' : '7-day duty'}
      </Text>
      <Text
        numberOfLines={2}
        style={[s.value, { fontSize: geometry.valueSize, color: toneColor(metric.status, palette) }]}
        testID={`kpi-value-${metric.id}`}
      >
        {metric.main}
      </Text>
      <Text
        numberOfLines={2}
        style={[s.sub, { fontSize: geometry.subSize, color: palette.cardSoft }]}
        testID={`kpi-sub-${metric.id}`}
      >
        {metric.sub}
      </Text>
      <Bar pct={metric.pct} tone={metric.status} height={geometry.barHeight} palette={palette} />
    </View>
  );
}

/** Take-offs and landings each keep their own label, subtitle and progress line. */
function FloatRecencyRow({ label, metric, geometry, palette }: {
  label: string; metric: KpiCountMetric; geometry: KpiPanelGeometry; palette: CarrierPalette;
}) {
  return (
    <View style={s.recencyRow} testID={`kpi-${metric.id}`}>
      <View style={s.recencyLine}>
        <Text style={[s.recencyLabel, { fontSize: geometry.subSize, color: palette.cardSoft }]}>{label}</Text>
        <Text
          numberOfLines={1}
          style={[s.recencyValue, { fontSize: geometry.valueSize - 6, color: toneColor(metric.status, palette) }]}
          testID={`kpi-value-${metric.id}`}
        >
          {metric.main}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={[s.sub, { fontSize: geometry.subSize - 1, color: palette.cardSoft }]}
        testID={`kpi-sub-${metric.id}`}
      >
        {metric.sub}
      </Text>
      <Bar pct={metric.pct} tone={metric.status} height={geometry.barHeight} palette={palette} />
    </View>
  );
}

function Alert({ text, tone, palette, testID }: {
  text: string; tone: 'over' | 'warn'; palette: CarrierPalette; testID?: string;
}) {
  const base = tone === 'over' ? palette.crit : palette.warn;
  return (
    <View style={[s.alert, { backgroundColor: glassTint(base, 0.14), borderColor: glassTint(base, 0.45) }]} testID={testID}>
      <Text style={[s.alertText, { color: base }]} numberOfLines={2}>{text}</Text>
    </View>
  );
}

/** All six windows plus both recency counts — the detail sheet. */
function DetailSheet({
  kpi,
  visible,
  onClose,
  palette,
}: {
  kpi: ScheduleKpi;
  visible: boolean;
  onClose: () => void;
  palette: CarrierPalette;
}) {
  const hours = [...kpi.flight, ...kpi.duty];
  const { height: windowHeight } = useWindowDimensions();
  // A definite sheet height (not just maxHeight) is what lets the ScrollView
  // take the remaining space and scroll: on a short landscape screen the last
  // window would otherwise render under the Done button.
  const sheetHeight = Math.min(Math.round(windowHeight * 0.84), 720);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={ALL_ORIENTATIONS}>
      {/* The dim layer is a sibling of the sheet, not its parent: an enclosing
          Pressable claims the touch responder and stops the ScrollView inside
          from scrolling (the last windows became unreachable on the Duo). */}
      <View style={s.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close all limits"
          testID="kpi-sheet-backdrop"
        />
        <View style={[s.sheet, { height: sheetHeight, backgroundColor: palette.cardOverlay, borderColor: palette.cardLine }]} testID="kpi-sheet">
          <View style={s.sheetHead}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.sheetTitle, { color: palette.cardInk }]}>Limits &amp; recency</Text>
              <Text style={[s.sheetSub, { color: palette.cardSoft }]} testID="kpi-sheet-anchor">
                Through {kpi.selectedLabel} · {kpi.zone} · projected
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={[s.sheetClose, { borderColor: palette.cardLine }]} accessibilityLabel="close" testID="kpi-sheet-close">
              <Icon name="close" size={14} color={palette.cardInk} strokeWidth={2.4} />
            </Pressable>
          </View>

          {kpi.breaches > 0 ? (
            <Alert
              text={`${kpi.breaches} hour ${kpi.breaches === 1 ? 'limit is' : 'limits are'} exceeded`}
              tone="over"
              palette={palette}
              testID="kpi-sheet-alert"
            />
          ) : null}

          <ScrollView style={s.sheetScroll} contentContainerStyle={s.sheetContent} showsVerticalScrollIndicator={false}>
            <Text style={[s.section, { color: palette.cardSoft }]}>FLIGHT TIME · BLOCK HOURS</Text>
            {kpi.flight.map(m => <DetailRow key={m.id} metric={m} palette={palette} />)}
            <Text style={[s.section, { color: palette.cardSoft }]}>DUTY HOURS · REPORT TO RELEASE</Text>
            {kpi.duty.map(m => <DetailRow key={m.id} metric={m} palette={palette} />)}
            <Text style={[s.section, { color: palette.cardSoft }]}>RECENCY · 90 DAYS ({kpi.recency.window.label})</Text>
            <DetailRow metric={{
              ...kpi.recency.takeOffs,
              window: kpi.recency.window,
            }} palette={palette} />
            <DetailRow metric={{
              ...kpi.recency.landings,
              window: kpi.recency.window,
            }} palette={palette} />

            <Text style={[s.note, { color: palette.cardSoft }]}>
              One operating flight counts as one take-off and one landing. Deadheads and non-flight duties are excluded.
              Planned flights inside each window are included through the selected day.
            </Text>
            {kpi.historyFrom ? (
              <Text style={[s.note, { color: palette.cardSoft }]} testID="kpi-sheet-history">
                Roster history from {kpi.historyFrom}. Windows reaching further back show “—” instead of an
                unproven remaining figure.
              </Text>
            ) : null}
            <Text style={[s.note, { color: palette.cardSoft }]} testID="kpi-sheet-profile">
              {kpi.profileLabel}. Hours remaining are specific to each window and do not by themselves confirm legality.
            </Text>
          </ScrollView>

          <Pressable onPress={onClose} style={[s.done, { backgroundColor: palette.btn }]} accessibilityRole="button" testID="kpi-sheet-done">
            <Text style={[s.doneText, { color: palette.dockLight }]}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ metric, palette }: {
  metric: (KpiHoursMetric | KpiCountMetric) & { window: { label: string } };
  palette: CarrierPalette;
}) {
  const isHours = 'usedMinutes' in metric;
  const planned = isHours ? metric.plannedMinutes : 0;
  const completed = isHours ? metric.completedMinutes : 0;
  return (
    <View style={s.row} testID={`kpi-sheet-row-${metric.id}`}>
      <View style={s.rowHead}>
        <Text style={[s.rowLabel, { color: palette.cardInk }]} numberOfLines={1}>{metric.label}</Text>
        <Text style={[s.rowWindow, { color: palette.cardSoft }]}>{metric.window.label}</Text>
      </View>
      <View style={s.rowValueLine}>
        <Text style={[s.rowValue, { color: toneColor(metric.status, palette) }]} numberOfLines={1}>{metric.main}</Text>
        <Text style={[s.rowSub, { color: palette.cardSoft }]} numberOfLines={2}>{metric.sub}</Text>
      </View>
      <Bar pct={metric.pct} tone={metric.status} height={5} palette={palette} />
      {planned > 0 ? (
        <Text style={[s.rowPlan, { color: palette.cardSoft }]}>
          {hoursText(completed)}h completed · {hoursText(planned)}h planned
        </Text>
      ) : null}
    </View>
  );
}

export function ScheduleKpiPanel({ kpi, geometry, onMeasure }: ScheduleKpiPanelProps): React.JSX.Element {
  const p = useCarrier();
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(0);
  // The card is one VoiceOver element: read the three headline figures together
  // instead of making the crew swipe through six separate labels.
  const summary = [
    `All limits through ${kpi.selectedLabel}.`,
    `28-day flight ${kpi.flight[0].main}.`,
    `7-day duty ${kpi.duty[0].main}.`,
    `90-day take-offs ${kpi.recency.takeOffs.main}, landings ${kpi.recency.landings.main}.`,
    kpi.breaches > 0 ? `${kpi.breaches} hour ${kpi.breaches === 1 ? 'limit' : 'limits'} exceeded.` : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <View
        style={[s.wrap, { width: geometry.width, right: geometry.margin, bottom: geometry.bottom }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={summary}
          testID="sched-kpi"
          style={[
            s.card,
            {
              backgroundColor: p.cardOverlay,
              borderColor: p.cardLine,
              padding: geometry.padding,
            },
          ]}
          onLayout={e => {
            const next = Math.round(e.nativeEvent.layout.height);
            if (next !== height) {
              setHeight(next);
              onMeasure?.(next);
            }
          }}
        >
          <View style={s.head}>
            <Text
              numberOfLines={1}
              style={[s.anchor, { fontSize: geometry.headerSize, color: p.cardSoft }]}
              testID="kpi-anchor"
            >
              Through {kpi.selectedLabel}
            </Text>
            <Text style={[s.allLimits, { fontSize: geometry.headerSize, color: p.btn }]}>All limits ›</Text>
          </View>

          {kpi.breaches > 0 ? (
            <Alert
              text={`${kpi.breaches} hour ${kpi.breaches === 1 ? 'limit' : 'limits'} exceeded`}
              tone="over"
              palette={p}
              testID="kpi-alert"
            />
          ) : kpi.incomplete > 0 ? (
            <Alert
              text={`${kpi.incomplete} ${kpi.incomplete === 1 ? 'limit needs' : 'limits need'} full history`}
              tone="warn"
              palette={p}
              testID="kpi-incomplete"
            />
          ) : null}

          <View style={[s.rowMetrics, { gap: geometry.gap }]}>
            <FloatHours metric={kpi.flight[0]} geometry={geometry} palette={p} />
            <FloatHours metric={kpi.duty[0]} geometry={geometry} palette={p} />
            <View style={s.metric} testID="kpi-recency">
              <Text numberOfLines={1} style={[s.label, { fontSize: geometry.labelSize, color: p.cardSoft }]}>
                90-day TO / LDG
              </Text>
              <FloatRecencyRow label="TO" metric={kpi.recency.takeOffs} geometry={geometry} palette={p} />
              <FloatRecencyRow label="LDG" metric={kpi.recency.landings} geometry={geometry} palette={p} />
            </View>
          </View>
        </Pressable>
      </View>

      <DetailSheet kpi={kpi} visible={open} onClose={() => setOpen(false)} palette={p} />
    </>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', zIndex: 25, elevation: 12 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  anchor: { flex: 1, minWidth: 0, fontWeight: '600' },
  allLimits: { fontWeight: '600' },
  alert: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 8 },
  alertText: { fontSize: 10, fontWeight: '700' },
  rowMetrics: { flexDirection: 'row', alignItems: 'flex-start' },
  metric: { flex: 1, minWidth: 0 },
  label: { fontWeight: '600', letterSpacing: 0.2 },
  value: { fontWeight: '700', marginTop: 3 },
  sub: { marginTop: 2 },
  track: { marginTop: 5, borderRadius: 6, overflow: 'hidden' },
  recencyRow: { marginTop: 3 },
  recencyLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 },
  recencyLabel: { fontWeight: '700', letterSpacing: 0.4 },
  recencyValue: { fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  sheet: { width: '100%', maxWidth: 560, borderRadius: 22, borderWidth: 1, padding: 18 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetSub: { fontSize: 11, marginTop: 3 },
  sheetClose: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // Let the rows shrink inside the max-height sheet so the last window and the
  // Done button stay reachable on a short landscape screen (iPhone Air, Duo).
  sheetScroll: { marginTop: 10, flex: 1, minHeight: 0 },
  sheetContent: { paddingBottom: 8 },
  section: { fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginTop: 14, marginBottom: 4 },
  row: { paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.08)' },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  rowLabel: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  rowWindow: { fontSize: 10 },
  rowValueLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 2 },
  rowValue: { fontSize: 17, fontWeight: '700' },
  rowSub: { fontSize: 10, flexShrink: 1, textAlign: 'right' },
  rowPlan: { fontSize: 10, marginTop: 3 },
  note: { fontSize: 10, lineHeight: 15, marginTop: 10 },
  done: { marginTop: 12, alignSelf: 'center', paddingVertical: 11, paddingHorizontal: 34, borderRadius: 999 },
  doneText: { fontSize: 14, fontWeight: '600' },
});
