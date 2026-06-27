import { useEffect, useRef } from "react";
import { createPixiApp, GameRenderer } from "./renderer";
import { initInput } from "./input";
import type { GameSocket } from "../network/socket";
import { MAX_FRAME_DT } from "@io-game/shared";
import type { MapShape, StateMessage } from "@io-game/shared";

interface GameCanvasProps {
  socket: GameSocket;
  playerId: string;
  gameState: StateMessage | null;
  shapes: MapShape[];
  mapSize: { width: number; height: number };
}

export function GameCanvas({ socket, playerId, gameState, shapes, mapSize }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  useEffect(() => {
    rendererRef.current?.setMapShapes(shapes);
  }, [shapes]);

  useEffect(() => {
    rendererRef.current?.setMapSize(mapSize.width, mapSize.height);
  }, [mapSize]);

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
      renderer?.updateState(state.players, state.bullets, state.hits ?? [], state.tick);
    });

    const onDebugKeyDown = (event: KeyboardEvent) => {
      if (!import.meta.env.DEV || event.code !== "KeyK" || event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      event.preventDefault();
      socket.sendDebug({ type: "debug", command: "suicide" });
    };

    window.addEventListener("keydown", onDebugKeyDown);

    const init = async () => {
      gameApp = await createPixiApp(container);
      if (destroyed) {
        gameApp.destroyLayout();
        gameApp.app.destroy(true);
        gameApp.fogCanvas.remove();
        return;
      }

      renderer = new GameRenderer(gameApp);
      rendererRef.current = renderer;
      renderer.setLocalPlayerId(playerId);
      renderer.setMapSize(mapSize.width, mapSize.height);
      renderer.setMapShapes(shapes);
      getInput = initInput(gameApp.app.canvas);

      const initial = gameStateRef.current;
      if (initial) {
        renderer.updateState(initial.players, initial.bullets, initial.hits ?? [], initial.tick);
      }

      const loop = (frameTime: number) => {
        if (destroyed || !renderer || !getInput) return;

        const dt = Math.min((frameTime - lastFrameTime) / 1000, MAX_FRAME_DT);
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
      window.removeEventListener("keydown", onDebugKeyDown);
      unsubscribeState();
      cancelAnimationFrame(rafId);
      rendererRef.current = null;
      renderer?.destroy();
      gameApp?.destroyLayout();
      gameApp?.app.destroy(true, { children: true });
      gameApp?.fogCanvas.remove();
    };
  }, [socket, playerId]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 isolate z-0 h-full w-full cursor-crosshair"
    />
  );
}
