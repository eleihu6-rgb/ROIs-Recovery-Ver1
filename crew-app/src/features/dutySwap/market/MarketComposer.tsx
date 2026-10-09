// Duty Swap · Market · the offer composer (design A2): what I take from crew B,
// what I give, the KPI delta, a note, "Check legality & send". The same content
// is a bottom sheet on a phone and the right-hand (wide) / lower (tall) pane on
// the Duo inner screen.
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '../../../components/v2/icons';
import type { CarrierPalette } from '../../../theme/carrier';
import {
  dayLabel, detailFor, kpiDelta, routeOf, signedHhmm, type ApiCompare, type ApiTaskDetail, type SwapCrew, type SwapDuty,
} from '../dutySwapModel';
import { tint } from '../components/CrewMatrix';
import { KIND_BADGE, precheck, precheckLabel, spanLabel } from './marketModel';

interface Props {
  palette: CarrierPalette;
  crewB: SwapCrew;
  /** Crew B's compare (both sides' details); undefined while it loads. */
  compare: ApiCompare | undefined;
  takeChoices: SwapDuty[];
  giveChoices: SwapDuty[];
  take: string[];
  give: string[];
  onToggleTake: (key: string) => void;
  onToggleGive: (key: string) => void;
  note: string;
  onNote: (v: string) => void;
  submitting: boolean;
  onSend: () => void;
  onClose: () => void;
}

