// ─── Trip Trade icons ─────────────────────────────────────────────────────────
// Nav-bar style outline glyphs: 24-unit viewBox, ~1.9 stroke, rounded joins,
// colour from a theme token. No emoji as UI icons (CLAUDE.md UI rules).

import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import type { IconKey } from './tripTradeModel';

interface IconProps {
  color: string;
  size?: number;
  strokeWidth?: number;
}

function Base({ size = 20, children }: { size?: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

const common = (color: string, strokeWidth: number) => ({
  stroke: color,
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function ListIcon({ color, size, strokeWidth = 1.9 }: IconProps) {
  const p = common(color, strokeWidth);
  return (
    <Base size={size}>
      <Path d="M8 6h12M8 12h12M8 18h12" {...p} />
      <Path d="M4 6h.01M4 12h.01M4 18h.01" {...p} />
    </Base>
  );
}

export function SwapIcon({ color, size, strokeWidth = 1.9 }: IconProps) {
  return (
    <Base size={size}>
      <Path d="M7 8h11l-3-3M17 16H6l3 3" {...common(color, strokeWidth)} />
    </Base>
  );
}

export function InboxIcon({ color, size, strokeWidth = 1.9 }: IconProps) {
  return (
    <Base size={size}>
      <Path d="M4 13h4l2 3h4l2-3h4M4 13l3-8h10l3 8v6H4z" {...common(color, strokeWidth)} />
    </Base>
  );
}

export function UserIcon({ color, size, strokeWidth = 1.9 }: IconProps) {
  const p = common(color, strokeWidth);
  return (
    <Base size={size}>
      <Circle cx={12} cy={8} r={3.5} {...p} />
      <Path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" {...p} />
    </Base>
  );
}

export function PlusIcon({ color, size, strokeWidth = 2 }: IconProps) {
  return (
    <Base size={size}>
      <Path d="M12 5v14M5 12h14" {...common(color, strokeWidth)} />
    </Base>
  );
}

export function CalendarIcon({ color, size, strokeWidth = 1.9 }: IconProps) {
  const p = common(color, strokeWidth);
  return (
    <Base size={size}>
      <Rect x={4} y={5} width={16} height={16} rx={2} {...p} />
      <Path d="M4 9h16M8 3v4M16 3v4" {...p} />
    </Base>
  );
}

export function ArrowUpIcon({ color, size, strokeWidth = 2 }: IconProps) {
  return (
    <Base size={size}>
      <Path d="M12 19V5M6 11l6-6 6 6" {...common(color, strokeWidth)} />
    </Base>
  );
}

export function PlaneIcon({ color, size, strokeWidth = 2 }: IconProps) {
  return (
    <Base size={size}>
      <Path d="M12 4l1.6 6.4L21 12l-7.4 1.6L12 20l-1.2-4.8" {...common(color, strokeWidth)} />
    </Base>
  );
}

function MoonIcon({ color, size, strokeWidth = 2 }: IconProps) {
  return (
    <Base size={size}>
      <Path d="M20 14a8 8 0 1 1-9-9 6 6 0 0 0 9 9z" {...common(color, strokeWidth)} />
    </Base>
  );
}

function GlobeIcon({ color, size, strokeWidth = 1.9 }: IconProps) {
  const p = common(color, strokeWidth);
  return (
    <Base size={size}>
      <Circle cx={12} cy={12} r={8} {...p} />
      <Path d="M4 12h16M12 4c2.5 2 2.5 14 0 16M12 4c-2.5 2-2.5 14 0 16" {...p} />
    </Base>
  );
}

function RepeatIcon({ color, size, strokeWidth = 2 }: IconProps) {
  return (
    <Base size={size}>
      <Path d="M4 9l3-3h10l3 3M20 15l-3 3H7l-3-3" {...common(color, strokeWidth)} />
    </Base>
  );
}

function TargetIcon({ color, size, strokeWidth = 1.9 }: IconProps) {
  const p = common(color, strokeWidth);
  return (
    <Base size={size}>
      <Circle cx={12} cy={12} r={8} {...p} />
      <Circle cx={12} cy={12} r={3.4} {...p} />
    </Base>
  );
}

function ClockIcon({ color, size, strokeWidth = 1.9 }: IconProps) {
  const p = common(color, strokeWidth);
  return (
    <Base size={size}>
      <Circle cx={12} cy={12} r={8} {...p} />
      <Path d="M12 8v4l3 2" {...p} />
    </Base>
  );
}

/** Resolve a model IconKey to the matching glyph (used by the generic-wants list). */
export function WantIcon({ icon, color, size = 15 }: { icon?: IconKey; color: string; size?: number }) {
  switch (icon) {
    case 'moon': return <MoonIcon color={color} size={size} />;
    case 'globe': return <GlobeIcon color={color} size={size} />;
    case 'repeat': return <RepeatIcon color={color} size={size} />;
    case 'plane': return <PlaneIcon color={color} size={size} />;
    case 'clock': return <ClockIcon color={color} size={size} />;
    case 'calendar': return <CalendarIcon color={color} size={size} />;
    case 'target':
    default: return <TargetIcon color={color} size={size} />;
  }
}
