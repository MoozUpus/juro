import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ATTACHED_PLATFORM_QUEUE_BINDINGS,
  PLATFORM_QUEUE_BINDINGS,
} from "../worker/platform-jobs";
import {
  normalizeSitesPrimaryBindings,
  type CloudflareBindingConfig,
} from "../build/cloudflare-binding-normalizer";

type NamedBinding = {
  binding: string;
  [key: string]: unknown;
};

type EnvironmentConfig = {
  name: string;
  workers_dev?: boolean;
  preview_urls?: boolean;
  routes?: unknown[];
  assets: NamedBinding;
  vars: Record<string, string>;
  d1_databases: NamedBinding[];
  r2_buckets: NamedBinding[];
  queues: {
    producers: Array<NamedBinding & { queue: string }>;
    consumers: Array<{
      queue: string;
      max_batch_size: number;
      max_retries: number;
      dead_letter_queue: string;
    }>;
  };
  vectorize: NamedBinding[];
  analytics_engine_datasets: NamedBinding[];
  images: NamedBinding;
  observability?: unknown;
  triggers?: unknown;
};

type WranglerConfig = EnvironmentConfig & {
  compatibility_date: string;
  compatibility_flags: string[];
  env: Record<"staging" | "production", EnvironmentConfig>;
};

const source = JSON.parse(
  readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
) as WranglerConfig;

const environments = ["development", "staging", "production"] as const;

const queueContract = [
  ["DOCUMENT_ANALYSIS_QUEUE", "document-analysis"],
  ["OCR_PROCESSING_QUEUE", "ocr-processing"],
  ["DOCUMENT_EXPORT_QUEUE", "document-export"],
  ["EMAIL_NOTIFICATIONS_QUEUE", "email-notifications"],
  ["LEGAL_SOURCES_SYNC_QUEUE", "legal-sources-sync"],
  ["DATA_RETENTION_CLEANUP_QUEUE", "data-retention-cleanup"],
  ["NOTIFICATIONS_QUEUE", "notifications"],
] as const;

const vectorContract = [
  ["LEX_UZ_INDEX", "lex-uz"],
  ["ADVICE_UZ_INDEX", "advice-uz"],
  ["INTERNAL_LEGAL_MATERIALS_INDEX", "internal-legal-materials"],
  ["USER_DOCUMENTS_INDEX", "user-documents"],
] as const;

function selectedEnvironment(
  environment: (typeof environments)[number],
): EnvironmentConfig {
  return environment === "development" ? source : source.env[environment];
}

function assertUnique(values: string[], label: string): void {
  assert.equal(
    new Set(values).size,
    values.length,
    `${label} contains duplicate values`,
  );
}

