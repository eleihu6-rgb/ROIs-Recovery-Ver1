import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useStore } from 'react-redux';
import { AppDialog } from '../../../components/v2/AppDialog';
import { Icon } from '../../../components/v2/icons';
import { useLayout } from '../../../components/v2/useLayout';
import { useAppDispatch, useAppSelector, type RootState } from '../../../store';
import { useCarrier } from '../../../theme/carrier';
import { airlineByCode } from '../../auth/airlines';
import { PageShell } from '../../v2/PageShell';
import { useV2Nav } from '../../v2/nav';
import { dutySwapApiFor, ensureDetails, openDutySwap, runSearch, selectDutySwapLive } from '../dutySwapActions';
import { detailFor, emptyFilters, flightRouteOf, kpiDelta, parseRuleMessage, signedHhmm, submitBody, type ApiCompare, type ApiTaskDetail, type SwapDuty, type SwapFilters } from '../dutySwapModel';
import { acceptDisclaimer } from '../dutySwapSlice';
import type { SearchOptions } from '../dutySwapApi';
import { TwinRails, TwinRangeControls } from './TwinRails';
import { TwinReview } from './TwinReview';
import { TwinSearch } from './TwinSearch';
import { moveWindow, type RailZoom } from './twinRailModel';
import { s } from './styles';

/** Concept B owns its draft; switching to A/C/D never changes their selection reducers. */
export function TwinRailScreen({ switcher, actionsInRail = false }: { switcher?: React.ReactNode; actionsInRail?: boolean }): React.JSX.Element {
  const auth = useAppSelector(state => state.auth);
  return <TwinRailSession key={`${auth.airline}:${auth.crewId}`} switcher={switcher} actionsInRail={actionsInRail} />;
}

