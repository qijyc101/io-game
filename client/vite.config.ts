import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { CLIENT_DEV_PORT, SERVER_PORT } from "../shared/src/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: CLIENT_DEV_PORT,
    proxy: {
      "/ws": {
        target: `ws://localhost:${SERVER_PORT}`,
        ws: true,
      },
    },
  },
});
