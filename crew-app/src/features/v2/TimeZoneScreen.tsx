// Profile ▸ Time Zone — the existing time-zone mode picker, full page.
import React, { useState } from 'react';
import { DashedLine } from '../../components/v2/TicketCard';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { RadioRow } from '../../components/v2/rows';
import { Icon } from '../../components/v2/icons';
import { PageShell, Hero, ListCard } from './PageShell';
import { setTimeZoneMode, type TimeZoneMode } from '../settings/settingsSlice';
import { airportZone } from '../settings/airportZones';

const OPTIONS: Array<{ mode: TimeZoneMode; title: string; marker: string; sub: (base: string) => string }> = [
  { mode: 'airport', title: 'Airport Local', marker: '13:00L', sub: () => 'Each flight shows its own departure/arrival airport local time.' },
  { mode: 'base', title: 'Base time', marker: '13:00B', sub: b => `All times shown in your base timezone (${b}).` },
  { mode: 'utc', title: 'UTC', marker: '13:00Z', sub: () => 'All times shown in Coordinated Universal Time.' },
  { mode: 'device', title: 'Phone Local Time', marker: '13:00', sub: () => "All times shown in your phone's current timezone." },
];

export function TimeZoneScreen() {
  const p = useCarrier();
  const dispatch = useAppDispatch();
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const base = useAppSelector(s => s.auth.base) ?? '';
  const [tipOpen, setTipOpen] = useState(false);
  const baseLabel = base || baseTz;
  return (
    <PageShell title="Time Zone" testID="page-timezone">
      <Hero h2="Choose how flight times are shown across the app. Alarms always ring in the departure airport's local time." palette={p} />
      {/* Time-convention legend. The letters are the only clue on a duty card that a
          time is airport-local vs base vs UTC, so they are documented in the same
          white-list-card language as the options below (not a see-through slab). */}
      <ListCard palette={p} style={{ marginBottom: 16 }}>
        <Pressable onPress={() => setTipOpen(v => !v)} style={s.legendHead} testID="timezone-legend-toggle">
          <View style={[s.legendIcon, { backgroundColor: p.card }]}>
            <Icon name="clock" size={18} color={p.btn} strokeWidth={1.9} />
          </View>
          <Text style={[s.legendTitle, { color: p.cardInk }]}>Time format</Text>
          <Text style={[s.legendToggle, { color: p.btn }]}>{tipOpen ? 'Hide' : 'What do L / B / Z mean?'}</Text>
        </Pressable>
        {tipOpen ? (
          <View testID="timezone-legend">
            {LEGEND.map((row, i) => (
              <View key={row.marker}>
                {i > 0 && <DashedLine color={p.cardLine} />}
                <View style={s.legendRow}>
                  <Text style={[s.legendMarker, { color: p.btn, borderColor: p.cardLine }]}>{row.marker}</Text>
                  <Text style={[s.legendText, { color: p.cardInk }]}>{row.text(baseLabel)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ListCard>
      <ListCard palette={p}>
        {OPTIONS.map((o, i) => (
          <View key={o.mode} >
            <RadioRow title={o.title} sub={o.sub(baseTz)} badge={o.marker} selected={mode === o.mode} onPress={() => dispatch(setTimeZoneMode(o.mode))} palette={p} />
            {i < OPTIONS.length - 1 && <DashedLine color={p.cardLine} />}
          </View>
        ))}
      </ListCard>
    </PageShell>
  );
}

const LEGEND: Array<{ marker: string; text: (base: string) => string }> = [
  { marker: '13:00L', text: () => "Airport local — that airport's own wall clock." },
  { marker: '13:00B', text: base => `Base time — your base (${base}).` },
  { marker: '13:00Z', text: () => 'UTC — Coordinated Universal Time.' },
  { marker: '13:00', text: () => 'Phone local — no letter.' },
];

const s = StyleSheet.create({
  legendHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  legendIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  legendTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  legendToggle: { fontSize: 12, fontWeight: '600' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  legendMarker: { fontSize: 12, fontWeight: '700', borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, minWidth: 62, textAlign: 'center', overflow: 'hidden' },
  legendText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
});
