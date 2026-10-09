// R'Bot — the crew app's in-app assistant chat (mock: Alipay's "阿宝" thread).
//
// First screen: greeting + a capability card + suggestion chips, so a crew who
// has never used an assistant still knows what to type. After that it is a
// normal thread: user bubble right, R'Bot bubble left, and a chip under the
// reply for every action that actually landed.
//
// R'Bot never *submits* anything: an absence request arrives as a pre-filled
// form the crew confirms (see dispatch-crew-action.ts).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { GradientScreen } from '../../components/v2/GradientScreen';
import { Icon } from '../../components/v2/icons';
import { useLayout } from '../../components/v2/useLayout';
import { CrewAvatar } from '../settings/avatars';
import { RBOT_AVATAR_INDEX } from './RBotEntry';
import { store, useAppDispatch, useAppSelector } from '../../store';
import { selectCrewCarrier } from '../auth/authSlice';
import { resolveTheme, useCarrier, type CarrierPalette } from '../../theme/carrier';
import { useV2Nav } from '../v2/nav';
import { sendCrewChat } from './crewChatApi';
import { dispatchCrewAction } from './dispatch-crew-action';
import { answerLocally } from './localAnswers';
import { appendEntry, markSeen, markUnread, saveRbotThread } from './rbotSlice';
import type { RbotContext, RbotThreadEntry } from './types';
import { useBase, useNextTrip, useAlarms } from '../v2/useV2';
import { legView, MON } from '../v2/model';
import { answerPageQuestion, pageContext, type RbotSource } from './pageContext';

/** What R'Bot can honestly do today — the card is the contract with the crew. */
const CAPABILITIES: { title: string; body: string }[] = [
  { title: 'Get around', body: 'Open your roster calendar, route map, next trip, alarms or settings.' },
  { title: 'Get things done', body: 'Prepare an absence request from what you tell me, set alarms, change settings.' },
  { title: 'Ask anything', body: 'Ask about your duties, a city on your route, or how the app works.' },
];

