// ─── Header backdrop texture ─────────────────────────────────────────────────
// Sparse, faint motifs drawn behind a screen's purple header for a bit of
// playful depth. Two moods:
//   • 'travel'  — a paper plane on a dashed flight path, suitcase, cloud (Profile / Sign On)
//   • 'explore' — a compass, mountains, a winding trail + map pins (Explore)
// Motifs are kept to the sides/bottom so they DON'T overlap the header text or
// the dynamic island (top-centre). Non-interactive.

import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle, Line, G } from 'react-native-svg';

const LINE = 'rgba(255,255,255,0.13)';
const FILL = 'rgba(255,255,255,0.09)';
const FAINT = 'rgba(255,255,255,0.07)';
const DOT = 'rgba(255,255,255,0.16)';

// A simple map pin (head circle + point + centre dot) at (x, y = head centre).
function Pin({ x, y }: { x: number; y: number }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={6} stroke={LINE} strokeWidth={2} fill="none" />
      <Path d={`M${x - 4.2} ${y + 4.2} L${x} ${y + 12} L${x + 4.2} ${y + 4.2}`} stroke={LINE} strokeWidth={2} strokeLinejoin="round" fill="none" />
      <Circle cx={x} cy={y} r={2} fill={LINE} />
    </G>
  );
}

function TravelMotifs() {
  return (
    <>
      {/* dashed flight path sweeping up toward the plane */}
      <Path d="M44 176 Q150 78 348 50" stroke={LINE} strokeWidth={2.4} strokeDasharray="1.5 11" strokeLinecap="round" fill="none" />
      {/* paper plane, top-right */}
      <G>
        <Path d="M356 42 L300 62 L327 68 Z" fill={FILL} />
        <Path d="M356 42 L327 68 L322 89 Z" fill={FAINT} />
      </G>
      {/* soft cloud, mid-left — kept low so it never sits under the island */}
      <Path d="M120 104 a10 10 0 0 1 10 -10 a13 13 0 0 1 25 3 a9 9 0 0 1 1 17 h-33 a9 9 0 0 1 -3 -10 z" fill={FILL} />
      {/* little suitcase, lower-left */}
      <G>
        <Rect x={36} y={150} width={48} height={36} rx={7} stroke={LINE} strokeWidth={2.2} fill="none" />
        <Path d="M50 150 a10 8 0 0 1 20 0" stroke={LINE} strokeWidth={2.2} fill="none" />
        <Line x1={60} y1={150} x2={60} y2={186} stroke={LINE} strokeWidth={2} />
      </G>
      {/* sparkles */}
      <Circle cx={252} cy={36} r={2.4} fill={DOT} />
      <Circle cx={300} cy={120} r={2.2} fill={DOT} />
    </>
  );
}

function ExploreMotifs() {
  return (
    <>
      {/* compass, top-right (clear of the island + title) */}
      <G>
        <Circle cx={344} cy={50} r={19} stroke={LINE} strokeWidth={2.2} fill="none" />
        <Path d="M344 37 L348 50 L344 63 L340 50 Z" fill={FILL} />
        <Path d="M344 28v4M344 68v4M321 50h4M363 50h4" stroke={LINE} strokeWidth={2} strokeLinecap="round" />
      </G>
      {/* mountain ranges along the bottom */}
      <Path d="M-5 210 L55 162 L100 192 L165 150 L235 196 L300 158 L395 200" stroke={LINE} strokeWidth={2.2} strokeLinejoin="round" fill="none" />
      <Path d="M-5 214 L80 186 L140 208 L210 182 L285 210 L360 184 L395 208" stroke={FAINT} strokeWidth={2} strokeLinejoin="round" fill="none" />
      {/* winding dashed trail across the lower band */}
      <Path d="M28 198 Q170 152 360 178" stroke={LINE} strokeWidth={2.2} strokeDasharray="1.5 10" strokeLinecap="round" fill="none" />
      {/* map pins (right + lower-left, below the title) */}
      <Pin x={300} y={116} />
      <Pin x={120} y={150} />
      {/* sparkles */}
      <Circle cx={250} cy={34} r={2.4} fill={DOT} />
      <Circle cx={210} cy={120} r={2} fill={DOT} />
    </>
  );
}

// 'signon' — a check-in / departure mood for the Sign On tab: an outline clock
// (your next check-in time) and a boarding-pass ticket on a dashed boarding path.
// Everything sits on the LEFT and along the BOTTOM so it clears the dynamic
// island (top-centre) and the right-aligned "Sign On" title (upper-right).
function SignOnMotifs() {
  return (
    <>
      {/* clock — top-left, reads ~10:10; well clear of island + title */}
      <G>
        <Circle cx={58} cy={56} r={20} stroke={LINE} strokeWidth={2.2} fill="none" />
        {/* hour ticks at 12 / 3 / 6 / 9 */}
        <Path d="M58 39v4M58 69v4M41 56h4M71 56h4" stroke={LINE} strokeWidth={2} strokeLinecap="round" />
        {/* hands + centre pin */}
        <Path d="M58 56 L58 44 M58 56 L67 60" stroke={LINE} strokeWidth={2.2} strokeLinecap="round" />
        <Circle cx={58} cy={56} r={2.2} fill={LINE} />
      </G>

      {/* dashed boarding path sweeping from the clock down across the bottom */}
      <Path d="M70 78 Q70 130 150 150 T380 150" stroke={LINE} strokeWidth={2.2} strokeDasharray="1.5 10" strokeLinecap="round" fill="none" />

      {/* boarding-pass ticket, lower-left — perforated stub + faint detail lines */}
      <G>
        <Rect x={36} y={150} width={150} height={44} rx={9} stroke={LINE} strokeWidth={2.2} fill="none" />
        {/* perforation between the main pass and the tear-off stub */}
        <Path d="M150 154v36" stroke={LINE} strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />
        {/* passenger / flight detail lines */}
        <Path d="M48 164h74M48 174h54" stroke={FAINT} strokeWidth={2.4} strokeLinecap="round" />
        {/* boarding-time dot on the stub */}
        <Circle cx={168} cy={172} r={3} fill={FILL} />
      </G>

      {/* sparkles, off the island + title */}
      <Circle cx={250} cy={34} r={2.4} fill={DOT} />
      <Circle cx={120} cy={108} r={2} fill={DOT} />
    </>
  );
}

export function HeaderBackdrop({
  variant = 'travel',
}: {
  variant?: 'travel' | 'explore' | 'signon';
}) {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 390 220"
      preserveAspectRatio="xMidYMid slice"
      pointerEvents="none">
      {variant === 'explore' ? (
        <ExploreMotifs />
      ) : variant === 'signon' ? (
        <SignOnMotifs />
      ) : (
        <TravelMotifs />
      )}
    </Svg>
  );
}
