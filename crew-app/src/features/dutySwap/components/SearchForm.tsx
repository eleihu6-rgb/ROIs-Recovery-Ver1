// Search pairing (design D0) — the first step of a new swap: find the target
// crew, then pick duties in the matrix. Every field of the web form (spec §4):
// mode, Start*/End*, Duration, CRD, BLH, Report time, Flight end, Type, Layover
// port + hours, Flt No., ARR, Fleet, Crew ID, Rank, hide crew without duties;
// Reset/Search; saved searches (the web folder/star buttons) stored on this phone
// per crew. The R'Bot bar on top is the shortcut to asking for the same in words.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Icon } from '../../../components/v2/icons';
import { CrewAvatar } from '../../settings/avatars';
import { RBOT_AVATAR_INDEX } from '../../rbot/RBotEntry';
import type { CarrierPalette } from '../../../theme/carrier';
import type { SearchOptions } from '../dutySwapApi';
import {
  activeFilterCount, dayLabel, isoDay, naiveMs, DAY_MS, SWAP_MODE_LABEL, validateFilters,
  type SwapFilters, type SwapMode,
} from '../dutySwapModel';
import { tint } from './CrewMatrix';

interface Props {
  palette: CarrierPalette;
  crewId: string;
  initial: SwapFilters;
  /** The portal's default window, used by Reset. */
  defaults: { startDate: string; endDate: string };
  options: SearchOptions | null;
  /** Fields side by side (Duo inner screen / landscape). */
  twoColumns: boolean;
  /** Search button suffix, e.g. "6 crew" from the live preview. */
  resultLabel?: string;
  onSearch: (f: SwapFilters) => void;
  /** Every edit, for the live preview on the Duo inner screen. */
  onChange?: (f: SwapFilters) => void;
  /** The R'Bot bar; hidden while R'Bot is already open. */
  onAskRbot?: () => void;
  /** Close the form and show the matrix, when there is a result to show. */
  onClose?: () => void;
}

interface Saved { name: string; filters: SwapFilters }
const savedKey = (crewId: string) => `@duty_swap_saved_${crewId}`;

