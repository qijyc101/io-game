import {
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PREDICTION_SNAP_DISTANCE,
  PREDICTION_BLEND_THRESHOLD,
  PREDICTION_BLEND_FACTOR,
  clampToMap,
} from "@io-game/shared";

export class LocalPredictor {
  x = 0;
  y = 0;
  angle = 0;
  private initialized = false;

  reset(x: number, y: number, angle: number): void {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.initialized = true;
  }

  predict(
    moveX: number,
    moveY: number,
    aim: number,
    dt: number,
    alive: boolean,
  ): void {
    if (!alive) return;
    this.angle = aim;

    const len = Math.hypot(moveX, moveY);
    if (len <= 0) return;

    this.x += (moveX / len) * PLAYER_SPEED * dt;
    this.y += (moveY / len) * PLAYER_SPEED * dt;

    const clamped = clampToMap(this.x, this.y, PLAYER_RADIUS);
    this.x = clamped.x;
    this.y = clamped.y;
  }

  reconcile(serverX: number, serverY: number, serverAngle: number, alive: boolean): void {
    if (!alive) {
      this.x = serverX;
      this.y = serverY;
      this.angle = serverAngle;
      return;
    }

    if (!this.initialized) {
      this.reset(serverX, serverY, serverAngle);
      return;
    }

    const dx = serverX - this.x;
    const dy = serverY - this.y;
    const err = Math.hypot(dx, dy);

    if (err > PREDICTION_SNAP_DISTANCE) {
      this.x = serverX;
      this.y = serverY;
    } else if (err > PREDICTION_BLEND_THRESHOLD) {
      this.x += dx * PREDICTION_BLEND_FACTOR;
      this.y += dy * PREDICTION_BLEND_FACTOR;
    }

    this.angle = serverAngle;
  }
}
