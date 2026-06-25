import {
  MAP_WIDTH,
  MAP_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_MAX_HP,
  BULLET_RADIUS,
  BULLET_SPEED,
  BULLET_TTL_MS,
  SHOOT_COOLDOWN_MS,
  RESPAWN_DELAY_MS,
} from "@io-game/shared";
import type { Vec2 } from "@io-game/shared";
import { circleOverlapsObstacles } from "./collision.js";

let nextEntityId = 1;

export function generateId(): string {
  return `e${nextEntityId++}`;
}

export interface Player {
  id: string;
  nickname: string;
  x: number;
  y: number;
  angle: number;
  hp: number;
  score: number;
  alive: boolean;
  respawnAt: number | null;
  move: Vec2;
  aim: number;
  shoot: boolean;
  lastShootAt: number;
}

export interface Bullet {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  angle: number;
  createdAt: number;
}

export function createPlayer(id: string, nickname: string): Player {
  const pos = randomSpawnPosition();
  return {
    id,
    nickname,
    x: pos.x,
    y: pos.y,
    angle: 0,
    hp: PLAYER_MAX_HP,
    score: 0,
    alive: true,
    respawnAt: null,
    move: { x: 0, y: 0 },
    aim: 0,
    shoot: false,
    lastShootAt: 0,
  };
}

export function createBullet(ownerId: string, x: number, y: number, angle: number): Bullet {
  return {
    id: generateId(),
    ownerId,
    x,
    y,
    angle,
    createdAt: Date.now(),
  };
}

export function randomSpawnPosition(): Vec2 {
  const margin = PLAYER_RADIUS + 50;
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = margin + Math.random() * (MAP_WIDTH - margin * 2);
    const y = margin + Math.random() * (MAP_HEIGHT - margin * 2);
    if (!circleOverlapsObstacles(x, y, PLAYER_RADIUS + 8)) {
      return { x, y };
    }
  }
  return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
}

export function clampPosition(x: number, y: number): Vec2 {
  const r = PLAYER_RADIUS;
  return {
    x: Math.max(r, Math.min(MAP_WIDTH - r, x)),
    y: Math.max(r, Math.min(MAP_HEIGHT - r, y)),
  };
}

function canPlaceCircle(x: number, y: number, radius: number): boolean {
  const clamped = clampPosition(x, y);
  if (clamped.x !== x || clamped.y !== y) return false;
  return !circleOverlapsObstacles(x, y, radius);
}

export function movePlayer(player: Player, dt: number): void {
  if (!player.alive) return;

  const len = Math.hypot(player.move.x, player.move.y);
  if (len > 0) {
    const nx = player.move.x / len;
    const ny = player.move.y / len;
    const newX = player.x + nx * PLAYER_SPEED * dt;
    const newY = player.y + ny * PLAYER_SPEED * dt;

    if (canPlaceCircle(newX, newY, PLAYER_RADIUS)) {
      player.x = newX;
      player.y = newY;
    } else if (canPlaceCircle(newX, player.y, PLAYER_RADIUS)) {
      player.x = newX;
    } else if (canPlaceCircle(player.x, newY, PLAYER_RADIUS)) {
      player.y = newY;
    }
    player.angle = player.aim;
  } else {
    player.angle = player.aim;
  }
}

export function tryShoot(player: Player, bullets: Bullet[], now: number): void {
  if (!player.alive || !player.shoot) return;
  if (now - player.lastShootAt < SHOOT_COOLDOWN_MS) return;

  player.lastShootAt = now;
  const offset = PLAYER_RADIUS + BULLET_RADIUS + 2;
  const bx = player.x + Math.cos(player.aim) * offset;
  const by = player.y + Math.sin(player.aim) * offset;
  if (circleOverlapsObstacles(bx, by, BULLET_RADIUS)) return;
  bullets.push(createBullet(player.id, bx, by, player.aim));
}

export function moveBullets(bullets: Bullet[], dt: number, now: number): Bullet[] {
  return bullets
    .map((b) => ({
      ...b,
      x: b.x + Math.cos(b.angle) * BULLET_SPEED * dt,
      y: b.y + Math.sin(b.angle) * BULLET_SPEED * dt,
    }))
    .filter((b) => {
      const inBounds =
        b.x >= -BULLET_RADIUS &&
        b.x <= MAP_WIDTH + BULLET_RADIUS &&
        b.y >= -BULLET_RADIUS &&
        b.y <= MAP_HEIGHT + BULLET_RADIUS;
      const notExpired = now - b.createdAt < BULLET_TTL_MS;
      const notInWall = !circleOverlapsObstacles(b.x, b.y, BULLET_RADIUS);
      return inBounds && notExpired && notInWall;
    });
}

export function respawnPlayer(player: Player, now: number): void {
  if (player.alive || player.respawnAt === null || now < player.respawnAt) return;
  const pos = randomSpawnPosition();
  player.x = pos.x;
  player.y = pos.y;
  player.hp = PLAYER_MAX_HP;
  player.alive = true;
  player.respawnAt = null;
}

export function killPlayer(player: Player, now: number): void {
  player.alive = false;
  player.hp = 0;
  player.respawnAt = now + RESPAWN_DELAY_MS;
}
