import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// super-line comes from npm (built dist). The super-store workspace packages
// resolve to their TS source so edits show up with no build step; `dedupe`
// keeps a single React instance across the app and the linked source packages.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@super-store/store": r("../../packages/store/src/index.ts"),
      "@super-store/react": r("../../packages/react/src/index.ts"),
    },
  },
});
