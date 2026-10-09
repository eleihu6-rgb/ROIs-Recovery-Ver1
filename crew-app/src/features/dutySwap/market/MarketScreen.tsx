// Duty Swap · Market (design Concept A "Swap Board").
// Spec: docs/superpowers/specs/2026-10-08-crew-app-duty-swap-market-design.md
// The crew picks one of their unlocked duties to swap out of; the board lists
// every unlocked duty other crews have published around it (fleet + rank
// pre-check per card); tapping an offer opens the composer (give / take / delta
// / note) and "Check legality & send" submits through the portal, whose rule
// check decides. Phone: the composer is a bottom sheet. Duo inner screen: board
// left | composer right, split at the hinge (wide); board top | composer below
// (tall). First paint = one search (shared with the Matrix); compare details
// load only for the crews whose cards are in view.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewToken,
} from 'react-native';
import { useStore } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppDialog } from '../../../components/v2/AppDialog';
import { Icon } from '../../../components/v2/icons';
import { ALL_ORIENTATIONS, useLayout } from '../../../components/v2/useLayout';
import { useAppDispatch, useAppSelector, type RootState } from '../../../store';
import { useCarrier, type CarrierPalette } from '../../../theme/carrier';
import { PageShell } from '../../v2/PageShell';
import { useV2Nav } from '../../v2/nav';
import { dutySwapApiFor, ensureDetails, openDutySwap, runSearch } from '../dutySwapActions';
import { dayLabel, detailFor, emptyFilters, parseRuleMessage, routeOf, submitBody, type ApiCompare, type RuleResult, type SwapDuty } from '../dutySwapModel';
import { acceptDisclaimer } from '../dutySwapSlice';
import { RuleList } from '../DutySwapScreen';
import { tint } from '../components/CrewMatrix';
import { MarketComposer } from './MarketComposer';
import {
  boardHeadline, boardOffers, defaultGive, defaultTake, giveChoices, KIND_BADGE, outOfDuties, precheck, precheckLabel, spanLabel, takeChoices,
  type Offer,
} from './marketModel';

type Result = { kind: 'sent'; crewB: string } | { kind: 'illegal'; rule: RuleResult } | { kind: 'error'; message: string };

