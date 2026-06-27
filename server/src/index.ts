import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { ACTIVE_MAP, SERVER_PORT } from "@io-game/shared";
import { GameRoom } from "./GameRoom.js";
import { MapStore } from "./mapStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || SERVER_PORT;
const isProd = process.env.NODE_ENV === "production";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const mapStore = new MapStore();
let room: GameRoom;

app.use(express.json({ limit: "1mb" }));

if (!isProd) {
  app.get("/api/maps", (_req, res) => {
    res.json({
      active: mapStore.getActiveMapName(),
      maps: mapStore.listMaps(),
    });
  });

  app.get("/api/maps/:name", (req, res) => {
    try {
      const map = mapStore.getMap(String(req.params.name));
      res.json(map);
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : "Map not found.",
      });
    }
  });

  app.post("/api/maps", async (req, res) => {
    try {
      const name = String(req.body?.name ?? "");
      const width = Number(req.body?.width);
      const height = Number(req.body?.height);
      const map = await mapStore.createMap(
        name,
        Number.isFinite(width) ? width : undefined,
        Number.isFinite(height) ? height : undefined,
      );
      res.status(201).json(map);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to create map.",
      });
    }
  });

  app.put("/api/maps/:name", async (req, res) => {
    try {
      const name = String(req.params.name);
      const width = Number(req.body?.width);
      const height = Number(req.body?.height);
      const stored = await mapStore.saveMap(name, {
        width,
        height,
        shapes: req.body?.shapes ?? [],
      });

      if (name === ACTIVE_MAP) {
        room.setMap(stored.shapes, {
          width: stored.width,
          height: stored.height,
        });
      }

      res.json({ ok: true, ...stored });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save map.",
      });
    }
  });

  app.delete("/api/maps/:name", async (req, res) => {
    try {
      const name = String(req.params.name);
      await mapStore.deleteMap(name);
      res.json({ ok: true, maps: mapStore.listMaps(), active: mapStore.getActiveMapName() });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to delete map.",
      });
    }
  });
}

if (isProd) {
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

wss.on("connection", (ws: WebSocket) => {
  room.addClient(ws);

  ws.on("message", (data) => {
    room.handleMessage(ws, data.toString());
  });

  ws.on("close", () => {
    room.removeClient(ws);
  });
});

async function start(): Promise<void> {
  await mapStore.init();
  const activeMap = mapStore.getActiveMap();
  room = new GameRoom(activeMap.shapes, {
    width: activeMap.width,
    height: activeMap.height,
  });
  room.start();

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket at ws://localhost:${PORT}/ws`);
    console.log(`Active map: ${ACTIVE_MAP}`);
    if (!isProd) {
      console.log(`Maps stored in ${path.resolve(__dirname, "../maps")}`);
    }
  });
}

void start();
