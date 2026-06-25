import { OBSTACLES } from "./obstacles.js";

/** Max distance the local player can spot enemies */
export const VIEW_RANGE = 700;

/** Vision cone width in radians (centered on aim direction) */
export const VIEW_ANGLE = (2 * Math.PI) / 3;

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

export function hasLineOfSight(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  for (const o of OBSTACLES) {
    if (segmentIntersectsRect(fromX, fromY, toX, toY, o.x, o.y, o.width, o.height)) {
      return false;
    }
  }
  return true;
}

function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Whether the viewer can see a target (FOV cone + range + obstacle LOS) */
export function canSeeTarget(
  viewerX: number,
  viewerY: number,
  viewerAim: number,
  targetX: number,
  targetY: number,
): boolean {
  const dx = targetX - viewerX;
  const dy = targetY - viewerY;
  const dist = Math.hypot(dx, dy);
  if (dist > VIEW_RANGE) return false;

  const angleToTarget = Math.atan2(dy, dx);
  const angleDiff = normalizeAngle(angleToTarget - viewerAim);
  if (Math.abs(angleDiff) > VIEW_ANGLE / 2) return false;

  return hasLineOfSight(viewerX, viewerY, targetX, targetY);
}