export function MarketScreen({ switcher, actionsInRail = false }: {
  switcher?: React.ReactNode;
  actionsInRail?: boolean;
} = {}): React.JSX.Element {
  const p = useCarrier();
  const nav = useV2Nav();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const insets = useSafeAreaInsets();
  const auth = useAppSelector(s => s.auth);
  const st = useAppSelector(s => s.dutySwap);
  const { width, wide, tall } = useLayout();
  const api = useMemo(() => dutySwapApiFor(auth), [auth]);

  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [outKey, setOutKey] = useState<string | null>(null);
  const [daysOff, setDaysOff] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [take, setTake] = useState<string[]>([]);
  const [give, setGive] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const afterSheet = useRef<(() => void) | null>(null);

  // First paint: one search over the window — the whole market, so any filters
  // left by the Matrix are dropped (window and mode kept).
  const search = useCallback(() => {
    if (!api) return;
    const f = store.getState().dutySwap.filters;
    if (f) void runSearch(dispatch, api, emptyFilters(f.startDate, f.endDate, f.swapMode));
    else void openDutySwap(dispatch, store.getState, api);
  }, [api, dispatch, store]);
  useEffect(() => {
    if (!api) return;
    search();
    if (!store.getState().dutySwap.disclaimerAccepted) {
      api.disclaimer().then(t => (t ? setDisclaimer(t) : dispatch(acceptDisclaimer()))).catch(() => undefined);
    }
  }, [api, search, dispatch, store]);

  const me = st.crews[0];
  const others = useMemo(() => st.crews.slice(1), [st.crews]);
  const outs = useMemo(() => outOfDuties(me), [me]);
  const out = outs.find(d => d.key === outKey) ?? outs[0];
  const offers = useMemo(() => (out ? boardOffers(others, out, { daysOff }) : []), [others, out, daysOff]);
  const crewB = offer ? others.find(c => c.crewId === offer.crewId) : undefined;
  const cmp: ApiCompare | undefined = offer ? st.details[offer.crewId] : undefined;
  // My side of any loaded compare (each crew's compare carries my duties too).
  const mineList = useMemo(() => Object.values(st.details)[0]?.mineTaskDetailList, [st.details]);
  const myDetail = out ? detailFor(out, mineList) : undefined;

  // Back from "My duties" with duties unlocked: search again.
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focused.current) {
      const s0 = store.getState().dutySwap;
      if (s0.status === 'error' || outOfDuties(s0.crews[0]).length === 0) search();
    }
    focused.current = true;
  }, [search, store]));

  // Details only for the crews whose cards are in view.
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const ids = [...new Set(viewableItems.map(v => (v.item as Offer).crewId))];
    const a = apiRef.current;
    if (a && ids.length) void ensureDetails(dispatch, store.getState, a, ids);
  });
  const apiRef = useRef(api);
  apiRef.current = api;

  const openOffer = (o: Offer) => {
    const b = others.find(c => c.crewId === o.crewId);
    if (!me || !out || !b) return;
    setOffer(o);
    setTake(defaultTake(b, out, o.duty));
    setGive(defaultGive(me, out, o.duty));
    setNote('');
    if (api) void ensureDetails(dispatch, store.getState, api, [o.crewId]);
    if (!wide && !tall) setSheetOpen(true);
  };
  const closeComposer = (then?: () => void) => {
    if (sheetOpen) {
      afterSheet.current = () => { setOffer(null); then?.(); };
      setSheetOpen(false);
    } else {
      setOffer(null);
      then?.();
    }
  };
  // iOS cannot dismiss the result dialog and the sheet under it in one tick.
  const closeAfterSend = (then?: () => void) => {
    setResult(null);
    if (sheetOpen) setTimeout(() => closeComposer(then), 350);
    else closeComposer(then);
  };

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter(k => k !== key) : [...list, key]);

  const send = async () => {
    if (!api || !me || !crewB || !offer || !st.filters) return;
    const takeDuties = crewB.duties.filter(d => take.includes(d.key));
    const giveDuties = me.duties.filter(d => give.includes(d.key));
    setSubmitting(true);
    try {
      const r = await api.submit(submitBody(me.crewId, crewB.crewId, giveDuties, takeDuties, st.filters.swapMode, note));
      if (r.ok) {
        setSent(prev => [...prev, offer.key]);
        setResult({ kind: 'sent', crewB: crewB.crewId });
      } else {
        const rule = parseRuleMessage(r.message);
        setResult(rule.items.length ? { kind: 'illegal', rule } : { kind: 'error', message: r.message });
      }
    } catch (e) {
      setResult({ kind: 'error', message: e instanceof Error ? e.message : 'Could not reach the crew portal.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!api) {
    return (
      <PageShell title="Duty Swap" titleNode={switcher} scroll={false} layout="full">
        <View style={s.center}><Text style={[s.msg, { color: p.ink }]}>Sign in with your crew account to swap duties.</Text></View>
      </PageShell>
    );
  }

  const composer = crewB && offer && me && out ? (
    <MarketComposer palette={p} crewB={crewB} compare={cmp}
      takeChoices={takeChoices(crewB, out, offer.duty)} giveChoices={giveChoices(me, out, offer.duty)}
      take={take} give={give} onToggleTake={k => toggle(take, setTake, k)} onToggleGive={k => toggle(give, setGive, k)}
      note={note} onNote={setNote} submitting={submitting} onSend={send} onClose={() => closeComposer()} />
  ) : null;

  const dialog = result ? (
    <AppDialog visible onClose={() => setResult(null)} testID="market-result"
      tone={result.kind === 'sent' ? 'success' : 'warning'} icon={result.kind === 'sent' ? 'send' : 'shield'}
      title={result.kind === 'sent' ? `Request sent to ${result.crewB}` : result.kind === 'illegal' ? 'Swap not allowed' : 'Could not send'}
      message={result.kind === 'sent'
        ? `Legality passed. ${result.crewB} has to accept, then crew control approves. Track it in Swap requests.`
        : result.kind === 'error' ? result.message : undefined}
      confirmLabel={result.kind === 'sent' ? 'View requests' : 'Edit offer'}
      onConfirm={() => (result.kind === 'sent' ? closeAfterSend(() => nav.navigate('DutySwapRecords')) : setResult(null))}
      cancelLabel={result.kind === 'sent' ? 'Done' : undefined}
      onCancel={() => (result.kind === 'sent' ? closeAfterSend() : setResult(null))}>
      {result.kind === 'illegal' ? <RuleList rule={result.rule} /> : null}
    </AppDialog>
  ) : null;

  // "Please publish task." / nothing of mine unlocked → the fix is My duties.
  const noUnlocked = (st.status === 'error' && !!st.error && /no unlocked duties/.test(st.error)) || (st.status === 'ready' && !!me && outs.length === 0);
  const unlockCard = (
    <View style={[s.card, { backgroundColor: p.cardSolid }]} testID="market-error">
      <Text style={[s.msgStrong, { color: p.cardInk }]}>{noUnlocked ? 'Unlock a duty to swap out of' : 'Could not load the market'}</Text>
      <Text style={[s.msg, { color: p.cardSoft }]}>
        {noUnlocked ? 'The market shows the duties other crew offer around one of your unlocked duties. Unlock the duties you want to swap out of.' : st.error}
      </Text>
      <View style={s.btnRow}>
        {noUnlocked ? (
          <Pressable onPress={() => nav.navigate('DutySwapMyDuties')} testID="market-unlock" style={[s.smallBtn, { backgroundColor: p.btn, borderColor: p.btn }]}>
            <Text style={[s.smallBtnText, { color: '#fff' }]}>Unlock my duties</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={search} testID="market-retry" style={[s.smallBtn, { borderColor: p.btn }]}>
          <Text style={[s.smallBtnText, { color: p.btn }]}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );

  const board = (
    <FlatList
      key={tall ? 'two' : 'one'}
      data={offers}
      numColumns={tall ? 2 : 1}
      columnWrapperStyle={tall ? s.colWrap : undefined}
      keyExtractor={o => o.key}
      extraData={[st.details, sent, offer?.key]}
      initialNumToRender={8}
      windowSize={7}
      onViewableItemsChanged={onViewable.current}
      viewabilityConfig={VIEWABILITY}
      contentContainerStyle={s.list}
      testID="market-board"
      renderItem={({ item }) => (
        <OfferCard o={item} p={p} on={offer?.key === item.key} sent={sent.includes(item.key)}
          detail={detailFor(item.duty, st.details[item.crewId]?.othersTaskDetailList)} mine={myDetail} onPress={() => openOffer(item)} />
      )}
      ListEmptyComponent={st.status === 'loading' ? null : (
        <Text style={[s.empty, { color: p.cardSoft, backgroundColor: p.cardSolid }]} testID="market-empty">
          No unlocked duties from other crew overlap {out?.code ?? 'this duty'}. Pick another of your duties{daysOff ? '' : ' or include days off'}.
        </Text>
      )}
    />
  );

  const toolbar = (
    <View style={s.toolbar}>
      <Text style={[s.over, { color: p.inkSoft }]}>OUT OF</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={s.flex}>
        {outs.map(d => {
          const on = d.key === out?.key;
          const dl = dayLabel(d.startDt.slice(0, 10));
          return (
            <Pressable key={d.key} onPress={() => { setOutKey(d.key); closeComposer(); }} testID={`market-out-${d.startDt.slice(0, 10)}`}
              accessibilityState={{ selected: on }} accessibilityLabel={`out of ${d.code} ${dl.day} ${dl.month}`}
              style={[s.chip, { backgroundColor: on ? (p.isLight ? p.cardInset : '#fff') : p.frost, borderColor: p.frostLine }]}>
              <Icon name="swap" size={13} color={on ? (p.isLight ? p.btn : p.g1) : p.ink} strokeWidth={2} />
              <Text style={[s.chipText, { color: on ? (p.isLight ? p.btn : p.g1) : p.ink }]}>{dl.day} {dl.month} · {d.code}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {!actionsInRail ? (
        <Pressable onPress={() => nav.navigate('DutySwapMyDuties')} accessibilityLabel="my duties" testID="market-my-duties"
          style={[s.iconChip, { backgroundColor: p.frost, borderColor: p.frostLine }]}>
          <Icon name="lock" size={15} color={p.ink} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
  const headline = out ? (
    <View style={s.headRow}>
      <Text style={[s.headline, { color: p.ink }]} testID="market-headline">{boardHeadline(offers.length, out)}</Text>
      <View style={s.flex} />
      {st.status === 'loading' ? <ActivityIndicator color={p.ink} size="small" /> : null}
      <Pressable onPress={() => setDaysOff(v => !v)} testID="market-days-off" accessibilityState={{ selected: daysOff }}
        style={[s.chip, { backgroundColor: daysOff ? (p.isLight ? p.cardInset : '#fff') : p.frost, borderColor: p.frostLine }]}>
        <Text style={[s.chipText, { color: daysOff ? (p.isLight ? p.btn : p.g1) : p.ink }]}>Days off</Text>
      </Pressable>
    </View>
  ) : null;

  const loading = st.status === 'loading' && !me;
  const showUnlock = !loading && (noUnlocked || (st.status === 'error' && !me));
  // Wide: the board ends at the hinge (window centre), the composer fills the right half.
  const boardW = width / 2 - insets.left - 12 - 6;
  const pane = (
    <View style={[s.pane, tall && s.paneTall, { backgroundColor: p.cardSolid }]}>
      {composer ?? (
        <View style={s.center} testID="market-composer-empty">
          <Icon name="market" size={28} color={p.cardSoft} />
          <Text style={[s.msg, { color: p.cardSoft }]}>Tap an offer to build your swap.</Text>
        </View>
      )}
    </View>
  );

  return (
    <PageShell title="Duty Swap" titleNode={switcher} scroll={false} layout="full" testID="market-screen"
      right={actionsInRail ? undefined : (
        <Pressable onPress={() => nav.navigate('DutySwapRecords')} hitSlop={10} accessibilityLabel="swap requests" testID="swap-records">
          <Icon name="history" size={22} color={p.ink} strokeWidth={1.8} />
        </Pressable>
      )}>
      <View style={[s.flex, wide && s.row]}>
        <View style={wide ? { width: boardW } : s.flex}>
          {loading ? (
            <View style={s.center}><ActivityIndicator color={p.ink} /><Text style={[s.msg, { color: p.inkSoft }]}>Loading the market…</Text></View>
          ) : showUnlock ? unlockCard : (
            <>
              {toolbar}
              {headline}
              {st.status === 'error' ? <Text style={[s.inlineErr, { color: p.inkSoft }]}>{st.error}</Text> : null}
              {board}
            </>
          )}
        </View>
        {wide || tall ? pane : null}
      </View>

      {!wide && !tall ? (
        <Modal visible={sheetOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => closeComposer()}
          onDismiss={() => { const next = afterSheet.current; afterSheet.current = null; next?.(); }} supportedOrientations={ALL_ORIENTATIONS}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.bottom + 12} style={s.flex}>
            <View style={[s.flex, { backgroundColor: p.cardSolid, paddingBottom: insets.bottom }]}>
              {composer}
              {dialog}
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : dialog}

      <AppDialog visible={!!disclaimer} onClose={() => { setDisclaimer(null); nav.goBack(); }} tone="neutral" icon="shield"
        title="Before you swap" message={disclaimer ?? ''} dismissable={false} testID="swap-disclaimer"
        cancelLabel="Cancel" onCancel={() => { setDisclaimer(null); nav.goBack(); }}
        confirmLabel="Agree" onConfirm={() => { setDisclaimer(null); dispatch(acceptDisclaimer()); }} />
    </PageShell>
  );
}

const VIEWABILITY = { itemVisiblePercentThreshold: 30, minimumViewTime: 150 };

function OfferCard({ o, p, on, sent, detail, mine, onPress }: {
  o: Offer; p: CarrierPalette; on: boolean; sent: boolean;
  detail: ReturnType<typeof detailFor>; mine: ReturnType<typeof detailFor>; onPress: () => void;
}) {
  const d: SwapDuty = o.duty;
  const dl = dayLabel(d.startDt.slice(0, 10));
  const route = d.kind === 'fly' ? routeOf(detail) : null;
  const check = precheck(detail, mine);
  const warn = !!check && (check.rankDiffers || check.fleetDiffers);
  return (
    <Pressable onPress={onPress} testID={`offer-${o.crewId}-${d.id}`} accessibilityLabel={`${o.crewId} ${d.code} ${dl.day} ${dl.month}${sent ? ' offered' : ''}`}
      accessibilityState={{ selected: on }}
      style={[s.cardItem, { backgroundColor: p.cardSolid, borderColor: on ? p.btn : 'transparent' }]}>
      <View style={s.date}>
        <Text style={[s.dateNum, { color: p.cardInk }]}>{dl.day}</Text>
        <Text style={[s.dateSub, { color: p.cardSoft }]}>{dl.month.toUpperCase()}</Text>
      </View>
      <View style={s.flex}>
        <View style={s.line}>
          <Text style={[s.code, { color: p.cardInk }]} numberOfLines={1}>{d.code}</Text>
          {KIND_BADGE[d.kind] ? <Text style={[s.badge, { color: p.cardSoft, borderColor: p.cardLine }]}>{KIND_BADGE[d.kind]}</Text> : null}
          {sent ? <Text style={[s.badge, { color: p.btn, borderColor: p.btn }]}>Offered</Text> : null}
        </View>
        <Text style={[s.sub, { color: p.cardSoft }]} numberOfLines={1}>{spanLabel(d)}{route ? ` · ${route}` : ''}</Text>
        <View style={s.line}>
          <Text style={[s.crew, { color: p.cardInk }]} numberOfLines={1}>{o.crewId} <Text style={{ color: p.cardSoft }}>{o.crewName}</Text></Text>
          {check && (check.rank || check.fleets.length) ? (
            <Text style={[s.badge, warn ? { color: p.btn, borderColor: p.btn } : { color: p.cardSoft, borderColor: p.cardLine }]}>{precheckLabel(check)}</Text>
          ) : null}
        </View>
      </View>
      <Icon name={on ? 'check' : 'chev'} size={18} color={p.btn} strokeWidth={2} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  msg: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  msgStrong: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  card: { borderRadius: 14, margin: 12, marginTop: 20, padding: 20, gap: 10, alignItems: 'center' },
  btnRow: { flexDirection: 'row', gap: 8 },
  smallBtn: { height: 40, borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontSize: 14, fontWeight: '700' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  over: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  chips: { gap: 6, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '700' },
  iconChip: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  headline: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  inlineErr: { fontSize: 12, paddingHorizontal: 12, paddingBottom: 6 },
  list: { paddingHorizontal: 10, paddingBottom: 16, gap: 8 },
  colWrap: { gap: 8 },
  empty: { fontSize: 13, padding: 14, borderRadius: 12, textAlign: 'center', marginTop: 12 },
  pane: { flex: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 4 },
  paneTall: { marginHorizontal: 12, marginTop: 8 },
  cardItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10 },
  date: { width: 38, alignItems: 'center' },
  dateNum: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dateSub: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  code: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  badge: { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  sub: { fontSize: 12, fontWeight: '500', marginVertical: 2, fontVariant: ['tabular-nums'] },
  crew: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
