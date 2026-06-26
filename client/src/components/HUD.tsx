import type { LeaderboardEntry } from "@io-game/shared";
import { PLAYER_MAX_HP, getWeapon } from "@io-game/shared";

interface HUDProps {
  hp: number;
  score: number;
  weaponId: string;
  leaderboard: LeaderboardEntry[];
  playerId: string;
}

export function HUD({ hp, score, weaponId, leaderboard, playerId }: HUDProps) {
  const weapon = getWeapon(weaponId);
  const hpPercent = Math.max(0, Math.min(100, (hp / PLAYER_MAX_HP) * 100));

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
        <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 backdrop-blur">
          <div className="mb-1 flex items-center justify-between gap-4">
            <span className="text-xs uppercase tracking-wide text-slate-400">HP</span>
            <span className="font-mono text-xs text-slate-300">
              {hp} / {PLAYER_MAX_HP}
            </span>
          </div>
          <div className="h-2 w-36 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-red-500 transition-[width] duration-150"
              style={{ width: `${hpPercent}%` }}
            />
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 backdrop-blur">
          <div className="text-xs uppercase tracking-wide text-slate-400">Weapon</div>
          <div className="text-lg font-semibold text-white">{weapon.name}</div>
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
    </div>
  );
}
