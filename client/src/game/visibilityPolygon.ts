import {
  OBSTACLES,
  VIEW_RANGE,
  VIEW_ANGLE,
  FOG_RAY_COUNT,
  FOG_CORNER_ANGLE_EPS,
  FOG_CORNER_CONE_PADDING,
  FOG_ANGLE_FILTER_EPS,
  normalizeAngle,
} from "@io-game/shared";
import type { Vec2 } from "@io-game/shared";

function raySegmentIntersect(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number | null {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((x1 - ox) * sy - (y1 - oy) * sx) / denom;
  const u = ((x1 - ox) * dy - (y1 - oy) * dx) / denom;
  if (t >= 0 && u >= 0 && u <= 1) return t;
  return null;
}

function castRay(ox: number, oy: number, angle: number): Vec2 {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let minT = VIEW_RANGE;

  for (const o of OBSTACLES) {
    const x3 = o.x + o.width;
    const y3 = o.y + o.height;
    const edges: [number, number, number, number][] = [
      [o.x, o.y, x3, o.y],
      [x3, o.y, x3, y3],
      [x3, y3, o.x, y3],
      [o.x, y3, o.x, o.y],
    ];
    for (const [x1, y1, x2, y2] of edges) {
      const t = raySegmentIntersect(ox, oy, dx, dy, x1, y1, x2, y2);
      if (t !== null && t < minT) minT = t;
    }
  }

  return { x: ox + dx * minT, y: oy + dy * minT };
}

function collectRayAngles(ox: number, oy: number, aim: number): number[] {
  const half = VIEW_ANGLE / 2;
  const start = aim - half;
  const end = aim + half;
  const angles = new Set<number>();

  const rayCount = FOG_RAY_COUNT;
  for (let i = 0; i <= rayCount; i++) {
    angles.add(start + ((end - start) * i) / rayCount);
  }

  const eps = FOG_CORNER_ANGLE_EPS;
  for (const o of OBSTACLES) {
    const corners: [number, number][] = [
      [o.x, o.y],
      [o.x + o.width, o.y],
      [o.x + o.width, o.y + o.height],
      [o.x, o.y + o.height],
    ];
    for (const [cx, cy] of corners) {
      const a = Math.atan2(cy - oy, cx - ox);
      const rel = normalizeAngle(a - aim);
      if (Math.abs(rel) <= half + FOG_CORNER_CONE_PADDING) {
        angles.add(a - eps);
        angles.add(a);
        angles.add(a + eps);
      }
    }
  }

  return [...angles]
    .map((a) => ({ a, rel: normalizeAngle(a - aim) }))
    .filter(({ rel }) => rel >= -half - FOG_ANGLE_FILTER_EPS && rel <= half + FOG_ANGLE_FILTER_EPS)
    .sort((p, q) => p.rel - q.rel)
    .map(({ a }) => a);
}

/** Visible area polygon from player position (shadow-casting rays) */
export function computeVisibilityPolygon(
  ox: number,
  oy: number,
  aim: number,
): Vec2[] {
  const angles = collectRayAngles(ox, oy, aim);
  return angles.map((angle) => castRay(ox, oy, angle));
}
