import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceConfigPath = resolve(projectRoot, "wrangler.jsonc");
const artifactConfigPath = resolve(projectRoot, "dist/server/wrangler.json");
const sourceHostingPath = resolve(projectRoot, ".openai/hosting.json");
const artifactHostingPath = resolve(
  projectRoot,
  "dist/.openai/hosting.json",
);
const sourceMigrations = resolve(projectRoot, "drizzle");
const artifactMigrations = resolve(projectRoot, "dist/.openai/drizzle");
const workerPath = resolve(projectRoot, "dist/server/index.js");

const requestedEnvironment = process.env.CLOUDFLARE_ENV?.trim() || "development";
assert.ok(
  ["development", "staging", "production"].includes(requestedEnvironment),
  `Unsupported CLOUDFLARE_ENV: ${requestedEnvironment}`,
);

const source = JSON.parse(await readFile(sourceConfigPath, "utf8"));
const selected = requestedEnvironment === "development"
  ? source
  : source.env?.[requestedEnvironment];
assert.ok(selected, `Missing source environment: ${requestedEnvironment}`);

const artifact = JSON.parse(await readFile(artifactConfigPath, "utf8"));
assert.equal(
  Object.hasOwn(artifact, "env"),
  false,
  "flattened Wrangler artifact must not contain env sections",
);
assert.equal(artifact.name, selected.name);
assert.equal(artifact.vars?.APP_ENV, requestedEnvironment);
assert.deepEqual(artifact.vars, selected.vars);
assert.equal(
  artifact.vars?.ASYNC_RUNTIME_ENABLED,
  requestedEnvironment === "staging" ? "true" : "false",
);
assert.equal(
  artifact.vars?.CRON_ENABLED,
  requestedEnvironment === "staging" ? "true" : "false",
);
assert.equal(
  artifact.vars?.ACCOUNT_DELETION_PURGE_ENABLED,
  requestedEnvironment === "staging" ? "true" : "false",
);
assert.equal(artifact.vars?.LEGAL_ADVICE_INGESTION_ENABLED, "false");
assert.equal(artifact.vars?.LEGAL_SOURCE_STAFF_API_ENABLED, "false");
assert.equal(
  artifact.vars?.IDENTITY_PROTECTION_MODE,
  "legacy",
  "identity protection must remain in expand-safe legacy mode",
);
assert.equal(
  Object.hasOwn(artifact.vars ?? {}, "ALLOW_PLATFORM_AUTH_HEADERS"),
  false,
  "development authentication bypass must never be packaged",
);
for (const secretBinding of [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "RESEND_API_KEY",
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "OTP_HASH_SECRET",
  "CRON_SECRET",
  "TURNSTILE_SECRET_KEY",
  "TOTP_ENCRYPTION_KEY",
  "SIGNED_URL_SECRET",
  "IDENTITY_KEYRING",
]) {
  assert.equal(
    Object.hasOwn(artifact.vars ?? {}, secretBinding),
    false,
    `${secretBinding} must be supplied by Cloudflare secret storage, not packaged vars`,
  );
}
assert.equal(artifact.compatibility_date, source.compatibility_date);
assert.deepEqual(artifact.compatibility_flags, source.compatibility_flags);
assert.equal(artifact.assets?.binding, "ASSETS");
assert.equal(artifact.assets?.directory, "../client");

if (requestedEnvironment === "staging") {
  assert.equal(
    selected.workers_dev,
    false,
    "staging source config must disable workers.dev exposure",
  );
  assert.equal(
    selected.preview_urls,
    false,
    "staging source config must disable version preview URLs",
  );
  assert.deepEqual(
    selected.routes,
    [],
    "staging source config must not attach a route before Access is proven",
  );
  assert.equal(
    artifact.workers_dev,
    false,
    "staging artifact must disable workers.dev exposure",
  );
  assert.equal(
    artifact.preview_urls,
    false,
    "staging artifact must disable version preview URLs",
  );
  assert.deepEqual(
    artifact.routes,
    [],
    "staging artifact must remain unattached until Access is proven",
  );
}

const usesProductionSitesBindings = requestedEnvironment === "production";
assert.deepEqual(selected.r2_buckets, [
  {
    binding: "BUCKET",
    bucket_name: usesProductionSitesBindings
      ? "juro-private-documents"
      : `juro-${requestedEnvironment}-files`,
  },
  {
    binding: "BACKUP_BUCKET",
    bucket_name: `juro-${requestedEnvironment}-backups`,
  },
  {
    binding: "QUARANTINE_BUCKET",
    bucket_name: `juro-${requestedEnvironment}-quarantine`,
  },
]);
assert.equal(artifact.d1_databases?.length, 1);
assert.deepEqual(
  artifact.d1_databases[0],
  usesProductionSitesBindings
    ? {
        binding: "DB",
        database_name: "site-creator-d1",
        database_id: "00000000-0000-4000-8000-000000000000",
        migrations_dir: "./drizzle",
      }
    : selected.d1_databases[0],
);

assert.equal(artifact.r2_buckets?.length, 3);
assert.deepEqual(
  artifact.r2_buckets,
  usesProductionSitesBindings
    ? [
        {
          binding: "BUCKET",
          bucket_name: "site-creator-r2",
        },
        ...selected.r2_buckets.slice(1),
      ]
    : selected.r2_buckets,
);
assert.deepEqual(artifact.queues, selected.queues);
assert.deepEqual(artifact.vectorize, selected.vectorize);
assert.deepEqual(
  artifact.analytics_engine_datasets,
  selected.analytics_engine_datasets,
);
assert.deepEqual(artifact.images, selected.images);
assert.deepEqual(
  artifact.observability,
  selected.observability ?? source.observability,
);

