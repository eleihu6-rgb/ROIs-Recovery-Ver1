// Crew Recovery Story 101 follow-up (Ryan, 2026-09-13): the Absence Request
// screen's top-right history icon opens this page — the crew's own submitted
// sick-leave requests, read from live-server (`POST /crew-app/v1/absences`,
// verified-credential owned).
//
// Scope is the CURRENT CALENDAR MONTH, computed on the device's own calendar
// (1st → last day) rather than following the From/To steppers: this page is a
// confirmation of what has already been filed, so it must not shift while the
// crew edits the form behind it. The server returns requests OVERLAPPING that
// window, cancelled ones included — a recovery cancellation is an outcome the
// crew has to see.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppSelector } from '../../store';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';
import { ListCard, PageShell, PrimaryButton } from './PageShell';
import { SectionLabel } from '../../components/v2/rows';
import { DashedLine } from '../../components/v2/TicketCard';
import { currentMonthRange, listAbsences, type AbsenceRecord } from '../absence/absenceApi';
import { MON } from './model';

type LoadState =
  | { kind: 'loading' }
  /** Signed in without an airline session (guest): there is nothing to read. */
  | { kind: 'signed-out' }
  | { kind: 'ready'; records: AbsenceRecord[] }
  | { kind: 'error'; message: string };

/** Absence codes the crew reads by name; anything unknown shows its own code. */
const TYPE_LABEL: Record<string, string> = { sick: 'Sick leave' };

/** '2026-09-24' → '24 Sep 2026'. The stored string is already the crew-base
 *  local day, so it is formatted by digits — no Date parsing, no zone drift. */
function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}`;
}

/** '24 Sep 2026', or '11 Sep → 24 Sep 2026' when the request spans days. */
function fmtRange(from: string, to: string): string {
  return from === to ? fmtDate(from) : `${fmtDate(from)} → ${fmtDate(to)}`;
}

function requestCount(n: number): string {
  return `${n} request${n === 1 ? '' : 's'}`;
}

/** One submitted request: what it was, the days it covers, the crew's own note. */
function HistoryRow({ record, last, palette: p }: { record: AbsenceRecord; last: boolean; palette: CarrierPalette }): React.JSX.Element {
  const cancelled = record.status !== 'active';
  return (
    <View>
      <View style={s.row} testID={`absence-history-row-${record.id}`}>
        <View style={s.rowHead}>
          <Text style={[s.type, { color: p.cardInk }]}>{TYPE_LABEL[record.absenceType] ?? record.absenceType}</Text>
          <Text
            style={[s.status, { color: cancelled ? p.cardSoft : p.good, borderColor: p.cardLine }]}
            testID={`absence-history-status-${record.id}`}
          >
            {cancelled ? 'Cancelled' : 'Active'}
          </Text>
        </View>
        <Text style={[s.range, { color: p.cardInk }]}>{fmtRange(record.fromDate, record.toDate)}</Text>
        {record.note ? (
          <Text style={[s.note, { color: p.cardSoft }]} numberOfLines={2}>{record.note}</Text>
        ) : null}
      </View>
      {!last && <DashedLine color={p.cardLine} />}
    </View>
  );
}

export function AbsenceHistoryScreen(): React.JSX.Element {
  const p = useCarrier();
  const airline = useAppSelector(s => s.auth.airline) ?? '';
  const crewId = useAppSelector(s => s.auth.crewId) ?? '';
  const password = useAppSelector(s => s.auth.password) ?? '';
  // The month is fixed when the page opens: the scope the crew is reading.
  const [month] = useState(() => {
    const now = new Date();
    return { ...currentMonthRange(now), label: `${MON[now.getMonth()]} ${now.getFullYear()}` };
  });
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    // A guest has no crew record: say so instead of raising a request error
    // (same wording the submit guard uses on the form).
    if (!crewId) {
      setState({ kind: 'signed-out' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const records = await listAbsences({
        airline,
        crewId,
        password,
        fromDate: month.fromDate,
        toDate: month.toDate,
      });
      setState({ kind: 'ready', records });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Please try again.' });
    }
  }, [airline, crewId, password, month]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell title="Absence History" testID="page-absence-history">
      <SectionLabel palette={p}>
        {state.kind === 'ready' ? `${month.label} · ${requestCount(state.records.length)}` : month.label}
      </SectionLabel>
      <ListCard palette={p}>
        {state.kind === 'loading' && (
          <View style={s.state} testID="absence-history-loading">
            <ActivityIndicator color={p.btn} />
            <Text style={[s.stateText, { color: p.cardSoft }]}>Loading your requests…</Text>
          </View>
        )}
        {state.kind === 'ready' && state.records.length === 0 && (
          <Text style={[s.stateText, s.blockText, { color: p.cardSoft }]} testID="absence-history-empty">
            {`No requests submitted in ${month.label}.`}
          </Text>
        )}
        {state.kind === 'ready' && state.records.map((record, i) => (
          <HistoryRow key={record.id} record={record} last={i === state.records.length - 1} palette={p} />
        ))}
        {state.kind === 'signed-out' && (
          <Text style={[s.stateText, s.blockText, { color: p.cardSoft }]} testID="absence-history-signed-out">
            Sign in with your airline on Profile first.
          </Text>
        )}
        {state.kind === 'error' && (
          <Text style={[s.stateText, s.blockText, { color: p.cardSoft }]} testID="absence-history-error">
            {state.message}
          </Text>
        )}
      </ListCard>
      {state.kind === 'error' && (
        <PrimaryButton label="Try again" palette={p} testID="absence-history-retry" onPress={() => void load()} />
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  row: { paddingVertical: 13 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  type: { fontSize: 15, fontWeight: '600' },
  /** Right-aligned outcome chip, same shape as the time-zone marker rows. */
  status: { fontSize: 12, fontWeight: '700', borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', minWidth: 74, textAlign: 'center' },
  range: { fontSize: 14, marginTop: 6 },
  note: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  stateText: { fontSize: 13 },
  blockText: { paddingVertical: 14 },
});
