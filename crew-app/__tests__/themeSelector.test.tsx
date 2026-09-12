// Colour-theme selector — Profile ▸ Preferences ▸ Appearance.
//
// Proves the three things the review asked for:
//   1. four selectable themes, exactly the sign-off mock's swatch set;
//   2. the crew's choice is remembered (persisted, rehydrated on relaunch,
//      and reversible back to the airline default);
//   3. every themed element repaints — the shared themed kit is rendered under
//      all four palettes and each palette colour is asserted on a real element,
//      including the theme-tinted dock on the Schedule tab.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import settingsReducer, { loadSettings, setThemePreset } from '../src/features/settings/settingsSlice';
import authReducer, { login } from '../src/features/auth/authSlice';
import rbotReducer from '../src/features/rbot/rbotSlice';
import flightCalendarReducer from '../src/features/calendar/flightCalendarSlice';
import { AppearanceScreen } from '../src/features/v2/AppearanceScreen';
import { PreferencesScreen } from '../src/features/v2/PreferencesScreen';
import { GradientScreen } from '../src/components/v2/GradientScreen';
import { PillDock } from '../src/components/v2/PillDock';
import { NavRow, ToggleRow } from '../src/components/v2/rows';
import { KvRow, ListCard, PrimaryButton } from '../src/features/v2/PageShell';
import {
  CarrierContext,
  PALETTES,
  THEME_LABELS,
  THEME_PRESETS,
  paletteFor,
  resolveTheme,
  useCarrier,
  type CarrierPalette,
} from '../src/theme/carrier';
import type { AppDispatch } from '../src/store';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

const THEME_KEY = '@royce_theme';

