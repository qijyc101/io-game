import type { MapShape } from "./mapEditor.js";
import { shapeBlocksInteraction } from "./mapCollision.js";

/** Earliest parametric hit along segment (x1,y1)->(x2,y2), t in [0,1]. */
export function segmentCircleHitT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number,
): number | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) {
    return Math.hypot(x1 - cx, y1 - cy) <= radius ? 0 : null;
  }

  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = lenSq;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return null;
  }

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);
  const hits = [t1, t2].filter((t) => t >= 0 && t <= 1).sort((p, q) => p - q);
  return hits[0] ?? null;
}

function segmentAabbHitT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;

  const clip = (origin: number, direction: number, min: number, max: number): boolean => {
    if (Math.abs(direction) < 1e-10) {
      return origin >= min && origin <= max;
    }
    const t1 = (min - origin) / direction;
    const t2 = (max - origin) / direction;
    const enter = Math.min(t1, t2);
    const exit = Math.max(t1, t2);
    tMin = Math.max(tMin, enter);
    tMax = Math.min(tMax, exit);
    return tMin <= tMax;
  };

  if (!clip(x1, dx, minX, maxX)) return null;
  if (!clip(y1, dy, minY, maxY)) return null;
  return tMin >= 0 && tMin <= 1 ? tMin : null;
}

function segmentExpandedRectHitT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  padding: number,
): number | null {
  return segmentAabbHitT(
    x1,
    y1,
    x2,
    y2,
    rx - padding,
    ry - padding,
    rx + rw + padding,
    ry + rh + padding,
  );
}

function segmentCapsuleHitT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
): number | null {
  const segDx = bx - ax;
  const segDy = by - ay;
  const lenSq = segDx * segDx + segDy * segDy;
  if (lenSq < 1e-10) {
    return segmentCircleHitT(x1, y1, x2, y2, ax, ay, radius);
  }

  let best: number | null = null;
  const consider = (t: number | null) => {
    if (t === null) return;
    if (best === null || t < best) best = t;
  };

  consider(segmentCircleHitT(x1, y1, x2, y2, ax, ay, radius));
  consider(segmentCircleHitT(x1, y1, x2, y2, bx, by, radius));

  const samples = 8;
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    consider(
      segmentCircleHitT(x1, y1, x2, y2, ax + segDx * u, ay + segDy * u, radius),
    );
  }

  return best;
}

export function segmentShapeHitT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
  shape: MapShape,
  interaction: "bullet" | "physical" = "bullet",
): number | null {
  if (!shapeBlocksInteraction(shape, interaction)) {
    return null;
  }
  if (shape.kind === "rect") {
    return segmentExpandedRectHitT(
      x1,
      y1,
      x2,
      y2,
      shape.x,
      shape.y,
      shape.width,
      shape.height,
      radius,
    );
  }
  if (shape.kind === "circle") {
    return segmentCircleHitT(x1, y1, x2, y2, shape.x, shape.y, shape.radius + radius);
  }
  return segmentCapsuleHitT(
    x1,
    y1,
    x2,
    y2,
    shape.x1,
    shape.y1,
    shape.x2,
    shape.y2,
    radius + shape.thickness / 2,
  );
}

export function segmentMapBoundsHitT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
  mapWidth: number,
  mapHeight: number,
): number | null {
  const minX = radius;
  const minY = radius;
  const maxX = mapWidth - radius;
  const maxY = mapHeight - radius;

  if (x1 < minX || x1 > maxX || y1 < minY || y1 > maxY) {
    return 0;
  }
  if (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY) {
    return null;
  }

  let best: number | null = null;
  const consider = (t: number) => {
    if (t >= 0 && t <= 1 && (best === null || t < best)) {
      best = t;
    }
  };

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx !== 0) {
    if (x2 < minX) consider((minX - x1) / dx);
    if (x2 > maxX) consider((maxX - x1) / dx);
  }
  if (dy !== 0) {
    if (y2 < minY) consider((minY - y1) / dy);
    if (y2 > maxY) consider((maxY - y1) / dy);
  }

  return best;
}

export function segmentShapesEarliestHitT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
  shapes: MapShape[],
  interaction: "bullet" | "physical" = "bullet",
): number | null {
  let best: number | null = null;
  for (const shape of shapes) {
    const t = segmentShapeHitT(x1, y1, x2, y2, radius, shape, interaction);
    if (t === null) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

export function segmentPointAtT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } {
  return {
    x: x1 + (x2 - x1) * t,
    y: y1 + (y2 - y1) * t,
  };
}

export function segmentPlayerHitT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bulletRadius: number,
  playerX: number,
  playerY: number,
  playerRadius: number,
): number | null {
  return segmentCircleHitT(
    x1,
    y1,
    x2,
    y2,
    playerX,
    playerY,
    bulletRadius + playerRadius,
  );
}
