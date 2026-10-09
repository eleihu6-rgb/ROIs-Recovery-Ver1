// Duty Swap · Ticket (Concept C / Trade Ticket). A guided, one-handed flow:
// Give → Want → Match → Send. It deliberately reuses the portal search,
// compare and submit contracts used by Matrix and Market; visual pre-checks are
// helpful warnings, never a substitute for the portal legality check.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from 'react-redux';

import { AppDialog } from '../../../components/v2/AppDialog';
import { Icon } from '../../../components/v2/icons';
import { useLayout } from '../../../components/v2/useLayout';
import { useAppDispatch, useAppSelector, type RootState } from '../../../store';
import { useCarrier } from '../../../theme/carrier';
import { PageShell } from '../../v2/PageShell';
import { useV2Nav } from '../../v2/nav';
import { dutySwapApiFor, ensureDetails, loadOptions, openDutySwap, runSearch } from '../dutySwapActions';
import { dayLabel, detailFor, emptyFilters, kpiDelta, parseRuleMessage, routeOf, signedHhmm, submitBody, type RuleResult, type SwapCrew, type SwapDuty } from '../dutySwapModel';
import { acceptDisclaimer } from '../dutySwapSlice';
import { RuleList } from '../DutySwapScreen';
import { SearchForm } from '../components/SearchForm';
import { tint } from '../components/CrewMatrix';
import { boardOffers, defaultTake, outOfDuties, precheck, precheckLabel, spanLabel, type Offer } from './marketModel';

type Step = 'give' | 'want' | 'match' | 'send';
type Result = { kind: 'sent'; crewB: string } | { kind: 'illegal'; rule: RuleResult } | { kind: 'error'; message: string };

/** One strongest offer per crew, ranked by coverage first then start time. */
export function ticketMatches(others: SwapCrew[], give: SwapDuty | undefined): Offer[] {
  if (!give) return [];
  const byCrew = new Map<string, Offer>();
  for (const offer of boardOffers(others, give, { daysOff: false })) {
    const current = byCrew.get(offer.crewId);
    if (!current || offer.duty.startDt < current.duty.startDt) byCrew.set(offer.crewId, offer);
  }
  return [...byCrew.values()].sort((a, b) => a.duty.startDt.localeCompare(b.duty.startDt) || a.crewId.localeCompare(b.crewId));
}

