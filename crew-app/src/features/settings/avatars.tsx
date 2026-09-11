// ─── Cute crew avatars (cartoon profile pictures) ────────────────────────────
// Ten friendly flat-vector characters in the app's rounded/playful style and
// purple-family palette. Each crew is mapped to one deterministically, so the
// Profile picture is a stable, fun identity instead of a bare crew number.

import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect, Line, G } from 'react-native-svg';

// 10 characters × 3 backings = 30 pickable avatars (Profile ▸ tap the avatar).
// One cohesive purple/indigo family: subtle variety, no clashing warm tones.
const BG = [
  '#6c5ce7', '#7b4fb8', '#9b5fc9',
];
export const CHARACTER_COUNT = 10;
export const AVATAR_COUNT = CHARACTER_COUNT * BG.length;

const INK = '#2c2440';     // eyes / line work
const FACE = '#ffffff';    // character face
const CHEEK = 'rgba(255,140,170,0.55)';

/** Stable avatar index for a crew (hash → 0..AVATAR_COUNT-1). */
export function avatarForCrew(crewId: string | null | undefined): number {
  const s = (crewId ?? '').trim();
  if (!s) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % AVATAR_COUNT;
}

// Shared cute face bits.
function Eyes({ y = 52, dx = 12, r = 4.5 }: { y?: number; dx?: number; r?: number }) {
  return (
    <G>
      <Circle cx={50 - dx} cy={y} r={r} fill={INK} />
      <Circle cx={50 + dx} cy={y} r={r} fill={INK} />
      <Circle cx={50 - dx + 1.4} cy={y - 1.4} r={1.3} fill={FACE} />
      <Circle cx={50 + dx + 1.4} cy={y - 1.4} r={1.3} fill={FACE} />
    </G>
  );
}
function Cheeks({ y = 60 }: { y?: number }) {
  return (
    <G>
      <Circle cx={34} cy={y} r={4} fill={CHEEK} />
      <Circle cx={66} cy={y} r={4} fill={CHEEK} />
    </G>
  );
}
function Smile({ y = 62, w = 7 }: { y?: number; w?: number }) {
  return <Path d={`M${50 - w} ${y} Q50 ${y + 6} ${50 + w} ${y}`} stroke={INK} strokeWidth={2.4} strokeLinecap="round" fill="none" />;
}

