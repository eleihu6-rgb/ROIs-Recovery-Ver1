// Home ▸ Quick actions ▸ Meal (demo, local only): the crew picks an IATA special
// meal (or No Meal) for a date range; saved in Redux + AsyncStorage per crew.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { MealScreen } from '../../src/features/meal/MealScreen';
import mealReducer, {
  addMealPref, removeMealPref, validateMealRange, saveMealPref, loadMealPrefs, MEAL_TYPES, mealOwner,
} from '../../src/features/meal/mealSlice';
import authReducer, { login } from '../../src/features/auth/authSlice';
import settingsReducer from '../../src/features/settings/settingsSlice';
import type { AppDispatch } from '../../src/store';

type Node = { children: Array<Node | string> };
/** Concatenated text under a node (jest-native matchers are not loaded here). */
const textOf = (n: Node): string => n.children.map(c => (typeof c === 'string' ? c : textOf(c))).join('');

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

const makeStore = () => configureStore({
  reducer: { auth: authReducer, settings: settingsReducer, meal: mealReducer },
  middleware: g => g({ serializableCheck: false }),
});

beforeEach(async () => { await AsyncStorage.clear(); });

describe('mealSlice', () => {
  const empty = { owner: 'TG:35459', prefs: [] };

  it('lists the IATA special meals plus Standard and No Meal', () => {
    const codes = MEAL_TYPES.map(m => m.code);
    expect(codes).toEqual(expect.arrayContaining(['STD', 'NOML', 'VGML', 'AVML', 'MOML', 'KSML', 'GFML', 'CHML', 'JNML']));
    expect(MEAL_TYPES.find(m => m.code === 'NOML')?.name).toBe("No Meal — I'll bring my own");
  });

  it('validates the range: to must be on or after from', () => {
    expect(validateMealRange('2026-10-08', '2026-10-14')).toBeNull();
    expect(validateMealRange('2026-10-08', '2026-10-08')).toBeNull();
    expect(validateMealRange('2026-10-09', '2026-10-08')).toMatch(/on or after/);
    expect(validateMealRange('', '2026-10-08')).toBe('Pick both dates.');
  });

  it('saves a preference, ignores an invalid range, and removes by id', () => {
    let s = mealReducer(empty, addMealPref({ id: 'a', code: 'VGML', from: '2026-10-08', to: '2026-10-14' }));
    expect(s.prefs).toEqual([{ id: 'a', code: 'VGML', from: '2026-10-08', to: '2026-10-14' }]);
    s = mealReducer(s, addMealPref({ id: 'bad', code: 'KSML', from: '2026-10-20', to: '2026-10-19' }));
    expect(s.prefs.map(p => p.id)).toEqual(['a']);
    s = mealReducer(s, addMealPref({ id: 'b', code: 'NOML', from: '2026-11-01', to: '2026-11-03' }));
    expect(s.prefs.map(p => p.id)).toEqual(['a', 'b']);
    s = mealReducer(s, removeMealPref('a'));
    expect(s.prefs.map(p => p.id)).toEqual(['b']);
  });

  it('one meal per day: a new range replaces the one it overlaps', () => {
    let s = mealReducer(empty, addMealPref({ id: 'a', code: 'VGML', from: '2026-10-08', to: '2026-10-14' }));
    s = mealReducer(s, addMealPref({ id: 'b', code: 'MOML', from: '2026-10-12', to: '2026-10-20' }));
    expect(s.prefs).toEqual([{ id: 'b', code: 'MOML', from: '2026-10-12', to: '2026-10-20' }]);
  });

  it('persists per crew: another crew starts empty, the same crew reloads its prefs', async () => {
    const store = makeStore();
    const dispatch = store.dispatch as AppDispatch;
    await dispatch(loadMealPrefs('TG:35459'));
    await dispatch(saveMealPref({ code: 'GFML', from: '2026-10-08', to: '2026-10-10' }));
    await dispatch(loadMealPrefs('PR:433535'));
    expect(store.getState().meal.prefs).toEqual([]);
    await dispatch(loadMealPrefs('TG:35459'));
    expect(store.getState().meal.prefs.map(p => p.code)).toEqual(['GFML']);
  });
});

describe('MealScreen', () => {
  it('picks No Meal, sets a range, saves, confirms in a status dialog and lists the row; remove clears it', async () => {
    const store = makeStore();
    store.dispatch(login({ airline: 'TG', crewId: '35459', password: 'pw', keepLogin: false }) as never);
    const screen = render(<Provider store={store}><MealScreen /></Provider>);
    await act(async () => {});
    expect(store.getState().meal.owner).toBe(mealOwner('TG', '35459'));
    expect(textOf(screen.getByTestId('meal-saved-empty') as unknown as Node)).toMatch('No meal preference saved yet.');
    expect(textOf(screen.getByTestId('meal-type-value') as unknown as Node)).toMatch('Standard (no special request)');

    // Dropdown: open, choose No Meal, it closes and shows the choice.
    fireEvent.press(screen.getByTestId('meal-type'));
    expect(textOf(screen.getByTestId('meal-option-VGML') as unknown as Node)).toMatch(/VGML.*Vegetarian \(vegan\)/);
    fireEvent.press(screen.getByTestId('meal-option-NOML'));
    expect(screen.queryByTestId('meal-options')).toBeNull();
    expect(textOf(screen.getByTestId('meal-type-value') as unknown as Node)).toMatch("NOML · No Meal — I'll bring my own");

    // Range: To stepped below From is rejected inline and Save does nothing.
    const fromText = String(screen.getByTestId('meal-from').props.children);
    for (let i = 0; i < 7; i++) fireEvent.press(screen.getByTestId('meal-to-dec'));
    expect(textOf(screen.getByTestId('meal-range-error') as unknown as Node)).toMatch(/on or after/);
    await act(async () => { fireEvent.press(screen.getByTestId('meal-save')); });
    expect(store.getState().meal.prefs).toHaveLength(0);
    // Back to From + 2 days.
    for (let i = 0; i < 3; i++) fireEvent.press(screen.getByTestId('meal-to-inc'));
    expect(screen.queryByTestId('meal-range-error')).toBeNull();

    await act(async () => { fireEvent.press(screen.getByTestId('meal-save')); });
    expect(textOf(screen.getByTestId('meal-dialog-title') as unknown as Node)).toMatch('Meal preference saved');
    expect(textOf(screen.getByTestId('meal-dialog-message') as unknown as Node)).toMatch(new RegExp(`NOML · No Meal.*${fromText}`, 's'));
    fireEvent.press(screen.getByTestId('meal-dialog-confirm'));
    expect(screen.queryByTestId('meal-dialog-title')).toBeNull();

    const row = screen.getByTestId('meal-saved-0');
    expect(textOf(row as unknown as Node)).toMatch(new RegExp(`NOML · No Meal.*${fromText} →`));
    const pref = store.getState().meal.prefs[0];
    expect(pref.code).toBe('NOML');
    expect(validateMealRange(pref.from, pref.to)).toBeNull();
    expect(pref.to > pref.from).toBe(true);

    await act(async () => { fireEvent.press(screen.getByTestId('meal-remove-0')); });
    expect(screen.queryByTestId('meal-saved-0')).toBeNull();
    expect(screen.getByTestId('meal-saved-empty')).toBeTruthy();
  });
});
