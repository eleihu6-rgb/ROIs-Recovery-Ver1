// Home ▸ Quick actions ▸ Meal — pick an onboard meal (IATA special-meal codes)
// for a date range. Demo only: saved locally (mealSlice), no backend.
// Same visual language as the Absence form: PageShell/Hero/ListCard, RadioRow
// options, the Absence date steppers and the Status-Card AppDialog.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';
import { PageShell, Hero, ListCard, PrimaryButton } from '../v2/PageShell';
import { DateStepRow } from '../v2/AbsenceScreen';
import { RadioRow, SectionLabel } from '../../components/v2/rows';
import { DashedLine } from '../../components/v2/TicketCard';
import { Icon } from '../../components/v2/icons';
import { AppDialog } from '../../components/v2/AppDialog';
import { MON } from '../v2/model';
import {
  MEAL_TYPES, deleteMealPref, loadMealPrefs, mealOwner, mealType, saveMealPref, validateMealRange,
  type MealPref,
} from './mealSlice';

/** Default range: the next 7 days, today included. */
const DEFAULT_DAYS = 7;

const pad = (n: number): string => String(n).padStart(2, '0');
const toIso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const shift = (iso: string, days: number): string => {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
};
const fmt = (iso: string): string => {
  const d = fromIso(iso);
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
};
const mealLabel = (code: string): string => {
  const m = mealType(code);
  if (!m) return code;
  return m.code === 'STD' ? m.name : `${m.code} · ${m.name}`;
};

export function MealScreen(): React.JSX.Element {
  const p = useCarrier();
  const dispatch = useAppDispatch();
  const owner = useAppSelector(s => mealOwner(s.auth.airline, s.auth.crewId));
  const loadedFor = useAppSelector(s => s.meal.owner);
  const saved = useAppSelector(s => s.meal.prefs);

  const today = toIso(new Date());
  const [code, setCode] = useState('STD');
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => shift(today, DEFAULT_DAYS - 1));
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Per-crew storage: (re)load when this crew's prefs are not the ones in Redux.
  useEffect(() => {
    if (loadedFor !== owner) void dispatch(loadMealPrefs(owner));
  }, [dispatch, owner, loadedFor]);

  const rangeError = validateMealRange(from, to);

  async function onSave() {
    if (rangeError) return;
    await dispatch(saveMealPref({ code, from, to }));
    setSavedMsg(`${mealLabel(code)}\n${from === to ? fmt(from) : `${fmt(from)} → ${fmt(to)}`}`);
  }

  return (
    <PageShell
      title="Meal Preference"
      testID="page-meal"
      hero={<Hero h1="Your onboard meal" h2="Choose a meal type and the dates you want it. Saved on this phone for now." palette={p} />}
    >
      <SectionLabel palette={p}>Meal type</SectionLabel>
      <ListCard palette={p}>
        <Pressable style={s.select} onPress={() => setOpen(o => !o)} testID="meal-type" accessibilityLabel="meal type">
          <Text style={[s.selectText, { color: p.cardInk }]} numberOfLines={1} testID="meal-type-value">{mealLabel(code)}</Text>
          <View style={open ? s.chevUp : s.chevDown}>
            <Icon name="chev" size={20} color={p.cardSoft} />
          </View>
        </Pressable>
        {open && (
          <View testID="meal-options">
            <DashedLine color={p.cardLine} />
            {MEAL_TYPES.map(m => (
              <RadioRow
                key={m.code}
                title={m.code === 'STD' ? 'Standard' : m.code}
                sub={m.code === 'STD' ? 'No special request' : m.name}
                selected={m.code === code}
                onPress={() => { setCode(m.code); setOpen(false); }}
                palette={p}
                testID={`meal-option-${m.code}`}
              />
            ))}
          </View>
        )}
      </ListCard>

      <SectionLabel palette={p}>Dates</SectionLabel>
      <ListCard palette={p}>
        <DateStepRow label="From" value={fromIso(from)} onDec={() => setFrom(shift(from, -1))} onInc={() => setFrom(shift(from, 1))} palette={p} testID="meal-from" />
        <DateStepRow label="To" value={fromIso(to)} onDec={() => setTo(shift(to, -1))} onInc={() => setTo(shift(to, 1))} palette={p} testID="meal-to" />
        {rangeError ? <Text style={[s.error, { color: p.crit }]} testID="meal-range-error">{rangeError}</Text> : null}
      </ListCard>

      <PrimaryButton
        label="Save preference"
        palette={p}
        testID="meal-save"
        onPress={rangeError ? undefined : () => void onSave()}
        style={rangeError ? s.disabled : undefined}
      />

      <SectionLabel palette={p}>Saved</SectionLabel>
      <ListCard palette={p}>
        {saved.length === 0 ? (
          <Text style={[s.empty, { color: p.cardSoft }]} testID="meal-saved-empty">No meal preference saved yet.</Text>
        ) : (
          saved.map((pref, i) => (
            <SavedRow key={pref.id} pref={pref} index={i} last={i === saved.length - 1} palette={p} onRemove={() => void dispatch(deleteMealPref(pref.id))} />
          ))
        )}
      </ListCard>

      <AppDialog
        visible={savedMsg !== null}
        onClose={() => setSavedMsg(null)}
        onConfirm={() => setSavedMsg(null)}
        tone="success"
        title="Meal preference saved"
        message={savedMsg ?? undefined}
        confirmLabel="Got it"
        testID="meal-dialog"
      />
    </PageShell>
  );
}

function SavedRow({ pref, index, last, palette, onRemove }: {
  pref: MealPref; index: number; last: boolean; palette: CarrierPalette; onRemove: () => void;
}) {
  return (
    <View>
      <View style={s.saved} testID={`meal-saved-${index}`}>
        <Icon name="meal" size={20} color={palette.cardSoft} strokeWidth={1.6} />
        <View style={s.savedText}>
          <Text style={[s.savedTitle, { color: palette.cardInk }]} numberOfLines={1}>{mealLabel(pref.code)}</Text>
          <Text style={[s.savedSub, { color: palette.cardSoft }]}>{pref.from === pref.to ? fmt(pref.from) : `${fmt(pref.from)} → ${fmt(pref.to)}`}</Text>
        </View>
        <Pressable onPress={onRemove} hitSlop={10} style={s.remove} accessibilityLabel="remove meal preference" testID={`meal-remove-${index}`}>
          <Icon name="close" size={18} color={palette.cardSoft} />
        </Pressable>
      </View>
      {!last && <DashedLine color={palette.cardLine} />}
    </View>
  );
}

const s = StyleSheet.create({
  select: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  selectText: { flex: 1, fontSize: 15, fontWeight: '600' },
  chevDown: { transform: [{ rotate: '90deg' }] },
  chevUp: { transform: [{ rotate: '-90deg' }] },
  error: { fontSize: 13, paddingBottom: 12 },
  disabled: { opacity: 0.5 },
  empty: { fontSize: 13, paddingVertical: 15 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  savedText: { flex: 1, minWidth: 0 },
  savedTitle: { fontSize: 14, fontWeight: '600' },
  savedSub: { fontSize: 12, marginTop: 2 },
  remove: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
