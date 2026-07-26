import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
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
  Object.hasOwn(artifact.vars ?? {}, "ALLOW_PLATFORM_AUTH_HEADERS"),
  false,
  "development authentication bypass must never be packaged",
);
assert.equal(artifact.compatibility_date, source.compatibility_date);
assert.deepEqual(artifact.compatibility_flags, source.compatibility_flags);
assert.equal(artifact.assets?.binding, "ASSETS");
assert.equal(artifact.assets?.directory, "../client");

const usesProductionSitesBindings = requestedEnvironment === "production";
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
assert.ok(
  triggers === undefined ||
    (
      triggers &&
      typeof triggers === "object" &&
      Object.keys(triggers).length === 0
    ),
  "Cron triggers must remain absent until control-plane inventory is verified",
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
