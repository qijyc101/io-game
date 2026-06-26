import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { SERVER_PORT } from "@io-game/shared";
import { GameRoom } from "./GameRoom.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || SERVER_PORT;
const isProd = process.env.NODE_ENV === "production";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const room = new GameRoom();

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

room.start();

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket at ws://localhost:${PORT}/ws`);
});
