import {
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_MAX_HP,
  RESPAWN_DELAY_MS,
  SPAWN_MAP_MARGIN,
  SPAWN_OBSTACLE_CLEARANCE,
  SPAWN_ATTEMPTS,
  DEFAULT_WEAPON_ID,
  getWeapon,
  resolveCircleMovement,
  isCirclePlacementValid,
} from "@io-game/shared";
import type { Vec2 } from "@io-game/shared";
import { circleOverlapsBulletBlockers, getActiveShapes } from "./collision.js";
import { getMapHeight, getMapWidth } from "./mapContext.js";

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
  weaponId: string;
  move: Vec2;
  aim: number;
  shoot: boolean;
  lastShootAt: number;
}

export interface Bullet {
  id: string;
  ownerId: string;
  weaponId: string;
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
    weaponId: DEFAULT_WEAPON_ID,
    move: { x: 0, y: 0 },
    aim: 0,
    shoot: false,
    lastShootAt: 0,
  };
}

export function createBullet(
  ownerId: string,
  weaponId: string,
  x: number,
  y: number,
  angle: number,
): Bullet {
  return {
    id: generateId(),
    ownerId,
    weaponId,
    x,
    y,
    angle,
    createdAt: Date.now(),
  };
}

export function randomSpawnPosition(): Vec2 {
  const mapWidth = getMapWidth();
  const mapHeight = getMapHeight();
  const shapes = getActiveShapes();
  const margin = PLAYER_RADIUS + SPAWN_MAP_MARGIN;
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
    const x = margin + Math.random() * (mapWidth - margin * 2);
    const y = margin + Math.random() * (mapHeight - margin * 2);
    if (
      isCirclePlacementValid(
        x,
        y,
        PLAYER_RADIUS + SPAWN_OBSTACLE_CLEARANCE,
        shapes,
        mapWidth,
        mapHeight,
      )
    ) {
      return { x, y };
    }
  }
  return { x: mapWidth / 2, y: mapHeight / 2 };
}

export function movePlayer(player: Player, dt: number): void {
  if (!player.alive) return;

  const len = Math.hypot(player.move.x, player.move.y);
  if (len > 0) {
    const dx = (player.move.x / len) * PLAYER_SPEED * dt;
    const dy = (player.move.y / len) * PLAYER_SPEED * dt;
    const resolved = resolveCircleMovement(
      player.x,
      player.y,
      dx,
      dy,
      PLAYER_RADIUS,
      getActiveShapes(),
      getMapWidth(),
      getMapHeight(),
    );
    player.x = resolved.x;
    player.y = resolved.y;
    player.angle = player.aim;
  } else {
    player.angle = player.aim;
  }
}

export function tryShoot(player: Player, bullets: Bullet[], now: number): void {
  if (!player.alive || !player.shoot) return;

  const weapon = getWeapon(player.weaponId);
  if (now - player.lastShootAt < weapon.fireRateMs) return;

  player.lastShootAt = now;
  const offset = PLAYER_RADIUS + weapon.bulletRadius + weapon.muzzleGap;
  const bx = player.x + Math.cos(player.aim) * offset;
  const by = player.y + Math.sin(player.aim) * offset;
  if (circleOverlapsBulletBlockers(bx, by, weapon.bulletRadius)) return;
  bullets.push(createBullet(player.id, player.weaponId, bx, by, player.aim));
}

export function moveBullets(bullets: Bullet[], dt: number, now: number): Bullet[] {
  return bullets
    .map((b) => {
      const weapon = getWeapon(b.weaponId);
      return {
        ...b,
        x: b.x + Math.cos(b.angle) * weapon.bulletSpeed * dt,
        y: b.y + Math.sin(b.angle) * weapon.bulletSpeed * dt,
      };
    })
    .filter((b) => {
      const weapon = getWeapon(b.weaponId);
      const r = weapon.bulletRadius;
      const mapWidth = getMapWidth();
      const mapHeight = getMapHeight();
      const inBounds =
        b.x >= -r && b.x <= mapWidth + r && b.y >= -r && b.y <= mapHeight + r;
      const notExpired = now - b.createdAt < weapon.bulletTtlMs;
      const notInWall = !circleOverlapsBulletBlockers(b.x, b.y, r);
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
