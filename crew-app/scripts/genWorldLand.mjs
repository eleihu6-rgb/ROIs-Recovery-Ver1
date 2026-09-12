#!/usr/bin/env node
/**
 * Generates `src/features/v2/worldLand.ts` — the land outline the Schedule tab's
 * Route-map view draws under the route lines.
 *
 * Why a baked path instead of a tile map: the app must render the map with no
 * network, no Mapbox token and no new native module (adding one costs a full
 * pod install + Xcode rebuild). A public-domain Natural Earth 110m outline,
 * projected once to web-Mercator and simplified, gives the same "where did I
 * fly this month" answer in ~15 KB of SVG path data.
 *
 * Source (public domain, Natural Earth via github.com/nvkelso/natural-earth-vector):
 *   curl -sS -o /tmp/ne_110m_land.geojson \
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson
 *   node scripts/genWorldLand.mjs /tmp/ne_110m_land.geojson
 *
 * Coordinates are emitted on a 0…1000 grid in normalised web-Mercator space so
 * the app can project an airport with the exact same two lines of maths
 * (`mercatorX` / `mercatorY` in schedView.ts) and use the result as a viewBox.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2] || '/tmp/ne_110m_land.geojson';
const out = path.join(here, '..', 'src', 'features', 'v2', 'worldLand.ts');

const GRID = 1000;
/** Douglas–Peucker tolerance in grid units (~0.2° ≈ 24 km) — detail below the
 *  pixel size of the phone-sized map, so simplifying loses nothing visible. */
const EPSILON = 0.6;
/** Anything whose projected bounding box is thinner than this is a speck. */
const MIN_EXTENT = 2.5;
/** Antarctica carries no crew route and would triple the file size. */
const MIN_LAT = -58;

const LAT_LIMIT = 85.05112878;
const mercatorX = lon => ((lon + 180) / 360) * GRID;
const mercatorY = lat => {
  const clamped = Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, lat));
  const rad = (clamped * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return (1 - y / Math.PI) / 2 * GRID;
};

function distToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Iterative Douglas–Peucker — 110m rings are small, but recursion depth on the
 *  Antarctic coastline was a real stack risk. */
function simplify(points, epsilon) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distToSegment(points[i], points[first], points[last]);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (worst > epsilon && index > 0) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const geo = JSON.parse(fs.readFileSync(input, 'utf8'));
const rings = [];

for (const feature of geo.features) {
  const geometry = feature.geometry;
  if (!geometry) continue;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    // Outer ring only — 110m land has no meaningful holes at this scale.
    const ring = polygon[0];
    if (!ring || ring.length < 4) continue;
    const lats = ring.map(p => p[1]);
    if (Math.max(...lats) < MIN_LAT) continue;
    let projected = ring.map(([lon, lat]) => [mercatorX(lon), mercatorY(lat)]);
    const xs = projected.map(p => p[0]);
    const ys = projected.map(p => p[1]);
    if (Math.max(...xs) - Math.min(...xs) < MIN_EXTENT && Math.max(...ys) - Math.min(...ys) < MIN_EXTENT) continue;
    projected = simplify(projected, EPSILON);
    if (projected.length < 4) continue;
    rings.push(projected);
  }
}

const round = n => Math.round(n * 10) / 10;
const paths = rings.map(ring => {
  // Drop the duplicated closing point; `Z` closes the ring in SVG.
  const pts = ring.slice(0, -1);
  let d = `M${round(pts[0][0])} ${round(pts[0][1])}`;
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    // Skip points that round to the same grid position as the previous one.
    if (round(p[0]) === round(prev[0]) && round(p[1]) === round(prev[1])) continue;
    d += `L${round(p[0])} ${round(p[1])}`;
    prev = p;
  }
  return `${d}Z`;
});

const points = paths.reduce((n, d) => n + (d.match(/L/g) || []).length + 1, 0);
const file = `// ─── World land outline for the Schedule tab's Route-map view ────────────────
// GENERATED FILE — do not edit by hand: node scripts/genWorldLand.mjs <geojson>
// Source: Natural Earth 110m land (public domain), web-Mercator projected and
// Douglas–Peucker simplified to a ${GRID}×${GRID} grid. ${paths.length} rings / ${points} points.
//
// Project an airport with mercatorX()/mercatorY() from ./schedView — same space.

/** One SVG path per land ring, in 0…${GRID} web-Mercator space. */
export const WORLD_LAND_PATHS: readonly string[] = [
${paths.map(d => `  '${d}',`).join('\n')}
];
`;

fs.writeFileSync(out, file);
console.log(`wrote ${path.relative(process.cwd(), out)} — ${rings.length} rings, ${points} points, ${(file.length / 1024).toFixed(1)} KB`);
