// Ticket uses the same portal search, compare and submit contracts as Matrix.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from 'react-redux';

import { AppDialog } from '../../../components/v2/AppDialog';
import { Icon } from '../../../components/v2/icons';
import { useLayout } from '../../../components/v2/useLayout';
import { useAppDispatch, useAppSelector, type RootState } from '../../../store';
import { colors, font, radius, space } from '../../../theme';
import { useCarrier } from '../../../theme/carrier';
import { RBOT_ENTRY_WIDTH } from '../../rbot/RBotEntry';
import { PageShell } from '../../v2/PageShell';
import { useV2Nav } from '../../v2/nav';
import { dutySwapApiFor, ensureDetails, loadOptions, openDutySwap, runSearch } from '../dutySwapActions';
import { dayLabel, detailFor, flightRouteOf, kpiDelta, parseRuleMessage, routeOf, signedHhmm, submitBody, validateFilters, type ApiCompare, type ApiTaskDetail, type RuleResult, type SwapCrew, type SwapDuty, type SwapFilters } from '../dutySwapModel';
import { acceptDisclaimer } from '../dutySwapSlice';
import { RuleList } from '../DutySwapScreen';
import { tint } from '../components/CrewMatrix';
import { SearchForm } from '../components/SearchForm';
import {
  boardOffers, defaultTake, flightLine, outOfDuties, parseWants, savedWantFor, wantLabel, wantStoreKey,
  type Offer, type SavedWants,
} from './marketModel';

type Step = 'give' | 'want' | 'match' | 'send';
const STEPS: Step[] = ['give', 'want', 'match', 'send'];
const LABELS = ['Give', 'Want', 'Pick', 'Send'];
type Result = { kind: 'sent'; crewB: string } | { kind: 'illegal'; rule: RuleResult } | { kind: 'error'; message: string };
type Palette = ReturnType<typeof useCarrier>;
/** The date column's width, so rows under a card start with their flight numbers. */
const DATE_COL = 52;

/** One candidate per crew across all offered duties, ordered by start time. */
export function ticketMatches(others: SwapCrew[], give: SwapDuty | SwapDuty[] | undefined): Offer[] {
  const duties = !give ? [] : Array.isArray(give) ? give : [give];
  const byCrew = new Map<string, Offer>();
  for (const d of duties) for (const offer of boardOffers(others, d, { daysOff: false })) {
    if (duties.some(mine => mine.id === offer.duty.id && mine.isGround === offer.duty.isGround)) continue;
    const current = byCrew.get(offer.crewId);
    if (!current || offer.duty.startDt < current.duty.startDt) byCrew.set(offer.crewId, offer);
  }
  return [...byCrew.values()].sort((a, b) => a.duty.startDt.localeCompare(b.duty.startDt) || a.crewId.localeCompare(b.crewId));
}

/** Review and submission share this exact bundle; each duty appears once. */
export function ticketTake(crew: SwapCrew, give: SwapDuty[], offer: Offer): SwapDuty[] {
  const keys = new Set(give.flatMap(d => defaultTake(crew, d, offer.duty)));
  return crew.duties.filter(d => keys.has(d.key));
}

export function TicketScreen(props: { switcher?: React.ReactNode; actionsInRail?: boolean } = {}): React.JSX.Element {
  const auth = useAppSelector(s => s.auth);
  // Account changes discard the entire local draft, including pending dialogs.
  return <TicketFlow key={`${auth.airline}:${auth.crewId}`} {...props} />;
}

