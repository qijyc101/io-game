import {
  MAP_WIDTH,
  MAP_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
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

    const r = PLAYER_RADIUS;
    this.x = Math.max(r, Math.min(MAP_WIDTH - r, this.x));
    this.y = Math.max(r, Math.min(MAP_HEIGHT - r, this.y));
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

    if (err > 100) {
      this.x = serverX;
      this.y = serverY;
    } else if (err > 0.5) {
      this.x += dx * 0.4;
      this.y += dy * 0.4;
    }

    this.angle = serverAngle;
  }
}