export function MarketComposer(props: Props): React.JSX.Element {
  const { palette: p, crewB, compare } = props;
  const takeSet = new Set(props.take), giveSet = new Set(props.give);
  const takeDetails = props.takeChoices.filter(d => takeSet.has(d.key)).map(d => detailFor(d, compare?.othersTaskDetailList)).filter(Boolean) as ApiTaskDetail[];
  const giveDetails = props.giveChoices.filter(d => giveSet.has(d.key)).map(d => detailFor(d, compare?.mineTaskDetailList)).filter(Boolean) as ApiTaskDetail[];
  const ready = props.take.length > 0 && props.give.length > 0;
  const delta = compare && ready ? kpiDelta(giveDetails, takeDetails) : null;
  const firstTake = props.takeChoices.find(d => takeSet.has(d.key));
  const firstGive = props.giveChoices.find(d => giveSet.has(d.key));
  const check = firstTake ? precheck(detailFor(firstTake, compare?.othersTaskDetailList), firstGive && detailFor(firstGive, compare?.mineTaskDetailList)) : null;
  const warn = !!check && (check.rankDiffers || check.fleetDiffers);

  const row = (d: SwapDuty, on: boolean, list: ApiTaskDetail[] | undefined, onPress: () => void, id: string) => {
    const dl = dayLabel(d.startDt.slice(0, 10));
    const det = detailFor(d, list);
    const route = d.kind === 'fly' ? routeOf(det) : null;
    return (
      <Pressable key={d.key} onPress={onPress} testID={id} accessibilityLabel={`${d.code} ${dl.day} ${dl.month}`} accessibilityState={{ checked: on }}
        style={[s.row, { borderColor: on ? p.btn : p.cardLine, backgroundColor: on ? tint(p.btn, 0.06) : 'transparent' }]}>
        <View style={[s.check, { borderColor: on ? p.btn : p.cardLine, backgroundColor: on ? p.btn : 'transparent' }]}>
          {on ? <Icon name="check" size={13} color="#fff" strokeWidth={2.6} /> : null}
        </View>
        <View style={s.flex}>
          <View style={s.line}>
            <Text style={[s.code, { color: p.cardInk }]} numberOfLines={1}>{d.code}</Text>
            {KIND_BADGE[d.kind] ? <Text style={[s.badge, { color: p.cardSoft, borderColor: p.cardLine }]}>{KIND_BADGE[d.kind]}</Text> : null}
          </View>
          <Text style={[s.sub, { color: p.cardSoft }]} numberOfLines={1}>
            {dl.day} {dl.month} · {spanLabel(d)}{route ? ` · ${route}` : ''}{det && det.blh !== '00:00' ? ` · BLH ${det.blh}` : ''}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[s.flex, { backgroundColor: p.cardSolid }]} testID="market-composer">
      <View style={[s.head, { borderBottomColor: p.cardLine }]}>
        <View style={s.flex}>
          <Text style={[s.title, { color: p.cardInk }]} numberOfLines={1}>Offer to {crewB.crewId}</Text>
          <Text style={[s.sub, { color: p.cardSoft }]} numberOfLines={1}>{crewB.crewName}</Text>
        </View>
        {check ? (
          <Text style={[s.chip, warn ? { color: p.btn, borderColor: p.btn } : { color: p.cardSoft, borderColor: p.cardLine }]} testID="market-precheck">
            {precheckLabel(check)}
          </Text>
        ) : null}
        <Pressable onPress={props.onClose} hitSlop={12} accessibilityLabel="close" testID="market-composer-close" style={[s.close, { borderColor: p.cardLine }]}>
          <Icon name="close" size={16} color={p.cardInk} strokeWidth={2.2} />
        </Pressable>
      </View>
      <ScrollView style={s.flex} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={[s.over, { color: p.cardSoft }]}>YOU TAKE FROM {crewB.crewId}</Text>
        {props.takeChoices.map(d => row(d, takeSet.has(d.key), compare?.othersTaskDetailList, () => props.onToggleTake(d.key), `market-take-${d.key}`))}
        <Text style={[s.over, { color: p.cardSoft }]}>YOU GIVE</Text>
        {props.giveChoices.map(d => row(d, giveSet.has(d.key), compare?.mineTaskDetailList, () => props.onToggleGive(d.key), `market-give-${d.key}`))}
        {!compare ? (
          <View style={s.loading}><ActivityIndicator color={p.btn} size="small" /><Text style={[s.sub, { color: p.cardSoft }]}>Loading duty details…</Text></View>
        ) : null}
      </ScrollView>
      {delta ? (
        <View style={[s.delta, { backgroundColor: tint(p.btn, 0.1) }]} testID="market-delta">
          {([['FDP', signedHhmm(delta.fdp)], ['BLH', signedHhmm(delta.blh)], ['CREDIT', signedHhmm(delta.crd)], ['DO', String(delta.dayOff)]] as const).map(([k, v]) => (
            <View key={k} style={s.deltaCell}>
              <Text style={[s.deltaKey, { color: p.cardSoft }]}>{k}</Text>
              <Text style={[s.deltaVal, { color: p.btn }]}>{v}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={s.footer}>
        <TextInput value={props.note} onChangeText={props.onNote} placeholder={`Note for ${crewB.crewId} (optional)`}
          placeholderTextColor={p.cardSoft} multiline maxLength={300} returnKeyType="done" blurOnSubmit
          style={[s.input, { color: p.cardInk, borderColor: p.cardLine }]} testID="market-note" />
        <Pressable disabled={!ready || props.submitting} onPress={props.onSend} testID="market-send"
          style={({ pressed }) => [s.send, { backgroundColor: p.btn, opacity: !ready || props.submitting ? 0.45 : pressed ? 0.9 : 1 }]}>
          {props.submitting ? <ActivityIndicator color="#fff" /> : <Icon name="shield" size={18} color="#fff" strokeWidth={2} />}
          <Text style={s.sendText}>{props.submitting ? 'Checking legality…' : 'Check legality & send'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 18, fontWeight: '800' },
  sub: { fontSize: 12, fontWeight: '500', marginTop: 2, fontVariant: ['tabular-nums'] },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  close: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  over: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  code: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  badge: { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  delta: { flexDirection: 'row', marginHorizontal: 14, marginTop: 6, borderRadius: 12, paddingVertical: 8 },
  deltaCell: { flex: 1, alignItems: 'center' },
  deltaKey: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  deltaVal: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },
  footer: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 10 },
  input: { minHeight: 44, maxHeight: 90, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  send: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
