// Small outline vector icons shared across trip/duty UI (enhance-Ver1 #10).
// They match the nav-bar / chip icon style: 24-unit viewBox, ~1.9 stroke,
// rounded joins, colour driven by theme tokens. Replaces emoji markers so the
// glyphs render identically on iOS and Android.

import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
}

// Alarm clock with bells — "Wake Up".
export function WakeIcon({ color, size = 15 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={13} r={7.5} stroke={color} strokeWidth={1.9} />
      <Path d="M12 10v3l2 1.4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4.5 5.5 7 7.9" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M19.5 5.5 17 7.9" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

// Door with exit arrow — "Leave Home".
export function LeaveIcon({ color, size = 15 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h7" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 12h9m-3-3 3 3-3 3" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Simple clock — check-in time chip.
export function ClockIcon({ color, size = 15 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.9} />
      <Path d="M12 7.5V12l3 1.8" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Bed / building — hotel layover row.
export function HotelIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 18v-7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v7" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 14h18" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M7 10V7a1 1 0 0 1 1-1h3" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={8.5} cy={11.5} r={1.4} stroke={color} strokeWidth={1.6} />
      <Path d="M3 18v2m18-2v2" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

// Bell — test alarm.
export function BellIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 16V11a6 6 0 1 0-12 0v5l-1.5 2.5h15L18 16Z"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M10 20.5a2 2 0 0 0 4 0" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

// Calendar page with a plus — "add this duty to the iOS Calendar".
export function CalendarPlusIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 7.5a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5v-11Z"
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <Path d="M4.5 10.5h15" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M8.5 4v4m7-4v4" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M12 13.5v4M10 15.5h4" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

// Calendar page with a tick — the duty is already in the iOS Calendar.
export function CalendarCheckIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 7.5a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5v-11Z"
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <Path d="M4.5 10.5h15" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M8.5 4v4m7-4v4" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path
        d="m9.3 15.3 1.9 1.9 3.5-3.6"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export type { IconProps };
