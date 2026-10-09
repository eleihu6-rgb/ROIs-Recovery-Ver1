// Home ▸ Quick actions ▸ Duty Swap — Concept D (Crew Matrix).
// Spec: docs/superpowers/specs/2026-10-07-crew-app-duty-swap-concept-d-design.md
// Flow: disclaimer → Search pairing (design D0: filters or R'Bot find the target
// crew; on the Duo inner screen with a live preview) → matrix (my duties + the
// crews found) → tap my duty (give) and crew B's duties (take) → Compare & send
// (portal legality check on submit) → result. Records (top-right) lists
// requests: withdraw / accept / reject.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from 'react-redux';

import { AppDialog } from '../../components/v2/AppDialog';
import { Icon } from '../../components/v2/icons';
import { useLayout } from '../../components/v2/useLayout';
import { airlineByCode } from '../auth/airlines';
import { useAppDispatch, useAppSelector, type RootState } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { PageShell } from '../v2/PageShell';
import { useV2Nav } from '../v2/nav';
import { dutySwapApiFor, ensureDetails, loadOptions, openDutySwap, runSearch } from './dutySwapActions';
import {
  activeFilterCount, dayLabel, daysBetween, detailFor, kpiDelta, parseRuleMessage, signedHhmm, submitBody, SWAP_MODE_LABEL, validateFilters,
  type RuleResult, type SwapDuty, type SwapFilters,
} from './dutySwapModel';
import { acceptDisclaimer, clearSelection, selectCrewB, setStep, toggleGive, toggleTake } from './dutySwapSlice';
import { CompareSheet } from './components/CompareSheet';
import { CrewMatrix, matrixGeometry, tint } from './components/CrewMatrix';
import { SearchForm } from './components/SearchForm';
import { SwapRbotPanel } from './components/SwapRbotPanel';
import { CrewAvatar } from '../settings/avatars';
import { RBOT_AVATAR_INDEX } from '../rbot/RBotEntry';

type Result = { kind: 'sent'; crewB: string } | { kind: 'illegal'; rule: RuleResult } | { kind: 'error'; message: string };