function TicketFlow({ switcher, actionsInRail = false }: { switcher?: React.ReactNode; actionsInRail?: boolean }): React.JSX.Element {
  const p = useCarrier(); const nav = useV2Nav(); const dispatch = useAppDispatch(); const store = useStore<RootState>();
  const auth = useAppSelector(s => s.auth); const st = useAppSelector(s => s.dutySwap); const { wide, tall } = useLayout();
  const api = useMemo(() => dutySwapApiFor(auth), [auth]);
  const [step, setStep] = useState<Step>('give');
  // Target filters may remove my duties from the response. Retain the explicit
  // selection, rather than silently substituting another duty after a search.
  const [give, setGive] = useState<SwapDuty[]>([]);
  const [draft, setDraft] = useState<SwapFilters | null>(null);
  const [wants, setWants] = useState<SavedWants>({});
  const [offer, setOffer] = useState<Offer | null>(null); const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false); const [result, setResult] = useState<Result | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [compared, setCompared] = useState<Record<string, ApiCompare>>({});

  useEffect(() => { if (!api) return; void openDutySwap(dispatch, store.getState, api); api.disclaimer().then(t => t ? setDisclaimer(t) : dispatch(acceptDisclaimer())).catch(() => undefined); }, [api, dispatch, store]);
  useEffect(() => { if (api && st.filters && st.status === 'ready') void loadOptions(dispatch, store.getState, api).catch(() => undefined); }, [api, st.filters, st.status, dispatch, store]);
  // Saved wants are per duty on this phone; the airline keeps PR and TG apart.
  useEffect(() => {
    let live = true;
    if (!auth.crewId) { setWants({}); return () => { live = false; }; }
    AsyncStorage.getItem(wantStoreKey(auth.airline, auth.crewId))
      .then(v => { if (live) setWants(parseWants(v)); })
      .catch(() => { if (live) setWants({}); });
    return () => { live = false; };
  }, [auth.airline, auth.crewId]);
  // A compare with any candidate also carries my detailed duties. Preload a small
  // leading set so Give and Want can show my airports immediately. Pick separately
  // loads only its actual matches instead of reading hundreds of cabin-crew rows.
  useEffect(() => {
    if (!api || st.status !== 'ready' || !st.filters) return;
    void ensureDetails(dispatch, store.getState, api, st.crews.filter(c => c.crewId !== auth.crewId).slice(0, 8).map(c => c.crewId));
  }, [api, auth.crewId, st.status, st.filters, st.crews, dispatch, store]);
  // PR can answer a self-compare; TG Handshake cannot, but every candidate compare
  // contains the same signed-in crew side. Use either source for Give and Want.
  const allCompared = { ...compared, ...st.details };
  const myCompare = auth.crewId
    ? allCompared[auth.crewId] ?? Object.values(allCompared).find(c => c.mineTaskDetailList?.length)
    : undefined;
  const mine = myCompare?.mineTaskDetailList ?? [];
  const filters = draft ?? st.filters;
  const others = useMemo(() => st.crews.slice(1), [st.crews]);
  const choices = [...new Map([...give, ...outOfDuties(st.crews[0])].map(d => [d.key, d])).values()];
  const matches = useMemo(() => st.status === 'ready' ? ticketMatches(others, give) : [], [others, give, st.status]);
  // Pick lists each candidate's duties, so their routes need the same detail read
  // the Matrix does once results land (each crew is fetched once per search).
  useEffect(() => {
    if (!api || st.status !== 'ready' || step !== 'match') return;
    const ids = matches.map(o => o.crewId);
    if (ids.length) void ensureDetails(dispatch, store.getState, api, ids);
  }, [api, st.status, step, matches, dispatch, store]);
  // Keep each crew's compare per session so Send can name the airports of the duties
  // it takes, even for a candidate whose card was never opened.
  useEffect(() => {
    const fresh = Object.fromEntries(Object.entries(st.details).filter(([id]) => !compared[id]));
    if (Object.keys(fresh).length) setCompared(prev => ({ ...prev, ...fresh }));
  }, [st.details, compared]);
  const crewB = offer ? others.find(c => c.crewId === offer.crewId) : undefined;
  const take = crewB && offer ? ticketTake(crewB, give, offer) : [];
  const compare = offer ? (st.details[offer.crewId] ?? compared[offer.crewId]) : undefined;
  /** A candidate's records for the Pick cards and the Send take list. */
  const compareOthers = (crewId: string): ApiTaskDetail[] | undefined => (st.details[crewId] ?? compared[crewId])?.othersTaskDetailList;
  const giveDetails = give.flatMap(d => { const detail = detailFor(d, compare?.mineTaskDetailList); return detail ? [detail] : []; });
  const takeDetails = take.flatMap(d => { const detail = detailFor(d, compare?.othersTaskDetailList); return detail ? [detail] : []; });
  const delta = compare && giveDetails.length === give.length && takeDetails.length === take.length ? kpiDelta(giveDetails, takeDetails) : null;
  const index = STEPS.indexOf(step);
  // A changed selection starts Want from the saved want (or the bare window),
  // never from edits made for the previous selection.
  const chooseGive = (d: SwapDuty) => { setGive(prev => prev.some(x => x.key === d.key) ? prev.filter(x => x.key !== d.key) : [...prev, d]); setDraft(null); setOffer(null); };
  const saveWant = (f: SwapFilters) => {
    if (!auth.crewId || !give.length) return;
    const next = { ...wants };
    for (const d of give) next[d.key] = f;
    setWants(next);
    AsyncStorage.setItem(wantStoreKey(auth.airline, auth.crewId), JSON.stringify(next)).catch(() => undefined);
  };
  const find = (f: SwapFilters) => { if (!api || validateFilters(f) || !give.length) return; setDraft(f); setOffer(null); setStep('match'); void runSearch(dispatch, api, f); };
  const chooseOffer = (o: Offer) => { if (offer?.crewId !== o.crewId) setNote(''); setOffer(o); if (api) void ensureDetails(dispatch, store.getState, api, [o.crewId]); };
  const send = async () => {
    if (!api || !crewB || !give.length || !take.length || !st.filters || submitting || st.status !== 'ready') return;
    setSubmitting(true);
    try {
      const r = await api.submit(submitBody(auth.crewId!, crewB.crewId, give, take, st.filters.swapMode, note));
      if (r.ok) setResult({ kind: 'sent', crewB: crewB.crewId });
      else { const rule = parseRuleMessage(r.message); setResult(rule.items.length ? { kind: 'illegal', rule } : { kind: 'error', message: r.message }); }
    } catch (e) { setResult({ kind: 'error', message: e instanceof Error ? e.message : 'Could not reach the crew portal.' }); }
    finally { setSubmitting(false); }
  };
  const canNext = !submitting && (step === 'give' ? give.length > 0 : step === 'want' ? !!filters && !validateFilters(filters) : !!offer && !!take.length && st.status === 'ready');
  const next = () => {
    if (!canNext) return;
    if (step === 'want' && filters) find(filters);
    else if (step === 'give') {
      if (!draft) { const saved = savedWantFor(give, wants); if (saved) setDraft(saved); }
      setStep('want');
    } else if (step === 'send') void send();
    else setStep(STEPS[index + 1]);
  };
  const back = () => { if (index === 0) nav.goBack(); else setStep(STEPS[index - 1]); };


  const summary = <DutyGroup title="You give" icon="give" duties={give} p={p} testID="ticket-selected-give" details={mine} />;
  const currentWant = savedWantFor(give, wants);
  if (!api) return <PageShell title="Duty Swap" titleNode={switcher} scroll={false} layout="full"><Empty p={p} text="Sign in with your crew account to swap duties." /></PageShell>;

  return <PageShell title="Duty Swap" titleNode={switcher} scroll={false} layout="full" testID="ticket-screen" right={actionsInRail ? undefined : <Pressable onPress={() => nav.navigate('DutySwapRecords')} testID="swap-records" accessibilityLabel="Swap requests"><Icon name="history" size={22} color={p.ink} /></Pressable>}>
    <View style={s.flex}>
      <View style={[s.stages, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]} testID="ticket-stages">
        {STEPS.map((x, i) => <View key={x} testID={`ticket-stage-${x}`} accessibilityLabel={`Step ${i + 1} of 4, ${LABELS[i]}${step === x ? ', current' : ''}`} style={[s.stage, step === x && { backgroundColor: p.btn }]}>
          <Text style={[s.stageN, { color: step === x ? colors.onPrimary : p.cardInk }]}>{i + 1}</Text>
          <Text style={[s.stageText, { color: step === x ? colors.onPrimary : p.cardSoft }]}>{LABELS[i]}</Text>
        </View>)}
      </View>
      {step === 'give' ? <ScrollView contentContainerStyle={s.body} testID="ticket-give">
        <Text style={[s.h, { color: p.ink }]}>What will you give?</Text>
        <Text style={[s.sub, { color: p.inkSoft }]}>Select one or more unlocked duties, then choose what you want. A saved want comes back with its duty.</Text>
        <Text style={[s.code, { color: p.ink }]}>{give.length} selected</Text>
        {choices.map(d => {
          const on = give.some(x => x.key === d.key);
          return <Pressable key={d.key} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => chooseGive(d)} testID={`ticket-give-${d.key}`} style={[s.dutyCard, { backgroundColor: p.cardSolid, borderColor: on ? p.btn : p.cardLine }]}>
            <DutyCard duty={d} p={p} details={mine} action={<View style={[s.checkbox, { borderColor: p.btn }]}>{on ? <Icon name="check" size={18} color={p.btn} /> : null}</View>} />
            {wants[d.key] ? <View testID={`ticket-want-${d.key}`} style={[s.wantChip, { borderColor: tint(p.btn, 0.35), marginLeft: DATE_COL }]}><Icon name="star" size={11} color={p.btn} /><Text style={[s.wantText, { color: p.btn }]} numberOfLines={1}>{wantLabel(wants[d.key])}</Text></View> : null}
          </Pressable>;
        })}
        {st.status === 'loading' ? <ActivityIndicator color={p.ink} /> : st.error ? <Empty p={p} text={st.error} /> : !choices.length ? <Empty p={p} text="Unlock a duty in My duties before starting a match." /> : null}
        {!choices.length && st.status !== 'loading' ? <Pressable style={[s.row, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]} onPress={() => nav.navigate('DutySwapMyDuties')} testID="ticket-my-duties"><Text style={[s.code, { color: p.cardInk }]}>Open My duties</Text><Icon name="chev" size={18} color={p.btn} /></Pressable> : null}
      </ScrollView> : step === 'want' ? filters ? <SearchForm palette={p} crewId={auth.crewId ?? ''} initial={filters} defaults={{ startDate: st.filters!.startDate, endDate: st.filters!.endDate }} options={st.options} twoColumns={wide || tall} onChange={setDraft} onSearch={find} onSaveWant={saveWant} savedWant={currentWant} leadingContent={summary} externalNavigation /> : <Empty p={p} text="Loading the available swap window…" /> : step === 'match' ? <View style={[s.flex, wide && s.columns]}>
        {wide ? <ScrollView style={s.summaryPane} contentContainerStyle={s.body}>{summary}</ScrollView> : null}
        <ScrollView style={s.flex} contentContainerStyle={s.body} testID="ticket-matches">
          {!wide ? summary : null}
          <View style={[s.titleRow, { alignItems: 'center' }]} testID="ticket-take-title"><Icon name="take" size={20} color={p.ink} testID="ticket-icon-take" /><Text style={[s.h, { color: p.ink }]}>You take</Text></View><Text style={[s.sub, { color: p.inkSoft }]}>Choose a crew to review · {matches.length} matches</Text>
          {matches.map(o => {
            const picked = offer?.crewId === o.crewId;
            return <Pressable key={o.crewId} onPress={() => chooseOffer(o)} testID={`ticket-match-${o.crewId}`} accessibilityRole="radio" accessibilityState={{ selected: picked }} style={[s.candidate, { backgroundColor: p.cardSolid, borderColor: picked ? p.btn : p.cardLine }]}>
              <View style={s.rowTitle}><Text style={[s.code, s.flex, { color: p.cardInk }]}>From {o.crewId}</Text>{picked ? <Icon name="check" size={20} color={p.btn} /> : null}</View>
              {ticketTake(others.find(c => c.crewId === o.crewId)!, give, o).map(d => <DutyCard key={d.key} duty={d} p={p} details={compareOthers(o.crewId)} />)}
            </Pressable>;
          })}
          {st.status === 'loading' ? <ActivityIndicator color={p.ink} /> : st.error ? <Empty p={p} text={st.error} /> : !matches.length ? <Empty p={p} text="No matching published duties. Go back to change your filters or the duties you give." /> : null}
        </ScrollView>
      </View> : offer && crewB ? <ScrollView contentContainerStyle={s.body} testID="swap-ticket">
        <Text style={[s.h, { color: p.ink }]}>Review your swap</Text>
        <Text style={[s.sub, { color: p.inkSoft }]}>{auth.crewId} ⇄ {crewB.crewId}</Text>
        <View style={[s.groups, (wide || tall) && s.columns]}><View style={(wide || tall) ? s.group : undefined}>{summary}</View><View style={(wide || tall) ? s.group : undefined}><DutyGroup title={`You take from ${crewB.crewId}`} icon="take" duties={take} p={p} testID="ticket-selected-take" details={compareOthers(crewB.crewId)} /></View></View>
        {delta ? <View style={[s.delta, { backgroundColor: p.cardSolid }]}>{([['FDP', signedHhmm(delta.fdp)], ['BLH', signedHhmm(delta.blh)], ['CREDIT', signedHhmm(delta.crd)], ['DO', String(delta.dayOff)]] as const).map(([k,v]) => <View key={k}><Text style={[s.over, { color: p.cardSoft }]}>{k}</Text><Text style={[s.code, { color: p.btn }]}>{v}</Text></View>)}</View> : <Text style={[s.sub, { color: p.inkSoft }]}>Credit comparison unavailable until all duty details are loaded. Legality is checked when you send.</Text>}
        <TextInput value={note} onChangeText={setNote} placeholder={`Note for ${crewB.crewId} (optional)`} placeholderTextColor={p.cardSoft} multiline style={[s.input, { backgroundColor: p.cardSolid, color: p.cardInk, borderColor: p.cardLine }]} testID="ticket-note" />
      </ScrollView> : <Empty p={p} text="Go back and choose a match to build your swap request." />}
      <View style={[s.footer, { paddingRight: actionsInRail ? space.sm8 : (wide ? space.xxl32 * 2 : RBOT_ENTRY_WIDTH + space.xl24) + space.sm8 }]}>
        <Pressable disabled={submitting} onPress={back} testID="ticket-back" accessibilityLabel={index ? `Back to ${LABELS[index - 1]}` : 'Back to previous page'} style={[s.button, s.back, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]}><Icon name="back" size={18} color={p.cardInk} /><Text style={[s.code, { color: p.cardInk }]}>Back</Text></Pressable>
        <Pressable disabled={!canNext} onPress={next} testID={step === 'send' ? 'ticket-send' : 'ticket-next'} style={[s.button, s.flex, { backgroundColor: p.btn, opacity: canNext ? 1 : .45 }]}>{submitting ? <ActivityIndicator color={colors.onPrimary} /> : <><Text style={[s.code, { color: colors.onPrimary }]}>{step === 'send' ? 'Check legality & send' : step === 'want' ? 'Find matches' : `Next: ${LABELS[index + 1]}`}</Text><Icon name={step === 'send' ? 'shield' : 'chev'} size={18} color={colors.onPrimary} /></>}</Pressable>
      </View>
    </View>
    <AppDialog visible={!!disclaimer} onClose={() => setDisclaimer(null)} tone="neutral" icon="shield" title="Before you swap" message={disclaimer ?? ''} dismissable={false} confirmLabel="Agree" onConfirm={() => { setDisclaimer(null); dispatch(acceptDisclaimer()); }} cancelLabel="Cancel" onCancel={() => { setDisclaimer(null); nav.goBack(); }} />
    {result ? <AppDialog visible onClose={() => setResult(null)} tone={result.kind === 'sent' ? 'success' : 'warning'} icon={result.kind === 'sent' ? 'send' : 'shield'} title={result.kind === 'sent' ? `Request sent to ${result.crewB}` : result.kind === 'illegal' ? 'Swap not allowed' : 'Could not send'} message={result.kind === 'sent' ? `Legality passed. ${result.crewB} must accept before crew control approves.` : result.kind === 'error' ? result.message : undefined} confirmLabel={result.kind === 'sent' ? 'View requests' : 'Edit request'} onConfirm={() => result.kind === 'sent' ? nav.navigate('DutySwapRecords') : setResult(null)}>{result.kind === 'illegal' ? <RuleList rule={result.rule} /> : null}</AppDialog> : null}
  </PageShell>;
}

