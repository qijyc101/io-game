import { Application, Container, Graphics, Text } from "pixi.js";
import {
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  PLAYER_RADIUS,
  PLAYER_AIM_LINE_LENGTH,
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  CAMERA_DEAD_ZONE_WIDTH,
  CAMERA_DEAD_ZONE_HEIGHT,
  CAMERA_SMOOTH_DECAY,
  CAMERA_DEBUG_DEAD_ZONE,
  INTERP_MS,
  FOG_OVERLAY_FILL,
  FOG_OVERLAY_EDGE_COLOR,
  FOG_OVERLAY_EDGE_WIDTH,
  canSeeTarget,
  getCameraTarget,
  getWeapon,
} from "@io-game/shared";
import type { MapShape, PlayerState, BulletState } from "@io-game/shared";
import type { InputState } from "./input";
import { computeVisibilityPolygon } from "./visibilityPolygon";
import { interpolatePosition, lerpAngle } from "./interpolation";
import { LocalPredictor } from "./localPrediction";
import { bindViewportLayout } from "./viewportLayout";

export interface GameApp {
  app: Application;
  fogCanvas: HTMLCanvasElement;
  fogCtx: CanvasRenderingContext2D;
  destroyLayout: () => void;
}

function colorFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  const r = Math.floor(128 + 127 * Math.sin((hue * Math.PI) / 180));
  const g = Math.floor(128 + 127 * Math.sin(((hue + 120) * Math.PI) / 180));
  const b = Math.floor(128 + 127 * Math.sin(((hue + 240) * Math.PI) / 180));
  return (r << 16) | (g << 8) | b;
}

interface InterpolatedEntity {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  receivedAt: number;
}

interface InterpolatedPlayer extends InterpolatedEntity {
  fromAngle: number;
  toAngle: number;
  state: PlayerState;
}

interface InterpolatedBullet extends InterpolatedEntity {
  ownerId: string;
  weaponId: string;
}

export class GameRenderer {
  private app: Application;
  private fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private worldContainer: Container;
  private entityContainer: Container;
  private arenaGraphics: Graphics;
  private obstacleGraphics: Graphics;
  private playerGraphics = new Map<string, Graphics>();
  private playerLabels = new Map<string, Text>();
  private bulletGraphics = new Map<string, Graphics>();
  private interpolatedPlayers = new Map<string, InterpolatedPlayer>();
  private interpolatedBullets = new Map<string, InterpolatedBullet>();
  private localPredictor = new LocalPredictor();
  private localPlayerId: string | null = null;
  private lastTick = -1;
  private cameraX = DEFAULT_MAP_WIDTH / 2;
  private cameraY = DEFAULT_MAP_HEIGHT / 2;
  private mapWidth = DEFAULT_MAP_WIDTH;
  private mapHeight = DEFAULT_MAP_HEIGHT;
  private lastInput: InputState = {
    move: { x: 0, y: 0 },
    aim: 0,
    shoot: false,
  };
  private shapes: MapShape[] = [];

  constructor(gameApp: GameApp) {
    this.app = gameApp.app;
    this.fogCanvas = gameApp.fogCanvas;
    this.fogCtx = gameApp.fogCtx;
    this.worldContainer = new Container();
    this.entityContainer = new Container();
    this.arenaGraphics = new Graphics();
    this.obstacleGraphics = new Graphics();

    this.app.stage.addChild(this.worldContainer);
    this.drawArena();
    this.drawMapShapes();
    this.worldContainer.addChild(this.arenaGraphics);
    this.worldContainer.addChild(this.obstacleGraphics);
    this.worldContainer.addChild(this.entityContainer);
  }

  setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  setInput(input: InputState): void {
    this.lastInput = input;
  }

  setMapShapes(shapes: MapShape[]): void {
    this.shapes = shapes;
    this.localPredictor.setMapShapes(shapes);
    this.drawMapShapes();
  }

  setMapSize(width: number, height: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
    this.cameraX = width / 2;
    this.cameraY = height / 2;
    this.localPredictor.setMapSize(width, height);
    this.drawArena();
  }

