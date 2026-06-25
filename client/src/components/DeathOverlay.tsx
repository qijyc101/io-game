interface DeathOverlayProps {
  respawnAt: number | null;
}

export function DeathOverlay({ respawnAt }: DeathOverlayProps) {
  const now = Date.now();
  const secondsLeft =
    respawnAt !== null ? Math.max(0, Math.ceil((respawnAt - now) / 1000)) : 0;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
      <div className="rounded-xl border border-red-800 bg-slate-900/90 px-10 py-8 text-center shadow-2xl">
        <h2 className="mb-2 text-3xl font-bold text-red-400">You died</h2>
        <p className="text-slate-300">
          Respawning in <span className="font-mono text-white">{secondsLeft}</span>s
        </p>
      </div>
    </div>
  );
}
