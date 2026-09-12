// Profile ▸ Preferences ▸ Appearance — colour-theme selector.
//
// The four swatches are the sign-off mock's "Airline background" set (Ver9):
// Reference blue (sia) · Thai violet · Emerald · Graphite. Tapping one stores
// the choice (settings.themePreset, persisted as @royce_theme) and V2Navigator
// immediately re-provides it through CarrierContext, so every screen — ground
// gradient, cards, dock, chips, buttons — repaints in the new colour without a
// restart. With no explicit choice the app follows the airline's own colour.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useAppDispatch, useAppSelector } from '../../store';
import { selectCrewCarrier } from '../auth/authSlice';
import {
  PALETTES,
  THEME_LABELS,
  THEME_PRESETS,
  presetForAirline,
  resolveTheme,
  useCarrier,
  type CarrierPalette,
  type ThemePreset,
} from '../../theme/carrier';
import { Icon } from '../../components/v2/icons';
import { DashedLine } from '../../components/v2/TicketCard';
import { Hero, ListCard, PageShell } from './PageShell';
import { setThemePreset } from '../settings/settingsSlice';

/** Round preview of a theme's ground gradient (same four stops as the screen). */
function Swatch({ preset, size = 44 }: { preset: ThemePreset; size?: number }) {
  const pal = PALETTES[preset];
  const id = `themeSwatch-${preset}`;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0.14" y2="1">
          <Stop offset="0" stopColor={pal.g1} />
          <Stop offset="0.34" stopColor={pal.g2} />
          <Stop offset="0.68" stopColor={pal.g3} />
          <Stop offset="1" stopColor={pal.g4} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={size} height={size} rx={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

function ThemeRow({
  preset,
  selected,
  isAirlineDefault,
  palette,
  onPress,
}: {
  preset: ThemePreset;
  selected: boolean;
  isAirlineDefault: boolean;
  palette: CarrierPalette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={`theme-${preset}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${THEME_LABELS[preset]}${selected ? ', selected' : ''}`}
      style={s.row}
    >
      <View
        style={[
          s.swatchRing,
          { borderColor: selected ? palette.btn : 'transparent', backgroundColor: palette.cardSoft },
        ]}
      >
        <Swatch preset={preset} />
      </View>
      <View style={s.rowText}>
        <Text style={[s.rowLabel, { color: palette.cardInk }]}>{THEME_LABELS[preset]}</Text>
        {isAirlineDefault ? (
          <Text style={[s.rowSub, { color: palette.cardSoft }]}>Your airline's colour</Text>
        ) : null}
      </View>
      {selected ? (
        <Icon name="check" size={20} color={palette.btn} />
      ) : (
        <View style={s.checkSpacer} />
      )}
    </Pressable>
  );
}

export function AppearanceScreen() {
  const p = useCarrier();
  const dispatch = useAppDispatch();
  const chosen = useAppSelector(s => s.settings.themePreset);
  // "Your airline's colour" must be the carrier the crew actually flies (K1003 =
  // EK), which the roster resolved — not the option they signed in through.
  const airline = useAppSelector(selectCrewCarrier) ?? '';
  const airlinePreset = resolveTheme(null, airline);
  const active = resolveTheme(chosen, airline);

  return (
    <PageShell title="Appearance" testID="page-appearance">
      <Hero
        h1="Colour theme"
        h2="Applies to every screen — ground, cards, dock and buttons. Defaults to your airline's colour."
        palette={p}
      />
      <ListCard palette={p}>
        {THEME_PRESETS.map((preset, i) => (
          <View key={preset}>
            <ThemeRow
              preset={preset}
              selected={active === preset}
              isAirlineDefault={airlinePreset === preset}
              palette={p}
              onPress={() => dispatch(setThemePreset(preset))}
            />
            {i < THEME_PRESETS.length - 1 ? <DashedLine color={p.cardLine} /> : null}
          </View>
        ))}
      </ListCard>
      {chosen !== null ? (
        <Pressable
          onPress={() => dispatch(setThemePreset(null))}
          testID="theme-reset"
          style={s.reset}
        >
          <Text style={[s.resetText, { color: p.inkSoft }]}>
            Use airline default ({THEME_LABELS[airlinePreset]})
          </Text>
        </Pressable>
      ) : (
        <Text style={[s.hint, { color: p.inkFaint }]} testID="theme-following-airline">
          Following {THEME_LABELS[airlinePreset]} — your airline's colour.
        </Text>
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  swatchRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 12, marginTop: 2 },
  checkSpacer: { width: 20 },
  reset: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 8 },
  resetText: { fontSize: 13, fontWeight: '600' },
  hint: { textAlign: 'center', fontSize: 12, marginTop: 14 },
});
