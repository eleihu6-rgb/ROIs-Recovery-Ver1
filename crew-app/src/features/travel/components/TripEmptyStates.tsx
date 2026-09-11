// Empty-state artwork + action row for MyTripsScreen (enhance-Ver1 #11).
// Extracting the two inline SVG illustrations and the ActionButton keeps the
// screen file focused on orchestration. Illustration colours come from theme
// tokens so the palette stays tunable.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle, Line, Ellipse, G } from 'react-native-svg';
import { colors, font, space, radius } from '../../../theme';

// ─── Illustrations ────────────────────────────────────────────────────────────

export function SuitcaseIllustration() {
  return (
    <Svg width={200} height={170} viewBox="0 0 200 170">
      <Rect x={28} y={58} width={144} height={104} rx={14} fill={colors.illoFill} />
      <Rect x={28} y={58} width={144} height={104} rx={14} stroke={colors.illoStroke} strokeWidth={1.5} fill="none" />
      <Ellipse cx={60} cy={100} rx={16} ry={20} fill="rgba(255,255,255,0.35)" />
      <Line x1={100} y1={62} x2={100} y2={158} stroke={colors.illoStroke} strokeWidth={1.2} strokeDasharray="4,3" />
      <Rect x={44} y={158} width={12} height={6} rx={3} fill={colors.primary} />
      <Rect x={144} y={158} width={12} height={6} rx={3} fill={colors.primary} />
      <Rect x={76} y={42} width={48} height={10} rx={5} fill={colors.primary} />
      <Rect x={82} y={32} width={8} height={22} rx={4} fill={colors.illoStroke} stroke={colors.illoStrokeDeep} strokeWidth={1} />
      <Rect x={110} y={32} width={8} height={22} rx={4} fill={colors.illoStroke} stroke={colors.illoStrokeDeep} strokeWidth={1} />
      <Rect x={92} y={100} width={16} height={12} rx={3} fill={colors.primary} />
      <Path d="M95 100V96Q100 91 105 96V100" stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <G>
        <Rect x={138} y={82} width={38} height={26} rx={5} fill={colors.accent} transform="rotate(-10 138 82)" />
        <Circle cx={141} cy={85} r={3.5} fill="none" stroke={colors.white} strokeWidth={1.3} />
        <Line x1={147} y1={89} x2={172} y2={85} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
        <Line x1={147} y1={95} x2={172} y2={91} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
      </G>
      <Path d="M138 88 Q130 82 128 74" stroke={colors.illoShadow} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function MapIllustration() {
  return (
    <Svg width={220} height={175} viewBox="0 0 220 175">
      <Path
        d="M18 55Q10 36 28 22L96 8Q126 3 158 20L188 40Q204 55 198 80L182 136Q177 160 152 164L52 168Q22 165 14 144Z"
        fill={colors.illoFill}
        opacity={0.7}
      />
      <Path
        d="M62 125Q50 102 65 87Q80 72 90 61Q106 46 122 52Q144 61 148 76"
        stroke={colors.white}
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.9}
      />
      {/* Gold pin */}
      <G transform="translate(48,103)">
        <Path d="M16 0C7.2 0 0 7.2 0 16C0 27.8 16 40 16 40C16 40 32 27.8 32 16C32 7.2 24.8 0 16 0Z" fill={colors.accent} />
        <Rect x={10} y={10} width={12} height={12} rx={2} fill={colors.white} opacity={0.9} transform="rotate(45 16 16)" />
      </G>
      {/* Purple pin */}
      <G transform="translate(136,46)">
        <Path d="M18 0C8 0 0 8 0 18C0 31.5 18 46 18 46C18 46 36 31.5 36 18C36 8 28 0 18 0Z" fill={colors.primary} />
        <Rect x={12} y={12} width={12} height={12} rx={2.5} fill={colors.white} opacity={0.9} transform="rotate(45 18 18)" />
      </G>
    </Svg>
  );
}

// ─── Action row ────────────────────────────────────────────────────────────────

export function ActionButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.actionLeft}>
        {icon}
        <Text style={styles.actionLabel}>{label}</Text>
      </View>
      <Text style={styles.actionArrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg16,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    marginBottom: space.md12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: space.md12 },
  actionLabel: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  actionArrow: { fontSize: 22, color: colors.faint, marginTop: -2 },
});
