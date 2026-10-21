import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '../../components/v2/icons';
import { useLayout } from '../../components/v2/useLayout';
import { colors, font, radius, space } from '../../theme';
import { useCarrier } from '../../theme/carrier';
import { PageShell } from '../v2/PageShell';
import type { V2StackParamList } from '../v2/nav';
import { formatDuration } from './dutyAnalyzerEngine';
import {
  APPLIED_BASIC_FDP_BANDS,
  APPLIED_LANDING_RANGES,
  appliedBasicFdpSelection,
  easaBasicFdpSelection,
} from './dutyAnalyzerRulePack';

type Props = NativeStackScreenProps<V2StackParamList, 'DutyAnalyzerReference'>;

const clockValue = (minuteOfDay: number): string =>
  `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;

export function DutyAnalyzerReferenceScreen({ route }: Props): React.JSX.Element {
  const p = useCarrier();
  const { wide, tall } = useLayout();
  const { input } = route.params;
  const selection = input.composition === 'basic' || input.composition === '2P'
    ? appliedBasicFdpSelection(input.reportMinuteOfDay, input.sectors)
    : null;
  const easaSelection = input.composition === 'basic' || input.composition === '2P'
    ? easaBasicFdpSelection(input.reportMinuteOfDay, input.sectors)
    : null;

  const applied = selection ? (
    <View style={[s.applied, { backgroundColor: p.card, borderColor: p.cardLine }]} testID="easa-applied-row">
      <View style={s.appliedHead}>
        <View style={[s.bookBadge, { borderColor: p.btn }]}><Icon name="book" size={21} color={p.btn} /></View>
        <View style={s.flex}>
          <Text style={[s.eyebrow, { color: p.cardSoft }]}>YOUR APPLIED AIRLINE ROW</Text>
          <Text style={[s.appliedTitle, { color: p.cardInk }]}>Why this analysis uses {formatDuration(selection.maxFdpMinutes)}</Text>
        </View>
      </View>
      <View style={s.path}>
        <Fact label="Report local" value={clockValue(input.reportMinuteOfDay)} p={p} testID="easa-report-local" />
        <Icon name="chev" size={18} color={p.cardSoft} />
        <Fact label="Reporting range" value={`${selection.start}–${selection.end}`} p={p} testID="easa-report-range" />
        <Icon name="chev" size={18} color={p.cardSoft} />
        <Fact label="Landings" value={`${input.sectors}`} p={p} testID="easa-landings" />
        <Icon name="chev" size={18} color={p.cardSoft} />
        <View style={[s.fact, s.appliedFact, { backgroundColor: p.btn }]} testID="easa-max-fdp">
          <Text style={s.factLabelOnAccent}>MAX FDP</Text>
          <DurationValue minutes={selection.maxFdpMinutes} color={colors.onPrimary} compact />
        </View>
      </View>
    </View>
  ) : (
    <View style={[s.applied, { backgroundColor: p.card, borderColor: p.cardLine }]} testID="easa-applied-unavailable">
      <Text style={[s.appliedTitle, { color: p.cardInk }]}>This duty uses a different EASA reference</Text>
      <Text style={[s.body, { color: p.cardSoft }]}>The highlighted Basic acclimatised table applies only to Basic flight-deck duties. Return to the Analyzer to review the evaluated result for this composition.</Text>
    </View>
  );

  const comparison = easaSelection && selection ? <View style={[s.comparisonCard, { backgroundColor: p.card, borderColor: p.cardLine }]} testID="easa-official-baseline">
    <View style={s.sourceTitle}><Icon name="doc" size={19} color={p.btn} /><Text style={[s.sectionTitle, { color: p.cardInk }]}>Official EASA baseline</Text></View>
    <Text style={[s.body, { color: p.cardSoft }]}>ORO.FTL.205 Table 2 uses sectors rather than the airline table’s landing groups.</Text>
    <View style={s.comparisonPath}>
      <Fact label="EASA range" value={`${easaSelection.start}–${easaSelection.end}`} p={p} testID="easa-official-range" />
      <Fact label="Sector column" value={easaSelection.sectorLabel} p={p} testID="easa-official-sectors" />
      <View style={[s.fact, s.officialFact, { borderColor: p.btn, backgroundColor: p.cardSolid }]} testID="easa-official-max-fdp">
        <Text style={[s.factLabel, { color: p.cardSoft }]}>EASA MAX FDP</Text>
        <DurationValue minutes={easaSelection.maxFdpMinutes} color={p.cardInk} compact />
      </View>
    </View>
    <Text style={[s.bodyStrong, { color: p.cardInk }]} testID="easa-comparison-note">The app applies the more restrictive configured airline value: {formatDuration(selection.maxFdpMinutes)} instead of the EASA baseline {formatDuration(easaSelection.maxFdpMinutes)}.</Text>
  </View> : null;

  const table = <View style={[s.tableCard, { backgroundColor: p.card, borderColor: p.cardLine }]} testID="easa-fdp-table">
    <Text style={[s.sectionTitle, { color: p.cardInk }]}>Configured airline FDP table</Text>
    <Text style={[s.body, { color: p.cardSoft }]}>Find the report-time row, then move across to the landing column. The highlighted intersection is the maximum FDP used by this analysis.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator testID="easa-table-scroll">
      <View style={s.table}>
        <View style={[s.tableRow, s.tableHead, { borderColor: p.cardLine }]}>
          <View style={[s.rangeCell, { backgroundColor: p.cardSolid }]}><Text style={[s.columnHead, { color: p.cardInk }]}>Report local</Text></View>
          {APPLIED_LANDING_RANGES.map(range => <View key={range.label} style={[s.valueCell, { backgroundColor: p.cardSolid }]}><Text style={[s.columnHead, { color: p.cardInk }]}>{range.label}</Text></View>)}
        </View>
        {APPLIED_BASIC_FDP_BANDS.map((band, rowIndex) => {
          const selectedRow = rowIndex === selection?.bandIndex;
          return <View key={`${band.start}-${band.end}`} style={[s.tableRow, { borderColor: p.cardLine }]} testID={`easa-table-row-${rowIndex}`}>
            <View style={[s.rangeCell, { backgroundColor: selectedRow ? p.frostStrong : p.cardInset, borderColor: selectedRow ? p.btn : p.cardLine }]}>
              <Text style={[s.rangeText, { color: p.cardInk }]}>{band.start}–{band.end}</Text>
            </View>
            {band.limits.map((limit, columnIndex) => {
              const selected = selectedRow && columnIndex === selection?.landingIndex;
              return <View key={`${limit}-${columnIndex}`} style={[s.valueCell, { backgroundColor: selected ? p.btn : p.cardInset, borderColor: selected ? p.btn : p.cardLine }]} testID={selected ? 'easa-selected-cell' : undefined}>
                <Text style={[s.cellText, { color: selected ? colors.onPrimary : p.cardInk }]}>{limit}</Text>
              </View>;
            })}
          </View>;
        })}
      </View>
    </ScrollView>
    <Text style={[s.tableNote, { color: p.cardSoft }]}>Columns are landings. Times are durations in HH:MM.</Text>
  </View>;

  const source = <View style={[s.sourceCard, { backgroundColor: p.card, borderColor: p.cardLine }]} testID="easa-source">
    <View style={s.sourceTitle}><Icon name="doc" size={19} color={p.btn} /><Text style={[s.sectionTitle, { color: p.cardInk }]}>Regulatory source</Text></View>
    <Text style={[s.bodyStrong, { color: p.cardInk }]}>EASA Easy Access Rules for Air Operations</Text>
    <Text style={[s.body, { color: p.cardSoft }]}>ORO.FTL.205(b)(1), Table 2 — Maximum daily FDP — Acclimatised crew members · Revision 24, March 2026.</Text>
    <Text style={[s.body, { color: p.cardSoft }]}>The EASA card shows the regulation’s baseline. The highlighted table shows the separate configured airline lookup used by this on-device analysis. Your airline operations manual and approved flight-time specification scheme remain authoritative.</Text>
  </View>;

  return <PageShell title="FDP Reference" testID="duty-analyzer-reference" layout="full" scroll={false}>
    {wide ? <View style={s.columns} testID="easa-reference-columns"><ScrollView style={s.left} contentContainerStyle={s.content} testID="easa-reference-left-scroll">{applied}{comparison}{source}</ScrollView><ScrollView style={s.right} contentContainerStyle={s.content} testID="easa-reference-right-scroll">{table}</ScrollView></View> : <ScrollView contentContainerStyle={[s.content, tall && s.tall]} testID="easa-reference-single">{applied}{comparison}{table}{source}</ScrollView>}
  </PageShell>;
}

function Fact({ label, value, p, testID }: { label: string; value: string; p: ReturnType<typeof useCarrier>; testID: string }) {
  return <View style={[s.fact, { backgroundColor: p.cardInset, borderColor: p.cardLine }]} testID={testID}>
    <Text style={[s.factLabel, { color: p.cardSoft }]}>{label.toUpperCase()}</Text>
    <Text style={[s.factValue, { color: p.cardInk }]}>{value}</Text>
  </View>;
}

function DurationValue({ minutes, color, compact = false }: { minutes: number; color: string; compact?: boolean }) {
  const value = formatDuration(minutes);
  const colon = value.indexOf(':');
  return <Text accessibilityLabel={value} style={[s.durationHours, compact && s.durationHoursCompact, { color }]}>
    {value.slice(0, colon)}<Text style={[s.durationMinutes, compact && s.durationMinutesCompact, { color }]}>{value.slice(colon)}</Text>
  </Text>;
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 48, gap: space.md12 },
  tall: { width: '100%', maxWidth: 620, alignSelf: 'center' },
  columns: { flex: 1, flexDirection: 'row', gap: space.lg16, paddingHorizontal: 22, paddingTop: 6 },
  left: { flex: 0.85, minWidth: 0 },
  right: { flex: 1.15, minWidth: 0 },
  applied: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg16, gap: space.md12 },
  appliedHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
  bookBadge: { width: 40, height: 40, borderWidth: 2, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { ...font.overline },
  appliedTitle: { ...font.title, marginTop: 2 },
  path: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm8 },
  fact: { minWidth: 112, flexGrow: 1, minHeight: 72, borderWidth: 1, borderRadius: radius.md, padding: space.md12, justifyContent: 'center' },
  appliedFact: { borderWidth: 0 },
  factLabel: { ...font.overline },
  factLabelOnAccent: { ...font.overline, color: colors.onPrimaryMuted },
  factValue: { ...font.title, marginTop: space.xs4, fontVariant: ['tabular-nums'] },
  durationHours: { ...font.h2, fontVariant: ['tabular-nums'] },
  durationHoursCompact: { ...font.title },
  durationMinutes: { ...font.sub, fontVariant: ['tabular-nums'] },
  durationMinutesCompact: { ...font.caption },
  comparisonCard: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg16, gap: space.sm8 },
  comparisonPath: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm8 },
  officialFact: { borderWidth: 2 },
  tableCard: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg16, gap: space.sm8 },
  sectionTitle: { ...font.title },
  bodyStrong: { ...font.bodyStrong },
  body: { ...font.sub, lineHeight: 19 },
  table: { minWidth: 628, marginTop: space.xs4 },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tableHead: { borderTopWidth: StyleSheet.hairlineWidth },
  rangeCell: { width: 148, minHeight: 46, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm8 },
  valueCell: { width: 80, minHeight: 46, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  columnHead: { ...font.caption, textAlign: 'center' },
  rangeText: { ...font.sub, fontVariant: ['tabular-nums'] },
  cellText: { ...font.sub, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tableNote: { ...font.caption },
  sourceCard: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg16, gap: space.sm8 },
  sourceTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
});
