import type { MapShape } from "./mapEditor.js";

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerState {
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
}

export interface BulletState {
  id: string;
  ownerId: string;
  weaponId: string;
  x: number;
  y: number;
  angle: number;
}

export interface HitEffect {
  x: number;
  y: number;
  kind: "player" | "wall";
}

export interface LeaderboardEntry {
  id: string;
  nickname: string;
  score: number;
}

export interface GameStateSnapshot {
  tick: number;
  players: PlayerState[];
  bullets: BulletState[];
  leaderboard: LeaderboardEntry[];
}

// Client -> Server
export interface JoinMessage {
  type: "join";
  nickname: string;
}

export interface InputMessage {
  type: "input";
  seq: number;
  move: Vec2;
  aim: number;
  shoot: boolean;
}

export interface DebugMessage {
  type: "debug";
  command: "suicide";
}

export type ClientMessage = JoinMessage | InputMessage | DebugMessage;

// Server -> Client
export interface WelcomeMessage {
  type: "welcome";
  id: string;
  mapSize: { width: number; height: number };
  shapes: MapShape[];
}

export interface StateMessage {
  type: "state";
  tick: number;
  players: PlayerState[];
  bullets: BulletState[];
  hits: HitEffect[];
  leaderboard: LeaderboardEntry[];
}

export interface DiedMessage {
  type: "died";
  killerId: string | null;
  killerNickname: string | null;
  weaponName: string | null;
  respawnAt: number;
}

export interface KilledMessage {
  type: "killed";
  victimId: string;
  victimNickname: string;
  weaponName: string;
}

export interface MapChangedMessage {
  type: "mapChanged";
  mapSize: { width: number; height: number };
  shapes: MapShape[];
}

export type ServerMessage =
  | WelcomeMessage
  | StateMessage
  | DiedMessage
  | KilledMessage
  | MapChangedMessage;