const queueContract = [
  ["DOCUMENT_ANALYSIS_QUEUE", "document-analysis"],
  ["OCR_PROCESSING_QUEUE", "ocr-processing"],
  ["DOCUMENT_EXPORT_QUEUE", "document-export"],
  ["EMAIL_NOTIFICATIONS_QUEUE", "email-notifications"],
  ["LEGAL_SOURCES_SYNC_QUEUE", "legal-sources-sync"],
  ["DATA_RETENTION_CLEANUP_QUEUE", "data-retention-cleanup"],
  ["NOTIFICATIONS_QUEUE", "notifications"],
];
assert.deepEqual(
  artifact.queues?.producers,
  queueContract.map(([binding, suffix]) => ({
    binding,
    queue: `${requestedEnvironment}-${suffix}`,
  })),
);
assert.deepEqual(
  artifact.queues?.consumers,
  requestedEnvironment === "staging"
    ? [
      {
        queue: "staging-legal-sources-sync",
        max_batch_size: 5,
        max_batch_timeout: 5,
        max_retries: 5,
        dead_letter_queue: "staging-legal-sources-sync-dlq",
        max_concurrency: 1,
        retry_delay: 30,
      },
      {
        queue: "staging-email-notifications",
        max_batch_size: 5,
        max_batch_timeout: 5,
        max_retries: 5,
        dead_letter_queue: "staging-email-notifications-dlq",
        max_concurrency: 2,
        retry_delay: 30,
      },
      {
        queue: "staging-data-retention-cleanup",
        max_batch_size: 5,
        max_batch_timeout: 5,
        max_retries: 5,
        dead_letter_queue: "staging-data-retention-cleanup-dlq",
        max_concurrency: 1,
        retry_delay: 30,
      },
    ]
    : [],
  "Only reviewed staging consumers may be attached",
);
assert.equal(
  artifact.queues?.producers.some(({ binding }) =>
    binding === "MALWARE_SCAN_QUEUE"
  ),
  false,
  "Malware queue cannot be attached before a real scanner exists",
);

const vectorContract = [
  ["LEX_UZ_INDEX", "lex-uz"],
  ["ADVICE_UZ_INDEX", "advice-uz"],
  ["INTERNAL_LEGAL_MATERIALS_INDEX", "internal-legal-materials"],
  ["USER_DOCUMENTS_INDEX", "user-documents"],
];
assert.deepEqual(
  artifact.vectorize,
  vectorContract.map(([binding, suffix]) => ({
    binding,
    index_name: `${requestedEnvironment}-${suffix}`,
  })),
);

const serializedArtifact = JSON.stringify(artifact);
for (const legacyBinding of [
  "AI_JOBS_QUEUE",
  "FILE_JOBS_QUEUE",
  "DOCUMENT_JOBS_QUEUE",
  "LEGAL_SYNC_QUEUE",
  "EMAIL_JOBS_QUEUE",
  "NOTIFICATION_JOBS_QUEUE",
  "CLEANUP_JOBS_QUEUE",
  "BACKUP_JOBS_QUEUE",
]) {
  assert.doesNotMatch(serializedArtifact, new RegExp(`"${legacyBinding}"`));
}

const bindingNames = [
  ...artifact.d1_databases,
  ...artifact.r2_buckets,
  ...artifact.queues.producers,
  ...artifact.vectorize,
  ...artifact.analytics_engine_datasets,
  artifact.images,
  artifact.assets,
].map(({ binding }) => binding);
assert.equal(
  new Set(bindingNames).size,
  bindingNames.length,
  "flattened artifact contains duplicate binding names",
);

const triggers = artifact.triggers;
assert.deepEqual(
  triggers,
  requestedEnvironment === "staging"
    ? { crons: ["*/5 * * * *"] }
    : {},
  "Only the reviewed staging outbox cron may be attached",
);

async function filesBelow(root) {
  const output = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        output.push(relative(root, path));
      }
    }
  }
  await visit(root);
  return output.sort();
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

const sourceFiles = await filesBelow(sourceMigrations);
const artifactFiles = await filesBelow(artifactMigrations);
assert.deepEqual(
  artifactFiles,
  sourceFiles,
  "packaged migration file set differs from source",
);
for (const path of sourceFiles) {
  assert.equal(
    await sha256(resolve(artifactMigrations, path)),
    await sha256(resolve(sourceMigrations, path)),
    `packaged migration differs: ${path}`,
  );
}

for (const path of await filesBelow(resolve(projectRoot, "dist"))) {
  const name = basename(path);
  assert.equal(
    name === ".env" ||
      name.startsWith(".env.") ||
      name === ".dev.vars" ||
      name.startsWith(".dev.vars."),
    false,
    `secret file was packaged: ${path}`,
  );
}

assert.deepEqual(
  JSON.parse(await readFile(artifactHostingPath, "utf8")),
  JSON.parse(await readFile(sourceHostingPath, "utf8")),
  "packaged Sites manifest differs from source",
);

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set(
  "sites-validation",
  `${process.pid}-${Date.now()}`,
);
const worker = await import(workerUrl.href);
assert.equal(typeof worker.default?.fetch, "function");
assert.equal(typeof worker.default?.queue, "function");
assert.equal(typeof worker.default?.scheduled, "function");

console.log(
  `Validated ${requestedEnvironment} Sites artifact: bindings, migrations, manifest, and Worker handlers are consistent.`,
);
