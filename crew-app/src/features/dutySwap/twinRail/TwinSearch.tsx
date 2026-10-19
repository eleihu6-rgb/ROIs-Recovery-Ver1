import React, { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import type { CarrierPalette } from '../../../theme/carrier';
import type { SearchOptions } from '../dutySwapApi';
import { emptyFilters, SWAP_MODE_LABEL, validateFilters, type SwapFilters } from '../dutySwapModel';
import { s } from './styles';

const sections = ['Pairing', 'Layover', 'Flight', 'Crew'] as const;
type Section = typeof sections[number];
type TextKey = { [K in keyof SwapFilters]: SwapFilters[K] extends string ? K : never }[keyof SwapFilters];
type ListKey = { [K in keyof SwapFilters]: SwapFilters[K] extends string[] ? K : never }[keyof SwapFilters];
const fields: Record<Section, Array<[string, TextKey]>> = {
  Pairing: [['Start *', 'startDate'], ['End *', 'endDate'], ['Duration min', 'durationStart'], ['Duration max', 'durationEnd'], ['CRD min (hours)', 'crdStart'], ['CRD max (hours)', 'crdEnd'], ['BLH min (hours)', 'blhStart'], ['BLH max (hours)', 'blhEnd'], ['Report from (HH:mm)', 'briefStart'], ['Report to (HH:mm)', 'briefEnd'], ['Flight end from', 'debriefStart'], ['Flight end to', 'debriefEnd']],
  Layover: [['Hours min', 'layoverTimeStart'], ['Hours max', 'layoverTimeEnd']], Flight: [], Crew: [],
};

export function TwinSearch({ p, initial, defaults, options, optionsError, onRetryOptions, large, onSearch, onClose }: {
  p: CarrierPalette; initial: SwapFilters; defaults: { startDate: string; endDate: string }; options: SearchOptions | null;
  optionsError: string | null; onRetryOptions: () => void; large: boolean; onSearch: (f: SwapFilters) => void; onClose: () => void;
}): React.JSX.Element {
  const [f, setF] = useState(initial);
  const [section, setSection] = useState<Section>('Pairing');
  const [editing, setEditing] = useState<ListKey | null>(null);
  const error = validateFilters(f);
  const lists: Record<Section, Array<[string, ListKey, string[]]>> = {
    Pairing: [['Type', 'taskTypeList', options?.taskTypes ?? []]],
    Layover: [['Port', 'layoverPortList', options?.ports ?? []]],
    Flight: [['Flt No.', 'fltNumList', options?.flights ?? []], ['ARR', 'fltArrList', options?.ports ?? []], ['Fleet', 'fltFleetList', options?.fleets ?? []]],
    Crew: [['Crew ID', 'crewIdList', options?.crews.map(c => c.crewId) ?? []], ['Rank', 'activeRankList', options?.ranks ?? []]],
  };
  const group = (name: Section): React.JSX.Element => <View key={name} style={s.body}>
    <Text style={[s.title, { color: p.cardInk }]}>{name === 'Pairing' ? 'Pairing info' : name}</Text>
    {fields[name].map(([label, key]) => <View key={key} style={[s.row, s.divider, { borderColor: p.cardLine }]}>
      <Text style={[s.text, s.flex, { color: p.cardInk }]}>{label}</Text>
      <TextInput value={f[key]} onChangeText={value => setF(prev => ({ ...prev, [key]: value }))}
        testID={`twin-search-${key}`} accessibilityLabel={label} placeholder={key.includes('Date') ? 'YYYY-MM-DD' : 'Any'}
        placeholderTextColor={p.cardSoft} style={[s.input, { width: 140, color: p.cardInk, borderColor: p.cardLine }]} />
    </View>)}
    {lists[name].map(([label, key, choices]) => <View key={key}>
      <Pressable onPress={() => setEditing(editing === key ? null : key)} testID={`twin-search-${key}`} style={[s.row, s.divider, { borderColor: p.cardLine }]}>
        <Text style={[s.text, s.flex, { color: p.cardInk }]}>{label}</Text><Text style={[s.text, { color: p.btn, maxWidth: '65%' }]}>{f[key].join(', ') || 'Any'} ›</Text>
      </Pressable>
      {editing === key ? <View style={s.wrap}>
        {!choices.length ? <Text style={[s.text, { color: p.cardSoft }]}>{options ? 'No available choices' : 'Loading choices…'}</Text> : null}
        {choices.map(value => <Pressable key={value} onPress={() => setF(prev => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter(v => v !== value) : [...prev[key], value] }))}
          testID={`twin-choice-${key}-${value}`} accessibilityRole="button" accessibilityLabel={value}
          accessibilityState={{ selected: f[key].includes(value) }} style={[s.button, { borderColor: p.cardLine, backgroundColor: f[key].includes(value) ? p.cardInset : p.cardSolid }]}>
          <Text style={[s.text, { color: p.btn }]}>{value}</Text>
        </Pressable>)}
      </View> : null}
    </View>)}
    {name === 'Crew' ? <View style={s.row}><Text style={[s.text, s.flex, { color: p.cardInk }]}>Hide crew without duties</Text><Switch testID="twin-search-hide-empty" value={f.filterEmptyDutyCrew} onValueChange={value => setF(prev => ({ ...prev, filterEmptyDutyCrew: value }))} trackColor={{ true: p.btn, false: p.cardLine }} /></View> : null}
  </View>;
  return <View style={[s.flex, s.panel, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]} testID="twin-search">
    <View style={s.bar}><Text style={[s.title, s.flex, { color: p.cardInk }]}>Search pairing</Text><Pressable onPress={onClose} testID="twin-search-close" style={s.button}><Text style={[s.text, { color: p.btn }]}>Back</Text></Pressable></View>
    <View style={s.bar}>{(options?.modes ?? [initial.swapMode]).map(mode => <Pressable key={mode} onPress={() => setF(prev => ({ ...prev, swapMode: mode }))} accessibilityState={{ selected: f.swapMode === mode }} style={[s.button, { borderColor: p.cardLine, backgroundColor: f.swapMode === mode ? p.cardInset : p.cardSolid }]}><Text style={[s.text, { color: p.btn }]}>{SWAP_MODE_LABEL[mode]}</Text></Pressable>)}</View>
    {!large ? <View style={s.bar}>{sections.map(name => <Pressable key={name} onPress={() => setSection(name)} testID={`twin-section-${name}`} style={[s.button, { borderColor: p.cardLine, backgroundColor: section === name ? p.cardInset : p.cardSolid }]}><Text style={[s.label, { color: p.btn }]}>{name}</Text></Pressable>)}</View> : null}
    {optionsError ? <Pressable onPress={onRetryOptions} style={s.body}><Text style={[s.text, { color: p.cardSoft }]}>{optionsError} · Retry choices</Text></Pressable> : null}
    <ScrollView style={s.flex} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      {large ? <View style={s.row}><View style={s.flex}>{group('Pairing')}</View><View style={s.flex}>{sections.slice(1).map(group)}</View></View> : group(section)}
    </ScrollView>
    {error ? <Text style={[s.text, s.body, { color: p.cardSoft }]}>{error}</Text> : null}
    <View style={s.bar}>
      <Pressable testID="twin-search-reset" onPress={() => setF(emptyFilters(defaults.startDate, defaults.endDate))} style={[s.button, { borderColor: p.btn }]}><Text style={[s.text, { color: p.btn }]}>Reset</Text></Pressable>
      <Pressable disabled={!!error} testID="twin-search-submit" onPress={() => onSearch(f)} style={[s.button, s.flex, { backgroundColor: p.btn, borderColor: p.btn, opacity: error ? 0.5 : 1 }]}><Text style={[s.buttonText, s.onPrimary]}>Search crew</Text></Pressable>
    </View>
  </View>;
}