function makeStore(airline = 'ET') {
  const store = configureStore({
    reducer: { auth: authReducer, settings: settingsReducer, rbot: rbotReducer, flightCalendar: flightCalendarReducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
  runThunk(store, login({ airline, crewId: 'J4002', password: 'Pier2026', keepLogin: false }));
  return store;
}

/** The settings thunks are typed against the app store's dispatch; a test-local
 *  store has an equivalent-but-distinct type, so call them through that cast. */
function runThunk(
  store: { dispatch: unknown },
  thunk: (dispatch: AppDispatch) => Promise<void>,
): Promise<void> {
  return thunk(store.dispatch as AppDispatch);
}

/** Every colour string that actually reached an element's style/props. */
function collectColours(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach(child => collectColours(child, out));
    return out;
  }
  if (!node || typeof node !== 'object') {
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  for (const [key, value] of Object.entries(props)) {
    // style/trackColor on RN views; stroke/fill on the icon + svg elements.
    if (key === 'style' || key === 'trackColor' || key === 'stroke' || key === 'fill' || /Color$/.test(key)) {
      pushStrings(value, out);
    }
  }
  // react-test-renderer's JSON keeps child nodes on `children` (not in props).
  collectColours((node as { children?: unknown }).children ?? props.children, out);
  return out;
}

function pushStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach(v => pushStrings(v, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(v => pushStrings(v, out));
  }
}

/** react-native-svg flattens <Stop stopColor> into an ARGB int array, so the
 *  rendered gradient has to be decoded to check which colours really shipped. */
function argbToHex(value: number): string {
  const v = value >>> 0;
  return (
    '#' +
    [(v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]
      .map(part => part.toString(16).padStart(2, '0'))
      .join('')
  );
}

function collectGradientStops(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach(child => collectGradientStops(child, out));
    return out;
  }
  if (!node || typeof node !== 'object') {
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  const gradient = props.gradient;
  if (Array.isArray(gradient)) {
    gradient.forEach((entry, index) => {
      // [offset, colour, offset, colour, …] — colours sit on the odd slots.
      if (index % 2 === 1 && typeof entry === 'number') {
        out.push(argbToHex(entry));
      }
    });
  }
  collectGradientStops((node as { children?: unknown }).children ?? props.children, out);
  return out;
}

/** A screen reads its palette from CarrierContext (V2Navigator provides it). */
function ContextProbe(): React.JSX.Element {
  const p = useCarrier();
  return <View testID="ctx-probe" style={{ backgroundColor: p.btn }} />;
}

function dockProps(palette: CarrierPalette) {
  return {
    palette,
    state: {
      index: 0,
      routes: [
        { key: 'k-sched', name: 'Schedule' },
        { key: 'k-home', name: 'Home' },
      ],
    },
    descriptors: {
      'k-sched': { options: { tabBarLabel: 'Schedule' } },
      'k-home': { options: { tabBarLabel: 'Home' } },
    },
    navigation: { emit: () => ({ defaultPrevented: false }), navigate: jest.fn() },
  } as unknown as Parameters<typeof PillDock>[0];
}

describe('colour theme selector', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('offers exactly the four themes of the sign-off mock', () => {
    expect(THEME_PRESETS).toEqual(['sia', 'thai', 'emerald', 'graphite']);
    expect(THEME_PRESETS.map(preset => THEME_LABELS[preset])).toEqual([
      'Reference blue',
      'Thai violet',
      'Emerald',
      'Graphite',
    ]);
  });

  it('defaults to the airline colour and lets the crew override it', () => {
    expect(resolveTheme(null, 'ET')).toBe('emerald');
    expect(resolveTheme(undefined, 'TG')).toBe('sia');
    expect(resolveTheme(null, 'XX')).toBe('sia');
    expect(resolveTheme(null, null)).toBe('sia');
    expect(resolveTheme('graphite', 'ET')).toBe('graphite');
    expect(resolveTheme('thai', 'TG')).toBe('thai');
  });

  it('remembers the chosen theme across a restart', async () => {
    const store = makeStore();
    await runThunk(store, setThemePreset('thai'));
    expect(store.getState().settings.themePreset).toBe('thai');
    expect(await AsyncStorage.getItem(THEME_KEY)).toBe(JSON.stringify('thai'));

    // Fresh launch: Bootstrapping calls loadSettings() and the choice comes back.
    const relaunched = makeStore();
    expect(relaunched.getState().settings.themePreset).toBeNull();
    await runThunk(relaunched, loadSettings());
    expect(relaunched.getState().settings.themePreset).toBe('thai');
  });

  it('clears back to the airline default', async () => {
    const store = makeStore();
    await runThunk(store, setThemePreset('graphite'));
    await runThunk(store, setThemePreset(null));
    expect(store.getState().settings.themePreset).toBeNull();
    expect(await AsyncStorage.getItem(THEME_KEY)).toBeNull();
    expect(resolveTheme(store.getState().settings.themePreset, 'ET')).toBe('emerald');
  });

  it('ignores an unknown persisted theme instead of leaving the app unthemed', async () => {
    await AsyncStorage.setItem(THEME_KEY, JSON.stringify('neon'));
    const store = makeStore();
    await runThunk(store, loadSettings());
    expect(store.getState().settings.themePreset).toBeNull();
    expect(resolveTheme(store.getState().settings.themePreset, 'ET')).toBe('emerald');
  });

  it('applies a tapped swatch, marks the airline default, and can reset', async () => {
    const store = makeStore('ET');
    const tree = render(
      <Provider store={store}>
        <CarrierContext.Provider value={paletteFor('emerald')}>
          <AppearanceScreen />
        </CarrierContext.Provider>
      </Provider>,
    );

    // Four swatches, nothing else selectable.
    for (const preset of THEME_PRESETS) {
      expect(tree.getByTestId(`theme-${preset}`)).toBeTruthy();
    }
    // ET's own colour is flagged, and we start out following it.
    expect(tree.getByText("Your airline's colour")).toBeTruthy();
    expect(tree.getByTestId('theme-following-airline')).toBeTruthy();
    expect(tree.getByTestId('theme-emerald').props.accessibilityState.selected).toBe(true);

    await act(async () => {
      fireEvent.press(tree.getByTestId('theme-graphite'));
    });
    expect(store.getState().settings.themePreset).toBe('graphite');
    expect(await AsyncStorage.getItem(THEME_KEY)).toBe(JSON.stringify('graphite'));
    expect(tree.getByTestId('theme-graphite').props.accessibilityState.selected).toBe(true);
    expect(tree.getByTestId('theme-emerald').props.accessibilityState.selected).toBe(false);

    await act(async () => {
      fireEvent.press(tree.getByTestId('theme-reset'));
    });
    expect(store.getState().settings.themePreset).toBeNull();
    expect(tree.getByTestId('theme-following-airline')).toBeTruthy();
  });

  it('shows the current theme name on the Preferences row (mock Ver9)', async () => {
    const store = makeStore('ET');
    const tree = render(
      <Provider store={store}>
        <CarrierContext.Provider value={paletteFor('emerald')}>
          <PreferencesScreen />
        </CarrierContext.Provider>
      </Provider>,
    );
    expect(tree.getByTestId('row-appearance')).toBeTruthy();
    expect(tree.getByText('Emerald')).toBeTruthy();

    await act(async () => {
      await runThunk(store, setThemePreset('thai'));
    });
    expect(tree.getByText('Thai violet')).toBeTruthy();
  });

  it('repaints every themed element for each of the four palettes', () => {
    for (const preset of THEME_PRESETS) {
      const pal = PALETTES[preset];
      const tree = render(
        <Provider store={makeStore()}>
          <CarrierContext.Provider value={pal}>
            <GradientScreen palette={pal} texture={false}>
              <ListCard palette={pal}>
                <ToggleRow label="Push notifications" value onValueChange={() => {}} palette={pal} />
                <KvRow label="Version" value="1.0" palette={pal} />
                <NavRow icon="doc" label="Language" value="English" palette={pal} onPress={() => {}} />
              </ListCard>
              <PrimaryButton label="Continue" palette={pal} />
              {/* The dock renders R'Bot's entry, which reads its session store. */}
              <PillDock {...dockProps(pal)} />
              <ContextProbe />
            </GradientScreen>
          </CarrierContext.Provider>
        </Provider>,
      );
      const colours = collectColours(tree.toJSON());
      const stops = collectGradientStops(tree.toJSON());

      // Ground gradient (all four stops), card surface, primary button, the
      // Schedule dock tint + its ink, and the palette handed down by context.
      for (const expected of [pal.g1, pal.g2, pal.g3, pal.g4]) {
        expect(stops).toContain(expected);
      }
      for (const expected of [pal.card, pal.btn, pal.dockLight, pal.dockInk]) {
        expect(colours).toContain(expected);
      }
      expect(tree.getByTestId('ctx-probe').props.style.backgroundColor).toBe(pal.btn);

      // Nothing from a *different* theme may leak onto the screen.
      for (const other of THEME_PRESETS.filter(x => x !== preset)) {
        for (const leaked of [
          PALETTES[other].g1,
          PALETTES[other].g2,
          PALETTES[other].g3,
          PALETTES[other].g4,
          PALETTES[other].dockLight,
          PALETTES[other].dockInk,
        ]) {
          expect(stops).not.toContain(leaked);
          expect(colours).not.toContain(leaked);
        }
      }
    }
  });
});
