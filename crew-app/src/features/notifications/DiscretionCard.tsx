// The FDP-discretion card shared by Alerts and the Home "Discretion" page.
//
// Ryan, 2026-09-13: FDP is a DUTY-level property, so the crew must see the whole
// duty, not just two identical timestamps — the check-in (report) time, every
// flown leg with its schedule next to the published revised time, and the FDP
// they are being asked to extend (x → y). Before this the card showed the same
// number twice (planned === actual) and no duty context at all.
//
// Layout follows the v2 surface (carrier palette, line icons). The two choices
// read left → right as Yes · No (the affirmative is the left pill).
import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';

import type {CarrierPalette} from '../../theme/carrier';
import {Icon} from '../../components/v2/icons';
import type {DiscretionRequest} from './notificationsApi';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-09-28T04:00:00Z' → '28 Sep 04:00z'. Naive values are read as UTC. */
export function fmtUtc(value?: string | null): string {
  if (!value) return '—';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return value;
  const [, , month, day, hour, minute] = m;
  return `${day} ${MONTHS[Number(month) - 1]} ${hour}:${minute}z`;
}

/** 660 → '11h00'. */
export function fmtHm(v?: number | null): string {
  if (v == null) return '—';
  const h = Math.floor(v / 60);
  const mm = Math.round(v % 60);
  return `${h}h${String(mm).padStart(2, '0')}`;
}

/** 120 → '2h00'. */
export function fmtDelay(min: number): string {
  const h = Math.floor(min / 60);
  const mm = min % 60;
  return h > 0 ? `${h}h${String(mm).padStart(2, '0')}` : `${mm}m`;
}

