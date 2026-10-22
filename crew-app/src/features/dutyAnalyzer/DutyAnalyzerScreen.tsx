import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDialog } from '../../components/v2/AppDialog';
import { Icon } from '../../components/v2/icons';
import { duoActionStripWidth, useLayout } from '../../components/v2/useLayout';
import { useAppSelector } from '../../store';
import { colors, font, radius, space } from '../../theme';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';
import { airlineByCode } from '../auth/airlines';
import { knownAirportZone } from '../settings/airportZones';
import { hhmmInZone, wallClockInZone, zonedWallClockToUtc } from '../settings/timeFormat';
import { PageShell, PrimaryButton } from '../v2/PageShell';
import { useV2Nav } from '../v2/nav';
import { evaluateDuty, formatDuration, newDutyTiming, type NewDutyTiming } from './dutyAnalyzerEngine';
import {
  addUtcMinutes,
  cloneDutyTimeline,
  divertAndAddRecovery,
  editSegmentTimes,
  rosterInput,
  rosterPairings,
  shiftLinkedTimes,
  shiftReportTime,
  timelineInput,
  timelineRoute,
} from './dutyAnalyzerRoster';
import {
  analyzerOwner,
  deleteDutyScenario,
  loadDutyScenarios,
  saveDutyScenario,
} from './dutyAnalyzerStorage';
import type {
  AnalyzerDutyTimeline,
  AnalyzerMetric,
  AnalyzerRosterDuty,
  AnalyzerRosterSegment,
  DutyAnalyzerInput,
  DutyAnalyzerResult,
  MetricStatus,
  SavedDutyScenario,
  TimelineShiftScope,
} from './dutyAnalyzerTypes';

type Mode = 'roster' | 'new' | 'saved';
type FlightAction = 'move' | 'diversion' | null;

const newDutyInput = (now = new Date()): DutyAnalyzerInput => ({
  crewCategory: 'flight-deck',
  acclimatisation: 'acclimatised',
  composition: 'basic',
  restFacility: null,
  reportMinuteOfDay: now.getHours() * 60 + now.getMinutes(),
  latestChockOnMinuteOfDay: null,
  sectors: 2,
  fdpMinutes: null,
  dpMinutes: null,
  blockMinutes: null,
  restBeforeMinutes: null,
  restAfterMinutes: null,
  atHomeBase: true,
  timezoneDifferenceHours: 0,
  splitBreakMinutes: 0,
  useDiscretion: false,
});

const ROSTER_CONTEXT = newDutyInput(new Date(2026, 0, 1, 7));

const statusLabel = (status: MetricStatus): string => ({
  within: 'Within limit',
  tight: 'Tight',
  exceeded: 'Exceeded',
  'not-evaluated': 'Not evaluated',
  'needs-review': 'Needs review',
})[status];

const statusColor = (status: MetricStatus, p: CarrierPalette): string => {
  if (status === 'exceeded') return p.cardCrit;
  if (status === 'tight' || status === 'needs-review') return p.cardWarn;
  if (status === 'within') return p.cardGood;
  return p.cardSoft;
};

const numberValue = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
};

