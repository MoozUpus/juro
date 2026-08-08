import vinext from "vinext";
import { defineConfig } from "vite";
import { normalizeSitesPrimaryBindings } from "./build/cloudflare-binding-normalizer";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const localVars: Record<string, string> =
  process.env.ALLOW_PLATFORM_AUTH_HEADERS === "true"
    ? { ALLOW_PLATFORM_AUTH_HEADERS: "true" }
    : {};

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const agentPreviewCompatibilityDate =
    command === "serve"
      ? process.env.JURO_AGENT_PREVIEW_COMPATIBILITY_DATE?.trim()
      : undefined;

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
          if (agentPreviewCompatibilityDate) {
            userConfig.compatibility_date = agentPreviewCompatibilityDate;
          }
          normalizeSitesPrimaryBindings(
            userConfig,
            {},
            localVars,
          );
        },
      }),
    ],
  };
});
