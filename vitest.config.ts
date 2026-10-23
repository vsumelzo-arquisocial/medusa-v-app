import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Tests que leían migraciones históricas de Lovable (drizzle/migrations/00xx) que no vinieron en el export.
    // Pendiente: reescribirlos contra supabase/migrations/20261024000000_initial_schema.sql.
    exclude: [
      "**/node_modules/**",
      "src/test/naval-persistent-rpc.test.ts",
      "src/test/profile-reset-rpc.test.ts",
      "src/test/ship-economy-rebalance-rpc.test.ts",
      "src/test/ship-work-queue-rpc.test.ts",
      "src/test/warhammer40k-onboarding-rpc.test.ts",
      "src/test/wh40k-battle-flow-rpc.test.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