// Each character is the inner artwork drawn over the coloured circle.
const CHARACTERS: Array<() => React.ReactNode> = [
  // 0 — Robot (the R'Bot mascot)
  () => (
    <G>
      <Line x1={50} y1={30} x2={50} y2={20} stroke={FACE} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={50} cy={17} r={4} fill={FACE} />
      <Rect x={24} y={30} width={52} height={46} rx={13} fill={FACE} />
      <Circle cx={20} cy={53} r={4} fill={FACE} />
      <Circle cx={80} cy={53} r={4} fill={FACE} />
      <Rect x={36} y={47} width={28} height={13} rx={6.5} fill={INK} />
      <Circle cx={43} cy={53.5} r={3} fill={FACE} />
      <Circle cx={57} cy={53.5} r={3} fill={FACE} />
      <Path d="M42 67 Q50 71 58 67" stroke={INK} strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </G>
  ),
  // 1 — Cat
  () => (
    <G>
      <Path d="M30 36 L34 20 L46 32 Z" fill={FACE} />
      <Path d="M70 36 L66 20 L54 32 Z" fill={FACE} />
      <Circle cx={50} cy={56} r={26} fill={FACE} />
      <Eyes y={54} />
      <Path d="M47 61 L53 61 L50 64 Z" fill="#e8709a" />
      <Smile y={66} w={5} />
      <Line x1={22} y1={56} x2={36} y2={58} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={22} y1={62} x2={36} y2={62} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={78} y1={56} x2={64} y2={58} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={78} y1={62} x2={64} y2={62} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
    </G>
  ),
  // 2 — Bear
  () => (
    <G>
      <Circle cx={30} cy={34} r={11} fill={FACE} />
      <Circle cx={70} cy={34} r={11} fill={FACE} />
      <Circle cx={30} cy={34} r={5} fill="#f0c0d0" />
      <Circle cx={70} cy={34} r={5} fill="#f0c0d0" />
      <Circle cx={50} cy={56} r={27} fill={FACE} />
      <Eyes y={52} />
      <Ellipse cx={50} cy={64} rx={11} ry={8} fill="#efe6f7" />
      <Circle cx={50} cy={61} r={3} fill={INK} />
      <Smile y={67} w={5} />
    </G>
  ),
  // 3 — Bunny
  () => (
    <G>
      <Rect x={38} y={14} width={9} height={30} rx={4.5} fill={FACE} />
      <Rect x={53} y={14} width={9} height={30} rx={4.5} fill={FACE} />
      <Rect x={40.5} y={18} width={4} height={22} rx={2} fill="#f0a8c0" />
      <Rect x={55.5} y={18} width={4} height={22} rx={2} fill="#f0a8c0" />
      <Circle cx={50} cy={58} r={25} fill={FACE} />
      <Eyes y={55} />
      <Path d="M47 62 L53 62 L50 65 Z" fill="#e8709a" />
      <Smile y={67} w={5} />
    </G>
  ),
  // 4 — Fox
  () => (
    <G>
      <Path d="M28 38 L30 18 L48 32 Z" fill="#d96b2a" />
      <Path d="M72 38 L70 18 L52 32 Z" fill="#d96b2a" />
      <Circle cx={50} cy={52} r={26} fill="#f7c89a" />
      <Path d="M50 86 L30 58 Q50 66 70 58 Z" fill={FACE} />
      <Eyes y={50} />
      <Circle cx={50} cy={66} r={3.5} fill={INK} />
      <Smile y={70} w={5} />
    </G>
  ),
  // 5 — Panda
  () => (
    <G>
      <Circle cx={30} cy={32} r={10} fill={INK} />
      <Circle cx={70} cy={32} r={10} fill={INK} />
      <Circle cx={50} cy={56} r={27} fill={FACE} />
      <Ellipse cx={40} cy={52} rx={7} ry={9} fill={INK} />
      <Ellipse cx={60} cy={52} rx={7} ry={9} fill={INK} />
      <Circle cx={40} cy={53} r={3} fill={FACE} />
      <Circle cx={60} cy={53} r={3} fill={FACE} />
      <Circle cx={50} cy={63} r={3} fill={INK} />
      <Smile y={68} w={5} />
    </G>
  ),
  // 6 — Owl
  () => (
    <G>
      <Path d="M30 34 L36 24 L42 34 Z" fill={FACE} />
      <Path d="M70 34 L64 24 L58 34 Z" fill={FACE} />
      <Circle cx={50} cy={56} r={27} fill={FACE} />
      <Circle cx={40} cy={53} r={9} fill="#efe6f7" />
      <Circle cx={60} cy={53} r={9} fill="#efe6f7" />
      <Circle cx={40} cy={53} r={4.5} fill={INK} />
      <Circle cx={60} cy={53} r={4.5} fill={INK} />
      <Path d="M46 60 L54 60 L50 66 Z" fill="#f0a04b" />
    </G>
  ),
  // 7 — Penguin
  () => (
    <G>
      <Circle cx={50} cy={54} r={28} fill={INK} />
      <Ellipse cx={50} cy={60} rx={18} ry={20} fill={FACE} />
      <Eyes y={48} dx={8} r={3.8} />
      <Path d="M45 56 L55 56 L50 62 Z" fill="#f5a623" />
      <Path d="M44 68 Q50 72 56 68" stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />
    </G>
  ),
  // 8 — Alien
  () => (
    <G>
      <Line x1={40} y1={26} x2={36} y2={16} stroke={FACE} strokeWidth={2.6} strokeLinecap="round" />
      <Line x1={60} y1={26} x2={64} y2={16} stroke={FACE} strokeWidth={2.6} strokeLinecap="round" />
      <Circle cx={36} cy={14} r={3} fill={FACE} />
      <Circle cx={64} cy={14} r={3} fill={FACE} />
      <Ellipse cx={50} cy={56} rx={26} ry={28} fill="#d7f5e7" />
      <Ellipse cx={40} cy={54} rx={6} ry={9} fill={INK} />
      <Ellipse cx={60} cy={54} rx={6} ry={9} fill={INK} />
      <Path d="M44 68 Q50 72 56 68" stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />
    </G>
  ),
  // 9 — Astronaut
  () => (
    <G>
      <Circle cx={50} cy={52} r={30} fill={FACE} />
      <Path d="M26 60 Q50 88 74 60 Z" fill="#eef0f6" />
      <Rect x={30} y={40} width={40} height={26} rx={13} fill={INK} />
      <Eyes y={52} dx={9} r={3.6} />
      <Path d="M40 58 Q50 62 60 58" stroke={FACE} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={62} cy={46} r={3} fill="rgba(255,255,255,0.5)" />
    </G>
  ),
];

/** A single cute crew avatar. Pass `bare` to drop the coloured backing disc so
 *  the character blends straight onto its surface (e.g. the purple header). */
export function CrewAvatar({
  index,
  size = 72,
  bare = false,
}: {
  index: number;
  size?: number;
  bare?: boolean;
}) {
  const { character, background } = avatarParts(index);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {!bare && <Circle cx={50} cy={50} r={50} fill={BG[background]} />}
      {CHARACTERS[character]()}
    </Svg>
  );
}

/** Split an avatar index into its character and backing-colour parts. */
export function avatarParts(index: number): { character: number; background: number } {
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  const character = ((i % CHARACTER_COUNT) + CHARACTER_COUNT) % CHARACTER_COUNT;
  const background = ((Math.floor(i / CHARACTER_COUNT) % BG.length) + BG.length) % BG.length;
  return { character, background };
}
