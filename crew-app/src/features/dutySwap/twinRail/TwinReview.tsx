import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { CarrierPalette } from '../../../theme/carrier';
import { compareRows, dayLabel, kpiDelta, portalToIso, realLegs, signedHhmm, type ApiTaskDetail, type SwapDuty } from '../dutySwapModel';
import { spanLabel } from '../market/marketModel';
import { ReviewDutyDetails, ReviewFlightDetails } from '../components/ReviewDetails';
import { s } from './styles';

export function TwinReview({ p, crewB, give, take, mine, theirs, ready, loading, error, onRetry, note, setNote, submitting, onSubmit, onBack, backLabel = 'Back' }: {
  p: CarrierPalette; crewB: string | null; give: SwapDuty[]; take: SwapDuty[]; mine: ApiTaskDetail[]; theirs: ApiTaskDetail[];
  ready: boolean; loading: boolean; error: string | null; onRetry: () => void; note: string; setNote: (v: string) => void;
  submitting: boolean; onSubmit: () => void; onBack?: () => void; backLabel?: string;
}): React.JSX.Element {
  const [tab, setTab] = useState<'date' | 'details'>('date');
  const delta = ready ? kpiDelta(mine, theirs) : null;
  const task = (t: ApiTaskDetail): React.JSX.Element => <View key={`${t.taskType}-${t.pairingId ?? t.rosterGroundPublishId}`} style={s.divider}>
    <ReviewDutyDetails task={t} p={p} />
    {realLegs(t).map((leg, i) => <ReviewFlightDetails key={i} leg={leg} p={p} showDate />)}
  </View>;
  return <View style={[s.flex, s.panel, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]} testID="twin-review">
    <View style={s.bar}><Text style={[s.title, s.flex, { color: p.cardInk }]}>Review{crewB ? ` with ${crewB}` : ' swap'}</Text>{onBack ? <Pressable onPress={onBack} disabled={submitting} testID="twin-review-back" style={s.button}><Text style={[s.text, { color: p.btn }]}>{backLabel}</Text></Pressable> : null}</View>
    <View style={s.bar}>{(['date', 'details'] as const).map(t => <Pressable key={t} onPress={() => setTab(t)} testID={`twin-review-${t}`} accessibilityState={{ selected: tab === t }} style={[s.button, { borderColor: p.cardLine, backgroundColor: tab === t ? p.cardInset : p.cardSolid }]}><Text style={[s.text, { color: p.btn }]}>{t === 'date' ? 'By date' : 'Duty details'}</Text></Pressable>)}</View>
    <ScrollView style={s.flex} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Text style={[s.text, { color: p.cardInk }]}>You give: {give.map(d => d.code).join(', ') || 'Tap your duties'}</Text>
      <Text style={[s.text, { color: p.cardInk }]}>You take: {take.map(d => d.code).join(', ') || 'Tap another crew’s duties'}</Text>
      {loading ? <ActivityIndicator color={p.btn} /> : null}
      {error ? <Pressable onPress={onRetry} testID="twin-details-retry" style={s.button}><Text style={[s.text, { color: p.cardSoft }]}>{error} · Retry details</Text></Pressable> : null}
      {ready && tab === 'date' ? <>
        <View style={s.row}><View style={s.dateCell} /><Text style={[s.label, s.flex, { color: p.cardSoft }]}>ME · GIVE</Text><Text style={[s.label, s.flex, { color: p.cardSoft }]}>{crewB} · TAKE</Text></View>
        {compareRows(mine, theirs).map(row => <View key={row.date} style={[s.row, s.divider, { borderColor: p.cardLine, alignItems: 'flex-start' }]}>
          <Text style={[s.label, s.dateCell, { color: p.cardSoft }]}>{dayLabel(row.date).day} {dayLabel(row.date).month}</Text>
          {[row.mine, row.others].map((side, i) => {
            const starts = (i === 0 ? mine : theirs).filter(t => portalToIso(t.startDateTimeLocal ?? t.startDateTime)?.slice(0, 10) === row.date);
            return <View key={i} style={s.flex}>{starts.map((t, index) => <ReviewDutyDetails key={index} task={t} p={p} />)}{!starts.length && !side.legs.length ? <Text style={[s.text, { color: p.cardSoft }]}>—</Text> : null}{side.legs.map((leg, j) => <ReviewFlightDetails key={j} leg={leg} p={p} />)}</View>;
          })}
        </View>)}
      </> : null}
      {ready && tab === 'details' ? <><Text style={[s.label, { color: p.btn }]}>ME · GIVE</Text>{mine.map(task)}<Text style={[s.label, { color: p.btn }]}>{crewB} · TAKE</Text>{theirs.map(task)}</> : null}
      {!ready ? [...give, ...take].map(d => <Text key={d.key} style={[s.text, { color: p.cardSoft }]}>{d.code} · {spanLabel(d)}</Text>) : null}
      {delta ? <View style={[s.wrap, s.body, { backgroundColor: p.cardInset }]} testID="twin-delta">{([['FDP', signedHhmm(delta.fdp)], ['BLH', signedHhmm(delta.blh)], ['CREDIT', signedHhmm(delta.crd)], ['DO', String(delta.dayOff)]] as const).map(([label, value]) => <View key={label} style={s.flex}><Text style={[s.label, { color: p.cardSoft }]}>{label}</Text><Text style={[s.number, { color: p.btn }]}>{value}</Text></View>)}</View> : null}
      <Text style={[s.label, { color: p.cardSoft }]}>The crew portal checks legality when you send.</Text>
      <TextInput value={note} onChangeText={setNote} editable={!submitting} testID="twin-note" accessibilityLabel="Note for other crew" placeholder="Add a note (optional)" placeholderTextColor={p.cardSoft} multiline maxLength={300} style={[s.input, { color: p.cardInk, borderColor: p.cardLine }]} />
      <Pressable disabled={!ready || submitting} onPress={onSubmit} testID="twin-send" style={[s.button, { borderColor: p.btn, backgroundColor: p.btn, opacity: !ready || submitting ? 0.5 : 1 }]}><Text style={[s.buttonText, s.onPrimary]}>{submitting ? 'Checking legality…' : 'Check legality & send'}</Text></Pressable>
    </ScrollView>
  </View>;
}
