// Home ▸ Quick actions ▸ Check-In — the crew portal's Check In page
// (/portal/page/check-in) without its "Check In Record" section: the next duty
// day, earliest / latest (+ scheduled) check-in times, a live clock and
// countdown, the Check In button, a map of the check-in point, and
// the duty's legs. Rules + data contract: checkInModel.ts.
// Demo: tapping Check In records the time on this phone only (checkInSlice).
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';
import { PageShell, ListCard } from '../v2/PageShell';
import { SectionLabel } from '../../components/v2/rows';
import { DashedLine } from '../../components/v2/TicketCard';
import { Icon } from '../../components/v2/icons';
import { AppDialog } from '../../components/v2/AppDialog';
import { useLayout } from '../../components/v2/useLayout';
import { fetchToCheckIn } from './checkInApi';
import { checkInKey, checkedIn } from './checkInSlice';
import { CheckInMap } from './CheckInMap';
import {
  canCheckIn, countdownFor, hhmmAt, nowClock, taskFromApi, taskFromTrips,
  type CheckInTask,
} from './checkInModel';

type Load = { state: 'loading' } | { state: 'ready'; task: CheckInTask | null };

export function CheckInScreen(): React.JSX.Element {
  const p = useCarrier();
  const dispatch = useAppDispatch();
  const { wide } = useLayout();
  const airline = useAppSelector(s => s.auth.airline);
  const crewId = useAppSelector(s => s.auth.crewId);
  const password = useAppSelector(s => s.auth.password);
  const trips = useAppSelector(s => s.trips.trips);
  const records = useAppSelector(s => s.checkIn.records);

  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const [dialogAt, setDialogAt] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // The portal's task when this crew's portal answers; otherwise the roster rule.
  useEffect(() => {
    let live = true;
    setLoad({ state: 'loading' });
    const fromRoster = () => taskFromTrips(trips, Date.now());
    (async () => {
      let task: CheckInTask | null;
      try {
        const api = crewId && password ? await fetchToCheckIn({ airline, crewId, password }) : null;
        task = api ? taskFromApi(api) : fromRoster();
      } catch {
        task = fromRoster();
      }
      if (live) setLoad({ state: 'ready', task });
    })();
    return () => { live = false; };
  }, [airline, crewId, password, trips]);

  const task = load.state === 'ready' ? load.task : null;
  const key = task ? checkInKey(airline, crewId, task.dutyId) : '';
  const doneAt = task ? records[key] : undefined;

  if (load.state === 'loading' || !task) {
    return (
      <PageShell title="Check-In" testID="page-checkin">
        <ListCard palette={p}>
          <Text style={[s.empty, { color: p.cardSoft }]} testID={load.state === 'loading' ? 'checkin-loading' : 'checkin-empty'}>
            {load.state === 'loading' ? 'Loading your next check-in…' : 'No check in task yet.'}
          </Text>
        </ListCard>
      </PageShell>
    );
  }

  const cd = countdownFor(task, now);
  const enabled = canCheckIn(cd.phase) && doneAt === undefined;
  const onCheckIn = () => {
    const at = Date.now();
    dispatch(checkedIn({ key, at }));
    setDialogAt(hhmmAt(at, task.zone));
  };

  const times = (
    <View testID="checkin-times">
      <SectionLabel palette={p}>All times local</SectionLabel>
      <ListCard palette={p} style={s.card}>
        <View style={s.dayRow}>
          <Icon name="checkin" size={18} color={p.cardSoft} strokeWidth={1.6} />
          <Text style={[s.day, { color: p.cardInk }]} testID="checkin-day">{task.dayLabel}</Text>
        </View>
        <DashedLine color={p.cardLine} />
        <View style={s.grid}>
          <Cell label="Earliest check in" value={task.earliest} testID="checkin-earliest" palette={p} />
          <View style={s.cell}>
            <Text style={[s.pk, s.right, { color: p.cardSoft }]}>LATEST CHECK IN</Text>
            <Text style={[s.pv, s.right, { color: p.cardInk }]} testID="checkin-latest">{task.latest}</Text>
            {task.latest !== task.scheduled ? (
              <Text style={[s.sched, s.right, { color: p.crit }]} testID="checkin-scheduled">{`(Scheduled: ${task.scheduled})`}</Text>
            ) : null}
          </View>
        </View>
        <DashedLine color={p.cardLine} />
        <View style={s.clock}>
          <Text style={[s.now, { color: p.cardSoft }]} testID="checkin-now">{`Now: ${nowClock(now, task.zone)}`}</Text>
          <Text style={[s.count, { color: cd.phase === 'closed' ? p.cardSoft : p.cardInk }]} testID="checkin-countdown">{cd.value}</Text>
          <Text style={[s.caption, { color: cd.phase === 'closed' ? p.crit : p.cardSoft }]} testID="checkin-countdown-caption">{cd.caption}</Text>
          <Pressable
            onPress={enabled ? onCheckIn : undefined}
            disabled={!enabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: !enabled }}
            testID="checkin-button"
            style={({ pressed }) => [s.btn, { backgroundColor: p.btn, opacity: !enabled ? 0.45 : pressed ? 0.92 : 1 }]}
          >
            <Text style={s.btnText}>{doneAt !== undefined ? `Checked in · ${hhmmAt(doneAt, task.zone)}L` : 'Check In'}</Text>
          </Pressable>
        </View>
      </ListCard>
    </View>
  );

  const place = task.location ? (
    <View style={wide ? s.mapGroup : undefined}>
      <SectionLabel palette={p}>Check-in location</SectionLabel>
      <CheckInMap pin={task.location} radiusM={task.locationRadiusM} locationKind={task.locationKind} airport={task.dep} palette={p} fill={wide} />
    </View>
  ) : null;

  const duties = (
    <View>
      <SectionLabel palette={p}>Duty</SectionLabel>
      <ListCard palette={p} style={s.card}>
        <View style={s.tRow}>
          {HEAD.map(h => <Text key={h} style={[s.pk, s.tCell, h === 'Flt' && s.tWide, { color: p.cardSoft }]}>{h.toUpperCase()}</Text>)}
        </View>
        {task.rows.map((r, i) => (
          <View key={i}>
            <DashedLine color={p.cardLine} />
            <View style={s.tRow} testID={`checkin-duty-${i}`}>
              {[r.duty, r.fltNum, r.start, r.dep, r.arr, r.end].map((v, j) => (
                <Text key={j} style={[s.tVal, s.tCell, j === 1 && s.tWide, { color: p.cardInk }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{v}</Text>
              ))}
            </View>
          </View>
        ))}
      </ListCard>
    </View>
  );

  return (
    <PageShell title="Check-In" testID="page-checkin" layout={wide ? 'full' : 'auto'}>
      {wide ? (
        <View style={s.stack}>
          <View style={s.topRow} testID="checkin-top-row">
            <View style={s.topCell}>{times}</View>
            {place ? <View style={s.topCell} testID="checkin-side">{place}</View> : null}
          </View>
          {duties}
        </View>
      ) : (
        <View style={s.stack}>{times}{place}{duties}</View>
      )}
      <AppDialog
        visible={dialogAt !== null}
        onClose={() => setDialogAt(null)}
        onConfirm={() => setDialogAt(null)}
        tone="success"
        icon="checkin"
        title={`Checked in at ${dialogAt ?? ''}`}
        message={`${task.dayLabel} · ${task.rows[0]?.fltNum ?? ''} ${task.dep}`.trim()}
        confirmLabel="Done"
        testID="checkin-dialog"
      />
    </PageShell>
  );
}

const HEAD = ['Duty', 'Flt', 'Start', 'Dep', 'Arr', 'End'] as const;

function Cell({ label, value, testID, palette: p }: { label: string; value: string; testID: string; palette: CarrierPalette }) {
  return (
    <View style={s.cell}>
      <Text style={[s.pk, { color: p.cardSoft }]}>{label.toUpperCase()}</Text>
      <Text style={[s.pv, { color: p.cardInk }]} testID={testID}>{value}</Text>
    </View>
  );
}

// Labels/values: the Trip Details marker typography (small spaced label over a
// semibold value).
const s = StyleSheet.create({
  stack: { gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'stretch', gap: 18 },
  topCell: { flex: 1, minWidth: 0 },
  mapGroup: { flex: 1 },
  card: { paddingVertical: 4 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  day: { fontSize: 17, fontWeight: '600' },
  grid: { flexDirection: 'row', paddingVertical: 12, gap: 12 },
  cell: { flex: 1, minWidth: 0 },
  pk: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6 },
  pv: { fontSize: 16, fontWeight: '600', marginTop: 3, fontVariant: ['tabular-nums'] },
  right: { textAlign: 'right' },
  sched: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  clock: { alignItems: 'center', paddingTop: 14, paddingBottom: 12 },
  now: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  count: { fontSize: 34, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  caption: { fontSize: 12, marginTop: 2, textAlign: 'center' },
  btn: { alignSelf: 'stretch', marginTop: 14, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 4 },
  tCell: { flex: 1, minWidth: 0 },
  tWide: { flex: 1.2 },
  tVal: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 22 },
});