test("declares isolated, disabled-by-default Cloudflare environments", () => {
  const resourceNames = new Map<string, Set<string>>();

  for (const environment of environments) {
    const config = selectedEnvironment(environment);
    assert.equal(config.name, `juro-platform-${environment}`);
    assert.equal(config.vars.APP_ENV, environment);
    assert.equal(config.vars.ASYNC_RUNTIME_ENABLED, "false");
    assert.equal(config.vars.CRON_ENABLED, "false");
    assert.equal(config.vars.LEGAL_ADVICE_INGESTION_ENABLED, "false");
    assert.equal(config.vars.LEGAL_SOURCE_STAFF_API_ENABLED, "false");
    assert.equal(config.vars.IDENTITY_PROTECTION_MODE, "legacy");
    assert.equal(config.vars.JOB_SCHEMA_VERSION, "1");
    assert.equal(Object.hasOwn(config, "triggers"), false);
    assert.deepEqual(config.assets, { binding: "ASSETS" });

    assert.deepEqual(
      config.d1_databases.map(({ binding }) => binding),
      ["DB"],
    );
    assert.equal(config.d1_databases[0]?.migrations_dir, "./drizzle");
    assert.deepEqual(
      config.r2_buckets,
      [
        {
          binding: "BUCKET",
          bucket_name: environment === "production"
            ? "juro-private-documents"
            : `juro-${environment}-files`,
        },
        {
          binding: "BACKUP_BUCKET",
          bucket_name: `juro-${environment}-backups`,
        },
        {
          binding: "QUARANTINE_BUCKET",
          bucket_name: `juro-${environment}-quarantine`,
        },
      ],
    );
    assert.deepEqual(
      config.queues.producers,
      queueContract.map(([binding, name]) => ({
        binding,
        queue: `${environment}-${name}`,
      })),
    );
    assert.deepEqual(
      config.queues.producers.map(({ binding }) => binding),
      [...ATTACHED_PLATFORM_QUEUE_BINDINGS],
    );
    assert.deepEqual(
      [...PLATFORM_QUEUE_BINDINGS].filter((binding) =>
        !ATTACHED_PLATFORM_QUEUE_BINDINGS.includes(
          binding as (typeof ATTACHED_PLATFORM_QUEUE_BINDINGS)[number],
        )
      ),
      ["MALWARE_SCAN_QUEUE"],
    );
    assert.deepEqual(config.queues.consumers, []);

    assert.deepEqual(
      config.vectorize,
      vectorContract.map(([binding, name]) => ({
        binding,
        index_name: `${environment}-${name}`,
      })),
    );
    assert.deepEqual(
      config.analytics_engine_datasets.map(({ binding }) => binding),
      ["PLATFORM_ANALYTICS"],
    );
    assert.deepEqual(config.images, { binding: "IMAGES" });

    const allBindings = [
      ...config.d1_databases,
      ...config.r2_buckets,
      ...config.queues.producers,
      ...config.vectorize,
      ...config.analytics_engine_datasets,
      config.images,
      config.assets,
    ].map(({ binding }) => binding);
    assertUnique(allBindings, `${environment} bindings`);

    resourceNames.set(environment, new Set([
      config.name,
      ...config.d1_databases.map((entry) => String(entry.database_name)),
      ...config.r2_buckets.map((entry) => String(entry.bucket_name)),
      ...config.queues.producers.map(({ queue }) => queue),
      ...config.queues.consumers.map(({ dead_letter_queue }) =>
        dead_letter_queue
      ),
      ...config.vectorize.map((entry) => String(entry.index_name)),
      ...config.analytics_engine_datasets.map((entry) =>
        String(entry.dataset)
      ),
    ]));
  }

  for (let left = 0; left < environments.length; left += 1) {
    for (let right = left + 1; right < environments.length; right += 1) {
      const leftName = environments[left];
      const rightName = environments[right];
      const overlap = [...(resourceNames.get(leftName) ?? [])].filter((name) =>
        resourceNames.get(rightName)?.has(name)
      );
      assert.deepEqual(
        overlap,
        [],
        `${leftName} and ${rightName} share resources`,
      );
    }
  }

  assert.equal(source.env.staging.workers_dev, false);
  assert.equal(source.env.staging.preview_urls, false);
  assert.deepEqual(source.env.staging.routes, []);
  assert.equal(
    Object.hasOwn(source.env.staging.vars, "ALLOW_PLATFORM_AUTH_HEADERS"),
    false,
  );
});

test("pins only verified non-production D1 identifiers and excludes secrets", () => {
  const serialized = JSON.stringify(source);
  assert.equal(
    source.d1_databases[0]?.database_id,
    "d07670cf-f7bf-460c-a668-101671d4c330",
  );
  assert.equal(
    source.env.staging.d1_databases[0]?.database_id,
    "bb716a96-b2fb-4823-90d6-6c228fed181a",
  );
  assert.equal(source.env.production.d1_databases[0]?.database_id, undefined);
  assert.doesNotMatch(
    serialized,
    /4cce509b-0e02-4ca9-a3ba-a5ce1327aeda/i,
    "the production D1 identifier remains outside source configuration",
  );
  assert.doesNotMatch(serialized, /"account_id"\s*:/i);
  assert.doesNotMatch(serialized, /"(?:api_key|secret|token)"\s*:/i);
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
      serialized.includes(`\"${secretBinding}\"`),
      false,
      `${secretBinding} must not be checked into Wrangler vars`,
    );
  }
});