/** '04:00z' — the date is carried by the duty window, so each leg reads as a clock. */
function clock(value?: string | null): string {
  if (!value) return '—';
  const m = value.match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}z` : value;
}

/** The FDP pair the crew is agreeing to: current → current + requested extension,
 *  raised to the recalculated value when the published delay already moved it. */
export function fdpExtension(d: DiscretionRequest): {
  current: number | null;
  recalculated: number | null;
  proposed: number | null;
  requested: number;
} {
  const current = d.duty?.fdpBeforeMin ?? d.plannedFdpMin ?? null;
  const recalculated = d.duty?.fdpAfterMin ?? d.actualFdpMin ?? null;
  const requested = d.extensionRequestedMin;
  // The proposed FDP is the extended duty the crew agrees to: the recalculated
  // (revised-schedule) FDP itself, NOT recalculated + requested. Because
  // requested = recalculated − current, adding it on top double-counts the delay
  // (930 + 90 = 1020 = 17h00 instead of the real 930 = 15h30 the gantt shows).
  // When there is no recalculated value, fall back to current + requested.
  const proposed = recalculated ?? (current != null ? current + requested : null);
  return {current, recalculated, proposed, requested};
}

type Leg = NonNullable<DiscretionRequest['duty']>['legs'][number];

function LegRow({leg, palette: p}: {leg: Leg; palette: CarrierPalette}): React.JSX.Element {
  const delayed = leg.delayMin > 0;
  return (
    <View style={s.legRow} testID={`disc-leg-${leg.fltNum}`}>
      <Text
        style={[s.legFlt, {color: p.cardInk}]}
        numberOfLines={1}
        ellipsizeMode="clip">
        {leg.fltNum}
      </Text>
      <Text style={[s.legRoute, {color: p.cardSoft}]}>{leg.depArp} → {leg.arvArp}</Text>
      <View style={s.legTimes}>
        <Text style={[s.legTime, {color: p.cardSoft}]} testID={`disc-leg-sch-${leg.fltNum}`}>
          {clock(leg.schDepUtc)} → {clock(leg.schArvUtc)}
        </Text>
        {delayed ? (
          <Text style={[s.legTime, {color: p.crit}]} testID={`disc-leg-rev-${leg.fltNum}`}>
            <Text style={s.legDelay}>DELAYED +{fmtDelay(leg.delayMin)}  </Text>
            {clock(leg.revisedDepUtc)} → {clock(leg.revisedArvUtc)}
          </Text>
        ) : (
          <Text style={[s.legTime, {color: p.good}]} testID={`disc-leg-ontime-${leg.fltNum}`}>On schedule</Text>
        )}
      </View>
    </View>
  );
}

const STATE_LABEL: Record<string, string> = {
  accepted: 'Agreed',
  rejected: 'Declined',
  expired: 'Expired',
  superseded: 'Superseded',
  pending: 'Awaiting your reply',
};

export function DiscretionCard({
  request: d,
  palette: p,
  deciding,
  onDecide,
  showActions = true,
}: {
  request: DiscretionRequest;
  palette: CarrierPalette;
  deciding?: boolean;
  onDecide?: (d: DiscretionRequest, decision: 'accept' | 'reject') => void;
  showActions?: boolean;
}): React.JSX.Element {
  const {current, recalculated, proposed, requested} = fdpExtension(d);
  const duty = d.duty;
  const legs = duty?.legs ?? [];
  const report = duty?.reportUtc ?? d.schDep ?? null;
  const release = duty?.releaseUtc ?? d.schArv ?? null;
  // Title the card by THIS duty's own flights (the legs listed below), not the
  // whole-pairing label — pairingLabel spans every duty (e.g. all four of
  // ET2681/ET2682/ET2683/ET2684) and reads as phantom flights on a single-duty
  // card that only holds ET2681/ET2682.
  const dutyLabel = legs.length > 0 ? legs.map(leg => leg.fltNum).join('/') : duty?.pairingLabel ?? null;
  const terminal = d.state !== 'pending';
  return (
    <View style={[s.card, {backgroundColor: p.cardSolid}]} testID="discretion-card">
      <View style={s.rowBetween}>
        <View style={s.headLeft}>
          <View style={[s.chip, {backgroundColor: p.frost}]}>
            <Icon name="shield" size={16} color={p.cardInk} strokeWidth={1.7} />
          </View>
          <Text style={[s.title, {color: p.cardInk}]} testID="disc-title">
            FDP discretion{dutyLabel ? ` · ${dutyLabel}` : ''} · Duty {d.dutyId}
          </Text>
        </View>
        <Text style={[s.extBadge, {backgroundColor: p.btn}]}>+{requested}m</Text>
      </View>

      {/* Duty-level window: the check-in the crew still reports at, and the release. */}
      <View style={[s.grid, {borderColor: p.cardLine}]}>
        <View style={s.gridCol}>
          <Text style={[s.gridHead, {color: p.cardSoft}]}>Check-in (report)</Text>
          <Text style={[s.gridVal, {color: p.cardInk}]} testID="disc-report">{fmtUtc(report)}</Text>
        </View>
        <View style={s.gridCol}>
          <Text style={[s.gridHead, {color: p.cardSoft}]}>Release</Text>
          <Text style={[s.gridVal, {color: p.cardInk}]} testID="disc-release">{fmtUtc(release)}</Text>
        </View>
      </View>

      {legs.length > 0 && (
        <View style={[s.legs, {borderColor: p.cardLine}]} testID="disc-legs">
          <Text style={[s.legsHead, {color: p.cardSoft}]}>FLIGHTS</Text>
          {legs.map(leg => <LegRow key={`${leg.fltNum}-${leg.depArp}`} leg={leg} palette={p} />)}
        </View>
      )}

      {/* FDP is the number the crew is actually agreeing to extend. */}
      <View style={s.fdpRow}>
        <View>
          <Text style={[s.gridHead, {color: p.cardSoft}]}>FDP current</Text>
          <Text style={[s.fdpVal, {color: p.cardInk}]} testID="disc-fdp-current">{fmtHm(current)}</Text>
        </View>
        <Icon name="chev" size={16} color={p.cardSoft} strokeWidth={2} />
        <View>
          <Text style={[s.gridHead, {color: p.cardSoft}]}>FDP proposed</Text>
          <Text style={[s.fdpVal, {color: p.btn}]} testID="disc-fdp-proposed">{fmtHm(proposed)}</Text>
        </View>
        <Text style={[s.fdpDelta, {color: p.cardInk}]} testID="disc-fdp-delta">+{requested}m</Text>
      </View>
      <Text style={[s.note, {color: p.cardSoft}]} testID="disc-limit">
        {d.limitMin == null
          ? 'Regulatory assessment pending'
          : `Plan limit ${fmtHm(d.limitMin)} · exceed by ${Math.max((recalculated ?? current ?? 0) - d.limitMin, 0)}m`}
      </Text>

      {d.proposal?.reason && <Text style={[s.body, {color: p.cardSoft}]} testID="disc-reason">{d.proposal.reason}</Text>}

      {showActions && !terminal ? (
        <>
          <Text style={[s.choice, {color: p.cardInk}]}>Do you agree to a {requested} min FDP extension?</Text>
          {deciding ? (
            <ActivityIndicator color={p.btn} style={s.spinner} testID="disc-deciding" />
          ) : (
            <View style={s.actions} testID="disc-actions">
              {/* Yes on the left — the affirmative is the first pill the eye lands on. */}
              <Pressable
                style={[s.btn, {backgroundColor: p.btn}]}
                testID="btn-accept"
                onPress={() => onDecide?.(d, 'accept')}>
                <Text style={s.btnText}>Yes · +{requested}m</Text>
              </Pressable>
              <Pressable
                style={[s.btn, s.btnGhost, {borderColor: p.cardLine}]}
                testID="btn-reject"
                onPress={() => onDecide?.(d, 'reject')}>
                <Text style={[s.btnGhostText, {color: p.cardInk}]}>No</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : (
        <Text style={[s.stateLine, {color: p.cardSoft}]} testID="disc-state">
          {STATE_LABEL[d.state] ?? d.state}
          {d.decidedUtc ? ` · ${fmtUtc(d.decidedUtc)}` : ''}
        </Text>
      )}

      <Text style={[s.note, {color: p.cardSoft}]}>Agreement does not override regulatory limits.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {borderRadius: 18, padding: 16, marginBottom: 12, gap: 10},
  rowBetween: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between'},
  headLeft: {flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1},
  chip: {width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  title: {fontSize: 15, lineHeight: 20, fontWeight: '600', flexShrink: 1},
  extBadge: {color: '#fff', fontSize: 12, fontWeight: '700', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8, overflow: 'hidden'},
  grid: {flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 12},
  gridCol: {flex: 1, gap: 2},
  gridHead: {fontSize: 11, letterSpacing: 0.3, textTransform: 'uppercase'},
  gridVal: {fontSize: 15, fontWeight: '600'},
  legs: {borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 8},
  legsHead: {fontSize: 11, letterSpacing: 0.5},
  legRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  legFlt: {fontSize: 13, fontWeight: '700', width: 62, flexShrink: 0},
  legRoute: {fontSize: 12, width: 78},
  legTimes: {flex: 1, alignItems: 'flex-end', gap: 2},
  legTime: {fontSize: 12},
  legDelay: {fontWeight: '700'},
  fdpRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10},
  fdpVal: {fontSize: 22, fontWeight: '700'},
  fdpDelta: {fontSize: 14, fontWeight: '600', marginLeft: 'auto'},
  note: {fontSize: 12, lineHeight: 16},
  body: {fontSize: 13, lineHeight: 18},
  choice: {fontSize: 14, fontWeight: '600', marginTop: 2},
  actions: {flexDirection: 'row', gap: 10, marginTop: 2},
  btn: {flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center'},
  btnGhost: {borderWidth: StyleSheet.hairlineWidth},
  btnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  btnGhostText: {fontSize: 15, fontWeight: '600'},
  stateLine: {fontSize: 13, fontWeight: '600'},
  spinner: {marginVertical: 8},
});
