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
  segmentMapBoundsHitT,
  segmentPlayerHitT,
  segmentPointAtT,
  segmentShapesEarliestHitT,
} from "@io-game/shared";
import type { HitEffect, Vec2 } from "@io-game/shared";
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

export interface BulletImpact {
  x: number;
  y: number;
  kind: HitEffect["kind"];
  playerId?: string;
  ownerId: string;
  weaponId: string;
}

function advanceBullet(
  bullet: Bullet,
  dt: number,
  now: number,
  players: Player[],
): { bullet: Bullet | null; impact: BulletImpact | null } {
  const weapon = getWeapon(bullet.weaponId);
  const x1 = bullet.x;
  const y1 = bullet.y;
  const x2 = x1 + Math.cos(bullet.angle) * weapon.bulletSpeed * dt;
  const y2 = y1 + Math.sin(bullet.angle) * weapon.bulletSpeed * dt;
  const radius = weapon.bulletRadius;
  const shapes = getActiveShapes();
  const mapWidth = getMapWidth();
  const mapHeight = getMapHeight();

  let bestT: number | null = null;
  let kind: HitEffect["kind"] = "wall";
  let playerId: string | undefined;

  const wallT = segmentShapesEarliestHitT(x1, y1, x2, y2, radius, shapes, "bullet");
  if (wallT !== null) {
    bestT = wallT;
  }

  const boundsT = segmentMapBoundsHitT(x1, y1, x2, y2, radius, mapWidth, mapHeight);
  if (boundsT !== null && (bestT === null || boundsT < bestT)) {
    bestT = boundsT;
    kind = "wall";
    playerId = undefined;
  }

  for (const player of players) {
    if (!player.alive || player.id === bullet.ownerId) {
      continue;
    }
    const hitT = segmentPlayerHitT(
      x1,
      y1,
      x2,
      y2,
      radius,
      player.x,
      player.y,
      PLAYER_RADIUS,
    );
    if (hitT !== null && (bestT === null || hitT < bestT)) {
      bestT = hitT;
      kind = "player";
      playerId = player.id;
    }
  }

  if (bestT !== null) {
    const point = segmentPointAtT(x1, y1, x2, y2, bestT);
    return {
      bullet: null,
      impact: {
        x: point.x,
        y: point.y,
        kind,
        playerId,
        ownerId: bullet.ownerId,
        weaponId: bullet.weaponId,
      },
    };
  }

  if (now - bullet.createdAt >= weapon.bulletTtlMs) {
    return { bullet: null, impact: null };
  }

  return {
    bullet: { ...bullet, x: x2, y: y2 },
    impact: null,
  };
}

export function simulateBullets(
  bullets: Bullet[],
  dt: number,
  now: number,
  players: Player[],
): { bullets: Bullet[]; impacts: BulletImpact[] } {
  const nextBullets: Bullet[] = [];
  const impacts: BulletImpact[] = [];

  for (const bullet of bullets) {
    const result = advanceBullet(bullet, dt, now, players);
    if (result.bullet) {
      nextBullets.push(result.bullet);
    }
    if (result.impact) {
      impacts.push(result.impact);
    }
  }

  return { bullets: nextBullets, impacts };
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
