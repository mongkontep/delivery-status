import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { playground } from "./demo/playground-server.js";

// Demo site (demo/) — served from Firebase Hosting under /deliverystatus/
// In dev (npm run dev / npm run playground) it also serves a real /api/track from .env.local
export default defineConfig({
  root: "demo",
  base: "/deliverystatus/",
  plugins: [react(), playground()],
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
  },
});
