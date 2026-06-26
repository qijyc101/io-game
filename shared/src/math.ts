import {
  MAP_WIDTH,
  MAP_HEIGHT,
  CAMERA_DEAD_ZONE_RUBBER,
} from "./config.js";
import type { Vec2 } from "./types.js";

export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function clampToMap(x: number, y: number, radius: number): Vec2 {
  return {
    x: Math.max(radius, Math.min(MAP_WIDTH - radius, x)),
    y: Math.max(radius, Math.min(MAP_HEIGHT - radius, y)),
  };
}

/** Target camera position: recenter on idle, or clamp target inside dead zone while moving */
export function getCameraTarget(
  cameraX: number,
  cameraY: number,
  targetX: number,
  targetY: number,
  recenter: boolean,
): Vec2 {
  if (recenter) {
    return { x: targetX, y: targetY };
  }
  return applyCameraDeadZone(cameraX, cameraY, targetX, targetY);
}

/** Keep target inside a dead zone around the camera; move camera only at the edges */
export function applyCameraDeadZone(
  cameraX: number,
  cameraY: number,
  targetX: number,
  targetY: number,
): Vec2 {
  let x = cameraX;
  let y = cameraY;
  const dx = targetX - x;
  const dy = targetY - y;

  if (dx > CAMERA_DEAD_ZONE_RUBBER) x = targetX - CAMERA_DEAD_ZONE_RUBBER;
  else if (dx < -CAMERA_DEAD_ZONE_RUBBER) x = targetX + CAMERA_DEAD_ZONE_RUBBER;

  if (dy > CAMERA_DEAD_ZONE_RUBBER) y = targetY - CAMERA_DEAD_ZONE_RUBBER;
  else if (dy < -CAMERA_DEAD_ZONE_RUBBER) y = targetY + CAMERA_DEAD_ZONE_RUBBER;

  return { x, y };
}
