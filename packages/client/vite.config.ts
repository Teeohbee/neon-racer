import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true }, "/log": "http://localhost:8787" },
  },
});
