import type { LeaderboardEntry } from "@io-game/shared";
import { PLAYER_MAX_HP } from "@io-game/shared";

interface HUDProps {
  hp: number;
  score: number;
  leaderboard: LeaderboardEntry[];
  playerId: string;
}

export function HUD({ hp, score, leaderboard, playerId }: HUDProps) {
  return (
    <>
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
        <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 backdrop-blur">
          <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">HP</div>
          <div className="flex gap-2">
            {Array.from({ length: PLAYER_MAX_HP }).map((_, i) => (
              <div
                key={i}
                className={`h-3 w-3 rounded-full ${
                  i < hp ? "bg-red-500" : "bg-slate-600"
                }`}
              />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 backdrop-blur">
          <div className="text-xs uppercase tracking-wide text-slate-400">Score</div>
          <div className="text-2xl font-bold text-white">{score}</div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-4 w-48 rounded-lg border border-slate-700 bg-slate-900/80 p-3 backdrop-blur">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Leaderboard
        </div>
        <ul className="space-y-1">
          {leaderboard.length === 0 ? (
            <li className="text-sm text-slate-500">No scores yet</li>
          ) : (
            leaderboard.map((entry, i) => (
              <li
                key={entry.id}
                className={`flex justify-between text-sm ${
                  entry.id === playerId ? "font-bold text-cyan-400" : "text-slate-300"
                }`}
              >
                <span>
                  {i + 1}. {entry.nickname}
                </span>
                <span>{entry.score}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </>
  );
}
