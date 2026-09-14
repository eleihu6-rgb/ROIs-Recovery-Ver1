// Crew Recovery Story 101: sick-leave submission. Replaces the static
// SpecPage#absence mock with a real form that posts to live-server and retains
// original duties for Crew Control recovery. Kept in the same visual language as SpecPage
// (PageShell/Hero/ListCard/KvRow/PrimaryButton, SectionLabel + RadioRow from
// components/v2/rows) so the screen still looks like the rest of the app.
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppSelector } from '../../store';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';
import { PageShell, Hero, ListCard, KvRow, PrimaryButton } from './PageShell';
import { RadioRow, SectionLabel } from '../../components/v2/rows';
import { Icon } from '../../components/v2/icons';
import { AppDialog, type AppDialogTone } from '../../components/v2/AppDialog';
import { legView, MON } from './model';
import { submitAbsence, toApiDate } from '../absence/absenceApi';
import type { V2StackParamList } from './nav';

type Props = NativeStackScreenProps<V2StackParamList, 'Spec'>;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** yyyymmdd int, same shape as LegView.dateKey, so ranges compare directly. */
function ymd(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function fmtDisplay(d: Date): string {
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

function DateStepRow({
  label, value, onDec, onInc, palette, testID,
}: {
  label: string; value: Date; onDec: () => void; onInc: () => void;
  palette: CarrierPalette; testID: string;
}) {
  return (
    <View style={styles.dateRow}>
      <Text style={[styles.dateLabel, { color: palette.cardInk }]}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={onDec} hitSlop={10} style={styles.stepBtn} testID={`${testID}-dec`}>
          <Text style={[styles.stepBtnText, { color: palette.btn }]}>–</Text>
        </Pressable>
        <Text style={[styles.dateValue, { color: palette.cardInk }]} testID={testID}>
          {fmtDisplay(value)}
        </Text>
        <Pressable onPress={onInc} hitSlop={10} style={styles.stepBtn} testID={`${testID}-inc`}>
          <Text style={[styles.stepBtnText, { color: palette.btn }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Parses R'Bot's pre-fill ('YYYY-MM-DD', crew-base local) into a local midnight
 *  Date. Anything malformed returns null so the form falls back to today. */
function parsePrefillDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  // JS rolls an impossible day forward (2026-02-30 -> 2 Mar), which would have
  // silently changed the dates R'Bot extracted — accept only a true round trip.
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
    return null;
  }
  return parsed;
}

export function AbsenceScreen({ navigation, route }: Props): React.JSX.Element {
  const p = useCarrier();
  const airline = useAppSelector(s => s.auth.airline) ?? '';
  const crewId = useAppSelector(s => s.auth.crewId) ?? '';
  const password = useAppSelector(s => s.auth.password) ?? '';
  const trips = useAppSelector(s => s.trips.trips);
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);

  // R'Bot can open this form with the dates and note it extracted from the
  // conversation. It never submits — the crew reviews and presses Submit.
  const prefillFrom = parsePrefillDate(route.params.absenceFrom);
  const prefillTo = parsePrefillDate(route.params.absenceTo) ?? prefillFrom;
  const [fromDate, setFromDate] = useState<Date>(() => prefillFrom ?? startOfToday());
  const [toDate, setToDate] = useState<Date>(() => prefillTo ?? startOfToday());
  const [note, setNote] = useState(route.params.absenceNote ?? '');
  const [busy, setBusy] = useState(false);
  /**
   * Outcome pop-up (pop-up standard: status card, not a native alert). The
   * success card is dismissed before leaving the form, so the crew's confirmation
   * is not swallowed by the navigation (`thenGoBack`).
   */
  const [dialog, setDialog] = useState<{
    tone: AppDialogTone; title: string; message: string; confirmLabel: string; thenGoBack?: boolean;
  } | null>(null);

  function closeDialog() {
    const leave = dialog?.thenGoBack ?? false;
    setDialog(null);
    if (leave) navigation.goBack();
  }

  const affected = useMemo(() => {
    const fromKey = ymd(fromDate);
    const toKey = ymd(toDate);
    const items: { key: string; fltNumber: string; label: string }[] = [];
    for (const trip of trips) {
      for (const leg of trip.legs) {
        const lv = legView(leg, trip, mode, baseTz, undefined);
        if (lv.dateKey >= fromKey && lv.dateKey <= toKey) {
          items.push({
            key: `${trip.id}-${lv.fltNumber}-${lv.dateKey}`,
            fltNumber: lv.fltNumber || '—',
            label: `${lv.day} ${MON[lv.monthIdx]}`,
          });
        }
      }
    }
    items.sort((a, b) => a.label.localeCompare(b.label));
    return items;
  }, [trips, mode, baseTz, fromDate, toDate]);

  function decFrom() {
    const next = addDays(fromDate, -1);
    if (ymd(next) < ymd(startOfToday())) return;
    setFromDate(next);
    if (ymd(next) > ymd(toDate)) setToDate(next);
  }
  function incFrom() {
    const next = addDays(fromDate, 1);
    setFromDate(next);
    if (ymd(next) > ymd(toDate)) setToDate(next);
  }
  function decTo() {
    const next = addDays(toDate, -1);
    if (ymd(next) < ymd(fromDate)) return;
    setToDate(next);
  }
  function incTo() {
    setToDate(addDays(toDate, 1));
  }

  async function handleSubmit() {
    if (busy) return;
    // A guest has no crew record to report the absence against — sending one
    // would fail server-side, so say so instead of raising a request error.
    if (!crewId) {
      setDialog({
        tone: 'warning',
        title: 'Airline sign-in needed',
        message: 'Reporting an absence needs your crew ID. Sign in with your airline on Profile first.',
        confirmLabel: 'Got it',
      });
      return;
    }
    setBusy(true);
    try {
      await submitAbsence({
        airline,
        crewId,
        password,
        type: 'sick',
        fromDate: toApiDate(fromDate),
        toDate: toApiDate(toDate),
        note: note.trim() ? note.trim() : undefined,
      });
      setDialog({
        tone: 'success',
        title: 'Request submitted',
        message: 'Sick leave added. Original duties remain assigned pending Crew Control recovery.',
        confirmLabel: 'Got it',
        thenGoBack: true,
      });
    } catch (e) {
      setDialog({
        tone: 'destructive',
        title: 'Unable to submit',
        message: e instanceof Error ? e.message : 'Please try again.',
        confirmLabel: 'Try again',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      title="Absence Request"
      testID="page-absence"
      // Submitted history (Ryan, 2026-09-13): the crew checks what they already
      // filed for this month from here instead of leaving the form.
      right={
        <Pressable
          onPress={() => navigation.navigate('AbsenceHistory')}
          hitSlop={12}
          accessibilityLabel="submitted requests"
          testID="absence-history"
        >
          <Icon name="history" size={24} color={p.ink} strokeWidth={1.8} />
        </Pressable>
      }
    >
      <Hero
        h1="Report an absence"
        h2="Sick leave is recorded. Original duties remain assigned until Crew Control completes recovery."
        palette={p}
      />

      <SectionLabel palette={p}>Type</SectionLabel>
      <ListCard palette={p}>
        <RadioRow
          title="Sick leave"
          selected
          onPress={() => {}}
          palette={p}
          testID="absence-type-sick"
        />
        <RadioRow
          title="Emergency leave"
          sub="Coming soon"
          selected={false}
          onPress={() => {}}
          palette={p}
          disabled
          testID="absence-type-emergency"
        />
        <RadioRow
          title="Personal leave"
          sub="Coming soon"
          selected={false}
          onPress={() => {}}
          palette={p}
          disabled
          testID="absence-type-personal"
        />
      </ListCard>

      <SectionLabel palette={p}>Dates</SectionLabel>
      <ListCard palette={p}>
        <DateStepRow label="From" value={fromDate} onDec={decFrom} onInc={incFrom} palette={p} testID="absence-from" />
        <DateStepRow label="To" value={toDate} onDec={decTo} onInc={incTo} palette={p} testID="absence-to" />
      </ListCard>

      <SectionLabel palette={p}>Affects</SectionLabel>
      <ListCard palette={p}>
        {affected.length === 0 ? (
          <KvRow label="No duties in range" value="" palette={p} last />
        ) : (
          affected.map((item, i) => (
            <KvRow
              key={item.key}
              label={item.fltNumber}
              value={item.label}
              palette={p}
              last={i === affected.length - 1}
            />
          ))
        )}
      </ListCard>

      <SectionLabel palette={p}>Note (optional)</SectionLabel>
      <ListCard palette={p}>
        <TextInput
          style={[styles.note, { color: p.cardInk }]}
          value={note}
          onChangeText={setNote}
          placeholder="Add a note for Crew Control"
          placeholderTextColor={p.cardSoft}
          multiline
          testID="absence-note"
        />
      </ListCard>

      <PrimaryButton
        label={busy ? 'Submitting…' : 'Submit request'}
        palette={p}
        testID="absence-submit"
        onPress={busy ? undefined : handleSubmit}
      />

      <AppDialog
        visible={dialog !== null}
        onClose={closeDialog}
        onConfirm={closeDialog}
        tone={dialog?.tone ?? 'neutral'}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        confirmLabel={dialog?.confirmLabel}
        testID="absence-dialog"
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 20,
    fontWeight: '600',
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 92,
    textAlign: 'center',
  },
  note: {
    fontSize: 14,
    minHeight: 60,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
});
