// Duty Swap ▸ Swap requests (web "Records"). Sender can withdraw a pending
// request; the receiving crew accepts or rejects. Accept follows the web:
// verifyTaskStatus → hard rule = must decline · CBA soft rule = confirm with the
// violation · clean + soft-rule flag = confirm → respondentApproval.
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { AppDialog, type AppDialogTone } from '../../components/v2/AppDialog';
import type { IconName } from '../../components/v2/icons';
import { airlineByCode } from '../auth/airlines';
import { useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { PageShell } from '../v2/PageShell';
import { dutySwapApiFor } from './dutySwapActions';
import { parseRuleMessage, recordActions, recordStatusLabel, type ApiCompare, type ApiRecord } from './dutySwapModel';
import { CompareSheet } from './components/CompareSheet';
import { tint } from './components/CrewMatrix';

type Dialog = {
  tone: AppDialogTone; icon?: IconName; title: string; message?: string; rule?: string;
  confirmLabel?: string; onConfirm?: () => void; cancelLabel?: string;
};

export function DutySwapRecordsScreen(): React.JSX.Element {
  const p = useCarrier();
  const auth = useAppSelector(s => s.auth);
  const api = useMemo(() => dutySwapApiFor(auth), [auth]);
  const carrier = airlineByCode(auth.airline).carrier;
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; records: ApiRecord[] }>({ kind: 'loading' });
  const [open, setOpen] = useState<{ record: ApiRecord; detail?: ApiCompare } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!api) { setState({ kind: 'error', message: 'Sign in with your crew account to see swap requests.' }); return; }
    try {
      setState({ kind: 'ready', records: (await api.records()).records });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Could not reach the crew portal.' });
    }
  }, [api]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openRecord = async (record: ApiRecord) => {
    setOpen({ record });
    try { setOpen({ record, detail: await api!.recordDetail(record.id) }); } catch { /* sheet shows loading → close */ }
  };

  const finish = (title: string, message: string, ok = true) => {
    setBusy(false);
    setDialog({ tone: ok ? 'success' : 'warning', icon: ok ? 'check' : 'warning', title, message, confirmLabel: 'OK', onConfirm: () => setDialog(null) });
    setOpen(null);
    void load();
  };
  const run = async (fn: () => Promise<void>) => {
    setDialog(null); setBusy(true);
    try { await fn(); } catch (e) { finish('Something went wrong', e instanceof Error ? e.message : 'Please try again.', false); }
  };

  const withdraw = (r: ApiRecord) => setDialog({
    tone: 'destructive', icon: 'back', title: 'Withdraw this request?', message: 'The other crew will no longer see it.',
    cancelLabel: 'Keep', confirmLabel: 'Withdraw',
    onConfirm: () => run(async () => { await api!.withdraw(r.id); finish('Request withdrawn', 'Your duties stay as they were.'); }),
  });
  const reject = (r: ApiRecord, remark?: string) => setDialog({
    tone: 'destructive', icon: 'close', title: 'Decline this swap?', message: remark ? undefined : `${r.crewId} will see that you declined.`, rule: remark,
    cancelLabel: 'Back', confirmLabel: 'Decline',
    onConfirm: () => run(async () => {
      const res = await api!.respond(r.id, false, remark ? { remark } : {});
      res.ok ? finish('Swap declined', `${r.crewId} has been told.`) : finish('Could not decline', res.message, false);
    }),
  });
  const accept = (r: ApiRecord) => run(async () => {
    const respondYes = async (violationComments?: string) => {
      const res = await api!.respond(r.id, true, violationComments !== undefined ? { violationComments } : {});
      res.ok ? finish('Swap accepted', 'Crew control will review it next.') : finish('Could not accept', res.message, false);
    };
    const issue = await api!.verify(r.id);
    setBusy(false);
    if (issue && issue.includes('[CBA]')) {
      setDialog({ tone: 'warning', icon: 'warning', title: 'This swap breaks a soft rule', rule: issue, message: 'You can still accept; the violation goes with your answer.',
        cancelLabel: 'Back', confirmLabel: 'Accept anyway', onConfirm: () => run(() => respondYes(issue)) });
    } else if (issue && issue.includes('[RuleCheck]')) {
      reject(r, issue);
    } else if (issue) {
      finish('Cannot accept now', issue, false);
    } else if (await api!.softRuleConfirm()) {
      setDialog({ tone: 'neutral', icon: 'check', title: 'Accept this swap?', message: 'Your duties change once crew control approves.',
        cancelLabel: 'Back', confirmLabel: 'Accept', onConfirm: () => run(() => respondYes('')) });
    } else {
      setBusy(true);
      await respondYes();
    }
  });

  const card = (r: ApiRecord) => {
    const mine = r.source === 'My Application';
    const actions = recordActions(r);
    return (
      <Pressable key={r.id} onPress={() => openRecord(r)} style={[s.card, { backgroundColor: p.cardSolid }]} testID={`record-${r.id}`}>
        <View style={s.cardTop}>
          <Text style={[s.badge, { color: p.btn, backgroundColor: tint(p.btn, 0.12) }]} testID={`record-status-${r.id}`}>{recordStatusLabel(r.status)}</Text>
          <Text style={[s.time, { color: p.cardSoft }]}>{r.submitTime.slice(0, 17)}</Text>
        </View>
        <Text style={[s.line, { color: p.cardInk }]}>
          {mine ? `You give ${r.mineSwappedDate}  ⇄  take ${r.othersSwappedDate}` : `You give ${r.othersSwappedDate}  ⇄  take ${r.mineSwappedDate}`}
        </Text>
        <Text style={[s.sub, { color: p.cardSoft }]}>{mine ? 'Sent by you' : `Request from ${r.crewId}`}</Text>
        {r.remark ? <Text style={[s.sub, { color: p.cardSoft }]}>{r.remark}</Text> : null}
        {actions.length ? (
          <View style={s.actions}>
            {actions.includes('withdraw') ? <Btn label="Withdraw" onPress={() => withdraw(r)} p={p} testID={`record-withdraw-${r.id}`} /> : null}
            {actions.includes('reject') ? <Btn label="Decline" onPress={() => reject(r)} p={p} testID={`record-reject-${r.id}`} /> : null}
            {actions.includes('accept') ? <Btn label="Accept" solid onPress={() => accept(r)} p={p} testID={`record-accept-${r.id}`} /> : null}
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <PageShell title="Swap requests" testID="swap-records-screen">
      {state.kind === 'loading' ? <ActivityIndicator color={p.ink} style={s.spin} /> : null}
      {state.kind === 'error' ? <Text style={[s.msg, { color: p.ink }]}>{state.message}</Text> : null}
      {state.kind === 'ready' && state.records.length === 0 ? (
        <Text style={[s.msg, { color: p.inkSoft }]} testID="records-empty">No swap requests yet. Requests you send or receive appear here.</Text>
      ) : null}
      {state.kind === 'ready' ? <View style={s.list}>{state.records.map(card)}</View> : null}
      {busy ? <ActivityIndicator color={p.ink} style={s.spin} /> : null}

      {open ? (
        <CompareSheet visible onClose={() => setOpen(null)} palette={p} carrier={carrier} mode="record" picked
          meId={auth.crewId ?? ''} othersId={open.record.source === 'My Application' ? (open.detail?.othersCrewId ?? '') : open.record.crewId}
          loading={!open.detail} mine={open.detail?.mineTaskDetailList ?? []} others={open.detail?.othersTaskDetailList ?? []}
          note={open.detail?.comments} />
      ) : null}

      <AppDialog visible={!!dialog} onClose={() => setDialog(null)} tone={dialog?.tone} icon={dialog?.icon} title={dialog?.title ?? ''}
        message={dialog?.message} cancelLabel={dialog?.cancelLabel} confirmLabel={dialog?.confirmLabel} onConfirm={dialog?.onConfirm}
        testID="records-dialog">
        {dialog?.rule ? (
          <View style={[s.rules, { backgroundColor: tint(p.cardSoft, 0.12) }]}>
            {parseRuleMessage(dialog.rule).items.map((it, i) => (
              <Text key={i} style={[s.sub, { color: p.cardInk }]}>{it.ruleId ? `${it.rule} · ${it.from} – ${it.to} · Rule ${it.ruleId}` : it.text}</Text>
            ))}
          </View>
        ) : null}
      </AppDialog>
    </PageShell>
  );
}

function Btn({ label, onPress, p, solid, testID }: { label: string; onPress: () => void; p: ReturnType<typeof useCarrier>; solid?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} testID={testID} style={[s.btn, { borderColor: p.btn, backgroundColor: solid ? p.btn : 'transparent' }]}>
      <Text style={[s.btnText, { color: solid ? '#fff' : p.btn }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  spin: { marginTop: 30 },
  msg: { fontSize: 14, textAlign: 'center', marginTop: 30, lineHeight: 20 },
  list: { gap: 10 },
  card: { borderRadius: 16, padding: 14, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  time: { fontSize: 11.5, fontVariant: ['tabular-nums'] },
  line: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  sub: { fontSize: 12.5, lineHeight: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  btn: { height: 36, borderRadius: 18, borderWidth: 1.5, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13.5, fontWeight: '700' },
  rules: { alignSelf: 'stretch', borderRadius: 10, padding: 10, gap: 6, marginTop: 10 },
});
