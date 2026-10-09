// R'Bot sharing the Duty Swap screen (spec §6): bottom half in portrait, a side
// pane in landscape / on the Duo inner screen. The crew types what they want;
// R'Bot changes the search, the crew columns and the picked duties, and says
// what it did. It never sends the swap.
import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from 'react-redux';

import { Icon } from '../../../components/v2/icons';
import { CrewAvatar } from '../../settings/avatars';
import { RBOT_AVATAR_INDEX } from '../../rbot/RBotEntry';
import { sendCrewChat } from '../../rbot/crewChatApi';
import type { RbotChatMessage, RbotThreadEntry } from '../../rbot/types';
import { appendEntry, saveRbotThread } from '../../rbot/rbotSlice';
import { useAppDispatch, useAppSelector, type RootState } from '../../../store';
import type { CarrierPalette } from '../../../theme/carrier';
import type { DutySwapApi } from '../dutySwapApi';
import { ensureDetails, runSearch } from '../dutySwapActions';
import { dayLabel } from '../dutySwapModel';
import { setGive, setStep, setTake } from '../dutySwapSlice';
import { applySwapActions, buildSwapSnapshot, describeResult, interpretSwapLocally, toCrews } from '../swapRbot';
import { tint } from './CrewMatrix';

type Entry = RbotThreadEntry;

