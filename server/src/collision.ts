import { PLAYER_RADIUS, BULLET_RADIUS } from "@io-game/shared";
import { OBSTACLES } from "@io-game/shared";
import type { ObstacleDef } from "@io-game/shared";

export function circleCollision(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distSq = dx * dx + dy * dy;
  const radiusSum = r1 + r2;
  return distSq <= radiusSum * radiusSum;
}

export function bulletHitsPlayer(
  bx: number,
  by: number,
  px: number,
  py: number,
): boolean {
  return circleCollision(bx, by, BULLET_RADIUS, px, py, PLAYER_RADIUS);
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

export function circleOverlapsObstacles(
  cx: number,
  cy: number,
  radius: number,
  obstacles: ObstacleDef[] = OBSTACLES,
): boolean {
  return obstacles.some((o) =>
    circleOverlapsRect(cx, cy, radius, o.x, o.y, o.width, o.height),
  );
}

export function bulletHitsObstacle(bx: number, by: number): boolean {
  return circleOverlapsObstacles(bx, by, BULLET_RADIUS);
}
