import { WebSocket } from "ws";
import {
  TICK_MS,
  RESPAWN_DELAY_MS,
  NICKNAME_MAX_LENGTH,
  LEADERBOARD_SIZE,
  getWeapon,
} from "@io-game/shared";
import type {
  ClientMessage,
  InputMessage,
  MapShape,
  PlayerState,
  BulletState,
  LeaderboardEntry,
  DiedMessage,
  KilledMessage,
  MapChangedMessage,
} from "@io-game/shared";
import {
  createPlayer,
  movePlayer,
  tryShoot,
  moveBullets,
  respawnPlayer,
  killPlayer,
  type Player,
  type Bullet,
} from "./entities.js";
import { bulletHitsPlayer, setActiveShapes } from "./collision.js";
import { setMapSize } from "./mapContext.js";

interface ClientConnection {
  ws: WebSocket;
  playerId: string | null;
  joined: boolean;
}

export class GameRoom {
  private players = new Map<string, Player>();
  private bullets: Bullet[] = [];
  private clients = new Map<WebSocket, ClientConnection>();
  private tick = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private shapes: MapShape[];
  private mapSize: { width: number; height: number };

  constructor(shapes: MapShape[], mapSize: { width: number; height: number }) {
    this.shapes = shapes;
    this.mapSize = mapSize;
    setActiveShapes(shapes);
    setMapSize(mapSize.width, mapSize.height);
  }

  setMap(shapes: MapShape[], mapSize: { width: number; height: number }): void {
    this.shapes = shapes;
    this.mapSize = mapSize;
    setActiveShapes(shapes);
    setMapSize(mapSize.width, mapSize.height);
    this.broadcastMapChanged();
  }

  getShapes(): MapShape[] {
    return this.shapes;
  }

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tickLoop(), TICK_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  addClient(ws: WebSocket): void {
    this.clients.set(ws, { ws, playerId: null, joined: false });
  }

  removeClient(ws: WebSocket): void {
    const conn = this.clients.get(ws);
    if (conn?.playerId) {
      this.players.delete(conn.playerId);
    }
    this.clients.delete(ws);
  }

  handleMessage(ws: WebSocket, raw: string): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }

    const conn = this.clients.get(ws);
    if (!conn) return;

    if (msg.type === "join") {
      if (conn.joined) return;
      const nickname = msg.nickname.trim().slice(0, NICKNAME_MAX_LENGTH) || "Player";
      const player = createPlayer(crypto.randomUUID(), nickname);
      this.players.set(player.id, player);
      conn.playerId = player.id;
      conn.joined = true;

      ws.send(
        JSON.stringify({
          type: "welcome",
          id: player.id,
          mapSize: this.mapSize,
          shapes: this.shapes,
        }),
      );
      return;
    }

    if (msg.type === "input" && conn.playerId) {
      this.handleInput(conn.playerId, msg);
      return;
    }

    if (msg.type === "debug" && conn.playerId) {
      this.handleDebug(conn.playerId, msg);
    }
  }

  private handleDebug(playerId: string, msg: ClientMessage & { type: "debug" }): void {
    if (process.env.NODE_ENV === "production") return;

    const player = this.players.get(playerId);
    if (!player || !player.alive) return;

    if (msg.command === "suicide") {
      const now = Date.now();
      this.sendToPlayer(player.id, {
        type: "died",
        killerId: null,
        killerNickname: null,
        weaponName: null,
        respawnAt: now + RESPAWN_DELAY_MS,
      } satisfies DiedMessage);
      killPlayer(player, now);
    }
  }

  private handleInput(playerId: string, input: InputMessage): void {
    const player = this.players.get(playerId);
    if (!player) return;

    const len = Math.hypot(input.move.x, input.move.y);
    if (len > 1) {
      player.move = { x: input.move.x / len, y: input.move.y / len };
    } else {
      player.move = { x: input.move.x, y: input.move.y };
    }
    player.aim = input.aim;
    player.shoot = input.shoot;
  }

  private tickLoop(): void {
    const dt = TICK_MS / 1000;
    const now = Date.now();
    this.tick++;

    for (const player of this.players.values()) {
      respawnPlayer(player, now);
      movePlayer(player, dt);
      tryShoot(player, this.bullets, now);
      player.shoot = false;
    }

    this.bullets = moveBullets(this.bullets, dt, now);
    this.checkCollisions(now);
    this.broadcastState();
  }

  private checkCollisions(now: number): void {
    const hitBulletIds = new Set<string>();

    for (const bullet of this.bullets) {
      if (hitBulletIds.has(bullet.id)) continue;
      const weapon = getWeapon(bullet.weaponId);

      for (const player of this.players.values()) {
        if (!player.alive || player.id === bullet.ownerId) continue;
        if (!bulletHitsPlayer(bullet.x, bullet.y, weapon.bulletRadius, player.x, player.y)) continue;

        hitBulletIds.add(bullet.id);
        player.hp -= weapon.damage;

        if (player.hp <= 0) {
          const killer = this.players.get(bullet.ownerId);
          if (killer) {
            killer.score += 1;
            this.sendToPlayer(player.id, {
              type: "died",
              killerId: killer.id,
              killerNickname: killer.nickname,
              weaponName: weapon.name,
              respawnAt: now + RESPAWN_DELAY_MS,
            } satisfies DiedMessage);
            this.sendToPlayer(killer.id, {
              type: "killed",
              victimId: player.id,
              victimNickname: player.nickname,
              weaponName: weapon.name,
            } satisfies KilledMessage);
          } else {
            this.sendToPlayer(player.id, {
              type: "died",
              killerId: null,
              killerNickname: null,
              weaponName: null,
              respawnAt: now + RESPAWN_DELAY_MS,
            } satisfies DiedMessage);
          }
          killPlayer(player, now);
        }
        break;
      }
    }

    if (hitBulletIds.size > 0) {
      this.bullets = this.bullets.filter((b) => !hitBulletIds.has(b.id));
    }
  }

  private sendToPlayer(playerId: string, message: DiedMessage | KilledMessage): void {
    for (const conn of this.clients.values()) {
      if (conn.playerId === playerId && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify(message));
      }
    }
  }

  private getLeaderboard(): LeaderboardEntry[] {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, LEADERBOARD_SIZE)
      .map((p) => ({ id: p.id, nickname: p.nickname, score: p.score }));
  }

  private toPlayerState(p: Player): PlayerState {
    return {
      id: p.id,
      nickname: p.nickname,
      x: p.x,
      y: p.y,
      angle: p.angle,
      hp: p.hp,
      score: p.score,
      alive: p.alive,
      respawnAt: p.respawnAt,
      weaponId: p.weaponId,
    };
  }

  private toBulletState(b: Bullet): BulletState {
    return {
      id: b.id,
      ownerId: b.ownerId,
      weaponId: b.weaponId,
      x: b.x,
      y: b.y,
      angle: b.angle,
    };
  }

  private broadcastMapChanged(): void {
    const message = JSON.stringify({
      type: "mapChanged",
      mapSize: this.mapSize,
      shapes: this.shapes,
    } satisfies MapChangedMessage);

    for (const conn of this.clients.values()) {
      if (conn.joined && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    }
  }

  private broadcastState(): void {
    const state = JSON.stringify({
      type: "state",
      tick: this.tick,
      players: [...this.players.values()].map((p) => this.toPlayerState(p)),
      bullets: this.bullets.map((b) => this.toBulletState(b)),
      leaderboard: this.getLeaderboard(),
    });

    for (const conn of this.clients.values()) {
      if (conn.joined && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(state);
      }
    }
  }
}
