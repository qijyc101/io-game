import { useCallback, useEffect, useMemo, useState } from "react";
import { GameSocket } from "./network/socket";
import { GameCanvas } from "./game/GameCanvas";
import { NicknameScreen } from "./components/NicknameScreen";
import { HUD } from "./components/HUD";
import { DeathOverlay } from "./components/DeathOverlay";
import { MapEditorScreen } from "./components/MapEditorScreen";
import type { MapShape, StateMessage } from "@io-game/shared";
import { DEFAULT_MAP_HEIGHT, DEFAULT_MAP_WIDTH } from "@io-game/shared";

type Screen = "nickname" | "game" | "mapEditor";

export default function App() {
  const [screen, setScreen] = useState<Screen>("nickname");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<StateMessage | null>(null);
  const [respawnAt, setRespawnAt] = useState<number | null>(null);
  const [deathInfo, setDeathInfo] = useState<{
    killerNickname: string | null;
    weaponName: string | null;
  } | null>(null);
  const [killFeed, setKillFeed] = useState<string | null>(null);
  const [shapes, setShapes] = useState<MapShape[]>([]);
  const [mapSize, setMapSize] = useState({ width: DEFAULT_MAP_WIDTH, height: DEFAULT_MAP_HEIGHT });
  const [, setTick] = useState(0);

  const socket = useMemo(
    () =>
      new GameSocket({
        onWelcome: (msg) => {
          setPlayerId(msg.id);
          setShapes(msg.shapes);
          setMapSize(msg.mapSize);
          setScreen("game");
        },
        onState: (msg) => {
          setGameState(msg);
        },
        onDied: (msg) => {
          setRespawnAt(msg.respawnAt);
          setDeathInfo({
            killerNickname: msg.killerNickname,
            weaponName: msg.weaponName,
          });
        },
        onKilled: (msg) => {
          setKillFeed(`Killed ${msg.victimNickname} with ${msg.weaponName}!`);
          setTimeout(() => setKillFeed(null), 2000);
        },
        onMapChanged: (msg) => {
          setShapes(msg.shapes);
          setMapSize(msg.mapSize);
        },
        onDisconnect: () => {
          setScreen("nickname");
          setPlayerId(null);
          setGameState(null);
        },
      }),
    [],
  );

  const handleJoin = useCallback(
    (nickname: string) => {
      socket.connect(nickname);
    },
    [socket],
  );

  useEffect(() => {
    return () => socket.disconnect();
  }, [socket]);

  useEffect(() => {
    if (respawnAt === null) return;
    const interval = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(interval);
  }, [respawnAt]);

  const localPlayer = gameState?.players.find((p) => p.id === playerId);
  const isDead = localPlayer ? !localPlayer.alive : false;

  useEffect(() => {
    if (localPlayer?.alive) {
      setRespawnAt(null);
      setDeathInfo(null);
    } else if (localPlayer?.respawnAt) {
      setRespawnAt(localPlayer.respawnAt);
    }
  }, [localPlayer?.alive, localPlayer?.respawnAt]);

  if (screen === "nickname") {
    return (
      <NicknameScreen
        onJoin={handleJoin}
        onOpenMapEditor={() => setScreen("mapEditor")}
      />
    );
  }

  if (screen === "mapEditor") {
    return <MapEditorScreen onBack={() => setScreen("nickname")} />;
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900">
      {playerId && (
        <GameCanvas
          socket={socket}
          playerId={playerId}
          gameState={gameState}
          shapes={shapes}
          mapSize={mapSize}
        />
      )}

      {localPlayer && (
        <HUD
          hp={localPlayer.hp}
          score={localPlayer.score}
          weaponId={localPlayer.weaponId}
          leaderboard={gameState?.leaderboard ?? []}
          playerId={playerId!}
        />
      )}

      {isDead && (
        <DeathOverlay
          respawnAt={respawnAt}
          killerNickname={deathInfo?.killerNickname ?? null}
          weaponName={deathInfo?.weaponName ?? null}
        />
      )}

      {killFeed && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-green-900/80 px-4 py-2 text-sm font-semibold text-green-300">
          {killFeed}
        </div>
      )}
    </div>
  );
}
