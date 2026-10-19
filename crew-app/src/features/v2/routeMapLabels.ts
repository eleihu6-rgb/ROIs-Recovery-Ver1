// Schedule ▸ Route map · on-map route labels.
//
// Pure geometry for the "endpoint block" treatment chosen from
// docs/mockups/crew-app-route-map-flight-info.html: each destination carries its
// code + distance + leg count beside the endpoint, on an accent rule with no
// surface. The label must never mask the great-circle arc it belongs to (or any
// sibling arc), so every candidate position is scored against the sampled route
// lines, the other labels and the map's chrome (base badge / zoom / stats).
//
// This module renders nothing: RouteMapView projects the routes to card pixels
// and calls `layoutRouteLabels`, which keeps the placement rules unit-testable.

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface RouteLabelEndpoint extends Point {
  code: string;
  width: number;
  height: number;
  /** Sort weight; the farthest destinations are placed first. */
  weight: number;
}

export interface RoutePolyline {
  code: string;
  points: readonly Point[];
}

export interface RouteLabelPlacement {
  code: string;
  left: number;
  top: number;
  width: number;
  height: number;
  leaderStart: Point;
  leaderEnd: Point;
}

export interface LayoutRouteLabelsOptions {
  endpoints: readonly RouteLabelEndpoint[];
  home: Point;
  polylines: readonly RoutePolyline[];
  /** The map card's rendered size in the same pixel space as the points. */
  bounds: { width: number; height: number };
  /** In-map chrome the label must not sit behind (base badge, zoom, stats). */
  obstacles?: readonly Rect[];
  /** Space to keep between a label and the card edge. */
  margin?: number;
  /** When false, only bounds/label collisions are scored (mock comparison). */
  clearance?: boolean;
}

const GAP_PX = 12;
const RADII_PX = [0, 16, 34] as const;
const ANGLES_DEG = [0, 20, -20, 40, -40, 60, -60, 82, -82, 105, -105, 130, -130, 155, -155, 180] as const;
const ARC_CLEARANCE_PX = 3.5;

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function rectPointDistance(rect: Rect, point: Point): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

function expand(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by };
}

/**
 * Place one label per destination. Each endpoint fans candidates around its
 * arrival tangent, biased outward from the base; the lowest-score candidate wins.
 * The returned leader starts at the endpoint and ends at the label's near edge.
 */
export function layoutRouteLabels(options: LayoutRouteLabelsOptions): RouteLabelPlacement[] {
  const { endpoints, home, polylines, bounds, obstacles = [], margin = 8, clearance = true } = options;
  if (endpoints.length === 0 || bounds.width <= 0 || bounds.height <= 0) return [];

  const placed: Array<{ code: string; rect: Rect; placement: RouteLabelPlacement }> = [];
  const ordered = [...endpoints].sort((a, b) => b.weight - a.weight);

  for (const endpoint of ordered) {
    const outAngle = Math.atan2(endpoint.y - home.y, endpoint.x - home.x);
    let best: { rect: Rect; cx: number; cy: number; ux: number; uy: number; dist: number; halfAlong: number; score: number } | null = null;

    for (const extra of RADII_PX) {
      for (const deg of ANGLES_DEG) {
        const angle = outAngle + (deg * Math.PI) / 180;
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const halfAlong = (Math.abs(ux) * endpoint.width + Math.abs(uy) * endpoint.height) / 2;
        const dist = GAP_PX + halfAlong + extra;
        const cx = endpoint.x + ux * dist;
        const cy = endpoint.y + uy * dist;
        const rect: Rect = {
          x: cx - endpoint.width / 2,
          y: cy - endpoint.height / 2,
          width: endpoint.width,
          height: endpoint.height,
        };

        let score = 0;

        const overLeft = Math.max(0, margin - rect.x);
        const overRight = Math.max(0, rect.x + rect.width - (bounds.width - margin));
        const overTop = Math.max(0, margin - rect.y);
        const overBottom = Math.max(0, rect.y + rect.height - (bounds.height - margin));
        const overflow = overLeft + overRight + overTop + overBottom;
        score += overflow * 260;
        if (overflow > 0) score += 4200;

        if (clearance) {
          for (const line of polylines) {
            let nearest = Number.POSITIVE_INFINITY;
            for (const point of line.points) {
              const distance = rectPointDistance(rect, point);
              if (distance < nearest) nearest = distance;
            }
            if (nearest < ARC_CLEARANCE_PX) score += (ARC_CLEARANCE_PX - nearest) * 950;
          }
          for (const obstacle of obstacles) score += overlapArea(expand(rect, 3), obstacle) * 6;
        }

        for (const sibling of placed) score += overlapArea(expand(rect, 4), sibling.rect) * 2.2;

        // Prefer staying close to the outward tangent / the near ring.
        score += Math.abs(deg) * 0.1 + extra * 0.55;

        if (!best || score < best.score) {
          best = { rect, cx, cy, ux, uy, dist, halfAlong, score };
        }
      }
    }

    if (!best) continue;
    const leaderEnd = {
      x: endpoint.x + best.ux * (best.dist - best.halfAlong),
      y: endpoint.y + best.uy * (best.dist - best.halfAlong),
    };
    const placement: RouteLabelPlacement = {
      code: endpoint.code,
      left: best.rect.x,
      top: best.rect.y,
      width: best.rect.width,
      height: best.rect.height,
      leaderStart: { x: endpoint.x, y: endpoint.y },
      leaderEnd,
    };
    placed.push({ code: endpoint.code, rect: best.rect, placement });
  }

  return placed.map(entry => entry.placement);
}
