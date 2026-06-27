import type { MapShape } from "./mapEditor.js";

/**
 * How map shapes interact with gameplay systems.
 *
 * | kind   | physical (players) | bullet | vision (LOS / fog) |
 * |--------|--------------------|--------|---------------------|
 * | rect   | blocks             | blocks | blocks              |
 * | circle | blocks             | blocks | blocks              |
 * | line   | blocks             | pass   | pass                |
 *
 * Lines are partial barriers: players cannot walk through them, but bullets
 * and line-of-sight pass through. This is intentional game design.
 */
export type ShapeInteraction = "physical" | "bullet" | "vision";

/** @deprecated Use ShapeInteraction */
export type ShapeCollisionMode = Extract<ShapeInteraction, "physical" | "bullet">;

export function shapeBlocksInteraction(
  shape: MapShape,
  interaction: ShapeInteraction,
): boolean {
  if (shape.kind === "line") {
    return interaction === "physical";
  }
  return true;
}

export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

export function circleOverlapsRect(
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const x3 = rx + rw;
  const y3 = ry + rh;
  return (
    segmentsIntersect(x1, y1, x2, y2, rx, ry, x3, ry) ||
    segmentsIntersect(x1, y1, x2, y2, x3, ry, x3, y3) ||
    segmentsIntersect(x1, y1, x2, y2, x3, y3, rx, y3) ||
    segmentsIntersect(x1, y1, x2, y2, rx, y3, rx, ry)
  );
}

export function circleOverlapsShape(
  cx: number,
  cy: number,
  radius: number,
  shape: MapShape,
  interaction: ShapeInteraction = "physical",
): boolean {
  if (!shapeBlocksInteraction(shape, interaction)) {
    return false;
  }
  if (shape.kind === "rect") {
    return circleOverlapsRect(cx, cy, radius, shape.x, shape.y, shape.width, shape.height);
  }
  if (shape.kind === "circle") {
    const combined = radius + shape.radius;
    const dx = cx - shape.x;
    const dy = cy - shape.y;
    return dx * dx + dy * dy < combined * combined;
  }
  return distanceToSegment(cx, cy, shape.x1, shape.y1, shape.x2, shape.y2) < radius + shape.thickness / 2;
}

export function circleOverlapsShapes(
  cx: number,
  cy: number,
  radius: number,
  shapes: MapShape[],
  interaction: ShapeInteraction = "physical",
): boolean {
  return shapes.some((shape) => circleOverlapsShape(cx, cy, radius, shape, interaction));
}

export function segmentIntersectsShape(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  shape: MapShape,
  interaction: ShapeInteraction = "vision",
): boolean {
  if (!shapeBlocksInteraction(shape, interaction)) {
    return false;
  }
  if (shape.kind === "rect") {
    return segmentIntersectsRect(x1, y1, x2, y2, shape.x, shape.y, shape.width, shape.height);
  }
  if (shape.kind === "circle") {
    return distanceToSegment(shape.x, shape.y, x1, y1, x2, y2) < shape.radius;
  }
  return distanceToSegment(x1, y1, shape.x1, shape.y1, shape.x2, shape.y2) < shape.thickness / 2 ||
    distanceToSegment(x2, y2, shape.x1, shape.y1, shape.x2, shape.y2) < shape.thickness / 2 ||
    distanceToSegment(shape.x1, shape.y1, x1, y1, x2, y2) < shape.thickness / 2 ||
    distanceToSegment(shape.x2, shape.y2, x1, y1, x2, y2) < shape.thickness / 2;
}

export function hasLineOfSightThroughShapes(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  shapes: MapShape[],
): boolean {
  return !shapes.some((shape) =>
    segmentIntersectsShape(fromX, fromY, toX, toY, shape, "vision"),
  );
}

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

function rayCircleIntersect(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  radius: number,
): number | null {
  const fx = ox - cx;
  const fy = oy - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);
  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2;
  return null;
}

function rayCapsuleIntersect(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
): number | null {
  const segDx = x2 - x1;
  const segDy = y2 - y1;
  const lenSq = segDx * segDx + segDy * segDy;
  if (lenSq < 1e-10) {
    return rayCircleIntersect(ox, oy, dx, dy, x1, y1, radius);
  }

  const tSeg = Math.max(0, Math.min(1, ((ox - x1) * segDx + (oy - y1) * segDy) / lenSq));
  const closestX = x1 + tSeg * segDx;
  const closestY = y1 + tSeg * segDy;
  const dist = Math.hypot(ox - closestX, oy - closestY);
  if (dist > radius) return null;

  const dirLen = Math.hypot(dx, dy);
  if (dirLen < 1e-10) return null;

  const penetration = Math.sqrt(radius * radius - dist * dist) / dirLen;
  const tCenter = ((closestX - ox) * dx + (closestY - oy) * dy) / (dirLen * dirLen);
  const hit = tCenter - penetration;
  return hit >= 0 ? hit : 0;
}

export function castRayAgainstShapes(
  ox: number,
  oy: number,
  angle: number,
  maxRange: number,
  shapes: MapShape[],
): { x: number; y: number } {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let minT = maxRange;

  for (const shape of shapes) {
    if (!shapeBlocksInteraction(shape, "vision")) {
      continue;
    }
    if (shape.kind === "rect") {
      const x3 = shape.x + shape.width;
      const y3 = shape.y + shape.height;
      const edges: [number, number, number, number][] = [
        [shape.x, shape.y, x3, shape.y],
        [x3, shape.y, x3, y3],
        [x3, y3, shape.x, y3],
        [shape.x, y3, shape.x, shape.y],
      ];
      for (const [x1, y1, x2, y2] of edges) {
        const t = raySegmentIntersect(ox, oy, dx, dy, x1, y1, x2, y2);
        if (t !== null && t < minT) minT = t;
      }
    } else if (shape.kind === "circle") {
      const t = rayCircleIntersect(ox, oy, dx, dy, shape.x, shape.y, shape.radius);
      if (t !== null && t < minT) minT = t;
    } else {
      const t = rayCapsuleIntersect(
        ox,
        oy,
        dx,
        dy,
        shape.x1,
        shape.y1,
        shape.x2,
        shape.y2,
        shape.thickness / 2,
      );
      if (t !== null && t < minT) minT = t;
    }
  }

  return { x: ox + dx * minT, y: oy + dy * minT };
}
