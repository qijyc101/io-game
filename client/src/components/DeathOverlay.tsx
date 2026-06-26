interface DeathOverlayProps {
  respawnAt: number | null;
  killerNickname: string | null;
  weaponName: string | null;
}

export function DeathOverlay({ respawnAt, killerNickname, weaponName }: DeathOverlayProps) {
  const now = Date.now();
  const secondsLeft =
    respawnAt !== null ? Math.max(0, Math.ceil((respawnAt - now) / 1000)) : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/50">
      <div className="rounded-xl border border-red-800 bg-slate-900/90 px-10 py-8 text-center shadow-2xl">
        <h2 className="mb-2 text-3xl font-bold text-red-400">You died</h2>
        {killerNickname && weaponName ? (
          <p className="mb-3 text-slate-300">
            Killed by <span className="font-semibold text-white">{killerNickname}</span>
            {" · "}
            <span className="font-semibold text-amber-400">{weaponName}</span>
          </p>
        ) : (
          <p className="mb-3 text-slate-400">You were eliminated</p>
        )}
        <p className="text-slate-300">
          Respawning in <span className="font-mono text-white">{secondsLeft}</span>s
        </p>
      </div>
    </div>
  );
}
