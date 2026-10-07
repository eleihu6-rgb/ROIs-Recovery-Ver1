// Crew-B compare (the web's detailed "Pairing Info + Duty Info" page, adapted):
// date-aligned rows, Mine | Crew B, each with the pairing summary and its legs,
// plus the KPI delta. In `swap` mode it is also the review step (comment +
// "Check legality & send"); in `record` mode it shows a submitted request.
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../../components/v2/icons';
import { ALL_ORIENTATIONS, useLayout } from '../../../components/v2/useLayout';
import type { CarrierPalette } from '../../../theme/carrier';
import {
  compareRows, dayLabel, hhmmOf, kpiDelta, portalToIso, signedHhmm,
  type ApiSegment, type ApiTaskDetail, type CompareSide,
} from '../dutySwapModel';
import { tint } from './CrewMatrix';

interface Props {
  visible: boolean;
  onClose: () => void;
  palette: CarrierPalette;
  carrier: string;
  meId: string;
  othersId: string;
  /** Tasks being swapped (or, with nothing picked yet, every task in the window). */
  mine: ApiTaskDetail[];
  others: ApiTaskDetail[];
  loading?: boolean;
  /** Both sides picked → delta + send are meaningful. */
  picked: boolean;
  mode: 'swap' | 'record';
  submitting?: boolean;
  onSubmit?: (comment: string) => void;
  /** Record mode: the requester's comment / status line. */
  note?: string | null;
  footer?: React.ReactNode;
  /** Dialogs shown over the sheet (iOS presents a nested Modal only from inside the open one). */
  overlay?: React.ReactNode;
  /** Fires once the sheet is fully gone (iOS) — navigate only then, or the next Modal cannot present. */
  onDismiss?: () => void;
}