const clockValue = (minuteOfDay: number): string =>
  `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;

const utcClock = (iso: string): string => {
  const date = new Date(iso);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
};

const parseClockValue = (value: string): number | null => {
  const compact = /^(\d{2})(\d{2})$/.exec(value.trim());
  const separated = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  const match = compact ?? separated;
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
};

const localClock = (iso: string, airport: string): string => {
  const zone = knownAirportZone(airport);
  return zone ? hhmmInZone(new Date(iso), zone) : utcClock(iso);
};

const localDate = (iso: string, airport: string): string => {
  const zone = knownAirportZone(airport);
  const wall = zone ? wallClockInZone(new Date(iso), zone) : new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
  const [year, month, day] = wall.slice(0, 10).split('-').map(Number);
  return `${String(day).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${year}`;
};

const localWithClock = (iso: string, airport: string, value: string): string | null => {
  if (parseClockValue(value) == null) return null;
  const zone = knownAirportZone(airport);
  if (!zone) return null;
  const near = new Date(iso);
  const localDateValue = wallClockInZone(near, zone).slice(0, 10);
  const [year, month, day] = localDateValue.split('-').map(Number);
  const candidates = [-1, 0, 1]
    .map(dayDelta => {
      const date = new Date(Date.UTC(year, month - 1, day + dayDelta));
      const dateValue = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      return zonedWallClockToUtc(`${dateValue} ${value}`, zone, near);
    })
    .filter((candidate): candidate is Date => candidate != null)
    .sort((a, b) => Math.abs(a.getTime() - near.getTime()) - Math.abs(b.getTime() - near.getTime()));
  return candidates[0]?.toISOString() ?? null;
};

const minutesBetween = (fromUtc: string, toUtc: string): number =>
  Math.round((new Date(toUtc).getTime() - new Date(fromUtc).getTime()) / 60_000);

const formatDelta = (minutes: number): string =>
  `${minutes >= 0 ? '+' : '−'}${Math.abs(minutes)} min`;

function ModeTabs({ mode, onChange, p }: { mode: Mode; onChange: (mode: Mode) => void; p: CarrierPalette }) {
  return <View style={[s.tabs, { backgroundColor: p.frost }]} testID="analyzer-modes">
    {([['roster', 'My roster'], ['new', 'New duty'], ['saved', 'Saved']] as const).map(([value, label]) => {
      const active = mode === value;
      return <Pressable key={value} onPress={() => onChange(value)} style={[s.tab, active && { backgroundColor: p.cardSolid, borderColor: p.cardLine }]} testID={`analyzer-mode-${value}`} accessibilityState={{ selected: active }}>
        <Text style={[s.tabText, { color: active ? p.ink : p.inkSoft }]}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

function Panel({ children, p, testID, compact = false }: { children: React.ReactNode; p: CarrierPalette; testID?: string; compact?: boolean }) {
  return <View style={[s.panel, compact && s.panelCompact, { backgroundColor: p.card, borderColor: p.cardLine }]} testID={testID}>{children}</View>;
}

function PanelHeading({ title, detail, p }: { title: string; detail?: string; p: CarrierPalette }) {
  return <View style={s.panelHeading}>
    <Text style={[s.sectionTitle, { color: p.cardInk }]}>{title}</Text>
    {detail ? <Text style={[s.help, { color: p.cardSoft }]}>{detail}</Text> : null}
  </View>;
}

function AnalyzerActionRail({ p, onReset, onSave, width }: { p: CarrierPalette; onReset: () => void; onSave: () => void; width: number }) {
  return <View pointerEvents="box-none" style={[s.actionRailEdge, { right: -width, width }]} testID="analyzer-action-rail-edge">
    <View style={[s.actionRail, { backgroundColor: p.frost, borderColor: p.frostLine }]}>
      <Pressable onPress={onReset} accessibilityLabel="Reset scenario" testID="analyzer-reset" hitSlop={4} style={s.actionRailButton}>
        <Icon name="history" size={21} color={p.ink} strokeWidth={1.8} />
        <Text style={[s.actionRailLabel, { color: p.ink }]}>Reset</Text>
      </Pressable>
      <View style={[s.actionRailDivider, { backgroundColor: p.frostLine }]} />
      <Pressable onPress={onSave} accessibilityLabel="Save scenario" testID="analyzer-save" hitSlop={4} style={s.actionRailButton}>
        <Icon name="check" size={21} color={p.ink} strokeWidth={1.8} />
        <Text style={[s.actionRailLabel, { color: p.ink }]}>Save</Text>
      </Pressable>
    </View>
  </View>;
}

function MetricCard({
  result,
  p,
  baseline,
  onOpenReference,
  unavailableLabel,
  derivedRestMinutes,
  hiddenMetrics = [],
  testID = 'analyzer-result',
}: {
  result: DutyAnalyzerResult;
  p: CarrierPalette;
  baseline?: DutyAnalyzerResult;
  onOpenReference: () => void;
  unavailableLabel?: string;
  derivedRestMinutes?: number | null;
  hiddenMetrics?: AnalyzerMetric['key'][];
  testID?: string;
}) {
  const color = statusColor(result.status, p);
  return <Panel p={p} testID={testID}>
    <View style={s.resultHead} accessibilityLiveRegion="polite" accessibilityLabel={`${result.headline}. ${statusLabel(result.status)}`}>
      <View style={[s.statusGlyph, { borderColor: color }]}>
        <Icon name={result.status === 'exceeded' ? 'warning' : result.status === 'within' ? 'check' : 'info'} size={20} color={color} />
      </View>
      <View style={s.flex}>
        <Text style={[s.resultTitle, { color: result.status === 'exceeded' ? p.cardCrit : p.cardInk }]}>{result.headline}</Text>
        <Text style={[s.source, { color: p.cardSoft }]}>{baseline ? 'Local advisory · Portal roster unchanged' : result.source}</Text>
      </View>
      <Text style={[s.statusText, { color: result.status === 'exceeded' ? p.cardCrit : p.cardInk }]}>{statusLabel(result.status)}</Text>
    </View>
    <View style={s.metrics}>
      {result.metrics.filter(metric => !hiddenMetrics.includes(metric.key)).map(metric => {
        const original = baseline?.metrics.find(item => item.key === metric.key);
        if (metric.key === 'rest' && derivedRestMinutes !== undefined) {
          return <DerivedRestRow key={metric.key} minutes={derivedRestMinutes} p={p} />;
        }
        return <MetricRow key={metric.key} metric={metric} baseline={original} p={p} unavailableLabel={unavailableLabel} />;
      })}
    </View>
    <View style={[s.resultNote, { backgroundColor: p.cardInset }]}>
      <View style={s.referenceHead}>
        <Text style={[s.referenceTitle, { color: p.cardInk }]}>How this limit was selected</Text>
        <Pressable onPress={onOpenReference} style={[s.referenceButton, { borderColor: p.cardLine, backgroundColor: p.cardSolid }]} accessibilityLabel="Open EASA reference" testID="analyzer-open-reference">
          <Icon name="book" size={18} color={p.btn} />
          <Text style={[s.referenceButtonText, { color: p.cardInk }]}>Reference</Text>
        </Pressable>
      </View>
      {result.explanation.slice(0, 3).map((line, index) =>
        <Text key={`${line}-${index}`} style={[s.explainText, { color: p.cardSoft }]}>• {line}</Text>)}
    </View>
  </Panel>;
}

function DurationValue({ minutes, color, style, unavailableLabel }: { minutes: number | null; color: string; style?: object; unavailableLabel?: string }) {
  const value = formatDuration(minutes);
  if (value === 'Not published') return <Text numberOfLines={unavailableLabel ? 2 : 1} style={[s.metricUnavailable, style, { color }]}>{unavailableLabel ?? value}</Text>;
  const colon = value.indexOf(':');
  return <Text accessibilityLabel={value} style={[s.metricValue, style, { color }]}>
    {value.slice(0, colon)}<Text style={[s.metricMinutes, { color }]}>{value.slice(colon)}</Text>
  </Text>;
}

function DerivedRestRow({ minutes, p }: { minutes: number | null; p: CarrierPalette }) {
  return <View style={[s.metricRow, { backgroundColor: p.cardInset, borderColor: p.cardLine }]} testID="metric-rest">
    <View style={s.metricLabelRow}>
      <Text style={[s.metricLabel, { color: p.cardInk }]}>REST</Text>
    </View>
    <View style={s.metricMiddle}>
      <DurationValue minutes={minutes} color={p.cardInk} unavailableLabel="Awaiting DP" />
      <Text style={[s.metricLimit, { color: p.cardSoft }]}>Required after duty</Text>
    </View>
    <Text style={[s.metricMargin, { color: p.cardInk, borderColor: p.cardLine }]}>From DP</Text>
  </View>;
}

function MetricRow({ metric, baseline, p, unavailableLabel }: { metric: AnalyzerMetric; baseline?: AnalyzerMetric; p: CarrierPalette; unavailableLabel?: string }) {
  const exceeded = metric.status === 'exceeded';
  const color = exceeded ? p.cardCrit : p.cardInk;
  const minimum = metric.key === 'rest';
  const marginLabel = metric.marginMinutes == null
    ? statusLabel(metric.status)
    : metric.marginMinutes < 0
      ? `${minimum ? 'Short' : 'Over'} ${formatDuration(Math.abs(metric.marginMinutes))}`
      : `${minimum ? 'Above' : 'Margin'} ${formatDuration(metric.marginMinutes)}`;
  return <View style={[s.metricRow, { backgroundColor: p.cardInset, borderColor: exceeded ? p.cardCrit : p.cardLine }]} testID={`metric-${metric.key}`}>
    <View style={s.metricLabelRow}>
      {exceeded ? <Icon name="warning" size={15} color={p.cardCrit} testID={`metric-${metric.key}-warning`} /> : null}
      <Text style={[s.metricLabel, { color: exceeded ? p.cardCrit : p.cardInk }]}>{metric.label}</Text>
    </View>
    <View style={s.metricMiddle}>
      <View style={s.metricValues}>
        <DurationValue minutes={metric.actualMinutes} color={color} unavailableLabel={unavailableLabel} />
        {baseline ? <Text style={[s.metricBaseline, { color: p.cardSoft }]} testID={`metric-${metric.key}-baseline`}>Portal {formatDuration(baseline.actualMinutes)}</Text> : null}
      </View>
      <Text style={[s.metricLimit, { color: p.cardSoft }]}>{metric.limitMinutes == null ? statusLabel(metric.status) : `${minimum ? 'Minimum' : 'Limit'} ${formatDuration(metric.limitMinutes)}`}</Text>
    </View>
    <Text style={[s.metricMargin, exceeded && s.metricMarginExceeded, { color: exceeded ? p.cardCrit : p.cardInk, borderColor: exceeded ? p.cardCrit : p.cardLine }]}>{marginLabel}</Text>
  </View>;
}

function PublishedMetrics({ duty, p }: { duty: AnalyzerRosterDuty; p: CarrierPalette }) {
  return <View style={s.published}>
    {([['FDP', duty.fdpMinutes], ['DP', duty.dpMinutes], ['REST', duty.restMinutes], ['BLOCK', duty.blockMinutes]] as const).map(([label, value]) =>
      <View key={label} style={s.publishedMetric}>
        <Text style={[s.metricLabel, { color: p.cardSoft }]}>{label}</Text>
        <Text style={[s.publishedValue, { color: p.cardInk }]}>{value == null ? '' : formatDuration(value)}</Text>
      </View>)}
  </View>;
}

function Field({ label, value, onChange, suffix, p, testID }: { label: string; value: number; onChange: (value: number) => void; suffix: string; p: CarrierPalette; testID: string }) {
  return <View style={s.field}>
    <Text style={[s.fieldLabel, { color: p.cardInk }]}>{label}</Text>
    <View style={[s.inputWrap, { backgroundColor: p.cardInset, borderColor: p.cardLine }]}>
      <TextInput value={String(value)} onChangeText={text => onChange(numberValue(text, 0))} keyboardType="number-pad" style={[s.input, { color: p.cardInk }]} testID={testID} accessibilityLabel={label} />
      <Text style={[s.suffix, { color: p.cardSoft }]}>{suffix}</Text>
    </View>
  </View>;
}

function ClockField({ label, value, onChange, p, testID }: { label: string; value: number; onChange: (value: number) => void; p: CarrierPalette; testID: string }) {
  const [draft, setDraft] = React.useState(clockValue(value));
  React.useEffect(() => setDraft(clockValue(value)), [value]);
  const commit = () => {
    const next = parseClockValue(draft) ?? value;
    setDraft(clockValue(next));
    onChange(next);
  };
  return <View style={s.field}>
    <Text style={[s.fieldLabel, { color: p.cardInk }]}>{label}</Text>
    <View style={[s.inputWrap, { backgroundColor: p.cardInset, borderColor: p.cardLine }]}>
      <TextInput value={draft} onChangeText={setDraft} onBlur={commit} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="HH:MM" placeholderTextColor={p.cardSoft} style={[s.input, { color: p.cardInk }]} testID={testID} accessibilityLabel={label} />
      <Text style={[s.suffix, { color: p.cardSoft }]}>24h</Text>
    </View>
  </View>;
}

function OptionalClockField({ label, value, onChange, p, testID }: { label: string; value: number | null; onChange: (value: number | null) => void; p: CarrierPalette; testID: string }) {
  const [draft, setDraft] = React.useState(value == null ? '' : clockValue(value));
  React.useEffect(() => setDraft(value == null ? '' : clockValue(value)), [value]);
  const change = (text: string) => {
    setDraft(text);
    const next = parseClockValue(text);
    if (next != null) onChange(next);
    else if (!text.trim()) onChange(null);
  };
  const commit = () => {
    const next = parseClockValue(draft);
    if (next == null) {
      setDraft('');
      onChange(null);
      return;
    }
    setDraft(clockValue(next));
    onChange(next);
  };
  return <View style={s.field}>
    <Text style={[s.fieldLabel, { color: p.cardInk }]}>{label}</Text>
    <View style={[s.inputWrap, { backgroundColor: p.cardInset, borderColor: p.cardLine }]}>
      <TextInput value={draft} onChangeText={change} onBlur={commit} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="Optional" placeholderTextColor={p.cardSoft} style={[s.input, { color: p.cardInk }]} testID={testID} accessibilityLabel={label} />
      <Text style={[s.suffix, { color: p.cardSoft }]}>24h</Text>
    </View>
  </View>;
}

function SectorStepper({ value, onChange, p }: { value: number; onChange: (value: number) => void; p: CarrierPalette }) {
  return <View style={s.sectorInline}>
    <Text style={[s.fieldLabel, { color: p.cardInk }]}>Sectors</Text>
    <View style={s.stepper}>
      <Pressable onPress={() => onChange(Math.max(1, value - 1))} style={[s.stepButton, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]} testID="analyzer-sectors-decrease" accessibilityLabel="Decrease sectors">
        <Text style={[s.stepButtonText, { color: p.btn }]}>−</Text>
      </Pressable>
      <View style={[s.stepValue, { backgroundColor: p.cardInset, borderColor: p.cardLine }]} testID="analyzer-sectors-value">
        <Text style={[s.stepValueText, { color: p.cardInk }]} testID="analyzer-sectors">{value}</Text>
      </View>
      <Pressable onPress={() => onChange(Math.min(10, value + 1))} style={[s.stepButton, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]} testID="analyzer-sectors-increase" accessibilityLabel="Increase sectors">
        <Text style={[s.stepButtonText, { color: p.btn }]}>+</Text>
      </Pressable>
    </View>
  </View>;
}

function ChoiceRow<T extends string>({ values, selected, onSelect, p, prefix }: { values: ReadonlyArray<readonly [T, string]>; selected: T; onSelect: (value: T) => void; p: CarrierPalette; prefix: string }) {
  return <View style={s.choices}>{values.map(([value, label]) => {
    const active = value === selected;
    return <Pressable key={value} onPress={() => onSelect(value)} style={[s.choice, { borderColor: active ? p.btn : p.cardLine, backgroundColor: active ? p.btn : 'transparent' }]} testID={`analyzer-${prefix}-${value}`} accessibilityState={{ selected: active }}>
      <Text style={[s.choiceText, { color: active ? colors.onPrimary : p.cardInk }]}>{label}</Text>
    </Pressable>;
  })}</View>;
}

function RuleContextFields({ input, onChange, p, inferred = false, compact = false }: { input: DutyAnalyzerInput; onChange: (input: DutyAnalyzerInput) => void; p: CarrierPalette; inferred?: boolean; compact?: boolean }) {
  const set = <K extends keyof DutyAnalyzerInput>(key: K, value: DutyAnalyzerInput[K]) => onChange({ ...input, [key]: value });
  return <View style={compact ? s.ruleContextCompact : undefined} testID={compact ? 'analyzer-rule-context-compact' : undefined}>
    {!inferred ? <View style={s.choiceGroup}>
      <Text style={[s.fieldLabel, { color: p.cardInk }]}>Crew category</Text>
      <ChoiceRow values={[["flight-deck", "Flight deck"], ["cabin", "Cabin crew"]]} selected={input.crewCategory} onSelect={value => set('crewCategory', value)} p={p} prefix="category" />
    </View> : null}
    <View style={compact ? s.ruleChoiceInline : s.choiceGroup}>
      <Text style={[s.fieldLabel, compact && s.ruleChoiceLabel, { color: p.cardInk }]}>Acclimatisation</Text>
      <ChoiceRow values={[["acclimatised", "Acclimatised"], ["unknown", "Unknown"]]} selected={input.acclimatisation} onSelect={value => set('acclimatisation', value)} p={p} prefix="acclimatisation" />
    </View>
    <View style={compact ? s.ruleChoiceInline : s.choiceGroup} testID="analyzer-composition">
      <View style={compact ? s.ruleChoiceLabel : undefined}>
        <Text style={[s.fieldLabel, { color: p.cardInk }]}>Crew composition</Text>
        {!compact ? <Text style={[s.help, { color: p.cardSoft }]}>Basic already means two pilots.</Text> : null}
      </View>
      <ChoiceRow values={[["basic", "Basic"], ["3P", "3 pilots"], ["4P", "4 pilots"]]} selected={input.composition === '2P' ? 'basic' : input.composition} onSelect={composition => onChange({
        ...input,
        composition,
        restFacility: composition === '3P' || composition === '4P'
          ? input.restFacility ?? 2
          : input.restFacility,
      })} p={p} prefix="composition" />
    </View>
    {input.composition === '3P' || input.composition === '4P' ? <View style={compact ? s.ruleChoiceInline : s.choiceGroup}>
      <Text style={[s.fieldLabel, compact && s.ruleChoiceLabel, { color: p.cardInk }]}>Rest facility</Text>
      <ChoiceRow values={[["1", "Class 1"], ["2", "Class 2"], ["3", "Class 3"]]} selected={String(input.restFacility ?? 2)} onSelect={value => set('restFacility', Number(value) as 1 | 2 | 3)} p={p} prefix="facility" />
    </View> : !compact ? <Text style={[s.facilityNote, { color: p.cardSoft }]}>Rest facility is not required for Basic composition.</Text> : null}
    {!inferred ? <View style={s.choiceGroup}>
      <Text style={[s.fieldLabel, { color: p.cardInk }]}>Post-duty rest location</Text>
      <ChoiceRow values={[["home", "Home base"], ["away", "Away from base"]]} selected={input.atHomeBase ? 'home' : 'away'} onSelect={value => set('atHomeBase', value === 'home')} p={p} prefix="rest-location" />
    </View> : null}
    {!inferred && !input.atHomeBase ? <Field label="Time-zone difference" value={input.timezoneDifferenceHours} onChange={value => set('timezoneDifferenceHours', value)} suffix="hours" p={p} testID="analyzer-timezone" /> : null}
    {input.acclimatisation === 'unknown' ? <Field label="Prior off-duty period" value={input.restBeforeMinutes ?? 0} onChange={value => set('restBeforeMinutes', value)} suffix="min" p={p} testID="analyzer-odp-before" /> : null}
    <Pressable onPress={() => set('useDiscretion', !input.useDiscretion)} style={[s.toggle, compact && s.toggleCompact]} testID="analyzer-discretion" accessibilityState={{ checked: input.useDiscretion }}>
      <Icon name={input.useDiscretion ? 'check' : 'close'} size={19} color={p.btn} />
      <Text style={[s.fieldLabel, { color: p.cardInk }]}>Apply commander discretion</Text>
    </Pressable>
  </View>;
}

function NewDutyProjection({ timing, p }: { timing: NewDutyTiming; p: CarrierPalette }) {
  const latest = timing.latestChockOnMinuteOfDay == null
    ? 'Needs input'
    : `${clockValue(timing.latestChockOnMinuteOfDay)}${timing.latestChockOnDayOffset ? ' +1 day' : ''}`;
  return <View style={[s.projection, { backgroundColor: p.cardInset, borderColor: p.cardLine }]} testID="analyzer-new-duty-projection">
    <View style={s.projectionIcon}><Icon name="clock" size={20} color={p.btn} /></View>
    <View style={s.projectionMetric}>
      <Text style={[s.metricLabel, { color: p.cardSoft }]}>MAX FDP</Text>
      <Text style={[s.projectionValue, { color: p.cardInk }]}>{formatDuration(timing.maximumFdpMinutes)}</Text>
    </View>
    <View style={s.projectionMetric}>
      <Text style={[s.metricLabel, { color: p.cardSoft }]}>LATEST CHOCK-ON</Text>
      <Text style={[s.projectionValue, { color: p.cardInk }]}>{latest}</Text>
    </View>
  </View>;
}

function ScenarioForm({ input, onChange, p }: { input: DutyAnalyzerInput; onChange: (input: DutyAnalyzerInput) => void; p: CarrierPalette }) {
  const set = <K extends keyof DutyAnalyzerInput>(key: K, value: DutyAnalyzerInput[K]) => onChange({ ...input, [key]: value });
  return <Panel p={p} testID="analyzer-new-form">
    <PanelHeading title="Duty facts" p={p} />
    <View style={s.compactFormSection}>
      <View style={s.fieldGrid}>
        <ClockField label="Reporting time" value={input.reportMinuteOfDay} onChange={value => set('reportMinuteOfDay', value)} p={p} testID="analyzer-report" />
        <OptionalClockField label="Latest chock-on" value={input.latestChockOnMinuteOfDay ?? null} onChange={value => set('latestChockOnMinuteOfDay', value)} p={p} testID="analyzer-chock-on" />
      </View>
      <Text numberOfLines={1} style={[s.compactHelp, { color: p.cardSoft }]}>Empty chock-on projects the legal latest time.</Text>
    </View>
    <View style={[s.compactFormSection, { borderTopColor: p.cardLine }]}>
      <SectorStepper value={input.sectors} onChange={value => set('sectors', value)} p={p} />
      <View style={s.factChoiceRow} testID="analyzer-composition">
        <Text style={[s.fieldLabel, { color: p.cardInk }]}>Crew</Text>
        <ChoiceRow values={[["basic", "Basic"], ["3P", "3P"], ["4P", "4P"]]} selected={input.composition === '2P' ? 'basic' : input.composition} onSelect={composition => onChange({
          ...input,
          composition,
          restFacility: composition === '3P' || composition === '4P' ? input.restFacility ?? 2 : null,
        })} p={p} prefix="composition" />
      </View>
      {input.composition === '3P' || input.composition === '4P' ? <View style={s.choiceGroup}>
        <Text style={[s.fieldLabel, { color: p.cardInk }]}>Rest facility</Text>
        <ChoiceRow values={[["1", "Class 1"], ["2", "Class 2"], ["3", "Class 3"]]} selected={String(input.restFacility ?? 2)} onSelect={value => set('restFacility', Number(value) as 1 | 2 | 3)} p={p} prefix="facility" />
      </View> : null}
      <View style={s.factChoiceRow}>
        <Text style={[s.fieldLabel, { color: p.cardInk }]}>Duty ends</Text>
        <ChoiceRow values={[["home", "Home"], ["away", "Away"]]} selected={input.atHomeBase ? 'home' : 'away'} onSelect={value => set('atHomeBase', value === 'home')} p={p} prefix="rest-location" />
      </View>
    </View>
  </Panel>;
}

function TimeStepper({
  label,
  airport,
  iso,
  disabled = false,
  compact = false,
  onChange,
  onInvalidLocalTime,
  p,
  testID,
  baseline,
}: {
  label: string;
  airport: string;
  iso: string;
  disabled?: boolean;
  compact?: boolean;
  onChange: (iso: string) => void;
  onInvalidLocalTime: () => void;
  p: CarrierPalette;
  testID: string;
  baseline?: string | null;
}) {
  const [draft, setDraft] = React.useState(localClock(iso, airport));
  React.useEffect(() => setDraft(localClock(iso, airport)), [airport, iso]);
  const commit = () => {
    const next = localWithClock(iso, airport, draft);
    if (!next) {
      setDraft(localClock(iso, airport));
      onInvalidLocalTime();
      return;
    }
    setDraft(localClock(next, airport));
    onChange(next);
  };
  const delta = baseline ? minutesBetween(baseline, iso) : 0;
  return <View style={[s.timeField, compact && s.timeFieldCompact]} testID={`${testID}-field`}>
    <Text style={[s.fieldLabel, compact && s.timeFieldLabelCompact, { color: p.cardInk }]}>{label} · {airport} · {localDate(iso, airport)}</Text>
    <View style={[s.timeControl, compact && s.timeControlCompact]}>
      <Pressable disabled={disabled} onPress={() => onChange(addUtcMinutes(iso, -5))} style={[s.timeStep, compact && s.timeStepCompact, { backgroundColor: disabled ? p.cardInset : p.cardSolid, borderColor: p.cardLine }]} testID={`${testID}-earlier`} accessibilityLabel={`Move ${label} 5 minutes earlier`}>
        <Text style={[s.timeStepText, { color: disabled ? p.cardSoft : p.btn }]}>−5</Text>
      </Pressable>
      <TextInput editable={!disabled} value={draft} onChangeText={setDraft} onBlur={commit} maxLength={5} keyboardType="numbers-and-punctuation" style={[s.timeInput, compact && s.timeInputCompact, { color: disabled ? p.cardSoft : p.cardInk, backgroundColor: p.cardInset, borderColor: p.cardLine }]} testID={testID} accessibilityLabel={label} />
      <Pressable disabled={disabled} onPress={() => onChange(addUtcMinutes(iso, 5))} style={[s.timeStep, compact && s.timeStepCompact, { backgroundColor: disabled ? p.cardInset : p.cardSolid, borderColor: p.cardLine }]} testID={`${testID}-later`} accessibilityLabel={`Move ${label} 5 minutes later`}>
        <Text style={[s.timeStepText, { color: disabled ? p.cardSoft : p.btn }]}>+5</Text>
      </Pressable>
    </View>
    <Text style={[s.originalLine, { color: delta ? p.btn : p.cardSoft }]}>{baseline ? `${airport} · Local ${localClock(baseline, airport)} · UTC ${utcClock(baseline)}${delta ? ` · ${formatDelta(delta)}` : ''}` : `${airport} · Local ${localClock(iso, airport)} · UTC ${utcClock(iso)} · added locally`}</Text>
    {baseline && delta ? <Text style={[s.liveUtcLine, { color: p.cardSoft }]}>Now · Local {localClock(iso, airport)} · UTC {utcClock(iso)}</Text> : null}
  </View>;
}

function SegmentCard({ segment, index, selected, onSelect, onEdit, onInvalidLocalTime, p, compact = false }: { segment: AnalyzerRosterSegment; index: number; selected: boolean; onSelect: () => void; onEdit: (edit: { departureUtc?: string; arrivalUtc?: string }) => void; onInvalidLocalTime: () => void; p: CarrierPalette; compact?: boolean }) {
  return <View style={[s.segment, compact && s.segmentCompact, { backgroundColor: p.cardInset, borderColor: selected ? p.btn : p.cardLine }]} testID={`analyzer-segment-${segment.id}`}>
    <View style={s.segmentHead}>
      <View style={s.segmentIdent}>
        <View style={[s.segmentIndex, { backgroundColor: p.btn }]}><Text style={s.segmentIndexText}>{index + 1}</Text></View>
        <View style={s.flex}>
          <Text style={[s.segmentFlight, { color: p.cardInk }]}>{segment.flightNumber}</Text>
          <Text style={[s.segmentRoute, { color: p.cardSoft }]}>{segment.from} → {segment.to} · {segment.fleet}</Text>
          {segment.kind === 'recovery' ? <Text style={[s.recoveryBadge, { color: p.btn }]}>Recovery segment · local</Text> : null}
        </View>
      </View>
      <Pressable onPress={onSelect} style={[s.selectButton, { borderColor: selected ? p.btn : p.cardLine, backgroundColor: selected ? p.frost : p.cardSolid }]} testID={`analyzer-segment-select-${segment.id}`} accessibilityState={{ selected }}>
        <Text style={[s.selectText, { color: selected ? p.btn : p.cardInk }]}>{selected ? 'Selected' : 'Select'}</Text>
      </Pressable>
    </View>
    <View style={[s.timeGrid, compact && s.timeGridCompact]} testID={compact ? `analyzer-segment-times-compact-${segment.id}` : undefined}>
      <TimeStepper label="Departure" airport={segment.from} iso={segment.departureUtc} compact={compact} onChange={departureUtc => onEdit({ departureUtc })} onInvalidLocalTime={onInvalidLocalTime} p={p} testID={`analyzer-segment-dep-${segment.id}`} baseline={segment.publishedDepartureUtc} />
      <TimeStepper label="Arrival" airport={segment.to} iso={segment.arrivalUtc} compact={compact} onChange={arrivalUtc => onEdit({ arrivalUtc })} onInvalidLocalTime={onInvalidLocalTime} p={p} testID={`analyzer-segment-arr-${segment.id}`} baseline={segment.publishedArrivalUtc} />
    </View>
  </View>;
}

function ChangeLog({ timeline, result, baseline, p }: { timeline: AnalyzerDutyTimeline; result: DutyAnalyzerResult; baseline: DutyAnalyzerResult; p: CarrierPalette }) {
  const changes: Array<[string, string]> = [];
  const reportDelta = minutesBetween(timeline.publishedBaseline.reportUtc, timeline.reportUtc);
  if (reportDelta) changes.push([`Report ${formatDelta(reportDelta)}`, `Portal ${utcClock(timeline.publishedBaseline.reportUtc)} → ${utcClock(timeline.reportUtc)}`]);
  timeline.segments.forEach(segment => {
    if (segment.kind === 'recovery') {
      changes.push([`Added ${segment.flightNumber} · ${segment.from}→${segment.to}`, `${utcClock(segment.departureUtc)}–${utcClock(segment.arrivalUtc)} · recovery segment`]);
      return;
    }
    const depDelta = segment.publishedDepartureUtc ? minutesBetween(segment.publishedDepartureUtc, segment.departureUtc) : 0;
    const arrDelta = segment.publishedArrivalUtc ? minutesBetween(segment.publishedArrivalUtc, segment.arrivalUtc) : 0;
    const routeChanged = segment.to !== segment.plannedTo;
    if (depDelta || arrDelta || routeChanged) {
      const pieces = [routeChanged ? `${segment.from}→${segment.plannedTo} changed to ${segment.from}→${segment.to}` : '', depDelta ? `DEP ${formatDelta(depDelta)}` : '', arrDelta ? `ARR ${formatDelta(arrDelta)}` : ''].filter(Boolean);
      changes.push([`${segment.flightNumber} · ${pieces.join(' · ')}`, `${segment.publishedDepartureUtc ? utcClock(segment.publishedDepartureUtc) : ''}–${segment.publishedArrivalUtc ? utcClock(segment.publishedArrivalUtc) : ''} → ${utcClock(segment.departureUtc)}–${utcClock(segment.arrivalUtc)}`]);
    }
  });
  const currentFdp = result.metrics.find(metric => metric.key === 'fdp')?.actualMinutes;
  const baseFdp = baseline.metrics.find(metric => metric.key === 'fdp')?.actualMinutes;
  const currentRest = result.metrics.find(metric => metric.key === 'rest')?.actualMinutes;
  const baseRest = baseline.metrics.find(metric => metric.key === 'rest')?.actualMinutes;
  if (currentFdp != null && baseFdp != null && (currentFdp !== baseFdp || currentRest !== baseRest)) {
    changes.push([`Duty impact · FDP ${formatDelta(currentFdp - baseFdp)}${currentRest != null && baseRest != null ? ` · Rest ${formatDelta(currentRest - baseRest)}` : ''}`, 'Block changes only when a sector duration changes.']);
  }
  if (!changes.length) changes.push(['No local changes', 'Times match the portal roster.']);
  return <Panel p={p} testID="analyzer-change-log">
    <PanelHeading title="What changed" detail="Compared with portal-published times" p={p} />
    <View style={s.changeList}>{changes.map(([title, detail], index) =>
      <View key={`${title}-${index}`} style={s.changeItem}>
        <View style={[s.changeDot, { backgroundColor: p.btn }]} />
        <View style={s.flex}><Text style={[s.changeTitle, { color: p.cardInk }]}>{title}</Text><Text style={[s.changeDetail, { color: p.cardSoft }]}>{detail}</Text></View>
      </View>)}</View>
  </Panel>;
}

function FlightActions({
  timeline,
  segment,
  action,
  scope,
  shiftMinutes,
  shiftLater,
  diversion,
  onAction,
  onScope,
  onShiftMinutes,
  onShiftLater,
  onApplyShift,
  onDiversion,
  onApplyDiversion,
  onCancel,
  p,
}: {
  timeline: AnalyzerDutyTimeline;
  segment: AnalyzerRosterSegment;
  action: FlightAction;
  scope: TimelineShiftScope;
  shiftMinutes: string;
  shiftLater: boolean;
  diversion: { airport: string; arrival: string; departure: string; recoveryArrival: string };
  onAction: (action: FlightAction) => void;
  onScope: (scope: TimelineShiftScope) => void;
  onShiftMinutes: (value: string) => void;
  onShiftLater: () => void;
  onApplyShift: () => void;
  onDiversion: (value: { airport: string; arrival: string; departure: string; recoveryArrival: string }) => void;
  onApplyDiversion: () => void;
  onCancel: () => void;
  p: CarrierPalette;
}) {
  const recovery = timeline.segments.find(item => item.recoveryForSegmentId === segment.id);
  return <Panel p={p} testID="analyzer-flight-actions">
    <PanelHeading title="Flight actions" detail={`Selected flight: ${segment.flightNumber} · ${segment.from}→${segment.to}`} p={p} />
    <View style={s.actionChoices}>
      <ChoiceButton label="Move linked times" active={action === 'move'} onPress={() => onAction(action === 'move' ? null : 'move')} p={p} testID="analyzer-action-move" />
      <ChoiceButton label="Divert & add recovery" active={action === 'diversion'} onPress={() => onAction(action === 'diversion' ? null : 'diversion')} p={p} testID="analyzer-action-diversion" />
      <ChoiceButton label="Cancel selection" active={false} onPress={onCancel} p={p} testID="analyzer-action-cancel" />
    </View>
    {action === 'move' ? <View style={[s.actionForm, { borderTopColor: p.cardLine }]} testID="analyzer-move-form">
      <PanelHeading title="Move linked times" detail="Report stays separate." p={p} />
      <Text style={[s.fieldLabel, { color: p.cardInk }]}>Move scope</Text>
      <ChoiceRow values={[["segment", "This segment"], ["following", "This + following"], ["duty", "Whole duty"]]} selected={scope} onSelect={onScope} p={p} prefix="shift-scope" />
      <Text style={[s.help, { color: p.cardSoft }]}>Moves departure and arrival together, preserving each selected sector’s block time.</Text>
      <View style={s.shiftEntry}>
        <View style={[s.shiftInputWrap, { backgroundColor: p.cardInset, borderColor: p.cardLine }]}>
          <TextInput value={shiftMinutes} onChangeText={onShiftMinutes} keyboardType="number-pad" style={[s.shiftInput, { color: p.cardInk }]} testID="analyzer-shift-minutes" accessibilityLabel="Shift amount in minutes" />
          <Text style={[s.suffix, { color: p.cardSoft }]}>min</Text>
        </View>
        <Pressable onPress={onShiftLater} style={[s.shiftSign, { borderColor: p.cardLine, backgroundColor: p.cardSolid }]} testID="analyzer-shift-sign"><Text style={[s.choiceText, { color: p.btn }]}>{shiftLater ? '+ later' : '− earlier'}</Text></Pressable>
        <PrimaryButton label="Apply shift" onPress={onApplyShift} palette={p} testID="analyzer-shift-apply" style={s.shiftApply} />
      </View>
    </View> : null}
    {action === 'diversion' ? <View style={[s.actionForm, { borderTopColor: p.cardLine }]} testID="analyzer-diversion-form">
      <PanelHeading title="Divert & add recovery" detail="Change this flight’s destination, then continue to its planned destination." p={p} />
      <View style={s.diversionRoute}>
        <ReadonlyValue label="Selected origin" value={segment.from} p={p} />
        <AirportField label="Divert to" value={diversion.airport} onChange={airport => onDiversion({ ...diversion, airport })} p={p} testID="analyzer-divert-airport" />
        <ReadonlyValue label="Planned destination" value={segment.plannedTo} p={p} />
      </View>
      <View style={s.fieldGrid}>
        <SimpleClockField label="Arrive divert" value={diversion.arrival} onChange={arrival => onDiversion({ ...diversion, arrival })} p={p} testID="analyzer-divert-arrival" />
        <SimpleClockField label="Recovery depart" value={diversion.departure} onChange={departure => onDiversion({ ...diversion, departure })} p={p} testID="analyzer-recovery-departure" />
        <SimpleClockField label="Recovery arrive" value={diversion.recoveryArrival} onChange={recoveryArrival => onDiversion({ ...diversion, recoveryArrival })} p={p} testID="analyzer-recovery-arrival" />
      </View>
      <Text style={[s.help, { color: p.cardSoft }]}>The selected flight keeps its identity. One local recovery sector is inserted immediately after it and all downstream calculations update.</Text>
      <PrimaryButton label={recovery ? 'Update recovery segment' : 'Add recovery segment'} onPress={onApplyDiversion} palette={p} testID="analyzer-apply-diversion" />
    </View> : null}
  </Panel>;
}

function ChoiceButton({ label, active, onPress, p, testID }: { label: string; active: boolean; onPress: () => void; p: CarrierPalette; testID: string }) {
  return <Pressable onPress={onPress} style={[s.actionChoice, { borderColor: active ? p.btn : p.cardLine, backgroundColor: active ? p.frost : p.cardInset }]} testID={testID} accessibilityState={{ selected: active }}>
    <Text style={[s.choiceText, { color: active ? p.btn : p.cardInk }]}>{label}</Text>
  </Pressable>;
}

function ReadonlyValue({ label, value, p }: { label: string; value: string; p: CarrierPalette }) {
  return <View style={s.diversionField}><Text style={[s.fieldLabel, { color: p.cardInk }]}>{label}</Text><View style={[s.readonlyValue, { backgroundColor: p.cardInset, borderColor: p.cardLine }]}><Text style={[s.input, { color: p.cardSoft }]}>{value}</Text></View></View>;
}

function AirportField({ label, value, onChange, p, testID }: { label: string; value: string; onChange: (value: string) => void; p: CarrierPalette; testID: string }) {
  return <View style={s.diversionField}><Text style={[s.fieldLabel, { color: p.cardInk }]}>{label}</Text><TextInput value={value} onChangeText={text => onChange(text.toUpperCase())} autoCapitalize="characters" maxLength={4} style={[s.airportInput, { color: p.cardInk, backgroundColor: p.cardInset, borderColor: p.cardLine }]} testID={testID} /></View>;
}

function SimpleClockField({ label, value, onChange, p, testID }: { label: string; value: string; onChange: (value: string) => void; p: CarrierPalette; testID: string }) {
  return <View style={s.field}><Text style={[s.fieldLabel, { color: p.cardInk }]}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType="numbers-and-punctuation" maxLength={5} style={[s.airportInput, { color: p.cardInk, backgroundColor: p.cardInset, borderColor: p.cardLine }]} testID={testID} /></View>;
}

function RosterList({ pairings, onSelect, p }: { pairings: ReturnType<typeof rosterPairings>; onSelect: (duty: AnalyzerRosterDuty) => void; p: CarrierPalette }) {
  return <View style={s.stack} testID="analyzer-roster">
    {pairings.length === 0 ? <View style={[s.empty, { backgroundColor: p.frost }]}><Icon name="cal" size={28} color={p.inkSoft} /><Text style={[s.emptyTitle, { color: p.ink }]}>No flight duties found</Text><Text style={[s.emptyText, { color: p.inkSoft }]}>Refresh your TG or PR roster, or create a new duty.</Text></View> : pairings.map(pairing =>
      <Panel key={pairing.id} p={p} testID={`analyzer-pairing-${pairing.id}`}>
        <View style={s.pairingHead}>
          <View style={s.flex}><Text style={[s.route, { color: p.cardInk }]}>{pairing.route}</Text><Text style={[s.pairingCount, { color: p.cardSoft }]}>{pairing.duties.length} {pairing.duties.length === 1 ? 'duty' : 'duties'}</Text></View>
          <Text style={[s.pairingDate, { color: p.btn }]} testID={`analyzer-pairing-date-${pairing.id}`}>{pairing.dateLabel}</Text>
        </View>
        <View style={s.pairingDuties}>{pairing.duties.map(duty =>
          <Pressable key={duty.id} onPress={() => onSelect(duty)} style={[s.duty, { backgroundColor: p.cardInset, borderColor: p.cardLine }]} testID={`analyzer-duty-${duty.id}`}>
            <View style={s.dutyHead}><View style={s.dutyLabel}><Text style={[s.dutyNumber, { color: p.btn }]}>D{duty.dutyIndex + 1}</Text><Text style={[s.dutyRoute, { color: p.cardInk }]}>{duty.route}</Text></View><Text style={[s.flight, { color: p.cardSoft }]}>{duty.lastFlight}</Text></View>
            <PublishedMetrics duty={duty} p={p} />
            <Text style={[s.whatIf, { color: p.btn }]}>Run duty what-if ›</Text>
          </Pressable>)}</View>
      </Panel>)}
  </View>;
}

export function DutyAnalyzerScreen(): React.JSX.Element {
  const p = useCarrier();
  const nav = useV2Nav();
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const duoWide = layout.wide && duoActionStripWidth(layout.width, layout.height, insets.right) > 0;
  const trips = useAppSelector(state => state.trips.trips);
  const airline = useAppSelector(state => state.auth.airline);
  const crewId = useAppSelector(state => state.auth.crewId);
  const rosterBase = useAppSelector(state => state.auth.base);
  const base = rosterBase || airlineByCode(airline).portalConfig?.baseAirport || '';
  const pairings = React.useMemo(() => rosterPairings(trips, crewId), [crewId, trips]);
  const owner = analyzerOwner(airline, crewId);
  const [mode, setMode] = React.useState<Mode>('roster');
  const [selectedDuty, setSelectedDuty] = React.useState<AnalyzerRosterDuty | null>(null);
  const [timeline, setTimeline] = React.useState<AnalyzerDutyTimeline | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = React.useState<string | null>(null);
  const [flightAction, setFlightAction] = React.useState<FlightAction>(null);
  const [shiftScope, setShiftScope] = React.useState<TimelineShiftScope>('segment');
  const [shiftMinutes, setShiftMinutes] = React.useState('60');
  const [shiftLater, setShiftLater] = React.useState(true);
  const [diversion, setDiversion] = React.useState({ airport: 'CRK', arrival: '', departure: '', recoveryArrival: '' });
  const [input, setInput] = React.useState<DutyAnalyzerInput>(() => newDutyInput());
  const [newDutyResetKey, setNewDutyResetKey] = React.useState(0);
  const [rosterContext, setRosterContext] = React.useState<DutyAnalyzerInput>(ROSTER_CONTEXT);
  const [saved, setSaved] = React.useState<SavedDutyScenario[]>([]);
  const [editingScenarioId, setEditingScenarioId] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<'saved' | 'delete' | 'storage-error' | 'invalid-diversion' | 'invalid-local-time' | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setSaved([]);
    void loadDutyScenarios(owner).then(items => { if (active) setSaved(items); }).catch(() => { if (active) setDialog('storage-error'); });
    return () => { active = false; };
  }, [owner]);

  React.useEffect(() => {
    setSelectedDuty(null);
    setTimeline(null);
    setSelectedSegmentId(null);
    setEditingScenarioId(null);
  }, [owner]);

  const inferredContext = React.useMemo((): DutyAnalyzerInput => {
    if (!timeline) return rosterContext;
    const finalDestination = timeline.segments[timeline.segments.length - 1]?.to;
    return {
      ...rosterContext,
      crewCategory: 'flight-deck',
      composition: rosterContext.composition === '2P' ? 'basic' : rosterContext.composition,
      atHomeBase: !!base && finalDestination === base,
    };
  }, [base, rosterContext, timeline]);
  const timing = React.useMemo(() => newDutyTiming(input), [input]);
  const calculatedInput = React.useMemo((): DutyAnalyzerInput => input.latestChockOnMinuteOfDay === undefined
    ? input
    : input.latestChockOnMinuteOfDay === null
      ? { ...input, fdpMinutes: null, dpMinutes: null }
      : { ...input, fdpMinutes: timing.actualFdpMinutes, dpMinutes: timing.actualFdpMinutes }, [input, timing.actualFdpMinutes]);
  const activeInput = timeline ? timelineInput(timeline, inferredContext) : calculatedInput;
  const result = React.useMemo(() => {
    const evaluated = evaluateDuty(activeInput);
    return !timeline && input.latestChockOnMinuteOfDay === null
      ? { ...evaluated, status: 'not-evaluated' as const, headline: 'Enter chock-on for actual FDP' }
      : evaluated;
  }, [activeInput, input.latestChockOnMinuteOfDay, timeline]);
  const baselineResult = React.useMemo(() => selectedDuty
    ? evaluateDuty(rosterInput(selectedDuty, 0, inferredContext))
    : null, [inferredContext, selectedDuty]);
  const selectedSegment = timeline?.segments.find(segment => segment.id === selectedSegmentId) ?? null;
  const openReference = () => nav.navigate('DutyAnalyzerReference', { input: activeInput });

  const openDuty = (duty: AnalyzerRosterDuty, restoredTimeline?: AnalyzerDutyTimeline, scenarioId?: string) => {
    setSelectedDuty(duty);
    setTimeline(restoredTimeline ?? cloneDutyTimeline(duty));
    setSelectedSegmentId(null);
    setFlightAction(null);
    setEditingScenarioId(scenarioId ?? null);
    setMode('roster');
  };

  const closeWhatIf = () => {
    setSelectedDuty(null);
    setTimeline(null);
    setSelectedSegmentId(null);
    setFlightAction(null);
    setEditingScenarioId(null);
  };

  const resetWhatIf = () => {
    if (!selectedDuty) return;
    setTimeline(cloneDutyTimeline(selectedDuty));
    setRosterContext(ROSTER_CONTEXT);
    setSelectedSegmentId(null);
    setFlightAction(null);
    setShiftScope('segment');
    setShiftMinutes('60');
    setShiftLater(true);
    setDiversion({ airport: 'CRK', arrival: '', departure: '', recoveryArrival: '' });
    setEditingScenarioId(null);
  };

  const resetNewDuty = () => {
    setInput(newDutyInput());
    setNewDutyResetKey(value => value + 1);
    setEditingScenarioId(null);
  };

  const selectSegment = (segment: AnalyzerRosterSegment) => {
    if (selectedSegmentId === segment.id) {
      setSelectedSegmentId(null);
      setFlightAction(null);
      return;
    }
    setSelectedSegmentId(segment.id);
    setFlightAction(null);
  };

  const chooseAction = (action: FlightAction) => {
    setFlightAction(action);
    if (action !== 'diversion' || !selectedSegment || !timeline) return;
    const recovery = timeline.segments.find(segment => segment.recoveryForSegmentId === selectedSegment.id);
    setDiversion({
      airport: recovery ? selectedSegment.to : selectedSegment.to === selectedSegment.plannedTo ? 'CRK' : selectedSegment.to,
      arrival: localClock(selectedSegment.arrivalUtc, recovery ? selectedSegment.to : selectedSegment.to),
      departure: localClock(recovery?.departureUtc ?? addUtcMinutes(selectedSegment.arrivalUtc, 45), recovery?.from ?? (selectedSegment.to === selectedSegment.plannedTo ? 'CRK' : selectedSegment.to)),
      recoveryArrival: localClock(recovery?.arrivalUtc ?? addUtcMinutes(selectedSegment.arrivalUtc, 90), selectedSegment.plannedTo),
    });
  };

  const applyShift = () => {
    if (!timeline || !selectedSegmentId) return;
    const amount = numberValue(shiftMinutes, 0);
    if (!amount) return;
    setTimeline(shiftLinkedTimes(timeline, selectedSegmentId, shiftLater ? amount : -amount, shiftScope));
  };

  const applyDiversion = () => {
    if (!timeline || !selectedSegment || !/^[A-Z]{3,4}$/.test(diversion.airport)) {
      setDialog('invalid-diversion');
      return;
    }
    const divertArrivalUtc = localWithClock(selectedSegment.arrivalUtc, diversion.airport, diversion.arrival);
    const recoveryDepartureUtc = divertArrivalUtc
      ? localWithClock(addUtcMinutes(divertArrivalUtc, 45), diversion.airport, diversion.departure)
      : null;
    const recoveryArrivalUtc = recoveryDepartureUtc
      ? localWithClock(addUtcMinutes(recoveryDepartureUtc, 45), selectedSegment.plannedTo, diversion.recoveryArrival)
      : null;
    if (!divertArrivalUtc || !recoveryDepartureUtc || !recoveryArrivalUtc || diversion.airport === selectedSegment.from || diversion.airport === selectedSegment.plannedTo || new Date(recoveryDepartureUtc) < new Date(divertArrivalUtc) || new Date(recoveryArrivalUtc) <= new Date(recoveryDepartureUtc)) {
      setDialog('invalid-diversion');
      return;
    }
    setTimeline(divertAndAddRecovery(timeline, selectedSegment.id, {
      destination: diversion.airport,
      divertArrivalUtc,
      recoveryDepartureUtc,
      recoveryArrivalUtc,
    }));
  };

  const saveCurrent = async () => {
    const name = timeline
      ? `${timelineRoute(timeline.segments)} · ${timeline.segments.length} sectors`
      : `New duty · ${input.sectors} sectors`;
    try {
      const next = await saveDutyScenario(owner, saved, {
        id: editingScenarioId ?? undefined,
        name,
        kind: timeline ? 'roster-what-if' : 'new-duty',
        sourceDuty: selectedDuty,
        delayMinutes: 0,
        timeline: timeline ?? undefined,
        input: timeline ? activeInput : input,
        result,
      });
      setSaved(next);
      setEditingScenarioId(next[0]?.id ?? null);
      setDialog('saved');
    } catch {
      setDialog('storage-error');
    }
  };

  const restore = (scenario: SavedDutyScenario) => {
    setInput(scenario.input);
    if (!scenario.sourceDuty) {
      closeWhatIf();
      setMode('new');
      setEditingScenarioId(scenario.id);
      return;
    }
    const currentDuty = pairings.flatMap(pairing => pairing.duties).find(duty => duty.id === scenario.sourceDuty?.id);
    if (!currentDuty) return;
    setRosterContext(scenario.input);
    const restoredTimeline = scenario.timeline ?? (() => {
      const legacy = cloneDutyTimeline(currentDuty);
      const last = legacy.segments[legacy.segments.length - 1];
      return last ? shiftLinkedTimes(legacy, last.id, scenario.delayMinutes, 'segment') : legacy;
    })();
    openDuty(currentDuty, restoredTimeline, scenario.id);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      const next = await deleteDutyScenario(owner, saved, pendingDelete);
      setSaved(next);
      setPendingDelete(null);
      setDialog(null);
    } catch {
      setDialog('storage-error');
    }
  };

  const advisory = <View style={[s.advisory, { borderColor: p.frostLine }]}><Icon name="info" size={18} color={p.inkSoft} /><Text style={[s.advisoryText, { color: p.inkSoft }]}>Simulations stay on this device and do not amend your airline roster. Confirm operational decisions with your airline.</Text></View>;

  let body: React.ReactNode;
  if (timeline && selectedDuty && baselineResult) {
    const editor = <View style={s.stack} testID="analyzer-editor-pane">
      <View style={s.contextChips}><Text style={[s.contextChip, { color: p.ink, backgroundColor: p.frost, borderColor: p.frostLine }]}>Flight deck · from sign-in</Text><Text style={[s.contextChip, { color: p.ink, backgroundColor: p.frost, borderColor: p.frostLine }]}>{activeInput.atHomeBase ? `Ends at home base · ${base}` : `Ends away from base · ${timeline.segments[timeline.segments.length - 1]?.to}`}</Text></View>
      <Panel p={p} testID="analyzer-timeline" compact={duoWide}>
        <View style={s.panelHeadingRow}><PanelHeading title="Duty timeline" detail={duoWide ? undefined : "Report first, followed by each flight segment in operating order."} p={p} /><Text style={[s.localBadge, { color: p.ink, backgroundColor: p.frost }]}>Local copy</Text></View>
        <View style={[s.reportCard, duoWide && s.reportCardCompact, { backgroundColor: p.cardInset, borderColor: p.cardLine }]}>
          <View style={s.reportHead}><View style={s.reportCopy}><Icon name="clock" size={22} color={p.btn} /><View><Text style={[s.segmentFlight, { color: p.cardInk }]}>Duty report time</Text><Text style={[s.help, { color: p.cardSoft }]}>{timeline.reportFrozen ? `Frozen at ${utcClock(timeline.reportUtc)}` : 'Editable · portal time is the reference'}</Text></View></View><View style={s.freeze}><Text style={[s.fieldLabel, { color: p.cardInk }]}>Freeze</Text><Switch value={timeline.reportFrozen} onValueChange={reportFrozen => setTimeline({ ...timeline, reportFrozen })} trackColor={{ false: p.cardLine, true: p.btn }} testID="analyzer-report-freeze" /></View></View>
          <TimeStepper label="Report" airport={timeline.reportAirport} iso={timeline.reportUtc} disabled={timeline.reportFrozen} compact={duoWide} onChange={reportUtc => setTimeline({ ...timeline, reportUtc })} onInvalidLocalTime={() => setDialog('invalid-local-time')} p={p} testID="analyzer-report-time" baseline={timeline.publishedBaseline.reportUtc} />
        </View>
        <View style={s.segmentList}>{timeline.segments.map((segment, index) => <SegmentCard key={segment.id} segment={segment} index={index} selected={selectedSegmentId === segment.id} onSelect={() => selectSegment(segment)} onEdit={edit => setTimeline(editSegmentTimes(timeline, segment.id, edit))} onInvalidLocalTime={() => setDialog('invalid-local-time')} p={p} compact={duoWide} />)}</View>
      </Panel>
      {selectedSegment ? <FlightActions timeline={timeline} segment={selectedSegment} action={flightAction} scope={shiftScope} shiftMinutes={shiftMinutes} shiftLater={shiftLater} diversion={diversion} onAction={chooseAction} onScope={setShiftScope} onShiftMinutes={setShiftMinutes} onShiftLater={() => setShiftLater(value => !value)} onApplyShift={applyShift} onDiversion={setDiversion} onApplyDiversion={applyDiversion} onCancel={() => { setSelectedSegmentId(null); setFlightAction(null); }} p={p} /> : null}
      <Panel p={p} compact={duoWide}><RuleContextFields input={inferredContext} onChange={setRosterContext} p={p} inferred compact={duoWide} /></Panel>
    </View>;
    const contentActions = <View style={s.saveActions} testID="analyzer-content-actions"><Pressable onPress={resetWhatIf} style={[s.resetButton, { borderColor: p.cardLine, backgroundColor: p.cardSolid }]} testID="analyzer-reset"><Text style={[s.choiceText, { color: p.cardInk }]}>Reset</Text></Pressable><PrimaryButton label="Save scenario" onPress={() => void saveCurrent()} palette={p} testID="analyzer-save" style={s.saveButton} /></View>;
    const summary = <View style={s.stack} testID="analyzer-summary-pane"><MetricCard result={result} baseline={baselineResult} p={p} onOpenReference={openReference} /><ChangeLog timeline={timeline} result={result} baseline={baselineResult} p={p} />{!duoWide ? contentActions : null}{advisory}</View>;
    body = layout.wide
      ? <View style={s.whatIfColumns} testID="analyzer-columns"><ScrollView style={s.editorPane} contentContainerStyle={s.paneContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets testID="analyzer-editor-scroll">{editor}</ScrollView><ScrollView style={s.summaryPane} contentContainerStyle={s.paneContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets testID="analyzer-summary-scroll">{summary}</ScrollView>{duoWide ? <AnalyzerActionRail p={p} onReset={resetWhatIf} onSave={() => void saveCurrent()} width={duoActionStripWidth(layout.width, layout.height, insets.right)} /> : null}</View>
      : <ScrollView contentContainerStyle={[s.screenContent, layout.tall && s.tallContent]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets testID="analyzer-single-column">{editor}{summary}</ScrollView>;
  } else {
    let main: React.ReactNode;
    let side: React.ReactNode = null;
    if (mode === 'roster') main = <RosterList pairings={pairings} onSelect={openDuty} p={p} />;
    else if (mode === 'new') {
      main = <ScenarioForm key={newDutyResetKey} input={input} onChange={setInput} p={p} />;
      const newDutyActions = <View style={s.saveActions} testID="analyzer-content-actions"><Pressable onPress={resetNewDuty} style={[s.resetButton, { borderColor: p.cardLine, backgroundColor: p.cardSolid }]} testID="analyzer-reset"><Text style={[s.choiceText, { color: p.cardInk }]}>Reset</Text></Pressable><PrimaryButton label="Save scenario" onPress={() => void saveCurrent()} palette={p} testID="analyzer-save" style={s.saveButton} /></View>;
      side = <View style={s.stack}><NewDutyProjection timing={timing} p={p} /><MetricCard result={result} p={p} onOpenReference={openReference} unavailableLabel="Awaiting last chock-on time" derivedRestMinutes={timing.requiredRestMinutes} hiddenMetrics={['block']} />{!duoWide ? newDutyActions : null}</View>;
    } else main = <View style={s.stack} testID="analyzer-saved-list">{saved.length === 0 ? <View style={[s.empty, { backgroundColor: p.frost }]}><Icon name="history" size={28} color={p.inkSoft} /><Text style={[s.emptyTitle, { color: p.ink }]}>No saved scenarios</Text><Text style={[s.emptyText, { color: p.inkSoft }]}>Save a roster what-if or a new duty to revisit it here.</Text></View> : saved.map(scenario => <View key={scenario.id} style={[s.saved, { backgroundColor: p.card, borderColor: p.cardLine }]}><Pressable onPress={() => restore(scenario)} style={s.savedMain} testID={`analyzer-saved-${scenario.id}`} accessibilityLabel={`Open ${scenario.name}`}><Text style={[s.route, { color: p.cardInk }]}>{scenario.name}</Text><Text style={[s.source, { color: p.cardSoft }]}>{scenario.kind === 'roster-what-if' ? 'Roster what-if' : 'New duty'} · {scenario.result.headline}</Text></Pressable><Pressable onPress={() => { setPendingDelete(scenario.id); setDialog('delete'); }} accessibilityLabel={`Delete ${scenario.name}`} testID={`analyzer-delete-${scenario.id}`} style={s.delete}><Icon name="close" size={17} color={p.crit} /></Pressable></View>)}</View>;
    body = <View style={s.flex}><ScrollView contentContainerStyle={[s.screenContent, (layout.wide || layout.tall) && !side && s.tallContent]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets testID="analyzer-basic-scroll"><ModeTabs mode={mode} onChange={value => { closeWhatIf(); setMode(value); setEditingScenarioId(null); }} p={p} />{layout.wide && side ? <View style={s.basicColumns} testID="analyzer-columns"><View style={s.editorColumn} testID="analyzer-new-duty-editor-column">{main}</View><View style={s.summaryColumn} testID="analyzer-new-duty-summary-column">{side}</View></View> : <View style={s.stack}>{main}{side}</View>}{advisory}</ScrollView>{mode === 'new' && duoWide ? <AnalyzerActionRail p={p} onReset={resetNewDuty} onSave={() => void saveCurrent()} width={duoActionStripWidth(layout.width, layout.height, insets.right)} /> : null}</View>;
  }

  return <PageShell title={timeline ? 'Duty What-if' : 'Duty Analyzer'} testID="duty-analyzer" layout="full" scroll={false} onBack={timeline ? closeWhatIf : undefined} right={timeline && !duoWide ? <Pressable onPress={resetWhatIf} accessibilityLabel="Reset scenario" testID="analyzer-reset-top"><Icon name="history" size={22} color={p.ink} /></Pressable> : undefined}>
    {body}
    <AppDialog visible={dialog === 'saved'} onClose={() => setDialog(null)} title="Scenario saved" message="This scenario is stored locally for this crew account." tone="success" icon="check" confirmLabel="Done" onConfirm={() => setDialog(null)} testID="analyzer-saved-dialog" />
    <AppDialog visible={dialog === 'delete'} onClose={() => setDialog(null)} title="Delete scenario?" message="This removes only the local what-if. Your airline roster is unchanged." tone="destructive" icon="warning" cancelLabel="Keep" confirmLabel="Delete" onConfirm={() => void confirmDelete()} testID="analyzer-delete-dialog" />
    <AppDialog visible={dialog === 'storage-error'} onClose={() => setDialog(null)} title="Could not update scenarios" message="Your roster is unchanged. Try again after checking available device storage." tone="warning" icon="warning" confirmLabel="Close" onConfirm={() => setDialog(null)} testID="analyzer-storage-error-dialog" />
    <AppDialog visible={dialog === 'invalid-diversion'} onClose={() => setDialog(null)} title="Check diversion details" message="Use a different diversion airport and keep recovery departure after divert arrival, with recovery arrival after departure." tone="warning" icon="warning" confirmLabel="Close" onConfirm={() => setDialog(null)} testID="analyzer-diversion-error-dialog" />
    <AppDialog visible={dialog === 'invalid-local-time'} onClose={() => setDialog(null)} title="Local time unavailable" message="This airport time zone is unavailable, or that local clock time does not exist because of a daylight-saving change. The UTC instant was not changed." tone="warning" icon="clock" confirmLabel="Close" onConfirm={() => setDialog(null)} testID="analyzer-local-time-error-dialog" />
  </PageShell>;
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: space.md12 },
  screenContent: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 64, gap: space.md12 },
  tallContent: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  whatIfColumns: { flex: 1, flexDirection: 'row', gap: space.lg16, paddingHorizontal: 22, paddingTop: 6 },
  actionRailEdge: { position: 'absolute', top: 58, alignItems: 'center' },
  actionRail: { width: 64, borderWidth: 1, borderRadius: radius.pill, paddingVertical: space.xs4, alignItems: 'center' },
  actionRailButton: { width: 56, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: space.xs4 },
  actionRailLabel: { ...font.caption },
  actionRailDivider: { width: 36, height: StyleSheet.hairlineWidth },
  editorPane: { flex: 1.6, minWidth: 0 },
  summaryPane: { flex: 0.86, minWidth: 0 },
  paneContent: { paddingBottom: 64 },
  basicColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg16 },
  editorColumn: { flex: 1, minWidth: 0 },
  summaryColumn: { flex: 1, minWidth: 0 },
  tabs: { flexDirection: 'row', padding: space.xs4, borderRadius: radius.lg },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent' },
  tabText: { ...font.sub, fontWeight: '700' },
  panel: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg16 },
  panelCompact: { padding: space.md12 },
  panelHeading: { gap: 2, flexShrink: 1 },
  panelHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md12 },
  sectionTitle: { ...font.title },
  help: { ...font.sub, lineHeight: 18 },
  compactHelp: { ...font.caption },
  localBadge: { ...font.caption, borderRadius: radius.pill, paddingHorizontal: space.sm8, paddingVertical: space.xs4, overflow: 'hidden' },
  contextChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm8 },
  contextChip: { ...font.caption, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md12, paddingVertical: space.sm8, overflow: 'hidden' },
  pairingHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md12 },
  pairingDate: { ...font.sub, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pairingCount: { ...font.caption, marginTop: space.xs4 },
  pairingDuties: { gap: space.sm8, marginTop: space.md12 },
  duty: { borderWidth: 1, borderRadius: radius.md, padding: space.md12 },
  dutyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm8 },
  dutyLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
  dutyNumber: { ...font.caption },
  dutyRoute: { ...font.bodyStrong, flexShrink: 1 },
  route: { ...font.title, flexShrink: 1 },
  flight: { ...font.sub },
  published: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.md12, gap: space.sm8 },
  publishedMetric: { minWidth: 66, flexGrow: 1 },
  publishedValue: { ...font.bodyStrong, marginTop: 2, fontVariant: ['tabular-nums'] },
  whatIf: { ...font.sub, marginTop: space.md12, fontWeight: '700' },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
  statusGlyph: { width: 38, height: 38, borderRadius: radius.round, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { ...font.title },
  source: { ...font.caption, marginTop: 2 },
  statusText: { ...font.caption, textTransform: 'uppercase' },
  metrics: { gap: space.sm8, marginTop: space.lg16 },
  metricRow: { minHeight: 76, borderRadius: radius.md, borderWidth: 1, padding: space.md12, flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
  metricLabelRow: { width: 56, flexDirection: 'row', alignItems: 'center', gap: space.xs4 },
  metricLabel: { ...font.overline },
  metricMiddle: { flex: 1, minWidth: 0 },
  metricValues: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space.sm8 },
  metricValue: { ...font.h2, fontVariant: ['tabular-nums'] },
  metricUnavailable: { ...font.bodyStrong },
  metricMinutes: { ...font.sub, fontVariant: ['tabular-nums'] },
  metricBaseline: { ...font.caption, textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] },
  metricLimit: { ...font.caption, marginTop: 2 },
  metricMargin: { ...font.caption, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm8, paddingVertical: space.xs4, overflow: 'hidden' },
  metricMarginExceeded: { fontWeight: '700' },
  resultNote: { gap: space.xs4, marginTop: space.md12, borderRadius: radius.md, padding: space.md12 },
  referenceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm8, marginBottom: space.xs4 },
  referenceTitle: { ...font.sub, fontWeight: '700', flex: 1 },
  referenceButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.xs4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md12 },
  referenceButtonText: { ...font.caption },
  explainText: { ...font.sub, lineHeight: 18 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md12 },
  formSection: { gap: space.sm8, marginTop: space.lg16, paddingTop: space.lg16, borderTopWidth: StyleSheet.hairlineWidth },
  compactFormSection: { gap: space.sm8, marginTop: space.md12, paddingTop: space.md12, borderTopWidth: StyleSheet.hairlineWidth },
  formSectionTitle: { ...font.bodyStrong },
  field: { flexGrow: 1, flexBasis: 142, gap: space.xs4 },
  sectorInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md12 },
  fieldLabel: { ...font.sub, fontWeight: '700' },
  inputWrap: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md12 },
  input: { ...font.bodyStrong, flex: 1, paddingVertical: 0, fontVariant: ['tabular-nums'] },
  suffix: { ...font.caption },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
  stepButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.md },
  stepButtonText: { ...font.h2 },
  stepValue: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.md },
  stepValueText: { ...font.bodyStrong, fontVariant: ['tabular-nums'] },
  projection: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: space.md12, borderWidth: 1, borderRadius: radius.md, padding: space.md12 },
  projectionIcon: { width: 32, alignItems: 'center' },
  projectionMetric: { flex: 1, minWidth: 0 },
  projectionValue: { ...font.bodyStrong, marginTop: space.xs4, fontVariant: ['tabular-nums'] },
  choiceGroup: { marginTop: space.sm8, gap: space.xs4 },
  ruleContextCompact: { gap: space.sm8 },
  ruleChoiceInline: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm8 },
  ruleChoiceLabel: { flex: 1, minWidth: 0 },
  factChoiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm8 },
  choice: { minHeight: 44, borderWidth: 1, borderRadius: radius.pill, justifyContent: 'center', paddingHorizontal: space.md12 },
  choiceText: { ...font.sub, fontWeight: '700' },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm8, marginTop: space.md12 },
  toggleCompact: { minHeight: 44, marginTop: 0 },
  facilityNote: { ...font.sub, marginTop: space.md12 },
  reportCard: { borderWidth: 1, borderRadius: radius.md, padding: space.md12, marginTop: space.md12, gap: space.md12 },
  reportCardCompact: { padding: space.sm8, marginTop: space.sm8, gap: space.sm8 },
  reportHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm8 },
  reportCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
  freeze: { flexDirection: 'row', alignItems: 'center', gap: space.xs4 },
  segmentList: { gap: space.sm8, marginTop: space.sm8 },
  segment: { borderWidth: 1, borderRadius: radius.md, padding: space.md12 },
  segmentCompact: { padding: space.sm8 },
  segmentHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm8 },
  segmentIdent: { flex: 1, minWidth: 0, flexDirection: 'row', gap: space.sm8 },
  segmentIndex: { width: 28, height: 28, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  segmentIndexText: { ...font.caption, color: colors.onPrimary },
  segmentFlight: { ...font.bodyStrong },
  segmentRoute: { ...font.sub, marginTop: 2 },
  recoveryBadge: { ...font.caption, marginTop: space.xs4 },
  selectButton: { minHeight: 48, borderWidth: 1, borderRadius: radius.pill, justifyContent: 'center', paddingHorizontal: space.md12 },
  selectText: { ...font.sub, fontWeight: '700' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md12, marginTop: space.md12 },
  timeGridCompact: { flexWrap: 'nowrap', gap: space.sm8, marginTop: space.sm8 },
  timeField: { flex: 1, minWidth: 210, gap: space.xs4 },
  timeFieldCompact: { minWidth: 0 },
  timeFieldLabelCompact: { minHeight: 40 },
  timeControl: { flexDirection: 'row', gap: space.sm8 },
  timeControlCompact: { gap: space.xs4 },
  timeStep: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.md },
  timeStepCompact: { width: 44, height: 44 },
  timeStepText: { ...font.bodyStrong },
  timeInput: { ...font.bodyStrong, minWidth: 88, flex: 1, height: 52, borderWidth: 1, borderRadius: radius.md, textAlign: 'center', paddingVertical: 0, fontVariant: ['tabular-nums'] },
  timeInputCompact: { minWidth: 68, height: 44 },
  originalLine: { ...font.caption, fontVariant: ['tabular-nums'] },
  liveUtcLine: { ...font.caption, fontVariant: ['tabular-nums'] },
  actionChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm8, marginTop: space.md12 },
  actionChoice: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md12 },
  actionForm: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: space.lg16, paddingTop: space.lg16, gap: space.md12 },
  shiftEntry: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm8 },
  shiftInputWrap: { width: 112, height: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md12 },
  shiftInput: { ...font.bodyStrong, flex: 1, paddingVertical: 0, fontVariant: ['tabular-nums'] },
  shiftSign: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, justifyContent: 'center', paddingHorizontal: space.md12 },
  shiftApply: { flexGrow: 1, minHeight: 52, marginTop: 0, justifyContent: 'center', paddingHorizontal: space.md12 },
  diversionRoute: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm8 },
  diversionField: { flex: 1, minWidth: 120, gap: space.xs4 },
  readonlyValue: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md12 },
  airportInput: { ...font.bodyStrong, minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md12, paddingVertical: 0, fontVariant: ['tabular-nums'] },
  changeList: { gap: space.md12, marginTop: space.md12 },
  changeItem: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm8 },
  changeDot: { width: 8, height: 8, borderRadius: radius.round, marginTop: 5 },
  changeTitle: { ...font.sub, fontWeight: '700' },
  changeDetail: { ...font.caption, lineHeight: 17, marginTop: 2 },
  saveActions: { flexDirection: 'row', gap: space.sm8 },
  resetButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.md },
  saveButton: { flex: 1, minHeight: 52, marginTop: 0, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: space.xl24, borderRadius: radius.lg },
  emptyTitle: { ...font.title, marginTop: space.sm8 },
  emptyText: { ...font.sub, lineHeight: 18, textAlign: 'center', marginTop: space.xs4 },
  saved: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.lg },
  savedMain: { flex: 1, padding: space.lg16 },
  delete: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  advisory: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm8, borderTopWidth: 1, marginTop: space.xs4, paddingTop: space.md12 },
  advisoryText: { ...font.caption, flex: 1, lineHeight: 17 },
});
