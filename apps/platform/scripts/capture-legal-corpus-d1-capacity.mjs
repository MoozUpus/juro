import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STAGING_ENVIRONMENT = "staging";
const STAGING_DATABASE = "juro-staging";
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const WRANGLER_ENTRYPOINT = resolve(SCRIPT_DIRECTORY, "../node_modules/wrangler/bin/wrangler.js");

function requiredArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new TypeError(`LEGAL_CORPUS_D1_CAPACITY_ARGUMENT_MISSING:${name}`);
  return value;
}

function optionalArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value || fallback;
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(`LEGAL_CORPUS_D1_CAPACITY_PROBE_FAILED:${code}:${stderr.slice(0, 500)}`));
    });
  });
}

async function main() {
  const outputPath = resolve(requiredArgument("--output"));
  const config = optionalArgument("--config", "wrangler.legal-corpus.jsonc");
  const database = optionalArgument("--database", STAGING_DATABASE);
  const environment = optionalArgument("--environment", STAGING_ENVIRONMENT);
  if (database !== STAGING_DATABASE || environment !== STAGING_ENVIRONMENT) {
    throw new TypeError("LEGAL_CORPUS_D1_CAPACITY_STAGING_ONLY");
  }

  const { stdout } = await run(process.execPath, [
    WRANGLER_ENTRYPOINT, "d1", "info", database,
    "--config", config,
    "--env", environment,
    "--json",
  ]);
  const result = JSON.parse(stdout);
  if (!result || typeof result !== "object"
    || typeof result.uuid !== "string"
    || result.name !== STAGING_DATABASE
    || !Number.isSafeInteger(result.database_size)
    || result.database_size < 0) {
    throw new TypeError("LEGAL_CORPUS_D1_CAPACITY_PROBE_INVALID");
  }

  const evidence = {
    schemaVersion: 1,
    environment: STAGING_ENVIRONMENT,
    databaseId: result.uuid,
    databaseName: result.name,
    observedAt: new Date().toISOString(),
    databaseSizeBytes: result.database_size,
    source: "wrangler_d1_info",
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    outputPath,
    databaseId: evidence.databaseId,
    databaseName: evidence.databaseName,
    databaseSizeBytes: evidence.databaseSizeBytes,
    observedAt: evidence.observedAt,
  })}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    code: "LEGAL_CORPUS_D1_CAPACITY_CAPTURE_FAILED",
    detail: error instanceof Error ? error.message : "unknown",
  })}\n`);
  process.exitCode = 2;
});
