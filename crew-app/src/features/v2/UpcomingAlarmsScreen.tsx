// Home ▸ alarm icon: every upcoming iOS alarm, grouped BY FLIGHT.
//
// Ryan's polish pass: the flight identity used to be repeated on every line
// ("Get Ready · TG662 BKK – PVG", "Leave Home · TG662 BKK – PVG", …). Now each
// duty gets ONE header (flight · route · date/check-in · zone) and the alarms it
// arms sit under it as compact icon-led rows — wake up → leave home → check-in,
// the order the crew lives them. Same master switch as Profile ▸ Alarms & Meetings.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';
import { Icon, type IconName } from '../../components/v2/icons';
import { DashedLine } from '../../components/v2/TicketCard';
import { NavRow, SectionLabel, ToggleRow } from '../../components/v2/rows';
import { PageShell, ListCard } from './PageShell';
import { setEnabled } from '../alarms/alarmsSlice';
import { isAlarmModuleAvailable } from '../settings/alarmModule';
import type { EffectiveAlarm } from '../settings/alarmSetup';
import { useAlarms } from './useV2';
import { alertAlarmsUnavailable } from './AlarmsSettingsScreen';
import { useV2Nav } from './nav';

interface AlarmRow {
  key: string;
  icon: IconName;
  label: string;
  hhmm: string;
}

interface FlightGroup {
  key: string;
  fltNumber: string;
  dep: string;
  arv: string;
  /** Local check-in stamp, "15 Sep 2230". */
  when: string;
  timeZone: string;
  rows: AlarmRow[];
}

/** "15 Sep 2230" → "22:30" (the roster stamp ends with HHMM). */
function hhmmFromStamp(stamp: string): string {
  const m = stamp.match(/(\d{2})(\d{2})\s*$/);
  return m ? `${m[1]}:${m[2]}` : '';
}

/**
 * One group per duty: the flight is written once, the alarms it arms below it.
 * Two duties of the same flight number on different dates stay separate (the
 * check-in stamp is part of the key).
 */
export function groupAlarmsByFlight(all: EffectiveAlarm[]): FlightGroup[] {
  const groups = new Map<string, FlightGroup>();
  for (const a of all) {
    const key = `${a.fltNumber}|${a.dep}|${a.arv}|${a.checkInLabel}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, fltNumber: a.fltNumber, dep: a.dep, arv: a.arv, when: a.checkInLabel, timeZone: a.timeZone, rows: [] };
      groups.set(key, g);
    }
    if (a.wakeUp) {
      g.rows.push({ key: `${a.dutyId}-wake`, icon: 'alarm', label: a.wakeWord, hhmm: a.wakeUp.hhmm });
    }
    if (a.leaveHome) {
      g.rows.push({ key: `${a.dutyId}-leave`, icon: 'run', label: 'Leave Home', hhmm: a.leaveHome.hhmm });
    }
    const checkIn = hhmmFromStamp(a.checkInLabel);
    if (checkIn) {
      g.rows.push({ key: `${a.dutyId}-checkin`, icon: 'checkin', label: 'Check-in', hhmm: checkIn });
    }
  }
  return [...groups.values()];
}

function CompactLine({ icon, label, when, palette: p }: { icon: IconName; label: string; when: string; palette: CarrierPalette }) {
  return (
    <View style={s.row}>
      <Icon name={icon} size={16} color={p.btn} strokeWidth={1.6} />
      <Text style={[s.rowLabel, { color: p.cardInk }]} numberOfLines={1}>{label}</Text>
      <Text style={[s.rowWhen, { color: p.cardInk }]}>{when}</Text>
    </View>
  );
}

export function UpcomingAlarmsScreen() {
  const p = useCarrier();
  const nav = useV2Nav();
  const dispatch = useAppDispatch();
  const enabled = useAppSelector(s => s.alarms.enabled);
  const wake = useAppSelector(s => s.alarms.wakeUpHours);
  const leave = useAppSelector(s => s.alarms.leaveHomeHours);
  const meetings = useAppSelector(s => s.meetings.meetings);
  const meetingsEnabled = useAppSelector(s => s.meetings.enabled);
  const minutesBefore = useAppSelector(s => s.meetings.minutesBefore);
  const [now] = useState(() => new Date());
  const { all } = useAlarms(now);
  const groups = useMemo(() => groupAlarmsByFlight(all), [all]);
  const dim = enabled ? 1 : 0.35;
  const upcomingMeetings = meetings.filter(m => !m.allDay && new Date(m.startISO).getTime() > now.getTime()).slice(0, 8);
  const alarmCount = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <PageShell title="Upcoming Alarms" testID="page-upcoming-alarms">
      <ListCard palette={p}>
        <ToggleRow label="iOS clock alarms" sub="Get Ready and Leave Home before each flight duty · meeting reminders from your calendar." value={enabled} palette={p} testID="upalarms-master"
          onValueChange={v => { if (v && !isAlarmModuleAvailable()) { alertAlarmsUnavailable(); return; } dispatch(setEnabled(v)); }} />
      </ListCard>
      <SectionLabel palette={p}>
        {enabled ? `${groups.length} flight${groups.length === 1 ? '' : 's'} · ${alarmCount} alarms` : 'Flights · local airport time'}
      </SectionLabel>
      <ListCard palette={p} style={{ opacity: dim }}>
        {groups.length === 0 && <Text style={[s.empty, { color: p.cardSoft }]}>No upcoming flights.</Text>}
        {groups.map((g, i) => (
          <View key={g.key} testID={`alarm-group-${g.fltNumber}`}>
            {i > 0 ? <DashedLine color={p.cardLine} /> : null}
            <View style={s.group}>
              <View style={s.groupHead}>
                <Text style={[s.flt, { color: p.cardInk }]}>{g.fltNumber}</Text>
                <Text style={[s.route, { color: p.cardSoft }]} numberOfLines={1}>{g.dep} → {g.arv}</Text>
              </View>
              <Text style={[s.when, { color: p.cardSoft }]}>{g.when} · {g.timeZone}</Text>
              {g.rows.map(r => (
                <CompactLine key={r.key} icon={r.icon} label={r.label} when={r.hhmm} palette={p} />
              ))}
            </View>
          </View>
        ))}
      </ListCard>
      <SectionLabel palette={p}>Meetings · {minutesBefore} min before</SectionLabel>
      <ListCard palette={p} style={{ opacity: meetingsEnabled ? 1 : 0.35 }}>
        {upcomingMeetings.length === 0 && <Text style={[s.empty, { color: p.cardSoft }]}>No upcoming meetings on your calendar.</Text>}
        {upcomingMeetings.map(m => {
          const t = new Date(new Date(m.startISO).getTime() - minutesBefore * 60000);
          const when = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
          return <CompactLine key={m.id} icon="cal" label={m.title} when={when} palette={p} />;
        })}
      </ListCard>
      <ListCard palette={p} style={{ marginTop: 14 }}>
        <NavRow icon="sliders" label="Alarm settings" value={`Dep − ${wake}h · Dep − ${leave}h`} palette={p} onPress={() => nav.navigate('AlarmsSettings')} testID="upalarms-settings" />
      </ListCard>
    </PageShell>
  );
}

const s = StyleSheet.create({
  empty: { fontSize: 13, paddingVertical: 12 },
  group: { paddingVertical: 12, gap: 2 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flt: { fontSize: 15, fontWeight: '700' },
  route: { fontSize: 13, flexShrink: 1 },
  when: { fontSize: 12, marginBottom: 4 },
  // One compact line per alarm: line icon · what · local time.
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  rowWhen: { fontSize: 15, fontWeight: '600' },
});
