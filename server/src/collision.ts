import { circleOverlapsShapes, PLAYER_RADIUS } from "@io-game/shared";
import type { MapShape } from "@io-game/shared";

let activeShapes: MapShape[] = [];

export function setActiveShapes(shapes: MapShape[]): void {
  activeShapes = shapes;
}

export function getActiveShapes(): MapShape[] {
  return activeShapes;
}

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
  bulletRadius: number,
  px: number,
  py: number,
): boolean {
  return circleCollision(bx, by, bulletRadius, px, py, PLAYER_RADIUS);
}

export function circleOverlapsMapShapes(
  cx: number,
  cy: number,
  radius: number,
  shapes: MapShape[] = activeShapes,
): boolean {
  return circleOverlapsShapes(cx, cy, radius, shapes, "physical");
}

export function circleOverlapsBulletBlockers(
  cx: number,
  cy: number,
  radius: number,
  shapes: MapShape[] = activeShapes,
): boolean {
  // Lines pass through bullets — see shapeBlocksInteraction in mapCollision.ts
  return circleOverlapsShapes(cx, cy, radius, shapes, "bullet");
}

export function bulletHitsObstacle(bx: number, by: number, bulletRadius: number): boolean {
  return circleOverlapsBulletBlockers(bx, by, bulletRadius);
}

/** Player movement and spawn — all shape kinds including lines */
export const circleOverlapsObstacles = circleOverlapsMapShapes;
