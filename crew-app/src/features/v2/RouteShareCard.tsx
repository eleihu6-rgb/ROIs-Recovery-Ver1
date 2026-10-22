// Route map ▸ share card.
//
// A 1080 × 1350 poster (Instagram's 4:5 portrait) drawn entirely in SVG so it
// can be rasterised at print size by react-native-svg's `toDataURL` — no view
// capture, no extra dependency. Colours come from the active carrier palette,
// including Daylight, and the roster month + year is the card's eyebrow so the
// shared picture always says which month it is.
import React, { useMemo } from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type { CarrierPalette } from '../../theme/carrier';
import type { MonthModel } from './model';
import {
  MERCATOR_GRID,
  greatCirclePath,
  mercatorX,
  mercatorY,
  positionOf,
  routeViewBox,
  unwrapLon,
} from './schedView';
import { WORLD_LAND_PATHS } from './worldLand';
import {
  buildRouteShareModel,
  shareStamps,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  type RouteShareStamp,
} from './routeShare';

const PAD = 60;
const MAP_X = PAD;
const MAP_Y = 510;
const MAP_W = SHARE_CARD_WIDTH - PAD * 2;
const MAP_H = 470;
const MAP_RADIUS = 40;

const STAMP_W = 222;
const STAMP_H = 56;
const STAMP_GAP = 18;
const STAMP_ROW_GAP = 10;
const STAMP_TOP = 1208;

const PLANE_PATH =
  'M4.2 11.6 19.4 4.6c.5-.2 1 .3.8.8l-6.9 15.1c-.2.5-1 .5-1.2 0l-2.2-5.2-5.2-2.2c-.5-.2-.5-.9 0-1.1Z';

interface RouteShareCardProps {
  month: MonthModel;
  base: string;
  palette: CarrierPalette;
  /** Carrier display name for the top row ("THAI", "Philippine Airlines"). */
  airlineName?: string;
  /** IATA code shown in the top-row disc ("TG"). */
  airlineCode?: string;
  /** Rendered size on screen. The viewBox keeps the print geometry fixed. */
  width?: number;
  height?: number;
}

interface ShareColors {
  bgA: string;
  bgB: string;
  ink: string;
  soft: string;
  faint: string;
  accent: string;
  cardLine: string;
  mapBg: string;
  landFill: string;
  landStroke: string;
  landOpacity: number;
  route: string;
  chipFill: string;
  chipLine: string;
  glow: string;
  sparkle: string;
}

function shareColors(p: CarrierPalette): ShareColors {
  return {
    bgA: p.g1,
    bgB: p.g2,
    ink: p.ink,
    soft: p.inkSoft,
    faint: p.inkFaint,
    accent: p.mapRoute,
    cardLine: p.frostLine,
    mapBg: p.mapBg,
    landFill: p.mapLand,
    landStroke: p.mapMutedRoute,
    landOpacity: p.isLight ? 0.72 : 0.34,
    route: p.mapRoute,
    chipFill: p.cardInset,
    chipLine: p.cardLine,
    glow: p.frost,
    sparkle: p.mapRoute,
  };
}

/** Four-point sparkle — the card's only decoration beyond the map. */
function Sparkle({ x, y, r, fill, opacity }: { x: number; y: number; r: number; fill: string; opacity: number }): React.JSX.Element {
  const k = r * 0.22;
  return (
    <Path
      d={`M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z`}
      fill={fill}
      opacity={opacity}
    />
  );
}