function TwinRailSession({ switcher, actionsInRail }: { switcher?: React.ReactNode; actionsInRail: boolean }): React.JSX.Element {
  const p = useCarrier(), nav = useV2Nav(), dispatch = useAppDispatch(), store = useStore<RootState>();
  const auth = useAppSelector(state => state.auth), st = useAppSelector(state => state.dutySwap);
  const supported = useAppSelector(selectDutySwapLive);
  const api = useMemo(() => supported ? dutySwapApiFor(auth) : null, [auth, supported]);
  const carrier = airlineByCode(auth.airline).carrier;
  const { wide, tall, height, width } = useLayout();
  const shortScreen = height < 560;
  const canInlineReview = (wide || tall) && !shortScreen;
  const compactTray = canInlineReview || shortScreen || (width < 560 && height < 740);
  const [reviewCollapsed, setReviewCollapsed] = useState(false);
  const [stage, setStage] = useState<'rails' | 'search' | 'review'>('search');
  const rangeInHeader = width >= 700 && width > height && stage === 'rails';
  const [give, setGive] = useState<string[]>([]), [take, setTake] = useState<string[]>([]);
  const [crewB, setCrewB] = useState<string | null>(null), [note, setNote] = useState('');
  const [start, setStart] = useState<string | null>(null);
  const [zoom, setZoom] = useState<RailZoom>(7);
  const [disclaimer, setDisclaimer] = useState<string | null>(null), [disclaimerError, setDisclaimerError] = useState<string | null>(null);
  const [disclaimerReady, setDisclaimerReady] = useState(st.disclaimerAccepted);
  const [compare, setCompare] = useState<{ crewId: string; filters: SwapFilters; data: ApiCompare } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState<string | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [options, setOptions] = useState<SearchOptions | null>(null), [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const sending = useRef(false);
  const [result, setResult] = useState<{ sent: boolean; title: string; message: string } | null>(null);
  const [initialWindow, setInitialWindow] = useState<{ startDate: string; endDate: string } | null>(null);

  useEffect(() => {
    if (!api) return;
    const existing = store.getState().dutySwap.filters;
    if (existing) void runSearch(dispatch, api, emptyFilters(existing.startDate, existing.endDate));
    else void openDutySwap(dispatch, store.getState, api);
  }, [api, dispatch, store]);
  useEffect(() => {
    if (st.filters && !initialWindow) setInitialWindow({ startDate: st.filters.startDate, endDate: st.filters.endDate });
  }, [st.filters, initialWindow]);
  useEffect(() => {
    let live = true;
    if (!api || st.disclaimerAccepted) { setDisclaimerReady(st.disclaimerAccepted); return; }
    api.disclaimer().then(text => {
      if (!live) return;
      setDisclaimerError(null);
      if (text) setDisclaimer(text);
      else { setDisclaimerReady(true); dispatch(acceptDisclaimer()); }
    }).catch(() => { if (live) setDisclaimerError('Could not load the swap disclaimer. Reopen Twin Rail to retry.'); });
    return () => { live = false; };
  }, [api, dispatch, st.disclaimerAccepted]);

  // Refresh details only for the chosen crew; an old response cannot validate a new draft.
  useEffect(() => {
    let live = true;
    setCompare(null); setDetailError(null);
    if (!api || !crewB || !st.filters) { setDetailLoading(false); return; }
    const filters = st.filters, id = crewB;
    setDetailLoading(true);
    api.compare(filters, id).then(data => {
      if (live) setCompare({ crewId: id, filters, data });
    }).catch(() => { if (live) setDetailError('Could not load duty details'); })
      .finally(() => { if (live) setDetailLoading(false); });
    return () => { live = false; };
  }, [api, crewB, st.filters, detailAttempt]);
  useEffect(() => {
    if (!api || stage !== 'search' || !st.filters) return;
    let live = true;
    setOptions(null); setOptionsError(null);
    api.options(st.filters.startDate, st.filters.endDate).then(value => { if (live) setOptions(value); })
      .catch(() => { if (live) setOptionsError('Could not load choices'); });
    return () => { live = false; };
  }, [api, stage, st.filters, optionsAttempt]);

  const me = st.crews[0], others = st.crews.slice(1);
  const other = others.find(c => c.crewId === crewB);
  const giveDuties = me?.duties.filter(d => give.includes(d.key) && d.swappable) ?? [];
  const takeDuties = other?.duties.filter(d => take.includes(d.key) && d.swappable) ?? [];
  const hasPair = giveDuties.length > 0 && takeDuties.length > 0;
  const inlineReview = canInlineReview && hasPair && !reviewCollapsed;
  useEffect(() => { setReviewCollapsed(false); }, [hasPair]);
  const openReview = (): void => {
    if (canInlineReview) setReviewCollapsed(false);
    else setStage('review');
  };
  const cmp = compare?.crewId === crewB && compare.filters === st.filters ? compare.data : undefined;
  const mine = giveDuties.map(d => detailFor(d, cmp?.mineTaskDetailList)).filter((d): d is ApiTaskDetail => !!d);
  const theirs = takeDuties.map(d => detailFor(d, cmp?.othersTaskDetailList)).filter((d): d is ApiTaskDetail => !!d);
  const complete = !!cmp && !!giveDuties.length && !!takeDuties.length && mine.length === giveDuties.length && theirs.length === takeDuties.length;
  const ready = complete && disclaimerReady && st.status === 'ready';
  const delta = complete ? kpiDelta(mine, theirs) : null;
  const clear = (): void => { setGive([]); setTake([]); setCrewB(null); setNote(''); };
  const pick = (d: SwapDuty): void => {
    if (!d.swappable || submitting) return;
    if (d.crewId === me?.crewId) setGive(prev => prev.includes(d.key) ? prev.filter(k => k !== d.key) : [...prev, d.key]);
    else {
      if (crewB !== d.crewId) { setTake([d.key]); setNote(''); }
      else setTake(prev => prev.includes(d.key) ? prev.filter(k => k !== d.key) : [...prev, d.key]);
      setCrewB(d.crewId);
    }
  };
  const from = st.filters?.startDate ?? '', to = st.filters?.endDate ?? '';
  const railStart = from ? moveWindow(start ?? from, 0, zoom, from, to) : '';
  const move = useCallback((days: number): void => { if (from) setStart(prev => moveWindow(prev ?? from, days, zoom, from, to)); }, [from, to, zoom]);
  const visible = useCallback((ids: string[]): void => { if (api) void ensureDetails(dispatch, store.getState, api, ids); }, [api, dispatch, store]);
  const search = (f: SwapFilters): void => {
    clear(); setStart(f.startDate); setStage('rails');
    if (api) void runSearch(dispatch, api, f);
  };
  const submit = async (): Promise<void> => {
    if (!ready || !api || !me || !crewB || !st.filters || sending.current) return;
    sending.current = true; setSubmitting(true);
    try {
      const response = await api.submit(submitBody(me.crewId, crewB, giveDuties, takeDuties, st.filters.swapMode, note));
      if (response.ok) setResult({ sent: true, title: 'Swap request sent', message: `Your request was sent to ${crewB}. Track it in swap requests.` });
      else {
        const rule = parseRuleMessage(response.message);
        setResult({ sent: false, title: rule.items.length ? 'Swap did not pass the check' : 'Could not send request', message: rule.items.length ? rule.items.map(item => item.text).join('\n') : response.message });
      }
    } catch (e) { setResult({ sent: false, title: 'Could not send request', message: e instanceof Error ? e.message : 'Could not reach the crew portal.' }); }
    finally { sending.current = false; setSubmitting(false); }
  };
  const closeResult = (): void => {
    if (result?.sent) { clear(); setStage('search'); if (api) void openDutySwap(dispatch, store.getState, api); }
    setResult(null);
  };
  const review = <TwinReview p={p} crewB={crewB} carrier={carrier} give={giveDuties} take={takeDuties} mine={mine} theirs={theirs} ready={ready}
    loading={detailLoading} error={detailError ?? (cmp && giveDuties.length && takeDuties.length && !complete ? 'Some selected duty details are missing' : null)}
    onRetry={() => setDetailAttempt(n => n + 1)} note={note} setNote={setNote} submitting={submitting} onSubmit={() => { void submit(); }}
    onBack={stage === 'review' ? () => setStage('rails') : inlineReview ? () => setReviewCollapsed(true) : undefined}
    backLabel={stage === 'review' ? 'Back' : 'Hide'} />;
  const button = (label: string, id: string, action: () => void, primary = false, disabled = false): React.JSX.Element => <Pressable key={id} testID={id} onPress={action} disabled={disabled || submitting} style={[s.button, { borderColor: p.btn, backgroundColor: primary ? p.btn : p.cardSolid, opacity: disabled || submitting ? 0.5 : 1 }]}><Text style={[s.buttonText, primary ? s.onPrimary : { color: p.btn }]}>{label}</Text></Pressable>;

  const railActions = !actionsInRail ? <>
    <Pressable testID="twin-records" accessibilityLabel="Swap requests" disabled={submitting} onPress={() => nav.navigate('DutySwapRecords')} style={s.headerAction}><Icon name="history" size={20} color={p.btn} /></Pressable>
    <Pressable testID="twin-my-duties" accessibilityLabel="My duties" disabled={submitting} onPress={() => nav.navigate('DutySwapMyDuties')} style={s.headerAction}><Icon name="lock" size={20} color={p.btn} /></Pressable>
  </> : undefined;
  const rangeAccessory = rangeInHeader && railStart ? <TwinRangeControls p={p} start={railStart} zoom={zoom} onMove={move} onZoom={setZoom} actions={railActions} /> : undefined;
  return <PageShell title="Duty Swap" titleNode={rangeInHeader ? undefined : switcher} headerAccessory={rangeAccessory} layout="full" scroll={false} testID="twin-screen" right={<Pressable testID="twin-search-open" accessibilityRole="button" accessibilityLabel="Search pairing" disabled={submitting} onPress={() => setStage('search')} style={s.headerAction}><Icon name="sliders" size={24} color={p.ink} /></Pressable>}>
    {!api ? <View style={s.center}><Text style={[s.text, { color: p.ink }]}>Duty Swap is not available for this account.</Text></View> : <>
      {disclaimerError ? <Text style={[s.text, s.body, { color: p.ink }]}>{disclaimerError}</Text> : null}
      {stage === 'search' && st.filters ? <TwinSearch p={p} initial={st.filters} defaults={initialWindow ?? st.filters} options={options} optionsError={optionsError} onRetryOptions={() => setOptionsAttempt(n => n + 1)} large={wide} onSearch={search} onClose={() => setStage('rails')} />
        : st.status === 'error' ? <View style={s.center} testID="twin-error"><Text style={[s.title, { color: p.ink }]}>Could not load duties</Text><Text style={[s.text, { color: p.ink }]}>{st.error}</Text>{button('Retry', 'twin-retry', () => { void openDutySwap(dispatch, store.getState, api); })}{button('My duties', 'twin-unlock', () => nav.navigate('DutySwapMyDuties'))}</View>
          : st.status === 'loading' || st.status === 'idle' ? <View style={s.center}><ActivityIndicator color={p.btn} /><Text style={[s.text, { color: p.ink }]}>Loading duties…</Text></View>
            : !me ? <View style={s.center}><Text style={[s.text, { color: p.ink }]}>No duties in this search window.</Text>{button('Search pairing', 'twin-empty-search', () => setStage('search'))}</View>
              : stage === 'review' ? review : <View style={wide && inlineReview ? s.split : s.stacked}>
                  <View style={s.flex} pointerEvents={submitting ? 'none' : 'auto'}><TwinRails p={p} carrier={carrier} me={me} others={others} start={railStart} zoom={zoom} give={give} take={take} crewB={crewB} details={st.details} onPick={pick} onMove={move} onZoom={setZoom} onVisible={visible} controlsInHeader={rangeInHeader} actions={rangeInHeader ? undefined : railActions} />
                    {!inlineReview && compactTray ? <View style={[s.summary, s.compactSummary, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]} testID="twin-tray">
                      <View style={[s.flex, canInlineReview && s.tabletSelection]} testID="twin-compact-selection">
                        <Text numberOfLines={1} style={[s.label, { color: p.cardInk }]}>Give {giveDuties.map(d => d.code).join(', ') || '—'}</Text>
                        <Text numberOfLines={1} style={[s.label, { color: p.cardInk }]}>Take {takeDuties.map(d => d.code).join(', ') || '—'}{crewB ? ` · ${crewB}` : ''}</Text>
                        {ready ? <Text style={[s.label, { color: p.cardInk }]} testID="twin-compact-routes">{routesText(giveDuties, takeDuties, mine, theirs, carrier)}</Text> : null}
                      </View>
                      {button('Clear', 'twin-clear', clear)}
                      {button('Review', 'twin-review-open', openReview, true, !hasPair)}
                    </View> : null}
                    {!inlineReview && !compactTray ? <View style={[s.summary, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]} testID="twin-tray"><Text style={[s.text, { color: p.cardInk }]}>Give {giveDuties.map(d => d.code).join(', ') || '—'}</Text><Text style={[s.text, { color: p.cardInk }]}>Take {takeDuties.map(d => d.code).join(', ') || '—'}{crewB ? ` · ${crewB}` : ''}</Text>{delta ? <Text style={[s.number, { color: p.btn }]}>FDP {signedHhmm(delta.fdp)} · BLH {signedHhmm(delta.blh)} · CRD {signedHhmm(delta.crd)} · DO {delta.dayOff}</Text> : null}<View style={s.row}>{button('Clear', 'twin-clear', clear)}{button('Review swap', 'twin-review-open', () => setStage('review'), true, !giveDuties.length || !takeDuties.length)}</View></View> : null}
                  </View>
                  {inlineReview ? <View style={[s.reviewPane, wide && s.sideReview]} testID="twin-review-pane">{review}{button('Clear selection', 'twin-clear', clear)}</View> : null}
                </View>}
    </>}
    <AppDialog visible={!!disclaimer} title="Duty Swap disclaimer" message={disclaimer ?? ''} dismissable={false} onClose={() => nav.goBack()} confirmLabel="I agree" onConfirm={() => { dispatch(acceptDisclaimer()); setDisclaimerReady(true); setDisclaimer(null); }} testID="twin-disclaimer" />
    <AppDialog visible={!!result} title={result?.title ?? ''} message={result?.message} tone={result?.sent ? 'success' : 'warning'} confirmLabel="OK" onConfirm={closeResult} onClose={closeResult} testID="twin-result" />
  </PageShell>;
}

/** 'Give PR124 MNL-SEA / PR125 SEA-MNL · Take 1HB MNL-MNL' — each selected duty's
 *  flight legs with their airports, in flight order. */
function routesText(give: SwapDuty[], take: SwapDuty[], mine: ApiTaskDetail[], theirs: ApiTaskDetail[], carrier: string): string {
  const side = (label: string, duties: SwapDuty[], list: ApiTaskDetail[]): string | null => {
    const routes = duties.flatMap(d => { const r = flightRouteOf(detailFor(d, list), carrier); return r ? [`${d.code} ${r}`] : []; });
    return routes.length ? `${label} ${routes.join(' / ')}` : null;
  };
  return [side('Give', give, mine), side('Take', take, theirs)].filter(Boolean).join(' · ');
}
