import React from 'react';
import { View, Text, Switch, Pressable, StyleSheet } from 'react-native';
import { Icon, type IconName } from './icons';
import type { CarrierPalette } from '../../theme/carrier';

export interface ToggleRowProps {
  label: string;
  sub?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  palette: CarrierPalette;
  testID?: string;
}

export function ToggleRow({
  label,
  sub,
  value,
  onValueChange,
  palette,
  testID,
}: ToggleRowProps): React.JSX.Element {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleTextCol}>
        <Text style={[styles.toggleLabel, { color: palette.cardInk }]}>{label}</Text>
        {sub ? (
          <Text style={[styles.toggleSub, { color: palette.cardSoft }]}>{sub}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: palette.btn, false: palette.cardLine }}
        testID={testID}
      />
    </View>
  );
}

export interface ChipRowProps {
  label: string;
  icon?: IconName;
  rightLabel: string;
  options: number[];
  value: number;
  onSelect: (value: number) => void;
  palette: CarrierPalette;
  formatOption: (value: number) => string;
}

export function ChipRow({
  label,
  icon,
  rightLabel,
  options,
  value,
  onSelect,
  palette,
  formatOption,
}: ChipRowProps): React.JSX.Element {
  return (
    <View style={styles.chipRowWrap}>
      <View style={styles.chipHead}>
        <View style={styles.chipHeadLeft}>
          {icon ? <Icon name={icon} size={22} color={palette.cardInk} /> : null}
          <Text style={[styles.chipLabel, { color: palette.cardInk }]}>{label}</Text>
        </View>
        <Text style={[styles.chipRightLabel, { color: palette.btn }]}>{rightLabel}</Text>
      </View>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? palette.btn : palette.cardLine,
                  backgroundColor: selected ? palette.btn : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? '#fff' : palette.cardInk },
                ]}
              >
                {formatOption(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export interface NavRowProps {
  icon: IconName;
  label: string;
  value?: string;
  onPress: () => void;
  palette: CarrierPalette;
  danger?: boolean;
  testID?: string;
}

export function NavRow({
  icon,
  label,
  value,
  onPress,
  palette,
  danger,
  testID,
}: NavRowProps): React.JSX.Element {
  return (
    <Pressable style={styles.navRow} onPress={onPress} testID={testID}>
      <Icon name={icon} size={22} color={danger ? palette.crit : palette.cardInk} />
      <Text style={[styles.navLabel, { color: danger ? palette.crit : palette.cardInk }]}>
        {label}
      </Text>
      {value ? (
        <Text style={[styles.navValue, { color: palette.cardSoft }]}>{value}</Text>
      ) : null}
      <Icon name="chev" size={20} color={palette.cardSoft} />
    </Pressable>
  );
}

export interface RadioRowProps {
  title: string;
  sub?: string;
  selected: boolean;
  onPress: () => void;
  palette: CarrierPalette;
  /** Optional right-aligned chip (e.g. the time-zone marker "13:00L"). */
  badge?: string;
  /** Dims the row and marks it non-interactive to the eye (onPress can still be
   *  a no-op or a "coming soon" toast — the caller decides). */
  disabled?: boolean;
  testID?: string;
}

export function RadioRow({ title, sub, selected, onPress, palette, badge, disabled, testID }: RadioRowProps): React.JSX.Element {
  return (
    <Pressable style={[styles.radioRow, disabled ? styles.radioRowDisabled : undefined]} onPress={onPress} testID={testID}>
      <View
        style={[
          styles.radioCircle,
          { borderColor: selected ? palette.btn : palette.cardLine },
        ]}
      >
        {selected ? (
          <View style={[styles.radioDot, { backgroundColor: palette.btn }]} />
        ) : null}
      </View>
      <View style={styles.radioTextCol}>
        <Text style={[styles.radioTitle, { color: palette.cardInk }]}>{title}</Text>
        {sub ? (
          <Text style={[styles.radioSub, { color: palette.cardSoft }]}>{sub}</Text>
        ) : null}
      </View>
      {badge ? (
        <Text style={[styles.radioBadge, { color: palette.btn, borderColor: palette.cardLine }]}>
          {badge}
        </Text>
      ) : null}
    </Pressable>
  );
}

export interface SectionLabelProps {
  children: React.ReactNode;
  palette: CarrierPalette;
}

export function SectionLabel({ children, palette }: SectionLabelProps): React.JSX.Element {
  return (
    <Text style={[styles.sectionLabel, { color: palette.inkFaint }]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
  },
  toggleTextCol: {
    flex: 1,
    flexDirection: 'column',
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  toggleSub: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  chipRowWrap: {
    flexDirection: 'column',
  },
  chipHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  chipRightLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  navLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  navValue: {
    fontSize: 13,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  radioRowDisabled: {
    opacity: 0.5,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  radioTextCol: {
    flex: 1,
    flexDirection: 'column',
  },
  radioTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  radioSub: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  /** Right-aligned marker chip, e.g. the time-zone "13:00L" letters. */
  radioBadge: {
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
    minWidth: 62,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 8,
    marginHorizontal: 4,
  },
});
