import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
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
const serverRoot = resolve(projectRoot, "dist/server");

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
  ["staging", "production"].includes(requestedEnvironment) ? "true" : "false",
);
assert.equal(
  artifact.vars?.CRON_ENABLED,
  ["staging", "production"].includes(requestedEnvironment) ? "true" : "false",
);
assert.equal(
  artifact.vars?.ACCOUNT_DELETION_PURGE_ENABLED,
  ["staging", "production"].includes(requestedEnvironment) ? "true" : "false",
);
assert.equal(
  artifact.vars?.LEGAL_ADVICE_INGESTION_ENABLED,
  "false",
);
assert.equal(
  artifact.vars?.LEGAL_SOURCE_STAFF_API_ENABLED,
  "false",
);
assert.equal(
  artifact.vars?.LEGAL_DIRECT_RETRIEVAL_ENABLED,
  "true",
);
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
  "CLOUDFLARE_TURN_KEY_API_TOKEN",
  "CLOUDFLARE_TURN_KEY_ID",
  "RESEND_API_KEY",
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "OTP_HASH_SECRET",
  "CRON_SECRET",
  "TURNSTILE_SECRET_KEY",
  "TOTP_ENCRYPTION_KEY",
  "SIGNED_URL_SECRET",
  "IDENTITY_KEYRING",
  "AI_PROVIDER_API_KEY",
  "LEGISLATION_FEED_API_KEY",
  "PAYMENT_API_KEY",
  "PAYMENT_WEBHOOK_SECRET",
  "PAYMENT_SANDBOX_WEBHOOK_SECRET",
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

