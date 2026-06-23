import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  target: "es2022",
  external: ["react", "@super-store/store"],
  clean: true,
});
