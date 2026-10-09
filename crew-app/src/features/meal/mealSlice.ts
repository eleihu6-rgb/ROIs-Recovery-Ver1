// Home ▸ Quick actions ▸ Meal — the crew's onboard meal preference for a date
// range (demo, Ryan 2026-10-08). There is no backend: the preferences live in
// Redux and are kept per crew in AsyncStorage (pattern: settingsSlice), keyed by
// airline + crew id so switching accounts never shows another crew's meals.
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppDispatch, RootState } from '../../store';

export interface MealType {
  /** IATA special-meal code; 'STD' = no special request. */
  code: string;
  name: string;
}

/** Popular airline special meals, by the IATA codes crew know. */
export const MEAL_TYPES: MealType[] = [
  { code: 'STD', name: 'Standard (no special request)' },
  { code: 'NOML', name: "No Meal — I'll bring my own" },
  { code: 'VGML', name: 'Vegetarian (vegan)' },
  { code: 'AVML', name: 'Asian vegetarian (Hindu)' },
  { code: 'VLML', name: 'Vegetarian lacto-ovo' },
  { code: 'HNML', name: 'Hindu' },
  { code: 'MOML', name: 'Muslim (halal)' },
  { code: 'KSML', name: 'Kosher' },
  { code: 'GFML', name: 'Gluten-free' },
  { code: 'DBML', name: 'Diabetic' },
  { code: 'LFML', name: 'Low fat' },
  { code: 'LSML', name: 'Low salt' },
  { code: 'NLML', name: 'Low lactose' },
  { code: 'BLML', name: 'Bland' },
  { code: 'SFML', name: 'Seafood' },
  { code: 'FPML', name: 'Fruit platter' },
  { code: 'RVML', name: 'Raw vegetarian' },
  { code: 'JNML', name: 'Jain' },
  { code: 'LCML', name: 'Low calorie' },
  { code: 'CHML', name: 'Child' },
];

export function mealType(code: string): MealType | undefined {
  return MEAL_TYPES.find(m => m.code === code);
}

export interface MealPref {
  id: string;
  code: string;
  /** Inclusive range, 'YYYY-MM-DD'. */
  from: string;
  to: string;
}

export interface MealState {
  /** `${airline}:${crewId}` the prefs belong to; null until loaded. */
  owner: string | null;
  prefs: MealPref[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** null when the range is valid, else the message to show the crew. */
export function validateMealRange(from: string, to: string): string | null {
  if (!ISO.test(from) || !ISO.test(to)) return 'Pick both dates.';
  // ISO dates compare correctly as strings.
  if (to < from) return 'The "To" date must be on or after the "From" date.';
  return null;
}

const overlaps = (a: MealPref, b: { from: string; to: string }): boolean => a.from <= b.to && b.from <= a.to;

const initialState: MealState = { owner: null, prefs: [] };

const mealSlice = createSlice({
  name: 'meal',
  initialState,
  reducers: {
    /** Saves a preference. One meal per day: a range it overlaps is replaced.
     *  An invalid range or unknown meal code is ignored. */
    addMealPref(state, action: PayloadAction<MealPref>) {
      const pref = action.payload;
      if (validateMealRange(pref.from, pref.to) || !mealType(pref.code)) return;
      state.prefs = [...state.prefs.filter(p => !overlaps(p, pref)), pref].sort((a, b) => a.from.localeCompare(b.from));
    },
    removeMealPref(state, action: PayloadAction<string>) {
      state.prefs = state.prefs.filter(p => p.id !== action.payload);
    },
    _hydrate(state, action: PayloadAction<{ owner: string; prefs: MealPref[] }>) {
      state.owner = action.payload.owner;
      state.prefs = action.payload.prefs;
    },
  },
});

export const { addMealPref, removeMealPref } = mealSlice.actions;
export default mealSlice.reducer;

export const mealOwner = (airline: string | null | undefined, crewId: string | null | undefined): string =>
  `${airline || 'guest'}:${crewId || 'guest'}`;

const storageKey = (owner: string): string => `@royce_meal_prefs:${owner}`;

const isPref = (x: unknown): x is MealPref => {
  const p = x as MealPref;
  return !!p && typeof p.id === 'string' && typeof p.code === 'string' && !validateMealRange(p.from, p.to);
};

/** Loads the crew's saved preferences (replaces whatever another crew left). */
export function loadMealPrefs(owner: string) {
  return async (dispatch: AppDispatch) => {
    let prefs: MealPref[] = [];
    try {
      const raw = await AsyncStorage.getItem(storageKey(owner));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) prefs = parsed.filter(isPref);
    } catch {}
    dispatch(mealSlice.actions._hydrate({ owner, prefs }));
  };
}

async function persist(getState: () => RootState): Promise<void> {
  const { owner, prefs } = getState().meal;
  if (!owner) return;
  try {
    await AsyncStorage.setItem(storageKey(owner), JSON.stringify(prefs));
  } catch {}
}

export function saveMealPref(input: { code: string; from: string; to: string }) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    const id = `${input.from}-${input.to}-${Date.now().toString(36)}`;
    dispatch(addMealPref({ id, ...input }));
    await persist(getState);
  };
}

export function deleteMealPref(id: string) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(removeMealPref(id));
    await persist(getState);
  };
}
