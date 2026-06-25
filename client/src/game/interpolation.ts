import { TICK_MS } from "@io-game/shared";

export const INTERP_MS = TICK_MS;
export const EXTRAP_MS = TICK_MS * 2;

export function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

export function interpolatePosition(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  receivedAt: number,
  now: number,
): { x: number; y: number } {
  const elapsed = now - receivedAt;

  if (elapsed <= INTERP_MS) {
    const t = smoothstep(elapsed / INTERP_MS);
    return {
      x: lerp(fromX, toX, t),
      y: lerp(fromY, toY, t),
    };
  }

  const vx = (toX - fromX) / INTERP_MS;
  const vy = (toY - fromY) / INTERP_MS;
  const extra = Math.min(elapsed - INTERP_MS, EXTRAP_MS);

  return {
    x: toX + vx * extra,
    y: toY + vy * extra,
  };
}
