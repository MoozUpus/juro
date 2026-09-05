import vinext from "vinext";
import { defineConfig } from "vite";
import { normalizeSitesPrimaryBindings } from "./build/cloudflare-binding-normalizer";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const useRemoteBindings = process.env.CLOUDFLARE_REMOTE_BINDINGS === "true";
const localVars: Record<string, string> = {};
for (const name of [
  "ALLOW_PLATFORM_AUTH_HEADERS",
  "LOCAL_AUTH_BYPASS",
  "LOCAL_AUTH_EMAIL",
  "LOCAL_AUTH_FULL_NAME",
]) {
  const value = process.env[name]?.trim();
  if (value) localVars[name] = value;
}

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
  const useStagingCorpusReads = command === "serve"
    && process.env.JURO_STAGING_CORPUS_READS === "true";
  const resolvedLocalVars = useStagingCorpusReads
    ? {
      ...localVars,
      LEGAL_CORPUS_ENABLED: "true",
      // This command exists to exercise the indexed staging corpus. Keep the
      // slower live-Lex freshness fallback out of this opt-in mode; stale
      // indexed evidence is still labelled by the normal freshness warning.
      LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: process.env.JURO_STAGING_LIVE_LEXUZ === "true" ? "true" : "false",
      LEGAL_CORPUS_REMOTE_READ_ENABLED: "true",
      LEGAL_CORPUS_SHADOW_MODE: "false",
      LEGAL_CORPUS_DENSE_ENABLED: "true",
      LEGAL_RERANKER_VERSION: "provision-set-v1",
      LEGAL_CORPUS_INDEX_VERSION: "staging-20260830-provision-v1",
      OPENAI_RETRIEVAL_MODEL: "gpt-5.6-terra",
      OPENAI_RERANK_MODEL: "text-embedding-3-large",
      QDRANT_URL: "https://qdrant.internal",
      QDRANT_COLLECTION: "juro_legal_staging_provision_v1",
    }
    : localVars;

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    optimizeDeps: {
      exclude: ["lucide-react"],
    },
    server: {
      host: "127.0.0.1",
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
        remoteBindings: useRemoteBindings || useStagingCorpusReads,
        configPath: "./wrangler.jsonc",
        config(userConfig) {
          if (agentPreviewCompatibilityDate) {
            userConfig.compatibility_date = agentPreviewCompatibilityDate;
          }
          if (useStagingCorpusReads) {
            // The deployed corpus Worker may lag local read-tool changes, so
            // development binds the staging database read-only at the corpus
            // boundary. Retrieval batches statistics, candidates and evidence
            // hydration to keep this path to a small number of remote trips.
            userConfig.d1_databases = [
              {
                binding: "LEGAL_CORPUS_READ_DB",
                database_name: "juro-staging",
                database_id: "bb716a96-b2fb-4823-90d6-6c228fed181a",
                remote: true,
              },
              ...(userConfig.d1_databases ?? []).filter(
                (binding) => binding.binding !== "LEGAL_CORPUS_READ_DB",
              ),
            ];
            userConfig.services = [
              {
                binding: "LEGAL_CORPUS_READ_SERVICE",
                service: "juro-legal-corpus-staging",
                remote: true,
              },
              ...(userConfig.services ?? []).filter(
                (binding) => binding.binding !== "LEGAL_CORPUS_READ_SERVICE",
              ),
            ];
          }
          normalizeSitesPrimaryBindings(
            userConfig,
            {},
            resolvedLocalVars,
          );
        },
      }),
    ],
  };
});
