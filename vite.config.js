import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * (c) 2026 Inverz Solutions Co.,Ltd.
 * Released under the MIT License.
 * ${pkg.homepage}
 */`;

const external = [
  "react",
  "react/jsx-runtime",
];

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      // "core" detects carriers without React; "server" holds the API keys and never ships React
      entry: { index: "src/index.js", core: "src/core.js", server: "src/server.js" },
      formats: ["es", "cjs"],
      fileName: (format, name) => `${name}.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: { external, output: { exports: "named", postBanner: banner } },
    sourcemap: true,
  },
});
