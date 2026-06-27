import type { MapShape, MapTextureDef, StateMessage } from "@io-game/shared"
import { MAX_FRAME_DT } from "@io-game/shared"
import { Stats } from "pixi-stats"
import { useEffect, useRef } from "react"
import type { GameSocket } from "../network/socket"
import { initInput } from "./input"
import { createPixiApp, GameRenderer } from "./renderer"

interface GameCanvasProps {
  socket: GameSocket;
  playerId: string;
  gameState: StateMessage | null;
  shapes: MapShape[];
  textures: MapTextureDef[];
  mapName: string;
  mapSize: { width: number; height: number };
}

export function GameCanvas({
  socket,
  playerId,
  gameState,
  shapes,
  textures,
  mapName,
  mapSize,
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const gameStateRef = useRef(gameState);
  const shapesRef = useRef(shapes);
  const texturesRef = useRef(textures);
  const mapNameRef = useRef(mapName);
  const mapSizeRef = useRef(mapSize);
  gameStateRef.current = gameState;
  shapesRef.current = shapes;
  texturesRef.current = textures;
  mapNameRef.current = mapName;
  mapSizeRef.current = mapSize;

  useEffect(() => {
    rendererRef.current?.setMapShapes(shapes);
  }, [shapes]);

  useEffect(() => {
    rendererRef.current?.setMapTextures(mapName, textures);
  }, [mapName, textures]);

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
    let fpsStats: Stats | null = null;

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

      if (import.meta.env.DEV) {
        fpsStats = new Stats(gameApp.app.renderer, undefined, container);
        if (fpsStats.domElement) {
          fpsStats.domElement.style.position = "absolute";
          fpsStats.domElement.style.bottom = "0";
          fpsStats.domElement.style.left = "0";
          fpsStats.domElement.style.zIndex = "10";
          fpsStats.domElement.style.pointerEvents = "auto";
        }
      }

      renderer = new GameRenderer(gameApp);
      rendererRef.current = renderer;
      renderer.setLocalPlayerId(playerId);
      renderer.setMapSize(mapSizeRef.current.width, mapSizeRef.current.height);
      renderer.setMapShapes(shapesRef.current);
      renderer.setMapTextures(mapNameRef.current, texturesRef.current);
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
      fpsStats?.hidePanel();
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
