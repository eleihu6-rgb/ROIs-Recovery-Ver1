// Duty Swap ▸ My duties (web "My Duty"). A crew can only search when they have
// unlocked (published) duties — the portal answers "Please publish task."
// otherwise — so this is where they choose which duties other crew may request.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from 'react-redux';

import { AppDialog } from '../../components/v2/AppDialog';
import { airlineByCode } from '../auth/airlines';
import { useAppDispatch, useAppSelector, type RootState } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { PageShell, PrimaryButton } from '../v2/PageShell';
import { dutySwapApiFor, runSearch } from './dutySwapActions';
import { dayLabel, myTaskCode, myTaskId, portalToIso, publishBody, routeOf, type ApiMyTask } from './dutySwapModel';

export function DutySwapMyDutiesScreen(): React.JSX.Element {
  const p = useCarrier();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const auth = useAppSelector(s => s.auth);
  const api = dutySwapApiFor(auth);
  const carrier = airlineByCode(auth.airline).carrier;
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; tasks: ApiMyTask[]; autoUnlock: boolean }>({ kind: 'loading' });
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [auto, setAuto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const r = await api.myTasks();
      setState({ kind: 'ready', ...r });
      setUnlocked(new Set(r.tasks.filter(t => t.publishStatus === 'Publish').map(myTaskId)));
      setAuto(r.autoUnlock);
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Could not reach the crew portal.' });
    }
  }, [api]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const tasks = state.kind === 'ready' ? state.tasks : [];
  const changed = state.kind === 'ready' && (auto !== state.autoUnlock || tasks.some(t => (t.publishStatus === 'Publish') !== unlocked.has(myTaskId(t))));

  const save = async () => {
    if (!api || state.kind !== 'ready') return;
    setSaving(true);
    try {
      await api.saveMyTasks(publishBody(tasks, unlocked), auto !== state.autoUnlock ? auto : undefined);
      // The swap search depends on what I have unlocked: refresh it.
      const f = store.getState().dutySwap.filters;
      if (f) void runSearch(dispatch, api, f);
      setDone(`${unlocked.size} of ${tasks.length} duties can now be requested by other crew.`);
      await load();
    } catch (e) {
      setDone(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="My duties" testID="swap-my-duties">
      <Text style={[s.intro, { color: p.inkSoft }]}>
        Other crew can only request duties you unlock. Locked duties stay private.
      </Text>
      {state.kind === 'loading' ? <ActivityIndicator color={p.ink} style={s.spin} /> : null}
      {state.kind === 'error' ? <Text style={[s.intro, { color: p.ink }]}>{state.message}</Text> : null}
      {state.kind === 'ready' ? (
        <View style={s.list}>
          <View style={[s.card, s.row, { backgroundColor: p.cardSolid }]}>
            <View style={s.flex}>
              <Text style={[s.code, { color: p.cardInk }]}>Unlock new duties automatically</Text>
              <Text style={[s.sub, { color: p.cardSoft }]}>Existing duties keep their setting.</Text>
            </View>
            <Switch value={auto} onValueChange={setAuto} trackColor={{ true: p.btn, false: p.cardLine }} testID="my-duties-auto" />
          </View>
          {tasks.length === 0 ? <Text style={[s.intro, { color: p.inkSoft }]}>No upcoming duties to unlock.</Text> : null}
          {tasks.map(t => {
            const id = myTaskId(t);
            const on = unlocked.has(id);
            const start = portalToIso(t.startDateTimeLocal ?? t.startDateTime);
            const end = portalToIso(t.endDateTimeLocal ?? t.endDateTime);
            const d = start ? dayLabel(start.slice(0, 10)) : null;
            const code = myTaskCode(t, carrier);
            const route = routeOf(t);
            return (
              <View key={id} style={[s.card, s.row, { backgroundColor: p.cardSolid }]}>
                {d ? (
                  <View style={s.date}>
                    <Text style={[s.day, { color: p.cardInk }]}>{d.day}</Text>
                    <Text style={[s.dow, { color: p.cardSoft }]}>{d.dow}</Text>
                  </View>
                ) : null}
                <View style={s.flex}>
                  <Text style={[s.code, { color: p.cardInk }]}>{code}</Text>
                  <Text style={[s.sub, { color: p.cardSoft }]} numberOfLines={1}>
                    {[route, start && end ? `${start.slice(11, 16)} → ${end.slice(5, 10) !== start.slice(5, 10) ? `${dayLabel(end.slice(0, 10)).day} ${dayLabel(end.slice(0, 10)).month} ` : ''}${end.slice(11, 16)}` : null,
                      t.blh && t.blh !== '00:00' ? `BLH ${t.blh}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Switch value={on} testID={`my-duty-${code}`} accessibilityLabel={`${code} ${on ? 'unlocked' : 'locked'}`} trackColor={{ true: p.btn, false: p.cardLine }}
                  onValueChange={v => setUnlocked(prev => { const n = new Set(prev); if (v) n.add(id); else n.delete(id); return n; })} />
              </View>
            );
          })}
          <PrimaryButton label={saving ? 'Saving…' : 'Save'} palette={p} testID="my-duties-save" onPress={changed && !saving ? save : undefined}
            style={!changed ? { opacity: 0.45 } : undefined} />
        </View>
      ) : null}
      <AppDialog visible={!!done} onClose={() => setDone(null)} tone="success" icon="check" title="Saved" message={done ?? ''}
        confirmLabel="OK" onConfirm={() => setDone(null)} testID="my-duties-saved" />
    </PageShell>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  intro: { fontSize: 13.5, lineHeight: 19, marginBottom: 12 },
  spin: { marginTop: 30 },
  list: { gap: 8 },
  card: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  date: { width: 38, alignItems: 'center' },
  day: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dow: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  code: { fontSize: 14.5, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
});