test("does not attach legacy or premature queue contracts", () => {
  const serialized = JSON.stringify(source);
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
    assert.doesNotMatch(serialized, new RegExp(`"${legacyBinding}"`));
  }
  assert.doesNotMatch(
    serialized,
    /juro-(?:ai|file|document|legal|email|notification|cleanup|backup)-jobs-/,
  );
  assert.doesNotMatch(serialized, /"MALWARE_SCAN_QUEUE"/);
  assert.doesNotMatch(serialized, /-malware-scan"/);
  assert.doesNotMatch(serialized, /"consumers":\[(?!\])/);
});

test("normalizes Sites primary bindings without losing add-ons", () => {
  const config: CloudflareBindingConfig = {
    d1_databases: [
      { binding: "DB", database_name: "selected-db" },
      { binding: "REPORTING_DB", database_name: "reporting-db" },
    ],
    r2_buckets: [
      { binding: "BUCKET", bucket_name: "selected-bucket" },
      { binding: "BACKUP_BUCKET", bucket_name: "backup-bucket" },
    ],
    vars: {
      APP_ENV: "staging",
      LOCAL_OVERRIDE: "source",
    },
  };

  normalizeSitesPrimaryBindings(
    config,
    {
      d1Binding: "DB",
      r2Binding: "BUCKET",
      databaseId: "00000000-0000-4000-8000-000000000000",
      databaseName: "site-creator-d1",
      bucketName: "site-creator-r2",
    },
    {
      LOCAL_OVERRIDE: "local",
    },
  );

  assert.deepEqual(config.d1_databases, [
    {
      binding: "DB",
      database_name: "site-creator-d1",
      database_id: "00000000-0000-4000-8000-000000000000",
      migrations_dir: "./drizzle",
    },
    { binding: "REPORTING_DB", database_name: "reporting-db" },
  ]);
  assert.deepEqual(config.r2_buckets, [
    { binding: "BUCKET", bucket_name: "site-creator-r2" },
    { binding: "BACKUP_BUCKET", bucket_name: "backup-bucket" },
  ]);
  assert.deepEqual(config.vars, {
    APP_ENV: "staging",
    LOCAL_OVERRIDE: "local",
  });

  const once = structuredClone(config);
  normalizeSitesPrimaryBindings(
    config,
    {
      d1Binding: "DB",
      r2Binding: "BUCKET",
      databaseId: "00000000-0000-4000-8000-000000000000",
      databaseName: "site-creator-d1",
      bucketName: "site-creator-r2",
    },
    {
      LOCAL_OVERRIDE: "local",
    },
  );
  assert.deepEqual(config, once);
});

test("rejects duplicate primary binding declarations", () => {
  assert.throws(
    () =>
      normalizeSitesPrimaryBindings(
        {
          d1_databases: [
            { binding: "DB" },
            { binding: "DB" },
          ],
        },
        {
          d1Binding: "DB",
          databaseId: "placeholder",
          databaseName: "placeholder",
          bucketName: "placeholder",
        },
        {},
      ),
    /Duplicate Cloudflare binding "DB"/,
  );

  assert.throws(
    () =>
      normalizeSitesPrimaryBindings(
        {
          r2_buckets: [
            { binding: "BUCKET" },
            { binding: "BUCKET" },
          ],
        },
        {
          r2Binding: "BUCKET",
          databaseId: "placeholder",
          databaseName: "placeholder",
          bucketName: "placeholder",
        },
        {},
      ),
    /Duplicate Cloudflare binding "BUCKET"/,
  );
});

test("ignores every supported local secret-file convention", () => {
  const candidates = [
    ".env",
    ".env.local",
    ".dev.vars",
    ".dev.vars.staging",
  ];
  const ignored = execFileSync(
    "git",
    ["check-ignore", "--stdin", "--no-index"],
    {
      cwd: new URL("..", import.meta.url),
      input: `${candidates.join("\n")}\n`,
      encoding: "utf8",
    },
  ).trim().split("\n");
  assert.deepEqual(ignored, candidates);

  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  }).split("\0").filter(Boolean);
  assert.deepEqual(
    tracked.filter((path) =>
      /(^|\/)(?:\.env(?:\.|$)|\.dev\.vars(?:\.|$))/.test(path)
    ),
    [],
  );
});
