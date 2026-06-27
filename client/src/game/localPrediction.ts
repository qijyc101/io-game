import {
  PLAYER_RADIUS,
  PLAYER_SPEED,
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  PREDICTION_SNAP_DISTANCE,
  PREDICTION_BLEND_THRESHOLD,
  PREDICTION_BLEND_FACTOR,
  resolveCircleMovement,
} from "@io-game/shared";
import type { MapShape } from "@io-game/shared";

export class LocalPredictor {
  x = 0;
  y = 0;
  angle = 0;
  private initialized = false;
  private mapWidth = DEFAULT_MAP_WIDTH;
  private mapHeight = DEFAULT_MAP_HEIGHT;
  private shapes: MapShape[] = [];

  setMapSize(width: number, height: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
  }

  setMapShapes(shapes: MapShape[]): void {
    this.shapes = shapes;
  }

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

    const dx = (moveX / len) * PLAYER_SPEED * dt;
    const dy = (moveY / len) * PLAYER_SPEED * dt;
    const resolved = resolveCircleMovement(
      this.x,
      this.y,
      dx,
      dy,
      PLAYER_RADIUS,
      this.shapes,
      this.mapWidth,
      this.mapHeight,
    );
    this.x = resolved.x;
    this.y = resolved.y;
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
