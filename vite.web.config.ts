import path from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(process.cwd(), "src/web/app"),
  base: "/",
  build: {
    outDir: path.resolve(process.cwd(), "dist/web"),
    emptyOutDir: false
  }
});
