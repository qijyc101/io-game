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
}

export interface BulletState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  angle: number;
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

export type ClientMessage = JoinMessage | InputMessage;

// Server -> Client
export interface WelcomeMessage {
  type: "welcome";
  id: string;
  mapSize: { width: number; height: number };
}

export interface StateMessage {
  type: "state";
  tick: number;
  players: PlayerState[];
  bullets: BulletState[];
  leaderboard: LeaderboardEntry[];
}

export interface DiedMessage {
  type: "died";
  killerId: string | null;
  respawnAt: number;
}

export interface KilledMessage {
  type: "killed";
  victimId: string;
  victimNickname: string;
}

export type ServerMessage =
  | WelcomeMessage
  | StateMessage
  | DiedMessage
  | KilledMessage;
