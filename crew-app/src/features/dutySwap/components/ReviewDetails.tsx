import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { font, space } from '../../../theme';
import type { CarrierPalette } from '../../../theme/carrier';
import { realLegs, withoutYear, type ApiSegment, type ApiTaskDetail } from '../dutySwapModel';

/** Review text must wrap: unlike Gantt pucks, these cards have no fixed height. */
export function ReviewDutyDetails({ task: t, p }: { task: ApiTaskDetail; p: CarrierPalette }): React.JSX.Element {
  const layoverInLegs = realLegs(t).some(leg => leg.layoverPort === t.layoverPort && leg.layoverTime === t.layoverTime);
  return <View style={s.details}>
    <Text style={[s.heading, { color: p.cardInk }]}>{[t.assignment, t.comp, t.actingRank].filter(x => x && x !== '-').join(' · ')}</Text>
    <Text style={[s.text, { color: p.cardSoft }]}>RPT {withoutYear(t.startDateTimeLocal ?? t.startDateTime)}</Text>
    <Text style={[s.text, { color: p.cardSoft }]}>End {withoutYear(t.endDateTimeLocal ?? t.endDateTime)}</Text>
    <Text style={[s.text, { color: p.cardSoft }]}>BLH {t.blh} · CRD {t.crd}</Text>
    <Text testID={`review-duty-fdp-${t.pairingId ?? t.rosterGroundPublishId}`} style={[s.text, { color: p.cardSoft }]}>FDP {t.fdp}</Text>
    {t.layoverPort && t.layoverPort !== '-' && !layoverInLegs ? <Text style={[s.text, { color: p.cardSoft }]}>Layover {t.layoverPort} {t.layoverTime}</Text> : null}
  </View>;
}

export function ReviewFlightDetails({ leg, p, flightNumber = leg.fltNo, showDate = false }: {
  leg: ApiSegment; p: CarrierPalette; flightNumber?: string; showDate?: boolean;
}): React.JSX.Element {
  return <View style={[s.leg, { borderTopColor: p.cardLine }]}>
    {showDate ? <Text style={[s.text, { color: p.cardSoft }]}>{withoutYear(leg.fltDt)}</Text> : null}
    <Text style={[s.heading, { color: p.cardInk }]}>{flightNumber} {leg.dep}→{leg.arr}</Text>
    <Text testID={`review-flight-times-${leg.fltNo}`} style={[s.text, { color: p.cardSoft }]}>{leg.std}–{leg.sta}</Text>
    <Text testID={`review-flight-metadata-${leg.fltNo}`} style={[s.text, { color: p.cardSoft }]}>Aircraft {leg.ac} · BLH {leg.blh}</Text>
    {leg.fdp && leg.fdp !== '-' ? <Text style={[s.text, { color: p.cardSoft }]}>FDP {leg.fdp}</Text> : null}
    {leg.layoverPort && leg.layoverPort !== '-' ? <Text style={[s.text, { color: p.cardSoft }]}>Layover {leg.layoverPort} {leg.layoverTime}</Text> : null}
  </View>;
}

const s = StyleSheet.create({
  details: { gap: space.xs4, minWidth: 0 },
  heading: { ...font.sub, fontWeight: '700', fontVariant: ['tabular-nums'] },
  text: { ...font.sub, fontVariant: ['tabular-nums'] },
  leg: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.xs4, marginTop: space.xs4, gap: space.xs4, minWidth: 0 },
});
