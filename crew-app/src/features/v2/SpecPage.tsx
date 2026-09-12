// Data-driven pages that mirror the mock's PAGES map 1:1 (quick actions, crew
// status, privacy, help, settings, language). Content that has no backing
// feature yet is presented exactly as in the approved mock; wiring lands
// per-feature later without changing the layout.
import React, { useState } from 'react';
import { DashedLine } from '../../components/v2/TicketCard';
import { View, Text, StyleSheet, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppSelector } from '../../store';
import { selectCrewCarrier } from '../auth/authSlice';
import { airlineByCode } from '../auth/airlines';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';
import { NavRow, SectionLabel, ToggleRow } from '../../components/v2/rows';
import type { IconName } from '../../components/v2/icons';
import { PageShell, Hero, ListCard, KvRow, PrimaryButton } from './PageShell';
import { AbsenceScreen } from './AbsenceScreen';
import type { V2StackParamList, SpecPageId } from './nav';
import { APP_VERSION } from '../../version';

type Row =
  | { kind: 'kv'; label: string; value: string }
  | { kind: 'nav'; icon: IconName; label: string; value?: string; to: SpecPageId }
  | { kind: 'toggle'; label: string; sub?: string; on: boolean }
  | { kind: 'pick'; label: string; selected?: boolean };

interface Group { title?: string; rows: Row[] }
interface Spec { title: string; hero?: { h1?: string; h2?: string }; groups: Group[]; cta?: { label: string; toast: string } }

function specFor(id: SpecPageId, ctx: { crewId: string; airlineName: string; nextFlight: string }): Spec {
  switch (id) {
    case 'status': return { title: 'Crew Status', hero: { h1: 'First Officer · A350', h2: `Base BKK · Crew ${ctx.crewId} · ${ctx.airlineName}` },
      groups: [{ title: 'Currency', rows: [{ kind: 'kv', label: 'Line check', value: 'Valid to Mar 2027' }, { kind: 'kv', label: 'Recurrent sim', value: '⚠ due 23 Sep' }, { kind: 'kv', label: 'Medical Class 1', value: 'Mar 2027' }, { kind: 'kv', label: 'Passport', value: '⚠ Jan 2027' }] }] };
    case 'checkin': return { title: 'Check-In', hero: { h1: ctx.nextFlight, h2: 'Opens 90 min before report time.' },
      groups: [{ title: 'Status', rows: [{ kind: 'kv', label: 'Required documents', value: 'Passport · Licence · Medical' }, { kind: 'kv', label: 'Crew briefing', value: 'At report · Ops Centre' }] },
        { title: 'Before you go', rows: [{ kind: 'kv', label: 'Transport', value: 'Own car · Crew park B' }] }], cta: { label: 'Remind me', toast: 'Reminder set ✓' } };
    case 'absence': return { title: 'Absence Request', hero: { h1: 'Report an absence', h2: 'Crew Control is notified instantly and your affected duties are reassigned.' },
      groups: [{ title: 'Type', rows: [{ kind: 'pick', label: 'Sick leave', selected: true }, { kind: 'pick', label: 'Emergency leave' }, { kind: 'pick', label: 'Personal leave' }] },
        { title: 'Dates', rows: [{ kind: 'kv', label: 'From', value: 'Today' }, { kind: 'kv', label: 'To', value: '—' }] }], cta: { label: 'Submit request', toast: 'Request submitted ✓' } };
    case 'swap': return { title: 'Duty Swap', hero: { h1: 'Offer a duty', h2: 'Pick one of your duties; qualified crew at your base will see it.' },
      groups: [{ title: 'Your next duty', rows: [{ kind: 'pick', label: ctx.nextFlight, selected: true }] },
        { title: 'Rule check', rows: [{ kind: 'kv', label: 'Rest & 7305', value: 'Passes' }, { kind: 'kv', label: 'Deadline', value: '48h before report' }] }], cta: { label: 'Post swap offer', toast: 'Swap offer posted ✓' } };
    case 'more': return { title: 'More', groups: [{ rows: [
      { kind: 'nav', icon: 'swap', label: 'Trip trade', to: 'trade' }, { kind: 'nav', icon: 'doc', label: 'Roster PDF', to: 'pdf' },
      { kind: 'nav', icon: 'shield', label: 'Documents', to: 'docs' }, { kind: 'nav', icon: 'clock', label: 'Leave balance', to: 'leave' },
      { kind: 'nav', icon: 'book', label: 'Expense claims', to: 'expense' }] }] };
    case 'trade': return { title: 'Trip Trade', groups: [{ title: "Open trips you're legal for", rows: [{ kind: 'kv', label: 'No open trips', value: '' }] }], cta: { label: 'Refresh', toast: 'Up to date' } };
    case 'pdf': return { title: 'Roster PDF', groups: [{ rows: [{ kind: 'kv', label: 'Month', value: 'Current roster' }, { kind: 'kv', label: 'Includes', value: 'Flights · standby · training' }] }], cta: { label: 'Share PDF', toast: 'Sharing…' } };
    case 'docs': return { title: 'Documents', groups: [{ rows: [{ kind: 'kv', label: 'Passport', value: '—' }, { kind: 'kv', label: 'Licence', value: '—' }, { kind: 'kv', label: 'Medical', value: '—' }] }], cta: { label: 'Upload document', toast: 'Coming soon' } };
    case 'leave': return { title: 'Leave Balance', groups: [{ rows: [{ kind: 'kv', label: 'Annual leave', value: '—' }, { kind: 'kv', label: 'Days in lieu', value: '—' }] }], cta: { label: 'Request leave', toast: 'Coming soon' } };
    case 'expense': return { title: 'Expense Claims', groups: [{ rows: [{ kind: 'kv', label: 'Pending', value: '0' }] }], cta: { label: 'New claim', toast: 'Coming soon' } };
    case 'privacy': return { title: 'Privacy & Security', groups: [{ rows: [{ kind: 'toggle', label: 'Face ID', on: true }, { kind: 'toggle', label: 'Store roster on device only', on: true }] },
      { title: 'Sessions', rows: [{ kind: 'kv', label: 'This iPhone', value: 'Active now' }] }], cta: { label: 'Change password', toast: 'Coming soon' } };
    case 'help': return { title: 'Help & Support', hero: { h1: 'Crew Control · 24/7', h2: 'Call or message the duty controller.' },
      groups: [
        { rows: [{ kind: 'nav', icon: 'headset', label: 'Call Crew Control', to: 'help' }, { kind: 'nav', icon: 'doc', label: 'Report an app issue', to: 'help' }, { kind: 'nav', icon: 'book', label: 'FAQ', to: 'help' }] },
        // The installed build identifies itself here (moved off Preferences) so
        // the crew can read the version where they go for support.
        { title: 'About', rows: [{ kind: 'kv', label: 'App version', value: String(APP_VERSION) }] },
      ] };
    case 'settings': return { title: 'Settings', groups: [{ rows: [{ kind: 'kv', label: 'Cache', value: 'Clear roster cache' }, { kind: 'kv', label: 'Diagnostics', value: 'Send logs' }] }] };
    case 'lang': return { title: 'Language', groups: [{ rows: [{ kind: 'pick', label: 'English', selected: true }, { kind: 'pick', label: 'ไทย' }, { kind: 'pick', label: '中文' }] }] };
    case 'limits': return { title: 'Duty & Rest Limits', groups: [{ title: 'This period', rows: [{ kind: 'kv', label: '7-day duty', value: '—' }, { kind: 'kv', label: '28-day block', value: '—' }, { kind: 'kv', label: 'Rest before next duty', value: '—' }] }] };
  }
}

