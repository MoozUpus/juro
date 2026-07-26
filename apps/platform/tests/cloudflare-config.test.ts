import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
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
      config.r2_buckets.map(({ binding }) => binding),
      ["BUCKET", "BACKUP_BUCKET", "QUARANTINE_BUCKET"],
    );
    assert.deepEqual(
      config.queues.producers.map(({ binding }) => binding),
      [...PLATFORM_QUEUE_BINDINGS],
    );
    assert.equal(config.queues.producers.length, 8);
    assert.equal(config.queues.consumers.length, 8);
    assert.deepEqual(
      new Set(config.queues.consumers.map(({ queue }) => queue)),
      new Set(config.queues.producers.map(({ queue }) => queue)),
    );
    assertUnique(
      config.queues.consumers.map(({ dead_letter_queue }) =>
        dead_letter_queue
      ),
      `${environment} DLQs`,
    );
    for (const consumer of config.queues.consumers) {
      assert.ok(consumer.max_retries > 0);
      assert.ok(consumer.dead_letter_queue);
      if (
        /-(?:ai|file|document)-jobs-/.test(consumer.queue) ||
        /-legal-sync-/.test(consumer.queue)
      ) {
        assert.equal(consumer.max_batch_size, 1);
      }
    }

    assert.deepEqual(
      config.vectorize.map(({ binding }) => binding),
      [
        "LEGAL_RU_INDEX",
        "LEGAL_UZ_INDEX",
        "INTERNAL_LEGAL_INDEX",
        "USER_MEMORY_INDEX",
      ],
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
});

test("keeps resource identifiers and secrets out of source configuration", () => {
  const serialized = JSON.stringify(source);
  assert.doesNotMatch(serialized, /"database_id"\s*:/i);
  assert.doesNotMatch(serialized, /"account_id"\s*:/i);
  assert.doesNotMatch(serialized, /"(?:api_key|secret|token)"\s*:/i);
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