function stampText(km: number): string {
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

function Stamp({ stamp, x, y, colors }: { stamp: RouteShareStamp; x: number; y: number; colors: ShareColors }): React.JSX.Element {
  return (
    <G>
      <Rect
        x={x}
        y={y}
        width={STAMP_W}
        height={STAMP_H}
        rx={STAMP_H / 2}
        fill={colors.chipFill}
        stroke={colors.chipLine}
        strokeWidth={2}
        strokeDasharray="7 7"
      />
      {stamp.km === null ? (
        <>
          <SvgText x={x + STAMP_W / 2} y={y + 27} textAnchor="middle" fill={colors.ink} fontSize={24} fontWeight="700" letterSpacing={1}>
            {stamp.code}
          </SvgText>
          <SvgText x={x + STAMP_W / 2} y={y + 45} textAnchor="middle" fill={colors.soft} fontSize={12} fontWeight="600" letterSpacing={2}>
            MORE
          </SvgText>
        </>
      ) : (
        <>
          <SvgText x={x + 22} y={y + 36} fill={colors.ink} fontSize={26} fontWeight="700" letterSpacing={1} testID={`route-share-stamp-${stamp.code}`}>
            {stamp.code}
          </SvgText>
          <SvgText x={x + STAMP_W - 22} y={y + 35} textAnchor="end" fill={colors.soft} fontSize={18} fontWeight="500">
            {stampText(stamp.km)}
          </SvgText>
        </>
      )}
    </G>
  );
}

export const RouteShareCard = React.forwardRef<React.ElementRef<typeof Svg>, RouteShareCardProps>(
  function RouteShareCard(
    {
      month,
      base,
      palette: p,
      airlineName = '',
      airlineCode = '',
      width = SHARE_CARD_WIDTH,
      height = SHARE_CARD_HEIGHT,
    },
    ref,
  ): React.JSX.Element {
    const model = useMemo(() => buildRouteShareModel(month, base), [month, base]);
    const colors = useMemo(() => shareColors(p), [p]);
    const stamps = useMemo(() => shareStamps(model.routes), [model.routes]);
    // The base position is what the map frames on, exactly like the in-app map.
    const home = useMemo(() => positionOf(model.baseCode), [model.baseCode]);
    const viewBox = useMemo(
      () => (home ? routeViewBox(home, model.routes.map(route => route.position), 1, MAP_W / MAP_H) : null),
      [home, model.routes],
    );

    return (
      <Svg
        ref={ref}
        width={width}
        height={height}
        viewBox={`0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}`}
        testID="route-share-card"
      >
        <Defs>
          <LinearGradient id="share-bg" x1="0%" y1="0%" x2="35%" y2="100%">
            <Stop offset="0%" stopColor={colors.bgA} />
            <Stop offset="100%" stopColor={colors.bgB} />
          </LinearGradient>
          <ClipPath id="share-map-clip">
            <Rect x={MAP_X} y={MAP_Y} width={MAP_W} height={MAP_H} rx={MAP_RADIUS} />
          </ClipPath>
        </Defs>

        <Rect x={0} y={0} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} fill="url(#share-bg)" />
        <Circle cx={1010} cy={140} r={270} fill={colors.glow} />
        <Circle cx={30} cy={1210} r={230} fill={colors.glow} />
        <Sparkle x={938} y={196} r={15} fill={colors.sparkle} opacity={0.75} />
        <Sparkle x={982} y={244} r={8} fill={colors.sparkle} opacity={0.5} />
        <Sparkle x={74} y={1080} r={10} fill={colors.sparkle} opacity={0.35} />

        {/* Top row: the carrier the crew flies for. */}
        <Circle cx={86} cy={104} r={25} fill="none" stroke={colors.accent} strokeWidth={2} />
        <SvgText x={86} y={113} textAnchor="middle" fill={colors.ink} fontSize={24} fontWeight="700" letterSpacing={1}>
          {airlineCode || '··'}
        </SvgText>
        <SvgText x={126} y={115} fill={colors.ink} fontSize={30} fontWeight="700" letterSpacing={5} testID="route-share-airline">
          {(airlineName || 'CREW').toUpperCase()}
        </SvgText>
        <G transform="translate(958 88) scale(2.3) rotate(-10)">
          <Path d={PLANE_PATH} fill="none" stroke={colors.accent} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        </G>

        {/* Month + year, the one thing a shared card must always say. */}
        <SvgText x={PAD} y={196} fill={colors.accent} fontSize={34} fontWeight="700" letterSpacing={10} testID="route-share-card-month">
          {model.monthStamp}
        </SvgText>

        <SvgText x={PAD - 2} y={300} fill={colors.ink} fontSize={92} fontWeight="700" letterSpacing={-2}>
          MY MONTH
        </SvgText>
        <SvgText x={PAD - 2} y={396} fill={colors.ink} fontSize={92} fontWeight="700" letterSpacing={-2}>
          IN THE SKY
        </SvgText>
        <Rect x={PAD} y={420} width={88} height={8} rx={4} fill={colors.accent} />
        <SvgText x={PAD} y={466} fill={colors.soft} fontSize={24} fontWeight="600" letterSpacing={4} testID="route-share-card-base">
          {`${model.baseCode} · ${model.baseLabel}`.toUpperCase()}
        </SvgText>

        {/* Map postcard. */}
        <G clipPath="url(#share-map-clip)">
          <Rect x={MAP_X} y={MAP_Y} width={MAP_W} height={MAP_H} fill={colors.mapBg} />
          {home
            ? (() => {
                const [vbX, vbY, vbW, vbH] = viewBox!.split(' ').map(Number);
                const scale = Math.min(MAP_W / vbW, MAP_H / vbH);
                const offsetX = MAP_X + (MAP_W - vbW * scale) / 2;
                const offsetY = MAP_Y + (MAP_H - vbH * scale) / 2;
                const shifts: number[] = [];
                for (let k = Math.floor(vbX / MERCATOR_GRID); k * MERCATOR_GRID < vbX + vbW; k++) {
                  shifts.push(k * MERCATOR_GRID);
                }
                const xOf = (lon: number) => mercatorX(unwrapLon(lon, home.lon));
                return (
                  <G transform={`translate(${offsetX} ${offsetY}) scale(${scale}) translate(${-vbX} ${-vbY})`}>
                    {shifts.map(dx => (
                      <G key={`share-world-${dx}`} transform={`translate(${dx} 0)`} opacity={0.9}>
                        {WORLD_LAND_PATHS.map((d, i) => (
                          <Path
                            key={`share-land-${i}`}
                            d={d}
                            fill={colors.landFill}
                            fillOpacity={colors.landOpacity}
                            stroke={colors.landStroke}
                            strokeWidth={0.6 / scale}
                          />
                        ))}
                      </G>
                    ))}
                    {model.routes.map(route => (
                      <Path
                        key={`share-glow-${route.code}`}
                        d={greatCirclePath(home, route.position, undefined, home.lon)}
                        fill="none"
                        stroke={colors.route}
                        strokeOpacity={0.12}
                        strokeWidth={16 / scale}
                        strokeLinecap="round"
                      />
                    ))}
                    {model.routes.map(route => (
                      <Path
                        key={`share-route-${route.code}`}
                        d={greatCirclePath(home, route.position, undefined, home.lon)}
                        fill="none"
                        stroke={colors.route}
                        strokeOpacity={0.95}
                        strokeWidth={5 / scale}
                        strokeLinecap="round"
                      />
                    ))}
                    {model.routes.map(route => (
                      <G key={`share-dot-${route.code}`}>
                        <Circle cx={xOf(route.position.lon)} cy={mercatorY(route.position.lat)} r={14 / scale} fill="none" stroke={colors.route} strokeOpacity={0.3} strokeWidth={2 / scale} />
                        <Circle cx={xOf(route.position.lon)} cy={mercatorY(route.position.lat)} r={7 / scale} fill={colors.route} />
                      </G>
                    ))}
                    <Circle cx={xOf(home.lon)} cy={mercatorY(home.lat)} r={17 / scale} fill="none" stroke={colors.route} strokeOpacity={0.35} strokeWidth={2 / scale} />
                    <Circle cx={xOf(home.lon)} cy={mercatorY(home.lat)} r={9 / scale} fill={colors.mapBg} stroke={colors.route} strokeWidth={4 / scale} />
                  </G>
                );
              })()
            : null}
        </G>

        {/* Postcard edge + stamp perforation. */}
        <Rect x={MAP_X} y={MAP_Y} width={MAP_W} height={MAP_H} rx={MAP_RADIUS} fill="none" stroke={colors.cardLine} strokeWidth={2} />
        <Rect
          x={MAP_X + 14}
          y={MAP_Y + 14}
          width={MAP_W - 28}
          height={MAP_H - 28}
          rx={MAP_RADIUS - 12}
          fill="none"
          stroke={colors.chipLine}
          strokeWidth={2}
          strokeDasharray="0.1 16"
          strokeLinecap="round"
          opacity={0.55}
        />

        {/* A paper plane "sticker" with a dotted trail: the postcard's one wink. */}
        <Path d="M858 478C902 446 950 454 972 492" fill="none" stroke={colors.accent} strokeWidth={3} strokeDasharray="3 12" strokeLinecap="round" opacity={0.65} />
        <G transform="translate(948 466) scale(2.6) rotate(12)">
          <Path d={PLANE_PATH} fill={colors.bgA} stroke={colors.accent} strokeWidth={1.6} strokeLinejoin="round" />
        </G>

        {/* Headline figures. */}
        <Rect x={360} y={1022} width={2} height={116} fill={colors.faint} opacity={0.35} />
        <Rect x={690} y={1022} width={2} height={116} fill={colors.faint} opacity={0.35} />
        <SvgText x={PAD} y={1094} fill={colors.ink} fontSize={64} fontWeight="700" letterSpacing={-1} testID="route-share-card-flights">
          {String(model.stats.flights)}
        </SvgText>
        <SvgText x={PAD} y={1132} fill={colors.soft} fontSize={20} fontWeight="600" letterSpacing={4}>
          FLIGHTS
        </SvgText>
        <SvgText x={390} y={1094} fill={colors.ink} fontSize={64} fontWeight="700" letterSpacing={-1} testID="route-share-card-km">
          {Math.round(model.stats.km).toLocaleString('en-US')}
        </SvgText>
        <SvgText x={390} y={1132} fill={colors.soft} fontSize={20} fontWeight="600" letterSpacing={4}>
          KM FLOWN
        </SvgText>
        <SvgText x={720} y={1094} fill={colors.ink} fontSize={64} fontWeight="700" letterSpacing={-1} testID="route-share-card-countries">
          {String(model.stats.countries)}
        </SvgText>
        <SvgText x={720} y={1132} fill={colors.soft} fontSize={20} fontWeight="600" letterSpacing={4}>
          COUNTRIES
        </SvgText>

        {/* Destination stamps. */}
        <SvgText x={PAD} y={1184} fill={colors.soft} fontSize={20} fontWeight="600" letterSpacing={4}>
          DESTINATION STAMPS
        </SvgText>
        {[stamps.slice(0, 4), stamps.slice(4, 8)].map((row, rowIndex) => {
          if (row.length === 0) return null;
          const rowWidth = row.length * STAMP_W + (row.length - 1) * STAMP_GAP;
          const startX = (SHARE_CARD_WIDTH - rowWidth) / 2;
          const y = STAMP_TOP + rowIndex * (STAMP_H + STAMP_ROW_GAP);
          return row.map((stamp, columnIndex) => (
            <Stamp
              key={`stamp-${stamp.code}-${columnIndex}`}
              stamp={stamp}
              x={startX + columnIndex * (STAMP_W + STAMP_GAP)}
              y={y}
              colors={colors}
            />
          ));
        })}
      </Svg>
    );
  },
);
