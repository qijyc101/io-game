import { VIEW_RANGE, VIEW_ANGLE } from "./config.js";
import { normalizeAngle } from "./math.js";
import type { MapShape } from "./mapEditor.js";
import { hasLineOfSightThroughShapes } from "./mapCollision.js";

export function hasLineOfSight(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  shapes: MapShape[] = [],
): boolean {
  return hasLineOfSightThroughShapes(fromX, fromY, toX, toY, shapes);
}

/** Whether the viewer can see a target (FOV cone + range + obstacle LOS). Lines do not block vision. */
export function canSeeTarget(
  viewerX: number,
  viewerY: number,
  viewerAim: number,
  targetX: number,
  targetY: number,
  shapes: MapShape[] = [],
): boolean {
  const dx = targetX - viewerX;
  const dy = targetY - viewerY;
  const dist = Math.hypot(dx, dy);
  if (dist > VIEW_RANGE) return false;

  const angleToTarget = Math.atan2(dy, dx);
  const angleDiff = normalizeAngle(angleToTarget - viewerAim);
  if (Math.abs(angleDiff) > VIEW_ANGLE / 2) return false;

  return hasLineOfSight(viewerX, viewerY, targetX, targetY, shapes);
}