export function TicketScreen({ switcher, actionsInRail = false }: { switcher?: React.ReactNode; actionsInRail?: boolean } = {}): React.JSX.Element {
  const p = useCarrier(); const nav = useV2Nav(); const dispatch = useAppDispatch(); const store = useStore<RootState>();
  const auth = useAppSelector(s => s.auth); const st = useAppSelector(s => s.dutySwap); const { wide, tall } = useLayout();
  const api = useMemo(() => dutySwapApiFor(auth), [auth]);
  const [step, setStep] = useState<Step>('give'); const [giveKey, setGiveKey] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null); const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false); const [result, setResult] = useState<Result | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);

  useEffect(() => { if (!api) return; void openDutySwap(dispatch, store.getState, api); api.disclaimer().then(t => t ? setDisclaimer(t) : dispatch(acceptDisclaimer())).catch(() => undefined); }, [api, dispatch, store]);
  useEffect(() => { if (api && st.filters && st.status === 'ready') void loadOptions(dispatch, store.getState, api).catch(() => undefined); }, [api, st.filters, st.status, dispatch, store]);

  const me = st.crews[0]; const others = useMemo(() => st.crews.slice(1), [st.crews]);
  const give = outOfDuties(me).find(d => d.key === giveKey) ?? outOfDuties(me)[0];
  const matches = useMemo(() => ticketMatches(others, give), [others, give]);
  const crewB = offer && others.find(c => c.crewId === offer.crewId);
  const compare = offer ? st.details[offer.crewId] : undefined;
  const take = crewB && offer ? defaultTake(crewB, give!, offer.duty) : [];
  const takeDuties = crewB?.duties.filter(d => take.includes(d.key)) ?? [];
  const giveDetails = give ? [detailFor(give, compare?.mineTaskDetailList)].filter(Boolean) : [];
  const takeDetails = takeDuties.map(d => detailFor(d, compare?.othersTaskDetailList)).filter(Boolean);
  const delta = compare && give ? kpiDelta(giveDetails as NonNullable<typeof giveDetails[number]>[], takeDetails as NonNullable<typeof takeDetails[number]>[]) : null;

  const chooseGive = (d: SwapDuty) => { setGiveKey(d.key); setOffer(null); setStep('want'); };
  const find = (f: typeof st.filters extends infer T ? Exclude<T, null> : never) => { if (api) void runSearch(dispatch, api, f); setOffer(null); setStep('match'); };
  const chooseOffer = (o: Offer) => { setOffer(o); setNote(''); if (api) void ensureDetails(dispatch, store.getState, api, [o.crewId]); setStep('send'); };
  const send = async () => {
    if (!api || !me || !crewB || !give || !st.filters) return;
    setSubmitting(true);
    try { const r = await api.submit(submitBody(me.crewId, crewB.crewId, [give], takeDuties, st.filters.swapMode, note));
      if (r.ok) setResult({ kind: 'sent', crewB: crewB.crewId }); else { const rule = parseRuleMessage(r.message); setResult(rule.items.length ? { kind: 'illegal', rule } : { kind: 'error', message: r.message }); }
    } catch (e) { setResult({ kind: 'error', message: e instanceof Error ? e.message : 'Could not reach the crew portal.' }); } finally { setSubmitting(false); }
  };
  if (!api) return <PageShell title="Duty Swap" titleNode={switcher} scroll={false} layout="full"><Empty p={p} text="Sign in with your crew account to swap duties." /></PageShell>;

  const stages = <View style={[s.stages, { backgroundColor: p.frost, borderColor: p.frostLine }]} testID="ticket-stages">
    {(['give', 'want', 'match', 'send'] as Step[]).map((x, i) => <View key={x} style={s.stage}><Text style={[s.stageN, { color: step === x ? p.btn : p.inkSoft }]}>{step === x || ['give', 'want', 'match', 'send'].indexOf(step) > i ? '✓' : i + 1}</Text><Text style={[s.stageText, { color: step === x ? p.btn : p.inkSoft }]}>{x[0].toUpperCase() + x.slice(1)}</Text></View>)}
  </View>;
  const giveBody = <ScrollView contentContainerStyle={s.body} testID="ticket-give"><Text style={[s.h, { color: p.ink }]}>What will you give?</Text><Text style={[s.sub, { color: p.inkSoft }]}>Tap an unlocked duty. Crew control locks stay unavailable.</Text>{outOfDuties(me).map(d => <DutyRow key={d.key} duty={d} p={p} selected={give?.key === d.key} onPress={() => chooseGive(d)} testID={`ticket-give-${d.key}`} />)}{!outOfDuties(me).length && <Empty p={p} text="Unlock a duty in My duties before starting a ticket." />}</ScrollView>;
  const wantBody = st.filters ? <SearchForm palette={p} crewId={auth.crewId ?? ''} initial={st.filters} defaults={{ startDate: st.filters.startDate, endDate: st.filters.endDate }} options={st.options} twoColumns={wide || tall} onSearch={find} resultLabel={`${others.length} crew`} /> : <Empty p={p} text="Loading the available swap window…" />;
  const matchBody = <ScrollView contentContainerStyle={s.body} testID="ticket-matches"><Text style={[s.h, { color: p.ink }]}>Matches</Text><Text style={[s.sub, { color: p.inkSoft }]}>For {give?.code ?? 'your duty'} · {matches.length} crew</Text>{matches.map((o, i) => <MatchRow key={o.key} offer={o} index={i} mine={give} detail={detailFor(o.duty, st.details[o.crewId]?.othersTaskDetailList)} mineDetail={detailFor(give!, st.details[o.crewId]?.mineTaskDetailList)} p={p} onPress={() => chooseOffer(o)} />)}{st.status === 'loading' && <ActivityIndicator color={p.btn} />}{!matches.length && st.status !== 'loading' && <Empty p={p} text="No matching published duty. Change what you want or pick another duty." />}</ScrollView>;
  const ticket = offer && crewB && give ? <Ticket p={p} me={me} give={give} crewB={crewB} take={takeDuties} delta={delta} note={note} setNote={setNote} submitting={submitting} onSend={send} /> : <Empty p={p} text="Choose a match to build your swap ticket." />;
  const content = step === 'give' ? giveBody : step === 'want' ? wantBody : step === 'match' ? matchBody : ticket;
  return <PageShell title="Duty Swap" titleNode={switcher} scroll={false} layout="full" testID="ticket-screen" right={actionsInRail ? undefined : <Pressable onPress={() => nav.navigate('DutySwapRecords')} testID="swap-records"><Icon name="history" size={22} color={p.ink} /></Pressable>}>
    <View style={[s.flex, wide && s.wide]}>{wide ? <View style={s.left}>{stages}{content}</View> : <View style={s.flex}>{stages}{content}</View>}{wide ? <View style={[s.ticketPane, { backgroundColor: p.cardSolid }]}>{ticket}</View> : null}</View>
    <AppDialog visible={!!disclaimer} onClose={() => setDisclaimer(null)} tone="neutral" icon="shield" title="Before you swap" message={disclaimer ?? ''} dismissable={false} confirmLabel="Agree" onConfirm={() => { setDisclaimer(null); dispatch(acceptDisclaimer()); }} cancelLabel="Cancel" onCancel={() => { setDisclaimer(null); nav.goBack(); }} />
    {result ? <AppDialog visible onClose={() => setResult(null)} tone={result.kind === 'sent' ? 'success' : 'warning'} icon={result.kind === 'sent' ? 'send' : 'shield'} title={result.kind === 'sent' ? `Request sent to ${result.crewB}` : result.kind === 'illegal' ? 'Swap not allowed' : 'Could not send'} message={result.kind === 'sent' ? `Legality passed. ${result.crewB} must accept before crew control approves.` : result.kind === 'error' ? result.message : undefined} confirmLabel={result.kind === 'sent' ? 'View requests' : 'Edit ticket'} onConfirm={() => result.kind === 'sent' ? nav.navigate('DutySwapRecords') : setResult(null)}>{result.kind === 'illegal' ? <RuleList rule={result.rule} /> : null}</AppDialog> : null}
  </PageShell>;
}

