import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'plane'
  | 'globe'
  | 'user'
  | 'bell'
  | 'alarm'
  | 'gear'
  | 'cal'
  | 'calcheck'
  | 'swap'
  | 'checkin'
  | 'check'
  | 'bed'
  | 'car'
  | 'more'
  | 'heart'
  | 'chev'
  | 'back'
  | 'qr'
  | 'sliders'
  | 'headset'
  | 'logout'
  | 'cam'
  | 'crown'
  | 'run'
  | 'star'
  | 'trip'
  | 'sunrise'
  | 'sun'
  | 'sunset'
  | 'moon'
  | 'clock'
  | 'house'
  | 'doc'
  | 'shield'
  | 'lock'
  | 'book'
  | 'jet'
  | 'menu3'
  | 'map'
  | 'list'
  | 'zoomIn'
  | 'zoomOut';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = '#fff', strokeWidth }: IconProps): React.JSX.Element {
  switch (name) {
    case 'home':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.7} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4 11.5 12 5l8 6.5" />
          <Path d="M6 10.5V19a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1v-8.5" />
        </Svg>
      );
    case 'plane':
      return (
        <Svg width={size} height={size} viewBox="2 2 30 26" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.5} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M14.398,18.689l-1.339,3.767c-0.139,0.391,0.231,0.771,0.625,0.643l1.258-0.408c0.1-0.033,0.188-0.096,0.249-0.181l5.854-8.01" />
          <Path d="M25.597,8.714l-5.506,1.789l-7.974-5.61c-0.126-0.096-0.29-0.116-0.442-0.066l-1.531,0.497c-0.304,0.1-0.437,0.468-0.265,0.738l4.03,6.45l-6.115,1.986c-0.637,0.208-1.329,0.086-1.854-0.333l-1.783-1.408c-0.129-0.104-0.306-0.132-0.467-0.079l-0.97,0.314c-0.333,0.109-0.456,0.506-0.24,0.783l1.948,2.532c1.3,1.67,3.499,2.354,5.505,1.702l19.668-6.391c0.685-0.223,1.057-0.954,0.834-1.638C30.3,9.563,29.967,9.25,29.547,9.123l-1.632-0.458C27.152,8.451,26.349,8.47,25.597,8.714z" />
        </Svg>
      );
    case 'globe':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.7} strokeLinecap="round">
          <Circle cx={12} cy={12} r={8.5} />
          <Path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" />
        </Svg>
      );
    case 'user':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.7} strokeLinecap="round">
          <Circle cx={12} cy={8.5} r={3.8} />
          <Path d="M5 20a7 7 0 0 1 14 0" />
        </Svg>
      );
    case 'bell':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M18 8.5a6 6 0 0 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5" />
          <Path d="M13.7 20a2 2 0 0 1-3.4 0" />
        </Svg>
      );
    case 'alarm':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx={12} cy={13} r={7.5} />
          <Path d="M12 9.5V13l2.5 1.5M4.5 5.5 7 3.5M19.5 5.5 17 3.5M7 20l-1.5 1.5M17 20l1.5 1.5" />
        </Svg>
      );
    case 'gear':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx={12} cy={12} r={3} />
          <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1A2 2 0 1 1 8.5 5.2l.1.1A1.7 1.7 0 0 0 11 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 11a2 2 0 1 1 0 4z" />
        </Svg>
      );
    case 'cal':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round">
          <Rect x={3} y={5} width={18} height={16} rx={3} />
          <Path d="M3 10h18M8 3v4M16 3v4" />
        </Svg>
      );
    case 'calcheck':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={3} y={5} width={18} height={16} rx={3} />
          <Path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4" />
        </Svg>
      );
    case 'swap':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M17 3l4 4-4 4M3 11V9a2 2 0 0 1 2-2h16M7 21l-4-4 4-4M21 13v2a2 2 0 0 1-2 2H3" />
        </Svg>
      );
    case 'checkin':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M9 12l2 2 4-4" />
          <Rect x={3} y={4} width={18} height={16} rx={3} />
        </Svg>
      );
    case 'check':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M5 12.5l4.5 4.5L19 7.5" />
        </Svg>
      );
    // Line-style bed (crew hotel) and car (layover transfer) — same 24px grid and
    // 1.6 stroke as the rest of the set.
    case 'bed':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 19v-9M3 14h15.5a2.5 2.5 0 0 1 2.5 2.5V19" />
          <Circle cx={7.5} cy={11.5} r={2.2} />
        </Svg>
      );
    case 'car':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4 13.5 5.6 9A2 2 0 0 1 7.5 7.7h9a2 2 0 0 1 1.9 1.3L20 13.5" />
          <Rect x={3} y={13} width={18} height={4.6} rx={1.6} />
          <Path d="M7 17.6v1.6M17 17.6v1.6" />
        </Svg>
      );
    case 'more':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Circle cx={5} cy={12} r={1.8} />
          <Circle cx={12} cy={12} r={1.8} />
          <Circle cx={19} cy={12} r={1.8} />
        </Svg>
      );
    case 'heart':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.8} strokeLinejoin="round">
          <Path d="M12 20s-7.5-4.4-7.5-10A4.5 4.5 0 0 1 12 7.5 4.5 4.5 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" />
        </Svg>
      );
    case 'chev':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M9 6l6 6-6 6" />
        </Svg>
      );
    case 'back':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M15 6l-6 6 6 6" />
        </Svg>
      );
    case 'qr':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.8}>
          <Rect x={4} y={4} width={6} height={6} rx={1} />
          <Rect x={14} y={4} width={6} height={6} rx={1} />
          <Rect x={4} y={14} width={6} height={6} rx={1} />
          <Path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2" />
        </Svg>
      );
    case 'sliders':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round">
          <Path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h12M20 17h0" />
          <Circle cx={16} cy={7} r={2} />
          <Circle cx={9} cy={12} r={2} />
          <Circle cx={18} cy={17} r={2} />
        </Svg>
      );
    case 'headset':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <Rect x={3} y={13} width={4} height={6} rx={2} />
          <Rect x={17} y={13} width={4} height={6} rx={2} />
          <Path d="M19 19a3 3 0 0 1-3 2h-2" />
        </Svg>
      );
    case 'logout':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l5 4-5 4M20 12H9" />
        </Svg>
      );
    case 'cam':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 2} strokeLinejoin="round">
          <Path d="M4 8h3l2-2h6l2 2h3v11H4z" />
          <Circle cx={12} cy={13} r={3} />
        </Svg>
      );
    case 'crown':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
        </Svg>
      );
    case 'run':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.8} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx={14} cy={4.5} r={1.5} />
          <Path d="M6 21l4-7 3 2 1-6-3-1-4 4M12 10l2 2 3-1" />
        </Svg>
      );
    case 'star':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Path d="M12 2l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17l-6.1 3.5 1.5-6.8L2.2 9l6.9-.7z" />
        </Svg>
      );
    case 'trip':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={3} y={7} width={18} height={13} rx={2.5} />
          <Path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M8 7v13M16 7v13" />
        </Svg>
      );
    case 'sunrise':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M17 18a5 5 0 0 0-10 0M12 3v4M4.2 11.2l1.4 1.4M1 18h2M21 18h2M18.4 12.6l1.4-1.4M23 22H1M8 6l4-3 4 3" />
        </Svg>
      );
    case 'sun':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round">
          <Circle cx={12} cy={12} r={4.5} />
          <Path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </Svg>
      );
    case 'sunset':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M17 18a5 5 0 0 0-10 0M12 9V3M4.2 11.2l1.4 1.4M1 18h2M21 18h2M18.4 12.6l1.4-1.4M23 22H1M16 6l-4 3-4-3" />
        </Svg>
      );
    case 'moon':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </Svg>
      );
    case 'clock':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round">
          <Circle cx={12} cy={12} r={9} />
          <Path d="M12 7v5l3 2" />
        </Svg>
      );
    case 'house':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4 11.5 12 5l8 6.5" />
          <Path d="M6 10.5V20h12v-9.5" />
          <Path d="M10 20v-5h4v5" />
        </Svg>
      );
    case 'doc':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <Path d="M14 3v5h5M9 13h6M9 17h6" />
        </Svg>
      );
    case 'shield':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinejoin="round">
          <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
        </Svg>
      );
    case 'book':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2z" />
          <Path d="M4 17a2 2 0 0 1 2-2h14M8 7h8" />
        </Svg>
      );
    case 'jet':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
        </Svg>
      );
    case 'menu3':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.9} strokeLinecap="round">
          <Path d="M4 7h16M4 12h16M4 17h16" />
        </Svg>
      );
    case 'list':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.7} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
        </Svg>
      );
    case 'map':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.7} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z" />
          <Path d="M9 4v14M15 6v14" />
        </Svg>
      );
    case 'zoomIn':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.7} strokeLinecap="round">
          <Circle cx={11} cy={11} r={6.5} />
          <Path d="M11 8.5v5M8.5 11h5M16 16l4 4" />
        </Svg>
      );
    case 'lock':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.7} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={5} y={10.5} width={14} height={9.5} rx={2.4} />
          <Path d="M8.6 10.5V8a3.4 3.4 0 0 1 6.8 0v2.5" />
        </Svg>
      );
    case 'zoomOut':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth ?? 1.7} strokeLinecap="round">
          <Circle cx={11} cy={11} r={6.5} />
          <Path d="M8.5 11h5M16 16l4 4" />
        </Svg>
      );
    default:
      return <Svg width={size} height={size} viewBox="0 0 24 24" />;
  }
}
