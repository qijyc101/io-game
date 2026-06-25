import { useEffect, useRef } from "react";
import { createPixiApp, GameRenderer } from "./renderer";
import { initInput } from "./input";
import type { GameSocket } from "../network/socket";
import type { StateMessage } from "@io-game/shared";

interface GameCanvasProps {
  socket: GameSocket;
  playerId: string;
  gameState: StateMessage | null;
}

export function GameCanvas({ socket, playerId, gameState }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let gameApp: Awaited<ReturnType<typeof createPixiApp>> | null = null;
    let renderer: GameRenderer | null = null;
    let getInput: ReturnType<typeof initInput> | null = null;
    let rafId = 0;
    let lastFrameTime = performance.now();

    const unsubscribeState = socket.onStateMessage((state) => {
      renderer?.updateState(state.players, state.bullets, state.tick);
    });

    const init = async () => {
      gameApp = await createPixiApp(container);
      if (destroyed) {
        gameApp.app.destroy(true);
        gameApp.fogCanvas.remove();
        return;
      }

      renderer = new GameRenderer(gameApp);
      renderer.setLocalPlayerId(playerId);
      getInput = initInput(gameApp.app.canvas);

      const initial = gameStateRef.current;
      if (initial) {
        renderer.updateState(initial.players, initial.bullets, initial.tick);
      }

      const loop = (frameTime: number) => {
        if (destroyed || !renderer || !getInput) return;

        const dt = Math.min((frameTime - lastFrameTime) / 1000, 0.05);
        lastFrameTime = frameTime;

        const input = getInput();
        renderer.setInput(input);
        socket.sendInput(input.move, input.aim, input.shoot);
        renderer.renderFrame(dt);
        rafId = requestAnimationFrame(loop);
      };

      rafId = requestAnimationFrame(loop);
    };

    void init();

    return () => {
      destroyed = true;
      unsubscribeState();
      cancelAnimationFrame(rafId);
      renderer?.destroy();
      gameApp?.app.destroy(true, { children: true });
      gameApp?.fogCanvas.remove();
    };
  }, [socket, playerId]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full cursor-crosshair"
    />
  );
}