export function SwapRbotPanel({ palette: p, api, onClose, side }: {
  palette: CarrierPalette; api: DutySwapApi; onClose: () => void; side: boolean;
}): React.JSX.Element {
  const store = useStore<RootState>();
  const dispatch = useAppDispatch();
  // The thread lives in the store: rotating / folding remounts this panel.
  const entries = useAppSelector(st => st.rbot.entries);
  const push = (e: Entry) => {
    dispatch(appendEntry({ entry: e, seen: true }));
    void dispatch(saveRbotThread());
  };
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const swap = () => store.getState().dutySwap;
  // Suggestion built from the crew's own first swappable trip.
  const me = swap().crews[0];
  const firstTrip = me?.duties.find(d => d.kind === 'fly' && d.swappable);
  const suggestions = [
    firstTrip ? `Swap my trip on ${dayLabel(firstTrip.startDt.slice(0, 10)).day} ${dayLabel(firstTrip.startDt.slice(0, 10)).month} for a standby` : null,
    'Also show someone with a DOH layover',
    'Reset the filters',
  ].filter((x): x is string => !!x);

  // Whatever R'Bot finds or picks lands in the matrix (design D0 → D1).
  const deps = {
    getState: () => swap(),
    search: (f: Parameters<typeof runSearch>[2]) => { dispatch(setStep('pick')); return runSearch(dispatch, api, f); },
    peek: async (f: Parameters<typeof runSearch>[2]) => toCrews(await api.search(f)).slice(1).map(c => c.crewId),
    setGive: (keys: string[]) => { dispatch(setStep('pick')); dispatch(setGive(keys)); },
    setTake: (crewId: string, keys: string[]) => {
      dispatch(setStep('pick'));
      dispatch(setTake({ crewId, keys }));
      void ensureDetails(dispatch, store.getState, api, [crewId]);
    },
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    const thread = [...entries, { role: 'user' as const, content: t }];
    push(thread[thread.length - 1]);
    setBusy(true);
    try {
      const local = interpretSwapLocally(t, swap());
      let reply: Entry;
      if (local) {
        const chips = await applySwapActions(local.actions, deps);
        const searched = local.actions.some(a => a.type !== 'select_swap_duties');
        reply = { role: 'assistant', local: true, applied: chips,
          content: [local.note, searched ? describeResult(swap()) : chips.length ? 'Done. Review when you are ready — I won\'t send anything for you.' : null].filter(Boolean).join(' ') };
      } else {
        const auth = store.getState().auth;
        const messages: RbotChatMessage[] = thread.map(e => ({ role: e.role, content: e.content }));
        const res = await sendCrewChat(messages, {
          airline: auth.airline, crewId: auth.crewId ?? '', crewName: auth.firstName ?? undefined,
          today: new Date().toISOString().slice(0, 10), screen: 'duty_swap', swap: buildSwapSnapshot(swap()),
        });
        const chips = await applySwapActions(res.actions, deps);
        reply = { role: 'assistant', content: res.content, applied: chips };
      }
      push(reply);
    } catch (e) {
      push({ role: 'assistant', content: `R'Bot could not finish that: ${e instanceof Error ? e.message : 'please try again.'}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.panel, side ? s.side : s.bottom, { backgroundColor: p.cardOverlay }]}
      testID="swap-rbot-panel">
      <View style={[s.head, { borderBottomColor: p.cardLine }]}>
        <CrewAvatar index={RBOT_AVATAR_INDEX} size={28} bare />
        <Text style={[s.title, { color: p.cardInk }]}>R'Bot</Text>
        <Text style={[s.badge, { color: p.btn, backgroundColor: tint(p.btn, 0.12) }]}>Helping with this table</Text>
        <View style={s.flex} />
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="close R'Bot" testID="swap-rbot-close" style={[s.close, { borderColor: p.cardLine }]}>
          <Icon name="close" size={14} color={p.cardInk} strokeWidth={2.2} />
        </Pressable>
      </View>
      <ScrollView ref={scroll} style={s.flex} contentContainerStyle={s.thread} keyboardShouldPersistTaps="handled" testID="swap-rbot-thread"
        // Newest turn in view — also after a rotation / fold remounts the panel.
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {entries.length === 0 ? (
          <Text style={[s.bubble, s.left, { backgroundColor: tint(p.btn, 0.08), color: p.cardInk }]}>
            Tell me what you want to swap and I'll find the crew and set up the table. I won't send anything for you.
          </Text>
        ) : null}
        {entries.map((e, i) => (
          <View key={i} style={[s.entry, e.role === 'user' ? s.right : s.left]}>
            <Text style={[s.bubble, e.role === 'user' ? { backgroundColor: p.btn, color: '#fff' } : { backgroundColor: tint(p.btn, 0.08), color: p.cardInk }]}
              testID={`swap-rbot-${e.role}-${i}`}>{e.content}</Text>
            {e.applied?.length ? (
              <View style={s.chips}>
                {e.applied.map(c => (
                  <View key={c} style={[s.chip, { borderColor: tint(p.btn, 0.4) }]}>
                    <Icon name="check" size={11} color={p.btn} strokeWidth={2.4} />
                    <Text style={[s.chipText, { color: p.btn }]}>{c}</Text>
                  </View>
                ))}
                {e.local ? <Text style={[s.local, { color: p.cardSoft }]}>on this phone</Text> : null}
              </View>
            ) : null}
          </View>
        ))}
        {busy ? <ActivityIndicator color={p.btn} style={s.left} /> : null}
      </ScrollView>
      {entries.length === 0 ? (
        // Plain wrapping pills: a ScrollView here grows (flexGrow 1) and split the
        // panel's height with the thread — card-sized buttons on the Duo.
        <View style={s.suggest} testID="swap-rbot-suggestions">
          {suggestions.map(x => (
            <Pressable key={x} onPress={() => send(x)} style={[s.chip, s.pill, { borderColor: tint(p.btn, 0.4) }]} testID="swap-rbot-suggestion">
              <Text style={[s.chipText, s.pillText, { color: p.btn }]} numberOfLines={1}>{x}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={[s.inputRow, { borderColor: p.cardLine }]}>
        <TextInput value={input} onChangeText={setInput} placeholder="Tell R'Bot what you want…" placeholderTextColor={p.cardSoft}
          style={[s.input, { color: p.cardInk }]} onSubmitEditing={() => send(input)} returnKeyType="send" testID="swap-rbot-input"
          // Crew ids, airport and pairing codes (DOH, PR124) must not be "corrected".
          autoCorrect={false} spellCheck={false} />
        <Pressable onPress={() => send(input)} disabled={!input.trim() || busy} testID="swap-rbot-send"
          style={[s.sendBtn, { backgroundColor: p.btn, opacity: !input.trim() || busy ? 0.45 : 1 }]}>
          <Icon name="send" size={16} color="#fff" strokeWidth={2} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  panel: { borderRadius: 16, overflow: 'hidden' },
  bottom: { flex: 1, marginTop: 8 },
  side: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 15, fontWeight: '800' },
  badge: { fontSize: 10.5, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9, overflow: 'hidden' },
  close: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  thread: { padding: 12, gap: 10 },
  entry: { maxWidth: '88%', gap: 5 },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { fontSize: 13.5, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, overflow: 'hidden', maxWidth: 520 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 13, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 11.5, fontWeight: '700' },
  pill: { maxWidth: '100%' },
  pillText: { flexShrink: 1 },
  local: { fontSize: 10.5, fontWeight: '600' },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 10, marginTop: 0, borderWidth: 1, borderRadius: 22, paddingLeft: 14, paddingRight: 5, height: 44 },
  input: { flex: 1, fontSize: 14 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