/** `switcher`: the Matrix | Market switch (DutySwapHost), shown in place of the title. */
export function DutySwapScreen({ switcher, rbot }: {
  switcher?: React.ReactNode;
  rbot?: { open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; inRail: boolean };
} = {}): React.JSX.Element {
  const p = useCarrier();
  const nav = useV2Nav();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const auth = useAppSelector(s => s.auth);
  const st = useAppSelector(s => s.dutySwap);
  const { width, height, wide, tall } = useLayout();
  const api = useMemo(() => dutySwapApiFor(auth), [auth]);
  const carrier = airlineByCode(auth.airline).carrier;

  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<{ startDate: string; endDate: string } | null>(null);
  // R'Bot shares the screen with the matrix (spec §6).
  const [localRbotOpen, setLocalRbotOpen] = useState(false);
  const rbotOpen = rbot?.open ?? localRbotOpen;
  const setRbotOpen = rbot?.setOpen ?? setLocalRbotOpen;
  const [compareOpen, setCompareOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // After a sent request: what to do once the sheet has fully dismissed.
  const afterSheet = useRef<(() => void) | null>(null);
  // iOS cannot dismiss a nested Modal and its parent in the same tick (the next
  // Modal then never presents): close the result dialog first, then the sheet.
  const closeAfterSend = (then?: () => void) => {
    setResult(null);
    // Clearing the selection unmounts the sheet, so it waits for onDismiss too.
    afterSheet.current = () => { dispatch(clearSelection()); then?.(); };
    setTimeout(() => setCompareOpen(false), 350);
  };

  // Every visit is a new swap: Search pairing, nothing picked. A pick left over
  // from an earlier visit sat off screen and was sent along unnoticed.
  useEffect(() => {
    dispatch(clearSelection());
    dispatch(setStep('search'));
  }, [dispatch]);

  // First paint: default window + one search in the background (my own duties
  // for R'Bot, and the Duo preview). The disclaimer loads alongside.
  useEffect(() => {
    if (!api) return;
    void openDutySwap(dispatch, store.getState, api);
    if (!store.getState().dutySwap.disclaimerAccepted) {
      api.disclaimer().then(t => (t ? setDisclaimer(t) : dispatch(acceptDisclaimer()))).catch(() => undefined);
    }
    api.defaultWindow().then(setDefaults).catch(() => undefined);
  }, [api, dispatch, store]);

  const me = st.crews[0];
  const others = useMemo(() => st.crews.slice(1), [st.crews]);
  const days = useMemo(() => (st.filters ? daysBetween(st.filters.startDate, st.filters.endDate) : []), [st.filters]);
  const give = useMemo(() => new Set(st.give), [st.give]);
  const take = useMemo(() => new Set(st.take), [st.take]);

  // Size from the measured body (side safe-area insets shrink it in landscape),
  // not the window. Duo inner landscape: Mine + Date + 3 crews left of the hinge,
  // 3 crews + the swap rail right.
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const areaW = area?.w ?? width - 20;
  const areaH = area?.h ?? height;
  // With R'Bot open: side by side when the body is landscape (the Duo inner
  // screen's halves meet at the hinge), stacked in portrait.
  const rbotSide = rbotOpen && areaW > areaH;
  const railMode = wide && width > height && !rbotOpen;
  const geometry = matrixGeometry(rbotSide ? areaW / 2 - 4 : areaW, areaH, others.length, { hingeAligned: railMode });
  const matrixW = railMode ? geometry.mineW + geometry.dateW + 6 * geometry.colW : rbotSide ? areaW / 2 - 4 : areaW;
  const railW = areaW - matrixW - 8;

  // "1–6 of 123 crew" once the crews do not fit (cabin crew: 120+ candidates).
  const [range, setRange] = useState<[number, number] | null>(null);
  const onRange = useCallback((a: number, b: number) => setRange([a, b]), []);
  const onVisibleCrews = useCallback((ids: string[]) => {
    if (api) void ensureDetails(dispatch, store.getState, api, ids);
  }, [api, dispatch, store]);

  const onPressDuty = (d: SwapDuty) => {
    if (!d.swappable) return;
    if (me && d.crewId === me.crewId) dispatch(toggleGive(d.key));
    else dispatch(toggleTake({ crewId: d.crewId, key: d.key }));
  };
  const onPressCrew = (id: string) => {
    dispatch(selectCrewB(id));
    if (api) void ensureDetails(dispatch, store.getState, api, [id]);
    setCompareOpen(true);
  };

  // Selected duties and their details (crew B's compare carries both sides).
  const giveDuties = me ? me.duties.filter(d => give.has(d.key)) : [];
  const crewB = others.find(c => c.crewId === st.crewB);
  const takeDuties = crewB ? crewB.duties.filter(d => take.has(d.key)) : [];
  const cmp = st.crewB ? st.details[st.crewB] : undefined;
  const giveDetails = giveDuties.map(d => detailFor(d, cmp?.mineTaskDetailList)).filter(Boolean) as NonNullable<ReturnType<typeof detailFor>>[];
  const takeDetails = takeDuties.map(d => detailFor(d, cmp?.othersTaskDetailList)).filter(Boolean) as NonNullable<ReturnType<typeof detailFor>>[];
  const picked = !!st.crewB && giveDuties.length + takeDuties.length > 0;
  const delta = cmp && picked ? kpiDelta(giveDetails, takeDetails) : null;

  const submit = async (comment: string) => {
    if (!api || !me || !st.crewB || !st.filters) return;
    setSubmitting(true);
    try {
      const r = await api.submit(submitBody(me.crewId, st.crewB, giveDuties, takeDuties, st.filters.swapMode, comment));
      if (r.ok) {
        setResult({ kind: 'sent', crewB: st.crewB });
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

  const onSearch = (f: SwapFilters) => {
    dispatch(setStep('pick'));
    if (api) void runSearch(dispatch, api, f);
  };
  const openSearch = () => dispatch(setStep('search'));
  // The form's choice lists (ports, flights, fleets…) for the current window —
  // after the first search lands: the portal queues a crew's calls, and seven
  // lookups in front of a cabin crew's 1 MB search pushed it past its timeout.
  const hasFilters = !!st.filters;
  const searched = st.status === 'ready' || st.status === 'error';
  useEffect(() => {
    if (api && hasFilters && searched && st.step === 'search') loadOptions(dispatch, store.getState, api).catch(() => undefined);
  }, [api, hasFilters, searched, st.step, dispatch, store]);

  // Duo inner screen: the preview follows the form (debounced), so the crew sees
  // who is left before pressing Search.
  const preview = wide || tall;
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);
  const onFormChange = useCallback((f: SwapFilters) => {
    if (!preview || !api) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      if (validateFilters(f) || JSON.stringify(f) === JSON.stringify(store.getState().dutySwap.filters)) return;
      void runSearch(dispatch, api, f);
    }, 700);
  }, [preview, api, dispatch, store]);
  const [previewArea, setPreviewArea] = useState<{ w: number; h: number } | null>(null);

  const windowLabel = st.filters
    ? `${dayLabel(st.filters.startDate).day} ${dayLabel(st.filters.startDate).month} – ${dayLabel(st.filters.endDate).day} ${dayLabel(st.filters.endDate).month}`
    : '…';
  const nFilters = st.filters ? activeFilterCount(st.filters) : 0;

  const summary = (vertical: boolean) => (
    <View style={[vertical ? s.rail : s.tray, { backgroundColor: p.cardSolid, width: vertical ? railW : undefined }]} testID="swap-tray">
      <View style={vertical ? s.railInner : s.trayLine}>
        <Text style={[s.trayLabel, { color: p.cardSoft }]}>GIVE</Text>
        <Text style={[s.trayCodes, { color: p.cardInk }]} numberOfLines={vertical ? 3 : 1}>{giveDuties.map(d => d.code).join(', ') || '—'}</Text>
        <Icon name="swap" size={16} color={p.btn} strokeWidth={2} />
        <Text style={[s.trayLabel, { color: p.cardSoft }]}>TAKE{st.crewB ? ` · ${st.crewB}` : ''}</Text>
        <Text style={[s.trayCodes, { color: p.cardInk }]} numberOfLines={vertical ? 3 : 1}>{takeDuties.map(d => d.code).join(', ') || '—'}</Text>
      </View>
      {delta ? (
        <Text style={[s.trayDelta, { color: p.btn }]} testID="tray-delta">
          BLH {signedHhmm(delta.blh)} · CRD {signedHhmm(delta.crd)}
        </Text>
      ) : null}
      <View style={vertical ? s.railBtns : s.trayBtns}>
        <Pressable onPress={() => dispatch(clearSelection())} style={[s.smallBtn, { borderColor: p.btn }]} testID="swap-clear">
          <Text style={[s.smallBtnText, { color: p.btn }]}>Clear</Text>
        </Pressable>
        <Pressable disabled={!st.crewB} onPress={() => setCompareOpen(true)} testID="swap-compare"
          style={[s.smallBtn, s.flexBtn, { backgroundColor: p.btn, borderColor: p.btn, opacity: st.crewB ? 1 : 0.45 }]}>
          <Text style={[s.smallBtnText, { color: '#fff' }]}>Compare & send</Text>
        </Pressable>
      </View>
    </View>
  );

  if (!api) {
    return (
      <PageShell title="Duty Swap" scroll={false} layout="full">
        <View style={s.center}><Text style={[s.msg, { color: p.ink }]}>Sign in with your crew account to swap duties.</Text></View>
      </PageShell>
    );
  }

  const showSummary = st.give.length > 0 || st.take.length > 0 || !!st.crewB;
  // "Please publish task.": nothing of mine is unlocked → the fix is My duties.
  const noUnlocked = !!st.error && /no unlocked duties/.test(st.error);
  const errorCard = (
    <View style={[s.center, s.card, { backgroundColor: p.cardSolid }]} testID="swap-error">
      <Text style={[s.msgStrong, { color: p.cardInk }]}>Could not load duties</Text>
      <Text style={[s.msg, { color: p.cardSoft }]}>{st.error}</Text>
      <View style={s.trayBtns}>
        {noUnlocked ? (
          <Pressable onPress={() => nav.navigate('DutySwapMyDuties')} testID="swap-unlock-duties" style={[s.smallBtn, { backgroundColor: p.btn, borderColor: p.btn }]}>
            <Text style={[s.smallBtnText, { color: '#fff' }]}>Unlock my duties</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={openSearch} style={[s.smallBtn, { borderColor: p.btn }]}><Text style={[s.smallBtnText, { color: p.btn }]}>Edit search</Text></Pressable>
        <Pressable onPress={() => st.filters && runSearch(dispatch, api, st.filters)} style={[s.smallBtn, { backgroundColor: p.btn, borderColor: p.btn }]}>
          <Text style={[s.smallBtnText, { color: '#fff' }]}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );
  const searching = st.step === 'search';
  const previewPane = (
    <View style={[s.flex, s.preview, { backgroundColor: p.cardSolid }]} testID="search-preview">
      <View style={[s.previewHead, { borderBottomColor: p.cardLine }]}>
        <Text style={[s.previewTitle, { color: p.cardInk }]}>Preview · {others.length} crew</Text>
        <View style={s.flex} />
        {st.status === 'loading' ? <ActivityIndicator color={p.btn} size="small" /> : <Text style={[s.count, { color: p.cardSoft }]}>{windowLabel}</Text>}
      </View>
      <View style={s.flex} testID="search-preview-body" onLayout={e => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setPreviewArea(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
      }}>
        {st.status === 'error' ? (
          <Text style={[s.msg, s.previewMsg, { color: p.cardSoft }]}>{st.error}</Text>
        ) : me && previewArea ? (
          <CrewMatrix palette={p} me={me} others={others} days={days} geometry={matrixGeometry(previewArea.w, previewArea.h, others.length)}
            width={previewArea.w} details={st.details} give={give} take={take} crewB={st.crewB}
            onPressDuty={() => undefined} onPressCrew={() => undefined} onVisibleCrews={() => undefined} />
        ) : (
          <ActivityIndicator color={p.btn} style={s.previewMsg} />
        )}
      </View>
    </View>
  );
  // Design D0: the form, plus R'Bot or (Duo inner screen) the live preview —
  // side by side in landscape, stacked in portrait.
  const searchBody = st.filters ? (
    <View style={[s.flex, s.searchGap, wide && s.rowLayout]}>
      <View style={wide ? s.half : s.flex}>
        <SearchForm palette={p} crewId={auth.crewId ?? ''} initial={st.filters} options={st.options}
          defaults={defaults ?? { startDate: st.filters.startDate, endDate: st.filters.endDate }}
          twoColumns={tall || (!wide && width > height)} resultLabel={preview && st.status === 'ready' ? `${others.length} crew` : undefined}
          onSearch={onSearch} onChange={onFormChange} onAskRbot={rbotOpen ? undefined : () => setRbotOpen(true)}
          onClose={st.crews.length ? () => dispatch(setStep('pick')) : undefined} />
      </View>
      {rbotOpen ? (
        <View style={wide ? s.half : s.rbotBottom}>
          <SwapRbotPanel palette={p} api={api} side={wide} onClose={() => setRbotOpen(false)} />
        </View>
      ) : preview ? <View style={wide ? s.half : s.flex}>{previewPane}</View> : null}
    </View>
  ) : st.status === 'error' ? errorCard : (
    <View style={s.center}><ActivityIndicator color={p.ink} /><Text style={[s.msg, { color: p.inkSoft }]}>Loading duties…</Text></View>
  );

  return (
    <PageShell title={searching ? 'New swap' : 'Duty Swap'} titleNode={switcher} scroll={false} layout="full" testID="duty-swap-screen"
      right={rbot?.inRail ? undefined : (
        <Pressable onPress={() => nav.navigate('DutySwapRecords')} hitSlop={10} accessibilityLabel="swap requests" testID="swap-records">
          <Icon name="history" size={22} color={p.ink} strokeWidth={1.8} />
        </Pressable>
      )}>
      {searching && rbot?.inRail ? null : <View style={s.toolbar}>
        {searching ? <View style={s.flex} /> : (<>
        <Pressable onPress={openSearch} style={[s.chip, { backgroundColor: p.frost, borderColor: p.frostLine }]} testID="swap-open-search">
          <Icon name="cal" size={14} color={p.ink} strokeWidth={2} />
          <Text style={[s.chipText, { color: p.ink }]}>{windowLabel}</Text>
        </Pressable>
        <Pressable onPress={openSearch} style={[s.chip, { backgroundColor: nFilters ? p.btn : p.frost, borderColor: p.frostLine }]} testID="swap-filters">
          <Icon name="sliders" size={14} color={p.ink} strokeWidth={2} />
          <Text style={[s.chipText, { color: p.ink }]}>
            {st.filters ? SWAP_MODE_LABEL[st.filters.swapMode] : 'Search'}{nFilters ? ` · ${nFilters}` : ''}
          </Text>
        </Pressable>
        <View style={s.flex} />
        <Text style={[s.count, { color: p.inkSoft }]} testID="swap-crew-count">
          {range && range[1] - range[0] + 1 < others.length ? `${range[0]}–${range[1]} of ${others.length} crew` : `${others.length} crew`}
        </Text>
        </>)}
        {!rbot?.inRail ? (
          <>
            <Pressable onPress={() => nav.navigate('DutySwapMyDuties')} accessibilityLabel="my duties" testID="swap-my-duties"
              style={[s.iconChip, { backgroundColor: p.frost, borderColor: p.frostLine }]}>
              <Icon name="lock" size={15} color={p.ink} strokeWidth={2} />
            </Pressable>
            <Pressable onPress={() => setRbotOpen(o => !o)} accessibilityLabel="R'Bot" testID="swap-rbot-open"
              style={[s.rbotBtn, { backgroundColor: rbotOpen ? p.ink : p.frost, borderColor: p.frostLine }]}>
              <CrewAvatar index={RBOT_AVATAR_INDEX} size={22} bare />
            </Pressable>
          </>
        ) : null}
      </View>}

      <View style={s.area} testID="swap-area" onLayout={e => {
        const { width: w, height: h } = e.nativeEvent.layout;
        // The area has 10 pt side padding on each side.
        setArea(prev => (prev && prev.w === w - 20 && prev.h === h ? prev : { w: w - 20, h }));
      }}>
        {searching ? searchBody : st.status === 'loading' && !me ? (
          <View style={s.center}><ActivityIndicator color={p.ink} /><Text style={[s.msg, { color: p.inkSoft }]}>Loading duties…</Text></View>
        ) : st.status === 'error' && !me ? (
          errorCard
        ) : me && area ? (
          <View style={[s.flex, (railMode || rbotSide) && s.rowLayout]}>
            <View style={railMode || rbotSide ? { width: matrixW } : s.flex}>
              <CrewMatrix palette={p} me={me} others={others} days={days} geometry={geometry} width={matrixW}
                details={st.details} give={give} take={take} crewB={st.crewB}
                onPressDuty={onPressDuty} onPressCrew={onPressCrew} onVisibleCrews={onVisibleCrews} onRange={onRange} />
              {st.status === 'error' ? <View style={s.overlay}>{errorCard}</View> : others.length === 0 ? (
                <Text style={[s.empty, { color: p.cardSoft, backgroundColor: p.cardSolid }]} testID="swap-empty">
                  No crew match this search. Widen the dates or remove a filter.
                </Text>
              ) : null}
              {st.status === 'loading' ? <View style={s.busy}><ActivityIndicator color={p.btn} /></View> : null}
            </View>
            {rbotOpen ? (
              <View style={rbotSide ? s.flex : s.rbotBottom}>
                {!rbotSide && showSummary ? summary(false) : null}
                <SwapRbotPanel palette={p} api={api} side={rbotSide} onClose={() => setRbotOpen(false)} />
                {rbotSide && showSummary ? summary(false) : null}
              </View>
            ) : railMode ? summary(true) : showSummary ? summary(false) : (
              <Text style={[s.hint, { color: p.inkSoft }]}>Tap one of your duties to give, then the duties you want from another crew — or ask R'Bot.</Text>
            )}
          </View>
        ) : null}
      </View>

      {me && st.crewB ? (
        <CompareSheet visible={compareOpen} onClose={() => setCompareOpen(false)} palette={p} carrier={carrier}
          onDismiss={() => { const next = afterSheet.current; afterSheet.current = null; next?.(); }}
          meId={me.crewId} othersId={st.crewB} loading={!cmp} mode="swap" picked={picked} submitting={submitting} onSubmit={submit}
          mine={picked ? giveDetails : cmp?.mineTaskDetailList ?? []} others={picked ? takeDetails : cmp?.othersTaskDetailList ?? []}
          overlay={result ? (
            <AppDialog visible onClose={() => setResult(null)} testID="swap-result"
              tone={result.kind === 'sent' ? 'success' : 'warning'} icon={result.kind === 'sent' ? 'send' : 'shield'}
              title={result.kind === 'sent' ? `Request sent to ${result.crewB}` : result.kind === 'illegal' ? 'Swap not allowed' : 'Could not send'}
              message={result.kind === 'sent'
                ? `Legality passed. ${result.crewB} has to accept, then crew control approves. Track it in Swap requests.`
                : result.kind === 'error' ? result.message : undefined}
              confirmLabel={result.kind === 'sent' ? 'View requests' : 'Edit swap'}
              onConfirm={() => (result.kind === 'sent' ? closeAfterSend(() => nav.navigate('DutySwapRecords')) : setResult(null))}
              cancelLabel={result.kind === 'sent' ? 'Done' : undefined}
              onCancel={() => (result.kind === 'sent' ? closeAfterSend() : setResult(null))}>
              {result.kind === 'illegal' ? <RuleList rule={result.rule} /> : null}
            </AppDialog>
          ) : null} />
      ) : null}

      <AppDialog visible={!!disclaimer} onClose={() => { setDisclaimer(null); nav.goBack(); }} tone="neutral" icon="shield"
        title="Before you swap" message={disclaimer ?? ''} dismissable={false} testID="swap-disclaimer"
        cancelLabel="Cancel" onCancel={() => { setDisclaimer(null); nav.goBack(); }}
        confirmLabel="Agree" onConfirm={() => { setDisclaimer(null); dispatch(acceptDisclaimer()); }} />
    </PageShell>
  );
}

export function RuleList({ rule }: { rule: RuleResult }) {
  const p = useCarrier();
  return (
    <View style={[s.rules, { backgroundColor: tint(p.cardSoft, 0.12) }]} testID="swap-rule-list">
      {rule.items.map((r, i) => (
        <View key={i} style={s.ruleItem}>
          {r.ruleId ? (
            <>
              <Text style={[s.ruleTitle, { color: p.cardInk }]}>{r.rule}</Text>
              <Text style={[s.ruleSub, { color: p.cardSoft }]}>
                {r.side === 'Others' ? 'Fails for the other crew' : r.side === 'Mine' ? 'Fails for you' : ''} · {r.from} – {r.to} · Rule {r.ruleId}
              </Text>
            </>
          ) : (
            <Text style={[s.ruleSub, { color: p.cardInk }]}>{r.text}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '700' },
  count: { fontSize: 12, fontWeight: '600' },
  area: { flex: 1, paddingHorizontal: 10 },
  rowLayout: { flexDirection: 'row', gap: 8 },
  rbotBottom: { flex: 1.05 },
  iconChip: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rbotBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  card: { borderRadius: 14, flex: 0, marginTop: 20 },
  msg: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  msgStrong: { fontSize: 16, fontWeight: '700' },
  empty: { position: 'absolute', left: 140, right: 10, top: 80, fontSize: 13, padding: 12, borderRadius: 12, textAlign: 'center' },
  busy: { position: 'absolute', right: 12, top: 12 },
  overlay: { position: 'absolute', left: 12, right: 12, top: 60 },
  hint: { fontSize: 12.5, textAlign: 'center', paddingVertical: 10 },
  searchGap: { gap: 8 },
  half: { flex: 1, minWidth: 0 },
  preview: { borderRadius: 16, overflow: 'hidden' },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 40, borderBottomWidth: StyleSheet.hairlineWidth },
  previewTitle: { fontSize: 14, fontWeight: '800' },
  previewMsg: { padding: 16, marginTop: 20 },
  tray: { marginTop: 8, borderRadius: 16, padding: 10, gap: 8 },
  trayLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trayLabel: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.8 },
  trayCodes: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  trayDelta: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  trayBtns: { flexDirection: 'row', gap: 8 },
  rail: { borderRadius: 14, padding: 12, gap: 12 },
  railInner: { gap: 6, alignItems: 'flex-start' },
  railBtns: { gap: 8, marginTop: 'auto' },
  smallBtn: { height: 40, borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  flexBtn: { flexGrow: 1 },
  smallBtnText: { fontSize: 14, fontWeight: '700' },
  rules: { alignSelf: 'stretch', borderRadius: 10, padding: 10, gap: 8, marginTop: 10 },
  ruleItem: { gap: 2 },
  ruleTitle: { fontSize: 14, fontWeight: '700' },
  ruleSub: { fontSize: 12, lineHeight: 17 },
});
