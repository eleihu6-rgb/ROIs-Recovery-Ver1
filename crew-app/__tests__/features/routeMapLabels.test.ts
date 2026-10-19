// Schedule ▸ Route map · endpoint-block labels.
//
// The label layer is pure geometry: given the card's pixel size, the projected
// endpoints and the sampled great-circle arcs, every label must stay inside the
// card, clear of every arc and clear of its siblings. These tests use the real
// MNL → TPE/PVG/SIN/CGK/YVR geometry from the design mock, where TPE sits right
// beside the YVR arc — the case that produced an overlap before the clearance
// search existed.
import {
  layoutRouteLabels,
  type Point,
  type Rect,
  type RouteLabelEndpoint,
} from '../../src/features/v2/routeMapLabels';
import {
  greatCirclePoints,
  mercatorX,
  mercatorY,
  positionOf,
  routeViewBox,
  unwrapLon,
} from '../../src/features/v2/schedView';

const BASE_CODE = 'MNL';
const ROUTES = [
  { code: 'TPE', km: 1175, legs: 2 },
  { code: 'PVG', km: 1852, legs: 2 },
  { code: 'SIN', km: 2374, legs: 2 },
  { code: 'CGK', km: 2788, legs: 2 },
  { code: 'YVR', km: 10555, legs: 2 },
] as const;

const CARD = { width: 412.5, height: 563 };
const MARGIN = 8;

const home = positionOf(BASE_CODE)!;
const viewBox = routeViewBox(home, ROUTES.map(r => positionOf(r.code)!), 1, CARD.width / CARD.height)
  .split(' ')
  .map(Number);
const [vbX, vbY, vbW, vbH] = viewBox;
const scale = Math.min(CARD.width / vbW, CARD.height / vbH);
const offsetX = (CARD.width - vbW * scale) / 2;
const offsetY = (CARD.height - vbH * scale) / 2;

function toPx(point: Point): Point {
  return {
    x: offsetX + (point.x - vbX) * scale,
    y: offsetY + (point.y - vbY) * scale,
  };
}

function metaFor(km: number, legs: number): string {
  return `${Math.round(km).toLocaleString('en-US')} km · ${legs} legs`;
}

const endpoints: RouteLabelEndpoint[] = ROUTES.map(route => {
  const position = positionOf(route.code)!;
  const point = toPx({ x: mercatorX(unwrapLon(position.lon, home.lon)), y: mercatorY(position.lat) });
  const meta = metaFor(route.km, route.legs);
  return {
    code: route.code,
    x: point.x,
    y: point.y,
    width: Math.ceil(Math.max(route.code.length * 7.8, meta.length * 5.15)) + 15,
    height: 28,
    weight: route.km,
  };
});

const polylines = ROUTES.map(route => ({
  code: route.code,
  points: greatCirclePoints(home, positionOf(route.code)!, undefined, home.lon).map(toPx),
}));

const obstacles: Rect[] = [
  { x: 10, y: 10, width: 100, height: 24 }, // base badge
  { x: CARD.width - 50, y: CARD.height - 174, width: 32, height: 72 }, // zoom
  { x: 10, y: CARD.height - 95, width: CARD.width - 20, height: 85 }, // stats
];

function rectOf(label: { left: number; top: number; width: number; height: number }): Rect {
  return { x: label.left, y: label.top, width: label.width, height: label.height };
}

function rectContainsPoint(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function rectPointDistance(rect: Rect, point: Point): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function layout() {
  return layoutRouteLabels({
    endpoints,
    home: toPx({ x: mercatorX(home.lon), y: mercatorY(home.lat) }),
    polylines,
    bounds: CARD,
    obstacles,
    margin: MARGIN,
  });
}

describe('route map · endpoint-block label placement', () => {
  it('places one label per destination', () => {
    expect(layout().map(label => label.code).sort()).toEqual(ROUTES.map(r => r.code).sort());
  });

  it('keeps every label inside the card', () => {
    for (const label of layout()) {
      expect(label.left).toBeGreaterThanOrEqual(MARGIN - 0.01);
      expect(label.top).toBeGreaterThanOrEqual(MARGIN - 0.01);
      expect(label.left + label.width).toBeLessThanOrEqual(CARD.width - MARGIN + 0.01);
      expect(label.top + label.height).toBeLessThanOrEqual(CARD.height - MARGIN + 0.01);
    }
  });

  it('never masks a route arc', () => {
    for (const label of layout()) {
      const rect = rectOf(label);
      let nearest = Number.POSITIVE_INFINITY;
      for (const line of polylines) {
        for (const point of line.points) {
          // Points on a label's own endpoint are excluded by the 12pt gap; any
          // arc point inside the rect is a failure.
          expect(rectContainsPoint(rect, point)).toBe(false);
          nearest = Math.min(nearest, rectPointDistance(rect, point));
        }
      }
      expect(nearest).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the TPE label clear of the YVR arc and of every sibling label', () => {
    const labels = layout();
    const tpe = rectOf(labels.find(label => label.code === 'TPE')!);
    const yvr = polylines.find(line => line.code === 'YVR')!;
    const tpeToYvr = Math.min(...yvr.points.map(point => rectPointDistance(tpe, point)));
    expect(tpeToYvr).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        expect(overlapArea(rectOf(labels[i]), rectOf(labels[j]))).toBe(0);
      }
    }
  });

  it('keeps labels off the stats, zoom and base chrome', () => {
    for (const label of layout()) {
      for (const obstacle of obstacles) expect(overlapArea(rectOf(label), obstacle)).toBe(0);
    }
  });

  it('is deterministic and empty-safe', () => {
    expect(layout()).toEqual(layout());
    expect(layoutRouteLabels({ endpoints: [], home: { x: 0, y: 0 }, polylines: [], bounds: CARD })).toEqual([]);
  });
});