export function CompareSheet(props: Props): React.JSX.Element {
  const { palette: p, mine, others, picked } = props;
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  const [comment, setComment] = useState('');
  const rows = compareRows(mine, others);
  const d = kpiDelta(mine, others);
  const flt = (n: string) => (/^\d+$/.test(n) ? `${props.carrier}${n}` : n);

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}
      onDismiss={props.onDismiss} supportedOrientations={ALL_ORIENTATIONS}>
      {/* The note field + send button must stay above the keyboard. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.bottom + 12} style={s.flex}>
      <View style={[s.page, { backgroundColor: p.cardSolid, paddingBottom: insets.bottom + 8 }]} testID="compare-sheet">
        <View style={[s.head, { borderBottomColor: p.cardLine }]}>
          <View style={s.flex}>
            <Text style={[s.title, { color: p.cardInk }]}>{props.mode === 'swap' ? 'Compare & send' : 'Swap request'}</Text>
            <Text style={[s.subtitle, { color: p.cardSoft }]}>{props.meId} (you)  ⇄  {props.othersId}</Text>
          </View>
          <Pressable onPress={props.onClose} hitSlop={12} accessibilityLabel="close" testID="compare-close" style={[s.close, { borderColor: p.cardLine }]}>
            <Icon name="close" size={16} color={p.cardInk} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={[s.colHead, { borderBottomColor: p.cardLine }]}>
          <View style={{ width: 52 }} />
          <Text style={[s.colTitle, { color: p.cardSoft }]}>{props.mode === 'swap' ? 'YOU GIVE' : 'YOUR SIDE'}</Text>
          <Text style={[s.colTitle, { color: p.cardSoft }]}>{props.mode === 'swap' ? `YOU TAKE · ${props.othersId}` : props.othersId}</Text>
        </View>

        {props.loading ? (
          <View style={s.loading}><ActivityIndicator color={p.btn} /><Text style={[s.subtitle, { color: p.cardSoft }]}>Loading duty details…</Text></View>
        ) : (
          <ScrollView style={s.flex} contentContainerStyle={s.body}>
            {!picked && props.mode === 'swap' ? (
              <Text style={[s.hint, { color: p.cardSoft, backgroundColor: tint(p.btn, 0.08) }]}>
                Showing every duty in the window. Tap duties in the matrix to choose what you give and take.
              </Text>
            ) : null}
            {rows.map(r => {
              const dl = dayLabel(r.date);
              return (
                <View key={r.date} style={[s.row, { borderBottomColor: p.cardLine }]}>
                  <View style={s.dateCol}>
                    <Text style={[s.dateNum, { color: p.cardInk }]}>{dl.day}</Text>
                    <Text style={[s.dateSub, { color: p.cardSoft }]}>{dl.dow}</Text>
                  </View>
                  <Side side={r.mine} p={p} flt={flt} wide={wide} />
                  <Side side={r.others} p={p} flt={flt} wide={wide} />
                </View>
              );
            })}
            {rows.length === 0 ? <Text style={[s.hint, { color: p.cardSoft }]}>No duties to compare.</Text> : null}
            {props.note ? <Text style={[s.note, { color: p.cardInk, borderColor: p.cardLine }]}>“{props.note}”</Text> : null}
          </ScrollView>
        )}

        {picked ? (
          <View style={[s.delta, { backgroundColor: tint(p.btn, 0.1) }]} testID="swap-delta">
            {([['FDP', signedHhmm(d.fdp)], ['BLH', signedHhmm(d.blh)], ['CREDIT', signedHhmm(d.crd)], ['DO', String(d.dayOff)]] as const).map(([k, v]) => (
              <View key={k} style={s.deltaCell}>
                <Text style={[s.deltaKey, { color: p.cardSoft }]}>{k}</Text>
                <Text style={[s.deltaVal, { color: p.btn }]} testID={`delta-${k}`}>{v}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {props.mode === 'swap' ? (
          <View style={s.footer}>
            <TextInput value={comment} onChangeText={setComment} placeholder={`Note for ${props.othersId} (optional)`}
              placeholderTextColor={p.cardSoft} multiline maxLength={300} returnKeyType="done" blurOnSubmit
              style={[s.input, { color: p.cardInk, borderColor: p.cardLine }]} testID="swap-comment" />
            <Pressable disabled={!picked || props.submitting} onPress={() => props.onSubmit?.(comment)} testID="swap-submit"
              style={({ pressed }) => [s.send, { backgroundColor: p.btn, opacity: !picked || props.submitting ? 0.45 : pressed ? 0.9 : 1 }]}>
              {props.submitting ? <ActivityIndicator color="#fff" /> : <Icon name="shield" size={18} color="#fff" strokeWidth={2} />}
              <Text style={s.sendText}>{props.submitting ? 'Checking legality…' : 'Check legality & send'}</Text>
            </Pressable>
          </View>
        ) : props.footer}
        {props.overlay}
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Side({ side, p, flt, wide }: { side: CompareSide; p: CarrierPalette; flt: (n: string) => string; wide: boolean }) {
  const t = side.task;
  if (!t && side.legs.length === 0) return <View style={s.side} />;
  const end = portalToIso(t?.endDateTimeLocal ?? t?.endDateTime);
  const start = portalToIso(t?.startDateTimeLocal ?? t?.startDateTime);
  const endLabel = end ? (start && end.slice(0, 10) !== start.slice(0, 10) ? `${dayLabel(end.slice(0, 10)).day} ${dayLabel(end.slice(0, 10)).month} ${hhmmOf(end)}` : hhmmOf(end)) : '';
  return (
    <View style={[s.side, { backgroundColor: tint(p.btn, 0.06) }]}>
      {t ? (
        <>
          <Text style={[s.taskHead, { color: p.cardInk }]} numberOfLines={1}>
            {[t.assignment, t.comp, t.actingRank].filter(x => x && x !== '-').join(' · ')}
          </Text>
          {start ? <Text style={[s.line, { color: p.cardSoft }]}>RPT {hhmmOf(start)} · End {endLabel}</Text> : null}
          <Text style={[s.line, { color: p.cardSoft }]}>BLH {t.blh} · CRD {t.crd}{wide ? ` · FDP ${t.fdp}` : ''}</Text>
          {t.layoverPort && t.layoverPort !== '-' ? <Text style={[s.line, { color: p.cardSoft }]}>Layover {t.layoverPort} {t.layoverTime}</Text> : null}
        </>
      ) : null}
      {side.legs.map((l: ApiSegment, i: number) => (
        <View key={`${l.fltNo}-${i}`} style={[s.leg, { borderTopColor: p.cardLine }]}>
          <Text style={[s.legMain, { color: p.cardInk }]} numberOfLines={1}>{flt(l.fltNo)}  {l.dep}→{l.arr}</Text>
          <Text style={[s.line, { color: p.cardSoft }]} numberOfLines={1}>{l.std}–{l.sta} · {l.ac} · BLH {l.blh}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  close: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  colHead: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  colTitle: { flex: 1, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  body: { paddingHorizontal: 12, paddingBottom: 12 },
  hint: { fontSize: 12, lineHeight: 17, padding: 10, borderRadius: 10, marginTop: 10 },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  dateCol: { width: 44, alignItems: 'center', paddingTop: 2 },
  dateNum: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dateSub: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  side: { flex: 1, minWidth: 0, borderRadius: 10, padding: 8, gap: 2 },
  taskHead: { fontSize: 13, fontWeight: '800' },
  line: { fontSize: 11.5, fontWeight: '500', fontVariant: ['tabular-nums'] },
  leg: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4, marginTop: 4 },
  legMain: { fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { fontSize: 13, fontStyle: 'italic', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 12 },
  delta: { flexDirection: 'row', marginHorizontal: 12, marginTop: 8, borderRadius: 12, paddingVertical: 8 },
  deltaCell: { flex: 1, alignItems: 'center' },
  deltaKey: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  deltaVal: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },
  footer: { paddingHorizontal: 12, paddingTop: 10, gap: 10 },
  input: { minHeight: 44, maxHeight: 90, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  send: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
