import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { ENVIRONMENT: "test" } },
    }),
  ],
  test: {
    unstubEnvs: true,
    exclude: ["**/node_modules/**", "src/endpoints/live.test.ts"],
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      thresholds: { branches: 85, lines: 95 },
    },
  },
});