export function SearchForm(props: Props): React.JSX.Element {
  const { palette: p, options, onChange } = props;
  const [f, setF] = useState<SwapFilters>(props.initial);
  const [saved, setSaved] = useState<Saved[]>([]);
  // R'Bot or a finished search can change the filters underneath the form.
  useEffect(() => {
    setF(prev => (JSON.stringify(prev) === JSON.stringify(props.initial) ? prev : props.initial));
  }, [props.initial]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    onChange?.(f);
  }, [f, onChange]);
  useEffect(() => {
    AsyncStorage.getItem(savedKey(props.crewId)).then(v => setSaved(v ? JSON.parse(v) : [])).catch(() => setSaved([]));
  }, [props.crewId]);
  const persist = (list: Saved[]) => { setSaved(list); AsyncStorage.setItem(savedKey(props.crewId), JSON.stringify(list)).catch(() => undefined); };

  const set = <K extends keyof SwapFilters>(k: K, v: SwapFilters[K]) => setF(prev => ({ ...prev, [k]: v }));
  const error = validateFilters(f);
  const label = (x: SwapFilters) => {
    const a = dayLabel(x.startDate), b = dayLabel(x.endDate);
    return [`${a.day}–${b.day} ${b.month}`, ...x.taskTypeList, ...x.fltFleetList, ...x.layoverPortList].slice(0, 4).join(' · ');
  };

  const pairing = (
    <Section title="Pairing info" p={p}>
      <View style={s.pair}>
        <DateField label="Start *" value={f.startDate} onChange={v => set('startDate', v)} p={p} testID="search-start" />
        <DateField label="End *" value={f.endDate} onChange={v => set('endDate', v)} p={p} testID="search-end" />
      </View>
      <Range label="Duration (days)" a={f.durationStart} b={f.durationEnd} onA={v => set('durationStart', v)} onB={v => set('durationEnd', v)} p={p} />
      <View style={s.pair}>
        <Range label="CRD (hours)" a={f.crdStart} b={f.crdEnd} onA={v => set('crdStart', v)} onB={v => set('crdEnd', v)} p={p} />
        <Range label="BLH (hours)" a={f.blhStart} b={f.blhEnd} onA={v => set('blhStart', v)} onB={v => set('blhEnd', v)} p={p} />
      </View>
      <View style={s.pair}>
        <Range label="Report time" time a={f.briefStart} b={f.briefEnd} onA={v => set('briefStart', v)} onB={v => set('briefEnd', v)} p={p} />
        <Range label="Flight end" time a={f.debriefStart} b={f.debriefEnd} onA={v => set('debriefStart', v)} onB={v => set('debriefEnd', v)} p={p} />
      </View>
      <Chips label="Type" options={options?.taskTypes} value={f.taskTypeList} onChange={v => set('taskTypeList', v)} p={p} testID="search-type" />
    </Section>
  );
  const rest = (
    <>
      <Section title="Layover" p={p}>
        <Chips label="Port" options={options?.ports} value={f.layoverPortList} onChange={v => set('layoverPortList', v)} p={p} />
        <Range label="Layover hours" a={f.layoverTimeStart} b={f.layoverTimeEnd} onA={v => set('layoverTimeStart', v)} onB={v => set('layoverTimeEnd', v)} p={p} />
      </Section>
      <Section title="Flight" p={p}>
        <Chips label="Flt No." options={options?.flights} value={f.fltNumList} onChange={v => set('fltNumList', v)} p={p} />
        <Chips label="ARR" options={options?.ports} value={f.fltArrList} onChange={v => set('fltArrList', v)} p={p} />
        <Chips label="Fleet" options={options?.fleets} value={f.fltFleetList} onChange={v => set('fltFleetList', v)} p={p} testID="search-fleet" />
      </Section>
      <Section title="Crew" p={p}>
        <Chips label="Crew ID" options={options?.crews.map(c => c.crewId)} value={f.crewIdList} onChange={v => set('crewIdList', v)} p={p} />
        <Chips label="Rank" options={options?.ranks} value={f.activeRankList} onChange={v => set('activeRankList', v)} p={p} />
        <View style={s.toggleRow}>
          <Text style={[s.fieldLabel, s.flex, { color: p.cardInk }]}>Hide crew without duties</Text>
          <Switch value={f.filterEmptyDutyCrew} onValueChange={v => set('filterEmptyDutyCrew', v)} trackColor={{ true: p.btn, false: p.cardLine }} testID="search-hide-empty" />
        </View>
      </Section>
    </>
  );

  return (
    <View style={[s.page, { backgroundColor: p.cardSolid }]} testID="search-form">
      <View style={[s.head, { borderBottomColor: p.cardLine }]}>
        <View style={s.flex}>
          <Text style={[s.title, { color: p.cardInk }]}>Search pairing</Text>
          <Text style={[s.sub, { color: p.cardSoft }]}>Find the crew to swap with, then pick duties</Text>
        </View>
        {props.onClose ? (
          <Pressable onPress={props.onClose} accessibilityLabel="close filters" testID="search-close" style={[s.iconBtn, { borderColor: p.cardLine }]}>
            <Icon name="close" size={15} color={p.cardInk} strokeWidth={2.2} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => persist([{ name: label(f), filters: f }, ...saved.filter(x => x.name !== label(f))].slice(0, 6))}
          accessibilityLabel="save search" testID="search-save" style={[s.iconBtn, { borderColor: p.cardLine }]}>
          <Icon name="star" size={16} color={p.btn} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView style={s.flex} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {props.onAskRbot ? (
          <Pressable onPress={props.onAskRbot} testID="search-ask-rbot"
            style={[s.rbotBar, { backgroundColor: tint(p.btn, 0.08), borderColor: tint(p.btn, 0.3) }]}>
            <CrewAvatar index={RBOT_AVATAR_INDEX} size={24} bare />
            <Text style={[s.rbotText, { color: p.cardInk }]} numberOfLines={2}>Or tell R'Bot: "swap my trip for a standby"</Text>
            <Icon name="chev" size={15} color={p.btn} strokeWidth={2} />
          </Pressable>
        ) : null}
        <View style={[s.seg, { backgroundColor: tint(p.cardSoft, 0.15) }]}>
          {(options?.modes ?? ['NS' as SwapMode]).map(m => (
            <Pressable key={m} onPress={() => set('swapMode', m)} testID={`search-mode-${m}`}
              style={[s.segItem, f.swapMode === m && { backgroundColor: p.cardSolid }]}>
              <Text style={[s.segText, { color: f.swapMode === m ? p.btn : p.cardSoft }]}>
                {SWAP_MODE_LABEL[m]} · {m === 'FS' ? 'friends' : 'all crew'}
              </Text>
            </Pressable>
          ))}
        </View>
        {saved.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.savedRow}>
            {saved.map(x => (
              <Pressable key={x.name} onPress={() => setF(x.filters)} onLongPress={() => persist(saved.filter(y => y !== x))}
                style={[s.chip, { borderColor: tint(p.btn, 0.5) }]}>
                <Icon name="star" size={12} color={p.btn} strokeWidth={2} />
                <Text style={[s.chipText, { color: p.btn }]}>{x.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {!options ? <View style={s.loadingRow}><ActivityIndicator color={p.btn} size="small" /><Text style={[s.sub, { color: p.cardSoft }]}>Loading choices…</Text></View> : null}
        {props.twoColumns ? <View style={s.cols}><View style={s.flex}>{pairing}</View><View style={s.flex}>{rest}</View></View> : <>{pairing}{rest}</>}
      </ScrollView>

      {error ? <Text style={[s.error, { color: p.crit }]}>{error}</Text> : null}
      <View style={s.footer}>
        <Pressable onPress={() => setF({ ...emptyLike(f), startDate: props.defaults.startDate, endDate: props.defaults.endDate })}
          testID="search-reset" style={[s.btn, s.btnOutline, { borderColor: p.btn }]}>
          <Text style={[s.btnText, { color: p.btn }]}>Reset</Text>
        </Pressable>
        <Pressable disabled={!!error} onPress={() => props.onSearch(f)} testID="search-submit"
          style={[s.btn, s.flex, { backgroundColor: p.btn, opacity: error ? 0.45 : 1 }]}>
          <Icon name="zoomIn" size={17} color="#fff" strokeWidth={2} />
          <Text style={[s.btnText, { color: '#fff' }]} numberOfLines={1}>
            {['Search', activeFilterCount(f) ? `${activeFilterCount(f)} filters` : null, props.resultLabel].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function emptyLike(f: SwapFilters): SwapFilters {
  const out = { ...f } as Record<string, unknown>;
  for (const [k, v] of Object.entries(f)) out[k] = Array.isArray(v) ? [] : typeof v === 'boolean' ? false : k === 'swapMode' ? v : '';
  return out as unknown as SwapFilters;
}

function Section({ title, p, children }: { title: string; p: CarrierPalette; children: React.ReactNode }) {
  return (
    <View style={[s.section, { borderColor: p.cardLine }]}>
      <Text style={[s.sectionTitle, { color: p.cardInk }]}>{title}</Text>
      {children}
    </View>
  );
}

function DateField({ label, value, onChange, p, testID }: { label: string; value: string; onChange: (v: string) => void; p: CarrierPalette; testID?: string }) {
  const step = (n: number) => onChange(isoDay(naiveMs(value) + n * DAY_MS));
  const d = dayLabel(value);
  return (
    <View style={s.field}>
      <Text style={[s.fieldLabel, { color: p.cardSoft }]}>{label.toUpperCase()}</Text>
      <View style={[s.dateBox, { borderColor: tint(p.btn, 0.4), backgroundColor: tint(p.btn, 0.07) }]}>
        <Pressable onPress={() => step(-1)} hitSlop={8} testID={`${testID}-prev`}><Icon name="back" size={16} color={p.btn} strokeWidth={2} /></Pressable>
        <Text style={[s.dateText, { color: p.cardInk }]} testID={testID}>{d.day} {d.month} {value.slice(0, 4)}</Text>
        <Pressable onPress={() => step(1)} hitSlop={8} testID={`${testID}-next`}><Icon name="chev" size={16} color={p.btn} strokeWidth={2} /></Pressable>
      </View>
    </View>
  );
}

function Range({ label, a, b, onA, onB, p, time }: { label: string; a: string; b: string; onA: (v: string) => void; onB: (v: string) => void; p: CarrierPalette; time?: boolean }) {
  const box = (v: string, on: (v: string) => void, ph: string) => (
    <TextInput value={v} onChangeText={on} placeholder={ph} placeholderTextColor={p.cardSoft}
      keyboardType={time ? 'numbers-and-punctuation' : 'number-pad'} maxLength={time ? 5 : 3}
      style={[s.input, { color: p.cardInk, borderColor: v ? tint(p.btn, 0.4) : p.cardLine }]} />
  );
  return (
    <View style={s.field}>
      <Text style={[s.fieldLabel, { color: p.cardSoft }]}>{label.toUpperCase()}</Text>
      <View style={s.rangeRow}>{box(a, onA, time ? 'HH:mm' : 'Min')}<Text style={{ color: p.cardSoft }}>–</Text>{box(b, onB, time ? 'HH:mm' : 'Max')}</View>
    </View>
  );
}

function Chips({ label, options, value, onChange, p, testID }: {
  label: string; options: string[] | undefined; value: string[]; onChange: (v: string[]) => void; p: CarrierPalette; testID?: string;
}) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const list = options ?? [];
  const long = list.length > 10;
  const shown = (q ? list.filter(x => x.toLowerCase().includes(q.toLowerCase())) : list);
  const visible = [...value.filter(v => !shown.includes(v)), ...(all || q ? shown : shown.slice(0, 10))];
  const toggle = (x: string) => onChange(value.includes(x) ? value.filter(v => v !== x) : [...value, x]);
  return (
    <View style={s.field} testID={testID}>
      <View style={s.chipHead}>
        <Text style={[s.fieldLabel, s.flex, { color: p.cardSoft }]}>{label.toUpperCase()}{value.length ? ` · ${value.length}` : ''}</Text>
        {long ? (
          <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={p.cardSoft} autoCapitalize="characters"
            style={[s.search, { color: p.cardInk, borderColor: p.cardLine }]} />
        ) : null}
      </View>
      <View style={s.chipWrap}>
        {visible.map(x => {
          const on = value.includes(x);
          return (
            <Pressable key={x} onPress={() => toggle(x)} testID={testID ? `${testID}-${x}` : undefined}
              style={[s.chip, { borderColor: on ? p.btn : p.cardLine, backgroundColor: on ? p.btn : 'transparent' }]}>
              <Text style={[s.chipText, { color: on ? '#fff' : p.cardInk }]}>{x}</Text>
            </Pressable>
          );
        })}
        {long && !all && !q && list.length > 10 ? (
          <Pressable onPress={() => setAll(true)} style={[s.chip, { borderColor: p.cardLine }]}>
            <Text style={[s.chipText, { color: p.btn }]}>+{list.length - 10} more</Text>
          </Pressable>
        ) : null}
        {options && list.length === 0 ? <Text style={[s.sub, { color: p.cardSoft }]}>No choices in this window</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, borderRadius: 16, overflow: 'hidden', paddingBottom: 10 },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rbotBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
  rbotText: { flex: 1, fontSize: 13, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '800' },
  sub: { fontSize: 13, fontWeight: '500' },
  iconBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 12 },
  cols: { flexDirection: 'row', gap: 14 },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segText: { fontSize: 13, fontWeight: '700' },
  savedRow: { gap: 8 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  section: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  pair: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, gap: 5, minWidth: 0 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  dateBox: { height: 40, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  dateText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { flex: 1, height: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, fontVariant: ['tabular-nums'] },
  chipHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { width: 110, height: 30, borderWidth: 1, borderRadius: 15, paddingHorizontal: 10, fontSize: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  error: { fontSize: 13, fontWeight: '600', paddingHorizontal: 18, paddingTop: 8 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
  btn: { height: 48, borderRadius: 24, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnOutline: { borderWidth: 1.5 },
  btnText: { fontSize: 15, fontWeight: '700' },
});
