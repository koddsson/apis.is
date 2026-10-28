import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { ENVIRONMENT: "test" } },
    }),
  ],
  test: {
    unstubEnvs: true,
    exclude: [...configDefaults.exclude, ".claude/**"],
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test-helper.ts"],
      thresholds: { 100: true },
    },
  },
});