const isProductionEnvironment = requestedEnvironment === "production";
const replacesSitesPrimaryBindings = false; // JURO production must retain wrangler.jsonc bindings.
assert.deepEqual(selected.r2_buckets, [
  {
    binding: "BUCKET",
    bucket_name: isProductionEnvironment
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
const expectedD1Database = replacesSitesPrimaryBindings
  ? {
      binding: "DB",
      database_name: "site-creator-d1",
      database_id: "00000000-0000-4000-8000-000000000000",
      migrations_dir: "./drizzle",
    }
  : selected.d1_databases[0];
const {
  migrations_dir: artifactMigrationsDirectory,
  migrations_pattern: artifactMigrationsPattern,
  ...artifactD1Database
} = artifact.d1_databases[0];
const {
  migrations_dir: expectedMigrationsDirectory,
  migrations_pattern: expectedMigrationsPattern,
  ...expectedD1DatabaseBinding
} = expectedD1Database;
assert.deepEqual(
  artifactD1Database,
  expectedD1DatabaseBinding,
);
assert.equal(
  resolve(dirname(artifactConfigPath), artifactMigrationsDirectory),
  resolve(dirname(sourceConfigPath), expectedMigrationsDirectory),
  "artifact D1 migrations_dir must resolve to the configured migration directory",
);
assert.equal(
  artifactMigrationsPattern
    ? resolve(dirname(artifactConfigPath), artifactMigrationsPattern)
    : artifactMigrationsPattern,
  expectedMigrationsPattern
    ? resolve(dirname(sourceConfigPath), expectedMigrationsPattern)
    : expectedMigrationsPattern,
  "artifact D1 migrations_pattern must resolve to the configured migration pattern",
);

assert.equal(artifact.r2_buckets?.length, 3);
assert.deepEqual(
  artifact.r2_buckets,
  replacesSitesPrimaryBindings
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
if (["staging", "production"].includes(requestedEnvironment)) {
  assert.equal(artifact.vars?.MALWARE_SCAN_ENABLED, "true");
  assert.equal(
    artifact.vars?.MALWARE_SCANNER_PROBE_ENABLED,
    "false",
  );
  assert.equal(
    artifact.vars?.STAGING_DOCUMENT_ANALYSIS_PROBE_ENABLED,
    requestedEnvironment === "production"
      ? "false"
      : (artifact.vars?.STAGING_DOCUMENT_ANALYSIS_PROBE_ENABLED === "true" ? "true" : "false"),
  );
  assert.equal(
    artifact.vars?.PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED,
    requestedEnvironment === "production" ? "true" : undefined,
  );
  assert.equal(
    artifact.vars?.PRODUCTION_SYNTHETIC_PROBES_ENABLED,
    requestedEnvironment === "production" ? "true" : "false",
  );
  assert.deepEqual(artifact.migrations, selected.migrations);
  assert.deepEqual(artifact.durable_objects, selected.durable_objects);
  assert.deepEqual(artifact.containers, selected.containers);
  assert.deepEqual(artifact.services, selected.services);
}

const sourceQueueContract = [
  ["DOCUMENT_ANALYSIS_QUEUE", "document-analysis"],
  ["OCR_PROCESSING_QUEUE", "ocr-processing"],
  ["DOCUMENT_EXPORT_QUEUE", "document-export"],
  ["EMAIL_NOTIFICATIONS_QUEUE", "email-notifications"],
  ["LEGAL_SOURCES_SYNC_QUEUE", "legal-sources-sync"],
  ["DATA_RETENTION_CLEANUP_QUEUE", "data-retention-cleanup"],
  ["NOTIFICATIONS_QUEUE", "notifications"],
];
const documentDlqContract = [
  ["DOCUMENT_ANALYSIS_DLQ", "document-analysis-dlq"],
  ["OCR_PROCESSING_DLQ", "ocr-processing-dlq"],
];
const isolatedDlqContract = [
  ...documentDlqContract,
  ["DOCUMENT_EXPORT_DLQ", "document-export-dlq"],
  ["MALWARE_SCAN_DLQ", "malware-scan-dlq"],
];
const stagingQueueHealthProbeContract = [
  ["STAGING_QUEUE_HEALTH_PROBE_QUEUE", "queue-health"],
];
const productionQueueHealthProbeContract = [
  ["PRODUCTION_QUEUE_HEALTH_PROBE_QUEUE", "queue-health"],
];
const hasAsyncConsumers = ["staging", "production"].includes(requestedEnvironment);
const queueContract = hasAsyncConsumers
  ? [
    sourceQueueContract[0],
    isolatedDlqContract[0],
    sourceQueueContract[1],
    isolatedDlqContract[1],
    sourceQueueContract[2],
    isolatedDlqContract[2],
    ...sourceQueueContract.slice(3),
    ["MALWARE_SCAN_QUEUE", "malware-scan"],
    isolatedDlqContract[3],
    ...(requestedEnvironment === "staging" ? stagingQueueHealthProbeContract : []),
    ...(requestedEnvironment === "production" ? productionQueueHealthProbeContract : []),
  ]
  : [
    sourceQueueContract[0],
    documentDlqContract[0],
    sourceQueueContract[1],
    documentDlqContract[1],
    ...sourceQueueContract.slice(2),
  ];
assert.deepEqual(
  artifact.queues?.producers,
  queueContract.map(([binding, suffix]) => ({
    binding,
    queue: `${requestedEnvironment}-${suffix}`,
  })),
);
const sourceConsumerContract = [
  ["document-analysis", 1, 3, 1],
  ["ocr-processing", 1, 3, 1],
  ["document-export", 1, 3, 1],
  ["legal-sources-sync", 5, 5, 1],
  ["email-notifications", 5, 5, 2],
  ["data-retention-cleanup", 5, 5, 1],
  ["notifications", 5, 5, 2],
  ["malware-scan", 1, 3, 1],
];
assert.deepEqual(
  artifact.queues?.consumers,
  hasAsyncConsumers
    ? (() => {
      const sourceConsumers = sourceConsumerContract.map(([suffix, batchSize, retries, concurrency]) => ({
        queue: `${requestedEnvironment}-${suffix}`,
        max_batch_size: batchSize,
        max_batch_timeout: 5,
        max_retries: retries,
        dead_letter_queue: `${requestedEnvironment}-${suffix}-dlq`,
        max_concurrency: concurrency,
        retry_delay: 30,
      }));
      const dlqConsumer = (suffix) => ({
        // Terminalizable document work records retry exhaustion durably after
        // its source queue exhausts retries. These consumers have no recursive
        // DLQ; their D1 bookkeeping retries are bounded here and a scheduled
        // reconciler fences any residual busy delivery.
        queue: `${requestedEnvironment}-${suffix}-dlq`,
        max_batch_size: 1,
        max_batch_timeout: 5,
        max_retries: 10,
        max_concurrency: 1,
        retry_delay: 60,
      });
      return [
        sourceConsumers[0],
        dlqConsumer("document-analysis"),
        sourceConsumers[1],
        dlqConsumer("ocr-processing"),
        sourceConsumers[2],
        dlqConsumer("document-export"),
        ...sourceConsumers.slice(3, -1),
        sourceConsumers.at(-1),
        dlqConsumer("malware-scan"),
        ...(requestedEnvironment === "staging" ? [{
          queue: `${requestedEnvironment}-queue-health`,
          max_batch_size: 1,
          max_batch_timeout: 5,
          max_retries: 3,
          max_concurrency: 1,
          retry_delay: 30,
        }, {
          queue: `${requestedEnvironment}-legal-evaluation`,
          max_batch_size: 1,
          max_batch_timeout: 1,
          max_retries: 0,
          max_concurrency: 4,
        }] : []),
        ...(requestedEnvironment === "production" ? [{
          // No recursive DLQ: after bounded consumer retries the durable D1
          // claim becomes a truthful degraded signal on the next cron.
          queue: `${requestedEnvironment}-queue-health`,
          max_batch_size: 1,
          max_batch_timeout: 5,
          max_retries: 3,
          max_concurrency: 1,
          retry_delay: 30,
        }] : []),
      ];
    })()
    : [],
  "Only isolated staging or production consumers may be attached",
);
assert.equal(
  artifact.queues?.producers.some(({ binding }) =>
    binding === "MALWARE_SCAN_QUEUE"
  ),
  hasAsyncConsumers,
  "Only isolated staging or production may attach the fail-closed malware scanner queue",
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
  hasAsyncConsumers
    ? { crons: ["*/5 * * * *", "0 19 * * *"] }
    : {},
  "Only isolated staging or production scheduler crons may be attached",
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

if (requestedEnvironment === "production") {
  assert.equal(selected.name, "juro", "production must update the isolated production platform Worker");
  assert.equal(selected.workers_dev, false, "production must not expose a workers.dev endpoint");
  assert.equal(selected.preview_urls, false, "production must not expose version preview URLs");
  assert.deepEqual(selected.routes, [
    {
      pattern: "app.juro.uz",
      zone_name: "juro.uz",
      custom_domain: true,
    },
    {
      pattern: "lawyer.juro.uz",
      zone_name: "juro.uz",
      custom_domain: true,
    },
    {
      pattern: "admin.juro.uz",
      zone_name: "juro.uz",
      custom_domain: true,
    },
    {
      pattern: "status.juro.uz",
      zone_name: "juro.uz",
      custom_domain: true,
    },
  ], "production must keep app.juro.uz, lawyer.juro.uz, admin.juro.uz, and status.juro.uz attached directly to Worker juro");
  assert.equal(artifact.workers_dev, false, "production artifact must disable workers.dev exposure");
  assert.equal(artifact.preview_urls, false, "production artifact must disable version preview URLs");
  assert.deepEqual(
    artifact.routes,
    selected.routes,
    "production artifact must retain the public JURO custom-domain routes",
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

  if (/\.(?:css|html|js)$/i.test(path)) {
    const source = await readFile(resolve(projectRoot, "dist", path), "utf8");
    assert.doesNotMatch(
      source,
      /(?:[A-Za-z]:[\\/]|\/(?:Users|home|workspace)\/)[^\n"'`)]*?\.vinext[\\/]fonts[\\/]/iu,
      `build-machine vinext font cache path was packaged: ${path}`,
    );
  }
}

const productionProbeChunks = [];
for (const path of await filesBelow(serverRoot)) {
  if (!path.endsWith(".js")) continue;
  const source = await readFile(resolve(serverRoot, path), "utf8");
  if (source.includes("production_dependency_probe.builder_failed")) {
    productionProbeChunks.push({ path, source });
  }
}
assert.equal(
  productionProbeChunks.length,
  1,
  "artifact must contain exactly one production dependency probe chunk",
);
assert.doesNotMatch(
  productionProbeChunks[0].source,
  /import\(["']\.\.\/index\.js["']\)/u,
  "Builder probe modules must be statically linked; the Worker entry does not export their runtime functions",
);

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
