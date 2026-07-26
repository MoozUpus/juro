import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { normalizeSitesPrimaryBindings } from "./build/cloudflare-binding-normalizer";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;
const selectedCloudflareEnvironment =
  process.env.CLOUDFLARE_ENV?.trim() || "development";
const usesProductionSitesBindings =
  selectedCloudflareEnvironment === "production";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const localVars: Record<string, string> =
  process.env.ALLOW_PLATFORM_AUTH_HEADERS === "true"
    ? { ALLOW_PLATFORM_AUTH_HEADERS: "true" }
    : {};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    optimizeDeps: {
      exclude: ["lucide-react"],
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        configPath: "./wrangler.jsonc",
        config(userConfig) {
          normalizeSitesPrimaryBindings(
            userConfig,
            {
              d1Binding: usesProductionSitesBindings ? d1 : undefined,
              r2Binding: usesProductionSitesBindings ? r2 : undefined,
              databaseId: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
              databaseName: "site-creator-d1",
              bucketName: "site-creator-r2",
            },
            localVars,
          );
        },
      }),
    ],
  };
});
