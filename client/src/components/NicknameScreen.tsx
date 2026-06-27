interface NicknameScreenProps {
  onJoin: (nickname: string) => void;
  onOpenMapEditor: () => void;
}

export function NicknameScreen({ onJoin, onOpenMapEditor }: NicknameScreenProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("nickname") as HTMLInputElement;
    const nickname = input.value.trim() || "Player";
    onJoin(nickname);
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-900">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-slate-700 bg-slate-800 p-8 shadow-2xl"
      >
        <h1 className="text-center text-3xl font-bold text-white">IO Arena</h1>
        <p className="text-center text-sm text-slate-400">
          Top-down shooter. WASD to move, mouse to aim, click or space to shoot.
        </p>
        <input
          name="nickname"
          type="text"
          maxLength={16}
          placeholder="Nickname"
          autoFocus
          className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-cyan-600 px-4 py-3 font-semibold text-white transition hover:bg-cyan-500"
        >
          Play
        </button>
        <button
          type="button"
          onClick={onOpenMapEditor}
          className="rounded-lg border border-slate-600 px-4 py-3 text-sm text-slate-200 transition hover:bg-slate-700"
        >
          Map editor
        </button>
      </form>
    </div>
  );
}