/** One duty, one shape in every step: the big date on the left; on the right the
 *  flight numbers, then `dep → [arr day] time · airports` underneath. */
function DutyCard({ duty, p, details, action }: { duty: SwapDuty; p: Palette; details?: ApiTaskDetail[]; action?: React.ReactNode }) {
  const day = dayLabel(duty.startDt);
  // Compare records are keyed by pairing, and the portal's "mine" side can carry
  // another crew's id; read this duty's own record, else a same-code one.
  const own = details ? detailFor(duty, details) ?? details.find(t => flightRouteOf(t)?.startsWith(`${duty.code} `)) : undefined;
  const route = duty.kind === 'fly' ? (own ? routeOf(own) : null) : null;
  return <View testID={`ticket-duty-${duty.key}`} style={s.dutyRow}>
    <View style={s.dateCol}><Text style={[s.dateDay, { color: p.cardInk }]}>{day.day}</Text><Text style={[s.dateDow, { color: p.cardSoft }]}>{day.month}</Text></View>
    <View style={s.flex}>
      <Text style={[s.code, { color: p.cardInk }]} numberOfLines={1}>{duty.code}</Text>
      <Text style={[s.sub, { color: p.cardSoft }]} numberOfLines={1}>{flightLine(duty, route)}</Text>
    </View>
    {action}
  </View>;
}
function DutyGroup({ title, icon, duties, p, testID, details }: { title: string; icon?: 'give' | 'take'; duties: SwapDuty[]; p: Palette; testID?: string; details?: ApiTaskDetail[] }) {
  return <View testID={testID} style={[s.group, s.summaryCard, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]}><View style={[s.titleRow, { marginBottom: space.sm8 }]}>{icon ? <TitleIcon name={icon} color={p.cardInk} /> : null}<Text style={[s.over, s.flex, { color: p.cardSoft }]}>{title}</Text></View>{duties.map(d => <DutyCard key={d.key} duty={d} p={p} details={details} />)}</View>;
}
function TitleIcon({ name, color }: { name: 'give' | 'take'; color: string }) {
  return <View testID={`ticket-icon-${name}`} accessibilityLabel={name === 'give' ? 'You give' : 'You take'} style={[s.titleIcon, { backgroundColor: tint(color, 0.12) }]}><Icon name={name} size={15} color={color} /></View>;
}
function Empty({ p, text }: { p: Palette; text: string }) { return <View style={s.empty}><Icon name="ticket" size={28} color={p.ink} /><Text style={[s.sub, { color: p.ink }]}>{text}</Text></View>; }
const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, minHeight: 0 }, columns: { flexDirection: 'row', gap: space.md12 },
  stages: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.lg, padding: space.xs4, margin: space.sm8 },
  stage: { flex: 1, alignItems: 'center', paddingVertical: space.sm8, gap: space.xs4, borderRadius: radius.md },
  stageN: { ...font.bodyStrong }, stageText: { ...font.caption },
  body: { padding: space.md12, gap: space.md12 }, h: { ...font.h2, fontWeight: '700' }, sub: { ...font.sub }, code: { ...font.bodyStrong, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm8, borderWidth: 1, borderRadius: radius.md, padding: space.md12 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
  titleIcon: { width: space.xl24, height: space.xl24, borderRadius: radius.op, alignItems: 'center', justifyContent: 'center' },
  candidate: { borderWidth: 1, borderRadius: radius.md, padding: space.md12, gap: space.md12 },
  checkbox: { width: space.xl24, height: space.xl24, borderWidth: 1, borderRadius: radius.op, alignItems: 'center', justifyContent: 'center' },
  dutyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md12, paddingVertical: space.sm8 },
  dutyCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, padding: space.md12 },
  dateCol: { width: DATE_COL - space.md12, alignItems: 'flex-start' },
  dateDay: { ...font.h2 }, dateDow: { ...font.caption },
  wantChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs4, alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm8, paddingVertical: 2, marginTop: space.xs4 },
  wantText: { ...font.caption, fontWeight: '700', flexShrink: 1 },
  groups: { gap: space.md12 }, group: { flexGrow: 1, flexBasis: 0, minWidth: 0 }, summaryCard: { borderWidth: 1, borderRadius: radius.md, padding: space.md12 }, summaryPane: { flex: 1 },
  empty: { alignItems: 'center', padding: space.xl24, gap: space.sm8 }, over: { ...font.overline },
  delta: { flexDirection: 'row', justifyContent: 'space-between', padding: space.md12, borderRadius: radius.md },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, padding: space.md12, ...font.body },
  footer: { flexDirection: 'row', gap: space.sm8, padding: space.sm8 },
  button: { minHeight: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm8, paddingHorizontal: space.md12 }, back: { borderWidth: 1 },
});