function DutyRow({ duty, p, selected, onPress, testID }: { duty: SwapDuty; p: ReturnType<typeof useCarrier>; selected: boolean; onPress: () => void; testID: string }) { const d = dayLabel(duty.startDt); return <Pressable onPress={onPress} testID={testID} style={[s.row, { backgroundColor: p.cardSolid, borderColor: selected ? p.btn : p.cardLine }]}><View style={s.date}><Text style={[s.dateN, { color: p.cardInk }]}>{d.day}</Text><Text style={[s.dateD, { color: p.cardSoft }]}>{d.month}</Text></View><View style={s.flex}><Text style={[s.code, { color: p.cardInk }]}>{duty.code}</Text><Text style={[s.sub, { color: p.cardSoft }]}>{spanLabel(duty)}</Text></View><Icon name="chev" size={18} color={p.btn} /></Pressable>; }
function MatchRow({ offer, index, mine, detail, mineDetail, p, onPress }: { offer: Offer; index: number; mine: SwapDuty | undefined; detail: ReturnType<typeof detailFor>; mineDetail: ReturnType<typeof detailFor>; p: ReturnType<typeof useCarrier>; onPress: () => void }) { const c = precheck(detail, mineDetail); const warn = !!c && (c.fleetDiffers || c.rankDiffers); return <Pressable onPress={onPress} testID={`ticket-match-${offer.crewId}`} style={[s.row, { backgroundColor: p.cardSolid, borderColor: warn ? p.btn : p.cardLine }]}><View style={s.flex}><Text style={[s.match, { color: p.inkSoft }]}>#{index + 1} match · {offer.crewId}</Text><Text style={[s.code, { color: p.cardInk }]}>{offer.duty.code}</Text><Text style={[s.sub, { color: p.cardSoft }]}>{spanLabel(offer.duty)} · {routeOf(detail) ?? 'Published duty'}</Text><Text style={[s.reason, { color: warn ? p.btn : p.inkSoft }]}>{warn ? `Likely to fail · ${precheckLabel(c!)}` : `Overlaps ${mine?.code ?? 'your selected duty'} · ${precheckLabel(c ?? { rank: null, fleets: [], rankDiffers: false, fleetDiffers: false }) || 'details loading'}`}</Text></View><Icon name="chev" size={18} color={p.btn} /></Pressable>; }
function Ticket({ p, me, give, crewB, take, delta, note, setNote, submitting, onSend }: { p: ReturnType<typeof useCarrier>; me: SwapCrew; give: SwapDuty; crewB: SwapCrew; take: SwapDuty[]; delta: ReturnType<typeof kpiDelta> | null; note: string; setNote: (x: string) => void; submitting: boolean; onSend: () => void }) { return <ScrollView contentContainerStyle={s.ticket} testID="swap-ticket"><Text style={[s.over, { color: p.btn }]}>SWAP TICKET</Text><Text style={[s.ticketTitle, { color: p.cardInk }]}>{me.crewId} ⇄ {crewB.crewId}</Text><Text style={[s.over, { color: p.cardSoft }]}>YOU GIVE</Text><Text style={[s.code, { color: p.cardInk }]}>{give.code}</Text><Text style={[s.sub, { color: p.cardSoft }]}>{spanLabel(give)}</Text><View style={[s.perf, { borderColor: p.cardLine }]} /><Text style={[s.over, { color: p.cardSoft }]}>YOU TAKE FROM {crewB.crewId}</Text>{take.map(d => <View key={d.key}><Text style={[s.code, { color: p.cardInk }]}>{d.code}</Text><Text style={[s.sub, { color: p.cardSoft }]}>{spanLabel(d)}</Text></View>)}{delta ? <View style={[s.delta, { backgroundColor: tint(p.btn, .08) }]}>{([['FDP', signedHhmm(delta.fdp)], ['BLH', signedHhmm(delta.blh)], ['CREDIT', signedHhmm(delta.crd)], ['DO', String(delta.dayOff)]] as const).map(([k,v]) => <View key={k}><Text style={[s.over, { color: p.cardSoft }]}>{k}</Text><Text style={[s.deltaV, { color: p.btn }]}>{v}</Text></View>)}</View> : <ActivityIndicator color={p.btn} />}<TextInput value={note} onChangeText={setNote} placeholder={`Note for ${crewB.crewId} (optional)`} placeholderTextColor={p.cardSoft} multiline style={[s.input, { color: p.cardInk, borderColor: p.cardLine }]} testID="ticket-note"/><Pressable onPress={onSend} disabled={submitting} testID="ticket-send" style={[s.send, { backgroundColor: p.btn, opacity: submitting ? .5 : 1 }]}>{submitting ? <ActivityIndicator color="#fff"/> : <><Icon name="shield" size={18} color="#fff"/><Text style={s.sendText}>Check legality & send</Text></>}</Pressable></ScrollView>; }
function Empty({ p, text }: { p: ReturnType<typeof useCarrier>; text: string }) { return <View style={s.empty}><Icon name="ticket" size={28} color={p.cardSoft}/><Text style={[s.sub, { color: p.cardSoft }]}>{text}</Text></View>; }
const s = StyleSheet.create({ flex:{flex:1,minWidth:0}, wide:{flexDirection:'row',gap:10}, left:{flex:1,minWidth:0}, ticketPane:{width:'47%',borderRadius:18,overflow:'hidden'}, stages:{flexDirection:'row',borderWidth:1,borderRadius:18,padding:4,margin:12,gap:2}, stage:{flex:1,alignItems:'center',gap:2}, stageN:{fontSize:13,fontWeight:'800'}, stageText:{fontSize:10,fontWeight:'700'}, body:{padding:14,gap:10}, h:{fontSize:21,fontWeight:'800'}, sub:{fontSize:12,fontWeight:'500',lineHeight:17}, row:{flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderRadius:14,padding:12}, date:{width:36,alignItems:'center'}, dateN:{fontSize:18,fontWeight:'800'}, dateD:{fontSize:9,fontWeight:'700',textTransform:'uppercase'}, code:{fontSize:15,fontWeight:'800'}, match:{fontSize:11,fontWeight:'800'}, reason:{fontSize:11,fontWeight:'700',marginTop:3}, empty:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:10}, ticket:{padding:18,gap:9}, over:{fontSize:10,fontWeight:'800',letterSpacing:.8}, ticketTitle:{fontSize:19,fontWeight:'800'}, perf:{borderTopWidth:1,borderStyle:'dashed',marginVertical:5}, delta:{flexDirection:'row',justifyContent:'space-between',padding:12,borderRadius:14,marginTop:4}, deltaV:{fontSize:14,fontWeight:'800'}, input:{minHeight:48,borderWidth:1,borderRadius:12,padding:12,fontSize:14,marginTop:4}, send:{height:50,borderRadius:25,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,marginTop:4}, sendText:{color:'#fff',fontSize:15,fontWeight:'800'} });