const SUGGESTIONS = [
  'Show my route map',
  'Report sick tomorrow',
  'Turn on my alarms',
  'Switch to the dark theme',
];

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function RBotScreen({ route }: { route?: { params?: { source?: RbotSource } } } = {}): React.JSX.Element {
  const p = useCarrier();
  const insets = useSafeAreaInsets();
  const nav = useV2Nav();
  const dispatch = useAppDispatch();
  // R'Bot is told the carrier the crew actually flies (EK for K1003), so its
  // answers and its action vocabulary match the roster on screen.
  const airline = useAppSelector(selectCrewCarrier) ?? '';
  const crewId = useAppSelector(s => s.auth.crewId) ?? '';
  const firstName = useAppSelector(s => s.auth.firstName);
  const trips = useAppSelector(s => s.trips.trips);
  const tzMode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const themePreset = useAppSelector(s => s.settings.themePreset);
  const explorePrefs = useAppSelector(s => s.settings.explorePrefs);
  const calendarSync = useAppSelector(s => s.flightCalendar.syncAll);
  const alertCount = useAppSelector(s => s.notifications.notifications.length);
  const alarmsEnabled = useAppSelector(s => s.alarms.enabled);
  const scheduleMonth = useAppSelector(s => s.rbot.scheduleMonth);
  const scheduleDay = useAppSelector(s => s.rbot.scheduleDay);
  const dutySwapApproach = useAppSelector(s => s.rbot.dutySwapApproach);
  const swap = useAppSelector(s => s.dutySwap);
  const base = useBase();
  const source = route?.params?.source;
  const currentPage = useMemo(() => pageContext(source, trips, {
    scheduleMonth: scheduleMonth ?? undefined, scheduleDay,
    timeZoneMode: tzMode, baseTimeZone: baseTz,
    theme: resolveTheme(themePreset, airline), explorePrefs, calendarSync,
    alertCount, alarmsEnabled,
    dutySwap: {
      approach: dutySwapApproach, step: swap.step, status: swap.status,
      ...(swap.filters ? {window: {start: swap.filters.startDate, end: swap.filters.endDate}} : {}),
      crewCount: Math.max(0, swap.crews.length - 1), selectedCrew: swap.crewB,
    },
  }), [source, trips, scheduleMonth, scheduleDay, tzMode, baseTz, themePreset, airline,
    explorePrefs, calendarSync, alertCount, alarmsEnabled, dutySwapApproach, swap]);

  const thread = useAppSelector(s => s.rbot.entries);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const scroller = useRef<ScrollView>(null);
  // The reply lands after an action may have navigated away, so read focus
  // through a ref rather than the value captured when `send` was created.
  // `useFocusEffect` also fires its cleanup when this screen is POPPED, which is
  // exactly the case that matters: R'Bot navigated the crew somewhere else.
  const focusedRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      dispatch(markSeen());
      return () => {
        focusedRef.current = false;
      };
    }, [dispatch]),
  );

  const context = useMemo<RbotContext>(() => ({
    airline,
    crewId,
    ...(firstName ? {crewName: firstName} : {}),
    today: toIsoDate(new Date()),
    screen: currentPage.screen,
    page: currentPage.page,
  }), [airline, crewId, firstName, currentPage]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    Keyboard.dismiss();
    setInput('');
    const history: RbotThreadEntry[] = [...thread, {role: 'user', content: trimmed}];
    dispatch(appendEntry({entry: {role: 'user', content: trimmed}, seen: true}));
    // Local-first: a roster fact ("what's my next duty?") is answered from the
    // phone, so the schedule never leaves the device for those questions.
    const pageAnswer = answerPageQuestion(trimmed, currentPage.screen, currentPage.page);
    const local = pageAnswer ? {content: pageAnswer} : answerLocally(trimmed, {now: new Date(), trips, mode: tzMode, baseTz, base});
    if (local) {
      dispatch(appendEntry({entry: {role: 'assistant', content: local.content, local: true}, seen: true}));
      void dispatch(saveRbotThread());
      return;
    }
    setBusy(true);
    try {
      const resp = await sendCrewChat(
        history.map(m => ({role: m.role, content: m.content})),
        context,
      );
      // Sequential, not Promise.all: a navigate that opens a form must land
      // before the next action runs, and each action may await a store write.
      const applied: string[] = [];
      for (const action of resp.actions) {
        const label = await dispatchCrewAction(action, {
          navigation: nav,
          dispatch,
          getState: store.getState,
          now: new Date(),
        });
        if (label) applied.push(label);
      }
      // A navigation action pops this screen before the reply is appended, so
      // `focused` is already false and the dock entry grows a dot.
      dispatch(appendEntry({
        entry: {role: 'assistant', content: resp.content, ...(applied.length ? {applied} : {})},
        seen: focusedRef.current,
      }));
      void dispatch(saveRbotThread());
      // A navigation action closes this screen a beat after the reply lands, so
      // re-check focus before deciding whether the crew saw the answer.
      setTimeout(() => {
        if (!focusedRef.current) dispatch(markUnread());
      }, 600);
    } catch (e) {
      dispatch(appendEntry({
        entry: {
          role: 'assistant',
          content: e instanceof Error ? e.message : 'R\'Bot is unavailable right now.',
        },
        seen: focusedRef.current,
      }));
    } finally {
      setBusy(false);
    }
  }, [base, baseTz, busy, context, currentPage.screen, dispatch, nav, thread, trips, tzMode]);

  useEffect(() => {
    const id = setTimeout(() => scroller.current?.scrollToEnd({animated: true}), 50);
    return () => clearTimeout(id);
  }, [thread, busy]);

  const showWelcome = thread.length === 0;
  // iPhone Duo inner screen: the back chevron goes where every other page has it
  // (left), so it reads as "back" on the wide layout; regular iPhones unchanged.
  // Wide also gets a context panel beside the thread — the next duty and the
  // "try asking" chips — so the thread is not a lone strip across ~900pt.
  const { wide, height } = useLayout();
  const [now] = useState(() => new Date());
  const nextTrip = useNextTrip(now);
  const { byTrip } = useAlarms(now);
  const nextLeg = nextTrip ? legView(nextTrip.legs[0], nextTrip, tzMode, baseTz, byTrip[nextTrip.id]) : null;
  const chips = (
    <View style={styles.chips}>
      {SUGGESTIONS.map(s => (
        <Pressable
          key={s}
          onPress={() => send(s)}
          style={[styles.chip, {backgroundColor: p.frost, borderColor: p.frostLine}]}
          testID={`rbot-suggestion-${SUGGESTIONS.indexOf(s)}`}
        >
          <Text style={[styles.chipText, {color: p.ink}]}>{s}</Text>
        </Pressable>
      ))}
    </View>
  );
  const contextPanel = wide ? (
    <ScrollView style={[styles.side, {paddingRight: insets.right}]} contentContainerStyle={styles.sideBody} showsVerticalScrollIndicator={false} testID="rbot-context">
      <Text style={[styles.sideTitle, {color: p.inkSoft}]}>NEXT DUTY</Text>
      {nextLeg && nextTrip ? (
        <Pressable style={[styles.card, styles.sideCard, {backgroundColor: p.card}]} onPress={() => nav.navigate('TripDetails', { tripId: nextTrip.id })} testID="rbot-next-duty">
          <Text style={[styles.cardTitle, {color: p.cardInk}]}>{`${nextLeg.fltNumber} · ${nextLeg.dep} → ${nextLeg.arv}`}</Text>
          <Text style={[styles.capBody, {color: p.cardSoft}]}>{`${nextLeg.day} ${MON[nextLeg.monthIdx]} ${nextLeg.year} · ${nextLeg.depTime} – ${nextLeg.arvTime}${nextLeg.arvDayOffset ? ` ${nextLeg.arvDayOffset}` : ''}`}</Text>
          <Text style={[styles.capBody, {color: p.cardSoft}]}>{`${nextLeg.readyWord} ${nextLeg.ready} · Check-in ${nextLeg.checkIn}`}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.capBody, {color: p.inkSoft}]}>No upcoming duty on your roster.</Text>
      )}
      <Text style={[styles.sideTitle, {color: p.inkSoft, marginTop: 18}]}>TRY ASKING</Text>
      {chips}
    </ScrollView>
  ) : null;
  const backButton = (
    <Pressable
      onPress={() => nav.goBack()}
      hitSlop={12}
      style={styles.close}
      accessibilityLabel="close"
      testID="rbot-close"
    >
      <Icon name="back" size={24} color={p.ink} strokeWidth={1.8} />
    </Pressable>
  );

  return (
    <View style={styles.overlay} pointerEvents="box-none" testID="rbot-overlay">
    <Pressable style={StyleSheet.absoluteFill} onPress={() => nav.goBack()} testID="rbot-backdrop" accessibilityLabel="close R'Bot" />
    <View style={[styles.panel, wide ? styles.sidePanel : styles.bottomPanel, {
      backgroundColor: p.g4,
      bottom: keyboardHeight,
      ...(!wide ? { height: Math.min(height * 0.62, height - keyboardHeight - Math.max(insets.top, 12)) } : {}),
    }]} testID="rbot-panel">
    <GradientScreen palette={p} texture={false} sideInsets={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.head, {paddingTop: wide ? insets.top + 8 : 12}]}>
          {wide ? backButton : null}
          {/* Same R'Bot avatar as the dock entry — the panda, straight on the
              surface (no theme-coloured disc behind it). */}
          <View style={styles.headDisc}>
            <CrewAvatar index={RBOT_AVATAR_INDEX} size={40} bare />
          </View>
          <View style={styles.headText}>
            <Text style={[styles.headTitle, {color: p.ink}]}>R&apos;Bot</Text>
            <Text style={[styles.headSub, {color: p.inkSoft}]}>Your crew assistant</Text>
          </View>
          {wide ? null : backButton}
        </View>

        <View style={[styles.flex, wide ? styles.wideBody : null]}>
        <View style={styles.flex}>
        <ScrollView
          ref={scroller}
          style={styles.flex}
          contentContainerStyle={styles.thread}
          showsVerticalScrollIndicator={false}
          testID="rbot-screen"
        >
          {showWelcome ? (
            <View testID="rbot-welcome">
              <Bubble palette={p} from="assistant">
                {`Hi${firstName ? ` ${firstName}` : ''}, I'm R'Bot. Get around the app, get things done, or just ask — one sentence is enough.`}
              </Bubble>
              <View style={[styles.card, {backgroundColor: p.card}]} testID="rbot-capabilities">
                <View style={styles.cardTitleRow}>
                  <View style={[styles.cardBar, {backgroundColor: p.btn}]} />
                  <Text style={[styles.cardTitle, {color: p.cardInk}]}>What I can do for you</Text>
                </View>
                {CAPABILITIES.map(c => (
                  <View key={c.title} style={styles.cap}>
                    <Text style={[styles.capTitle, {color: p.cardInk}]}>{c.title}</Text>
                    <Text style={[styles.capBody, {color: p.cardSoft}]}>{c.body}</Text>
                  </View>
                ))}
              </View>
              {/* On wide the chips live in the context panel — never twice on one screen. */}
              {wide ? null : chips}
            </View>
          ) : null}

          {thread.map((m, i) => (
            <View key={`${m.role}-${i}`}>
              <Bubble palette={p} from={m.role} testID={`rbot-bubble-${m.role}`}>
                {m.content}
              </Bubble>
              {m.applied?.length ? (
                <View style={styles.appliedRow} testID="rbot-applied">
                  {m.applied.map(a => (
                    <View key={a} style={[styles.applied, {borderColor: p.frostLine}]}>
                      <Icon name="check" size={13} color={p.ink} strokeWidth={2} />
                      <Text style={[styles.appliedText, {color: p.ink}]}>{a}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {m.local ? (
                <View style={styles.appliedRow} testID="rbot-local-answer">
                  <View style={[styles.applied, {borderColor: p.frostLine}]}>
                    <Icon name="shield" size={13} color={p.ink} strokeWidth={1.8} />
                    <Text style={[styles.appliedText, {color: p.ink}]}>
                      Answered on your device
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          ))}

          {busy ? (
            <View style={[styles.bubbleLeft, {backgroundColor: p.card}]} testID="rbot-thinking">
              <ActivityIndicator size="small" color={p.cardSoft} />
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.inputRow, {paddingBottom: Math.max(insets.bottom, 12)}]}>
          <View style={[styles.inputWrap, {backgroundColor: p.frost, borderColor: p.frostLine}]}>
            <TextInput
              style={[styles.input, {color: p.ink}]}
              value={input}
              onChangeText={setInput}
              placeholder="Ask R'Bot anything…"
              placeholderTextColor={p.inkFaint}
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
              multiline
              testID="rbot-input"
            />
          </View>
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || busy}
            style={[
              styles.send,
              {backgroundColor: p.btn, opacity: !input.trim() || busy ? 0.5 : 1},
            ]}
            testID="rbot-send"
            accessibilityLabel="send"
          >
            <Icon name="send" size={20} color="#fff" strokeWidth={1.9} />
          </Pressable>
        </View>
        </View>
        {contextPanel}
        </View>
      </KeyboardAvoidingView>
    </GradientScreen>
    </View>
    </View>
  );
}

function Bubble({
  children, from, palette, testID,
}: {
  children: React.ReactNode;
  from: 'user' | 'assistant';
  palette: CarrierPalette;
  testID?: string;
}) {
  const assistant = from === 'assistant';
  // Duo inner (wide or rotated): 86% of 600–900pt makes unreadably long lines; cap the bubble.
  const {wide, tall} = useLayout();
  return (
    <View
      style={[
        assistant ? styles.bubbleLeft : styles.bubbleRight,
        wide || tall ? styles.bubbleWide : null,
        {backgroundColor: assistant ? palette.card : palette.btn},
      ]}
      testID={testID}
    >
      <Text style={[styles.bubbleText, {color: assistant ? palette.cardInk : '#fff'}]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {flex: 1},
  panel: {position: 'absolute', overflow: 'hidden', borderRadius: 20},
  sidePanel: {right: 0, top: 0, bottom: 0, width: '68%'},
  bottomPanel: {left: 0, right: 0, bottom: 0, height: '62%'},
  flex: {flex: 1},
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  headDisc: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: {flex: 1},
  headTitle: {fontSize: 19, fontWeight: '600'},
  headSub: {fontSize: 12, marginTop: 1},
  close: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
  thread: {paddingHorizontal: 18, paddingBottom: 14, gap: 10},
  bubbleWide: {maxWidth: 560},
  // Wide (Duo inner): thread (3) | context panel (2).
  wideBody: {flexDirection: 'row'},
  side: {flex: 2, minWidth: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.25)'},
  sideBody: {paddingHorizontal: 18, paddingBottom: 110},
  sideTitle: {fontSize: 11, fontWeight: '700', letterSpacing: 0.8},
  sideCard: {marginTop: 8, gap: 4},
  bubbleLeft: {
    alignSelf: 'flex-start',
    maxWidth: '86%',
    borderRadius: 16,
    borderTopLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bubbleRight: {
    alignSelf: 'flex-end',
    maxWidth: '86%',
    borderRadius: 16,
    borderTopRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bubbleText: {fontSize: 14, lineHeight: 21},
  card: {
    marginTop: 10,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  cardTitleRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  cardBar: {width: 4, height: 18, borderRadius: 2},
  cardTitle: {fontSize: 16, fontWeight: '600'},
  cap: {gap: 3},
  capTitle: {fontSize: 14, fontWeight: '600'},
  capBody: {fontSize: 13, lineHeight: 19},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12},
  chip: {borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8},
  chipText: {fontSize: 13, fontWeight: '500'},
  appliedRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginLeft: 4},
  applied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  appliedText: {fontSize: 12, fontWeight: '500'},
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  inputWrap: {flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center'},
  input: {fontSize: 15, paddingVertical: 11, maxHeight: 120},
  send: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
});
