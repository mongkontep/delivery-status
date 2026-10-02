import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Demo site (demo/) — served from Firebase Hosting under /deliverystatus/
export default defineConfig({
  root: "demo",
  base: "/deliverystatus/",
  plugins: [react()],
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
  },
});
