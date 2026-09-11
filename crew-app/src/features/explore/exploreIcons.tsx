// ─── Explore vector icons ─────────────────────────────────────────────────────
// Single-colour outline icons (nav-bar style) replacing the multi-colour emoji
// that previously marked categories / ratings / walk time. One colour each,
// driven by a theme token — keeps Explore on the "one accent + neutrals" palette.

import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
}

const SW = 1.8;

function Frame({ size = 18, children }: { size?: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

// Per-category outline glyphs, keyed by category.key.
const GLYPHS: Record<string, (c: string) => React.ReactNode> = {
  cafe: c => (
    <G stroke={c} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z" />
      <Path d="M16 9h2a2 2 0 0 1 0 4h-2" />
      <Path d="M7 2.5v2M10 2.5v2M13 2.5v2" />
    </G>
  ),
  food: c => (
    <G stroke={c} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 11h16a8 8 0 0 1-16 0z" />
      <Path d="M8 3l3 7M16 4l-3 6" />
    </G>
  ),
  thai: c => (
    <G stroke={c} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 12a7 7 0 0 0 10 5c3-1.5 4-5.5 1.5-8.5" />
      <Path d="M18 4.5c-1 1-2.5 1-3.5 2.5" />
    </G>
  ),
  shopping: c => (
    <G stroke={c} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 8h12l-1 12H7L6 8z" />
      <Path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </G>
  ),
  sightseeing: c => (
    <G stroke={c} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={7} width={18} height={13} rx={2} />
      <Circle cx={12} cy={13.5} r={3.5} />
      <Path d="M8 7l1.5-2.5h5L16 7" />
    </G>
  ),
  nature: c => (
    <G stroke={c} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3l5 7h-3l4 6H6l4-6H7l5-7z" />
      <Path d="M12 16v5" />
    </G>
  ),
  bar: c => (
    <G stroke={c} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 5h16l-8 8z" />
      <Path d="M12 13v6M8 21h8" />
    </G>
  ),
  spa: c => (
    <G stroke={c} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M8 4c-1 1-1 2.2 0 3.2s1 2.2 0 3.2" />
      <Path d="M12 4c-1 1-1 2.2 0 3.2s1 2.2 0 3.2" />
      <Path d="M16 4c-1 1-1 2.2 0 3.2s1 2.2 0 3.2" />
      <Path d="M3.5 16.5h17M5.5 20h13" />
    </G>
  ),
  fitness: c => (
    <G stroke={c} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6.5 9v6M4 8v8M17.5 9v6M20 8v8M6.5 12h11" />
    </G>
  ),
  convenience: c => (
    <G stroke={c} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 9l1-4h14l1 4" />
      <Rect x={4} y={9} width={16} height={11} />
      <Path d="M10 20v-7h4v7" />
    </G>
  ),
};

/** Category marker icon (replaces the per-category emoji). */
export function CategoryIcon({ category, color, size = 18 }: IconProps & { category: string }) {
  const draw = GLYPHS[category] ?? GLYPHS.sightseeing;
  return <Frame size={size}>{draw(color)}</Frame>;
}

/** Filled rating star (replaces ★). */
export function StarIcon({ color, size = 14 }: IconProps) {
  return (
    <Frame size={size}>
      <Path d="M12 2.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9l6.1-.9L12 2.5z" fill={color} />
    </Frame>
  );
}

/** Walking figure (replaces 🚶). */
export function WalkIcon({ color, size = 13 }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Circle cx={13} cy={4} r={2} />
        <Path d="M13 7l-1.5 5 2.5 6" />
        <Path d="M11.5 12l-3 5" />
        <Path d="M13 8.5l3.5 2.5" />
        <Path d="M11.7 9l-3 1" />
      </G>
    </Frame>
  );
}
