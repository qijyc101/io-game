import {
  VIEW_RANGE,
  VIEW_ANGLE,
  FOG_RAY_COUNT,
  FOG_CORNER_ANGLE_EPS,
  FOG_CORNER_CONE_PADDING,
  FOG_ANGLE_FILTER_EPS,
  normalizeAngle,
  castRayAgainstShapes,
  shapeBlocksInteraction,
} from "@io-game/shared";
import type { MapShape, Vec2 } from "@io-game/shared";

function collectRayAngles(
  ox: number,
  oy: number,
  aim: number,
  shapes: MapShape[],
): number[] {
  const half = VIEW_ANGLE / 2;
  const start = aim - half;
  const end = aim + half;
  const angles = new Set<number>();

  const rayCount = FOG_RAY_COUNT;
  for (let i = 0; i <= rayCount; i++) {
    angles.add(start + ((end - start) * i) / rayCount);
  }

  const eps = FOG_CORNER_ANGLE_EPS;
  for (const shape of shapes) {
    if (!shapeBlocksInteraction(shape, "vision")) {
      continue;
    }
    if (shape.kind === "rect") {
      const corners: [number, number][] = [
        [shape.x, shape.y],
        [shape.x + shape.width, shape.y],
        [shape.x + shape.width, shape.y + shape.height],
        [shape.x, shape.y + shape.height],
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
    } else if (shape.kind === "circle") {
      const dx = shape.x - ox;
      const dy = shape.y - oy;
      const dist = Math.hypot(dx, dy);
      if (dist <= shape.radius) continue;

      const centerAngle = Math.atan2(dy, dx);
      const tangentOffset = Math.acos(shape.radius / dist);
      for (const a of [centerAngle - tangentOffset, centerAngle + tangentOffset]) {
        const rel = normalizeAngle(a - aim);
        if (Math.abs(rel) <= half + FOG_CORNER_CONE_PADDING) {
          angles.add(a - eps);
          angles.add(a);
          angles.add(a + eps);
        }
      }
    }
  }

  return [...angles]
    .map((a) => ({ a, rel: normalizeAngle(a - aim) }))
    .filter(({ rel }) => rel >= -half - FOG_ANGLE_FILTER_EPS && rel <= half + FOG_ANGLE_FILTER_EPS)
    .sort((p, q) => p.rel - q.rel)
    .map(({ a }) => a);
}

/** Visible area polygon from player position (shadow-casting rays). Lines do not cast shadows. */
export function computeVisibilityPolygon(
  ox: number,
  oy: number,
  aim: number,
  shapes: MapShape[] = [],
): Vec2[] {
  const angles = collectRayAngles(ox, oy, aim, shapes);
  return angles.map((angle) => castRayAgainstShapes(ox, oy, angle, VIEW_RANGE, shapes));
}