  private drawArena(): void {
    this.arenaGraphics.clear();
    this.arenaGraphics.rect(0, 0, this.mapWidth, this.mapHeight);
    this.arenaGraphics.fill(0x1e293b);
    this.arenaGraphics.stroke({ width: 4, color: 0x475569 });
  }

  private drawMapShapes(): void {
    this.obstacleGraphics.clear();
    for (const shape of this.shapes) {
      if (shape.kind === "rect") {
        this.obstacleGraphics.rect(shape.x, shape.y, shape.width, shape.height);
        this.obstacleGraphics.fill(0x334155);
        this.obstacleGraphics.stroke({ width: 2, color: 0x64748b });
      } else if (shape.kind === "circle") {
        this.obstacleGraphics.circle(shape.x, shape.y, shape.radius);
        this.obstacleGraphics.fill(0x334155);
        this.obstacleGraphics.stroke({ width: 2, color: 0x64748b });
      } else {
        this.obstacleGraphics.moveTo(shape.x1, shape.y1);
        this.obstacleGraphics.lineTo(shape.x2, shape.y2);
        this.obstacleGraphics.stroke({ width: shape.thickness, color: 0x64748b, cap: "round" });
      }
    }
  }

  private drawDeadZoneDebug(vw: number, vh: number, visible: boolean): void {
    if (!CAMERA_DEBUG_DEAD_ZONE || !visible) return;

    const dpr = this.app.renderer.resolution;
    const x = vw / 2 - CAMERA_DEAD_ZONE_WIDTH / 2;
    const y = vh / 2 - CAMERA_DEAD_ZONE_HEIGHT / 2;

    const ctx = this.fogCtx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(56, 189, 248, 0.1)";
    ctx.fillRect(x, y, CAMERA_DEAD_ZONE_WIDTH, CAMERA_DEAD_ZONE_HEIGHT);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, CAMERA_DEAD_ZONE_WIDTH, CAMERA_DEAD_ZONE_HEIGHT);
    ctx.restore();
  }

  updateState(players: PlayerState[], bullets: BulletState[], tick: number): void {
    if (tick === this.lastTick) return;
    this.lastTick = tick;

    const now = performance.now();
    const seenPlayers = new Set<string>();
    const seenBullets = new Set<string>();

    for (const p of players) {
      seenPlayers.add(p.id);
      const existing = this.interpolatedPlayers.get(p.id);
      if (existing) {
        existing.fromX = existing.toX;
        existing.fromY = existing.toY;
        existing.fromAngle = existing.toAngle;
        existing.toX = p.x;
        existing.toY = p.y;
        existing.toAngle = p.angle;
        existing.state = p;
        existing.receivedAt = now;
      } else {
        this.interpolatedPlayers.set(p.id, {
          fromX: p.x,
          fromY: p.y,
          toX: p.x,
          toY: p.y,
          fromAngle: p.angle,
          toAngle: p.angle,
          state: p,
          receivedAt: now,
        });
      }

      if (p.id === this.localPlayerId) {
        this.localPredictor.reconcile(p.x, p.y, p.angle, p.alive);
      }
    }

    for (const id of this.interpolatedPlayers.keys()) {
      if (!seenPlayers.has(id)) {
        this.interpolatedPlayers.delete(id);
        this.playerGraphics.get(id)?.destroy();
        this.playerGraphics.delete(id);
        this.playerLabels.get(id)?.destroy();
        this.playerLabels.delete(id);
      }
    }

    for (const b of bullets) {
      seenBullets.add(b.id);
      const existing = this.interpolatedBullets.get(b.id);
      if (existing) {
        existing.fromX = existing.toX;
        existing.fromY = existing.toY;
        existing.toX = b.x;
        existing.toY = b.y;
        existing.ownerId = b.ownerId;
        existing.weaponId = b.weaponId;
        existing.receivedAt = now;
      } else {
        this.interpolatedBullets.set(b.id, {
          fromX: b.x,
          fromY: b.y,
          toX: b.x,
          toY: b.y,
          ownerId: b.ownerId,
          weaponId: b.weaponId,
          receivedAt: now,
        });
      }
    }

    for (const id of this.interpolatedBullets.keys()) {
      if (!seenBullets.has(id)) {
        this.interpolatedBullets.delete(id);
        this.bulletGraphics.get(id)?.destroy();
        this.bulletGraphics.delete(id);
      }
    }
  }

  private drawFogOverlay(
    originX: number,
    originY: number,
    aim: number,
    screenOffsetX: number,
    screenOffsetY: number,
    vw: number,
    vh: number,
  ): void {
    const polygon = computeVisibilityPolygon(originX, originY, aim, this.shapes);
    const ctx = this.fogCtx;
    const canvas = this.fogCanvas;
    const dpr = this.app.renderer.resolution;
    const pixelW = Math.round(vw * dpr);
    const pixelH = Math.round(vh * dpr);

    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    const ox = originX + screenOffsetX;
    const oy = originY + screenOffsetY;

    ctx.fillStyle = FOG_OVERLAY_FILL;
    ctx.fillRect(0, 0, vw, vh);

    if (polygon.length >= 2) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      for (const p of polygon) {
        ctx.lineTo(p.x + screenOffsetX, p.y + screenOffsetY);
      }
      ctx.closePath();
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = FOG_OVERLAY_EDGE_COLOR;
      ctx.lineWidth = FOG_OVERLAY_EDGE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      for (const p of polygon) {
        ctx.lineTo(p.x + screenOffsetX, p.y + screenOffsetY);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  private clearFogOverlay(vw: number, vh: number): void {
    const dpr = this.app.renderer.resolution;
    this.fogCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fogCtx.clearRect(0, 0, vw, vh);
  }

  private getPlayerPosition(
    id: string,
    data: InterpolatedPlayer,
    now: number,
  ): { x: number; y: number; angle: number } {
    if (id === this.localPlayerId) {
      return {
        x: this.localPredictor.x,
        y: this.localPredictor.y,
        angle: this.lastInput.aim,
      };
    }

    const pos = interpolatePosition(
      data.fromX,
      data.fromY,
      data.toX,
      data.toY,
      data.receivedAt,
      now,
    );
    const elapsed = now - data.receivedAt;
    const t = Math.min(1, elapsed / INTERP_MS);
    const angle = lerpAngle(data.fromAngle, data.toAngle, t);

    return { x: pos.x, y: pos.y, angle };
  }

  renderFrame(dt: number): void {
    const now = performance.now();
    const localData = this.localPlayerId
      ? this.interpolatedPlayers.get(this.localPlayerId)
      : null;

    let localX = 0;
    let localY = 0;
    let localAim = this.lastInput.aim;
    let hasLocal = false;

    if (localData) {
      this.localPredictor.predict(
        this.lastInput.move.x,
        this.lastInput.move.y,
        this.lastInput.aim,
        dt,
        localData.state.alive,
      );
      localX = this.localPredictor.x;
      localY = this.localPredictor.y;
      localAim = this.localPredictor.angle;
      hasLocal = true;

      const isMoving = Math.hypot(this.lastInput.move.x, this.lastInput.move.y) > 0;
      const camTarget = getCameraTarget(
        this.cameraX,
        this.cameraY,
        localX,
        localY,
        !isMoving,
      );

      const camSmooth = 1 - Math.pow(CAMERA_SMOOTH_DECAY, dt);
      this.cameraX += (camTarget.x - this.cameraX) * camSmooth;
      this.cameraY += (camTarget.y - this.cameraY) * camSmooth;
    }

    const vw = this.app.screen.width;
    const vh = this.app.screen.height;

    for (const [id, data] of this.interpolatedPlayers) {
      const { x, y, angle } = this.getPlayerPosition(id, data, now);
      const alive = data.state.alive;
      const isLocal = id === this.localPlayerId;

      const visible =
        isLocal ||
        (hasLocal && canSeeTarget(localX, localY, localAim, x, y, this.shapes));

      let g = this.playerGraphics.get(id);
      if (!g) {
        g = new Graphics();
        this.entityContainer.addChild(g);
        this.playerGraphics.set(id, g);
      }

      let label = this.playerLabels.get(id);
      if (!label) {
        label = new Text({
          text: data.state.nickname,
          style: { fontSize: 12, fill: 0xffffff },
        });
        label.anchor.set(0.5, 1);
        this.entityContainer.addChild(label);
        this.playerLabels.set(id, label);
      }

      g.clear();
      label.visible = visible;

      if (!visible) continue;

      if (alive) {
        const color = colorFromId(id);
        g.circle(x, y, PLAYER_RADIUS);
        g.fill(color);
        g.moveTo(x, y);
        g.lineTo(
          x + Math.cos(angle) * (PLAYER_RADIUS + PLAYER_AIM_LINE_LENGTH),
          y + Math.sin(angle) * (PLAYER_RADIUS + PLAYER_AIM_LINE_LENGTH),
        );
        g.stroke({ width: 3, color: 0xffffff });
      } else {
        g.circle(x, y, PLAYER_RADIUS);
        g.fill({ color: 0x64748b, alpha: 0.4 });
      }

      label.text = data.state.nickname;
      label.position.set(x, y - PLAYER_RADIUS - 4);
      label.alpha = alive ? 1 : 0.4;
    }

    for (const [id, data] of this.interpolatedBullets) {
      const pos = interpolatePosition(
        data.fromX,
        data.fromY,
        data.toX,
        data.toY,
        data.receivedAt,
        now,
      );

      let g = this.bulletGraphics.get(id);
      if (!g) {
        g = new Graphics();
        this.entityContainer.addChild(g);
        this.bulletGraphics.set(id, g);
      }

      const isOwn = data.ownerId === this.localPlayerId;
      const visible =
        isOwn ||
        (hasLocal && canSeeTarget(localX, localY, localAim, pos.x, pos.y, this.shapes));

      g.visible = visible;
      if (!visible) continue;

      g.clear();
      const weapon = getWeapon(data.weaponId);
      g.circle(pos.x, pos.y, weapon.bulletRadius);
      g.fill(weapon.bulletColor);
    }

    this.worldContainer.position.set(
      vw / 2 - this.cameraX,
      vh / 2 - this.cameraY,
    );

    if (hasLocal) {
      this.drawFogOverlay(
        localX,
        localY,
        localAim,
        this.worldContainer.position.x,
        this.worldContainer.position.y,
        vw,
        vh,
      );
      this.drawDeadZoneDebug(vw, vh, true);
    } else {
      this.clearFogOverlay(vw, vh);
    }
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
  }

  destroy(): void {
    this.playerGraphics.forEach((g) => g.destroy());
    this.playerLabels.forEach((t) => t.destroy());
    this.bulletGraphics.forEach((g) => g.destroy());
    this.arenaGraphics.destroy();
    this.obstacleGraphics.destroy();
    this.entityContainer.destroy({ children: true });
    this.worldContainer.destroy({ children: true });
  }
}

export async function createPixiApp(parent: HTMLElement): Promise<GameApp> {
  const app = new Application();
  await app.init({
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    backgroundColor: 0x0f172a,
    antialias: true,
    resolution: 1,
    autoDensity: false,
  });

  const fogCanvas = document.createElement("canvas");
  fogCanvas.style.pointerEvents = "none";
  fogCanvas.style.zIndex = "1";

  app.canvas.style.zIndex = "0";

  parent.appendChild(app.canvas);
  parent.appendChild(fogCanvas);

  const fogCtx = fogCanvas.getContext("2d");
  if (!fogCtx) {
    throw new Error("Could not create fog canvas context");
  }

  const destroyLayout = bindViewportLayout(parent, app.canvas, fogCanvas, (layout) => {
    app.renderer.resolution = layout.resolution;
    app.renderer.resize(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  });

  return { app, fogCanvas, fogCtx, destroyLayout };
}