type Props = NativeStackScreenProps<V2StackParamList, 'Spec'>;

export function SpecPage(props: Props) {
  // Crew Recovery Story 101: the absence quick action is a real submission
  // flow now, not a data-driven mock — route it to its own screen before any
  // of the mock-page hooks below run.
  if (props.route.params.id === 'absence') {
    return <AbsenceScreen {...props} />;
  }
  const { route, navigation } = props;
  const p = useCarrier();
  const crewId = useAppSelector(st => st.auth.crewId) ?? '';
  // Spec copy addresses the crew's own carrier (roster-resolved), so an EK crew
  // never reads "Ethiopian Airlines" in a settings sentence.
  const airline = useAppSelector(selectCrewCarrier) ?? '';
  const spec = specFor(route.params.id, { crewId, airlineName: airlineByCode(airline).name, nextFlight: 'Next flight' });
  return (
    <PageShell title={spec.title} testID={`page-${route.params.id}`}>
      {spec.hero && <Hero h1={spec.hero.h1} h2={spec.hero.h2} palette={p} />}
      {spec.groups.map((g, gi) => (
        <View key={gi}>
          {g.title && <SectionLabel palette={p}>{g.title}</SectionLabel>}
          <ListCard palette={p} style={!g.title && gi === 0 ? undefined : undefined}>
            {g.rows.map((r, ri) => <SpecRow key={ri} row={r} last={ri === g.rows.length - 1} palette={p} onNav={to => navigation.push('Spec', { id: to })} />)}
          </ListCard>
        </View>
      ))}
      {spec.cta && <PrimaryButton label={spec.cta.label} palette={p} testID="spec-cta" onPress={() => { navigation.goBack(); Alert.alert(spec.cta!.toast); }} />}
    </PageShell>
  );
}

function SpecRow({ row, last, palette, onNav }: { row: Row; last: boolean; palette: CarrierPalette; onNav: (to: SpecPageId) => void }) {
  const [on, setOn] = useState(row.kind === 'toggle' ? row.on : false);
  const [picked, setPicked] = useState(row.kind === 'pick' ? !!row.selected : false);
  const divider = null;
  switch (row.kind) {
    case 'kv': return <KvRow label={row.label} value={row.value} palette={palette} last={last} />;
    case 'nav': return <View style={divider}><NavRow icon={row.icon} label={row.label} value={row.value} palette={palette} onPress={() => onNav(row.to)} />{!last && <DashedLine color={palette.cardLine} />}</View>;
    case 'toggle': return <View style={divider}><ToggleRow label={row.label} sub={row.sub} value={on} onValueChange={setOn} palette={palette} />{!last && <DashedLine color={palette.cardLine} />}</View>;
    case 'pick': return (
      <View style={[st.pick, divider]} onTouchEnd={() => setPicked(v => !v)}>
        <Text style={[st.pickLabel, { color: palette.cardInk }]}>{row.label}</Text>
        {picked && <Text style={{ color: palette.btn, fontWeight: '700' }}>✓</Text>}
      </View>
    );
  }
}

const st = StyleSheet.create({
  pick: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  pickLabel: { fontSize: 14, fontWeight: '500' },
});
