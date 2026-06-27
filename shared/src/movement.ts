import { clampToMap } from "./math.js";
import { circleOverlapsShapes } from "./mapCollision.js";
import type { MapShape } from "./mapEditor.js";

const MOVEMENT_STEP_PX = 8;

function canPlaceCircle(
  x: number,
  y: number,
  radius: number,
  shapes: MapShape[],
  mapWidth: number,
  mapHeight: number,
): boolean {
  const clamped = clampToMap(x, y, radius, mapWidth, mapHeight);
  if (clamped.x !== x || clamped.y !== y) {
    return false;
  }
  return !circleOverlapsShapes(x, y, radius, shapes, "physical");
}

function moveAxis(
  x: number,
  y: number,
  dx: number,
  dy: number,
  radius: number,
  shapes: MapShape[],
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number } {
  if (dx !== 0) {
    const nextX = clampToMap(x + dx, y, radius, mapWidth, mapHeight).x;
    if (canPlaceCircle(nextX, y, radius, shapes, mapWidth, mapHeight)) {
      return { x: nextX, y };
    }
    return { x, y };
  }

  if (dy !== 0) {
    const nextY = clampToMap(x, y + dy, radius, mapWidth, mapHeight).y;
    if (canPlaceCircle(x, nextY, radius, shapes, mapWidth, mapHeight)) {
      return { x, y: nextY };
    }
    return { x, y };
  }

  return { x, y };
}

export function isCirclePlacementValid(
  x: number,
  y: number,
  radius: number,
  shapes: MapShape[],
  mapWidth: number,
  mapHeight: number,
): boolean {
  return canPlaceCircle(x, y, radius, shapes, mapWidth, mapHeight);
}

/** Slide a circle along map bounds and solid shapes using fixed-size sub-steps. */
export function resolveCircleMovement(
  fromX: number,
  fromY: number,
  dx: number,
  dy: number,
  radius: number,
  shapes: MapShape[],
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number } {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return { x: fromX, y: fromY };
  }

  const steps = Math.max(1, Math.ceil(distance / MOVEMENT_STEP_PX));
  const stepDx = dx / steps;
  const stepDy = dy / steps;
  let x = fromX;
  let y = fromY;

  for (let step = 0; step < steps; step++) {
    ({ x, y } = moveAxis(x, y, stepDx, 0, radius, shapes, mapWidth, mapHeight));
    ({ x, y } = moveAxis(x, y, 0, stepDy, radius, shapes, mapWidth, mapHeight));
  }

  return { x, y };
}
