import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Der "@/"-Alias aus tsconfig.json — die Route-Tests importieren darüber die
// echten API-Routen (app/api/ticker/...), nicht nur die Engine.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
