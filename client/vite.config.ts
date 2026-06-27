import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { CLIENT_DEV_PORT, SERVER_PORT } from "../shared/src/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sharedSrc = path.resolve(rootDir, "../shared/src/index.ts");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@io-game/shared": sharedSrc,
    },
  },
  optimizeDeps: {
    exclude: ["@io-game/shared"],
  },
  server: {
    host: true,
    port: CLIENT_DEV_PORT,
    proxy: {
      "/ws": {
        target: `ws://localhost:${SERVER_PORT}`,
        ws: true,
      },
      "/api": {
        target: `http://localhost:${SERVER_PORT}`,
      },
    },
  },
});
