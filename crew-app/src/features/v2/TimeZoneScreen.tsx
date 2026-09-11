// Profile ▸ Time Zone — the existing time-zone mode picker, full page.
import React from 'react';
import { DashedLine } from '../../components/v2/TicketCard';
import { View } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { RadioRow } from '../../components/v2/rows';
import { PageShell, Hero, ListCard } from './PageShell';
import { setTimeZoneMode, type TimeZoneMode } from '../settings/settingsSlice';

const OPTIONS: Array<{ mode: TimeZoneMode; title: string; sub: (base: string) => string }> = [
  { mode: 'airport', title: 'Airport Local', sub: () => 'Each flight shows its own departure/arrival airport local time.' },
  { mode: 'base', title: 'Base time', sub: b => `All times shown in the base timezone (${b}).` },
  { mode: 'utc', title: 'UTC', sub: () => 'All times shown in Coordinated Universal Time.' },
  { mode: 'device', title: 'Phone Local Time', sub: () => "All times shown in your phone's current timezone." },
];

export function TimeZoneScreen() {
  const p = useCarrier();
  const dispatch = useAppDispatch();
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  return (
    <PageShell title="Time Zone" testID="page-timezone">
      <Hero h2="Choose how flight times are shown across the app. Alarms always ring in the departure airport's local time." palette={p} />
      <ListCard palette={p}>
        {OPTIONS.map((o, i) => (
          <View key={o.mode} >
            <RadioRow title={o.title} sub={o.sub(baseTz)} selected={mode === o.mode} onPress={() => dispatch(setTimeZoneMode(o.mode))} palette={p} />
            {i < OPTIONS.length - 1 && <DashedLine color={p.cardLine} />}
          </View>
        ))}
      </ListCard>
    </PageShell>
  );
}
