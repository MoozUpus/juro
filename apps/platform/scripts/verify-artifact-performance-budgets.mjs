import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultArtifactRoot = resolve(projectRoot, "dist");
const defaultBudgetPath = resolve(projectRoot, "performance-budgets.json");

const fontExtensions = new Set([".otf", ".ttf", ".woff", ".woff2"]);
const imageExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);

function displayBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function resolveInside(root, path) {
  const resolved = resolve(root, path);
  const pathFromRoot = relative(root, resolved);
  assert.ok(
    pathFromRoot !== "" && !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot),
    `Artifact path must stay inside its root: ${path}`,
  );
  return resolved;
}

async function filesBelow(directory) {
  const files = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const entryPath = resolve(path, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  await visit(directory);
  return files;
}

async function totalFileBytes(files) {
  let rawBytes = 0;
  for (const file of files) {
    rawBytes += (await stat(file)).size;
  }
  return rawBytes;
}

function manifestClosure(manifest, entry, seen = new Set()) {
  if (seen.has(entry)) {
    return seen;
  }
  const node = manifest[entry];
  assert.ok(node, `Manifest import is missing: ${entry}`);
  seen.add(entry);
  for (const importedEntry of node.imports ?? []) {
    manifestClosure(manifest, importedEntry, seen);
  }
  return seen;
}

async function manifestBytes(manifest, clientRoot, entries) {
  const files = [];
  for (const entry of entries) {
    const file = manifest[entry]?.file;
    assert.ok(file, `Manifest entry has no emitted file: ${entry}`);
    files.push(resolveInside(clientRoot, file));
  }
  return {
    fileCount: files.length,
    rawBytes: await totalFileBytes(files),
  };
}

function findBrowserEntry(manifest) {
  const entries = Object.entries(manifest)
    .filter(([, node]) => node?.isEntry)
    .map(([entry]) => entry);
  assert.equal(
    entries.length,
    1,
    `Expected one browser entry in the Vite manifest, found ${entries.length}`,
  );
  return entries[0];
}

async function collectFilesByExtension(clientRoot, extensions) {
  const files = await filesBelow(clientRoot);
  return files.filter((file) => extensions.has(extname(file).toLowerCase()));
}

/**
 * Read emitted artifact sizes only. These are regression guardrails, not a
 * substitute for a browser network trace or Core Web Vitals measurement.
 */
export async function collectArtifactPerformanceMetrics({
  artifactRoot = defaultArtifactRoot,
} = {}) {
  const clientRoot = resolveInside(artifactRoot, "client");
  const manifestPath = resolveInside(clientRoot, ".vite/manifest.json");
  const workerEntryPath = resolveInside(artifactRoot, "server/index.js");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const browserEntry = findBrowserEntry(manifest);
  const initialEntries = manifestClosure(manifest, browserEntry);
  const dynamicEntries = manifest[browserEntry]?.dynamicImports ?? [];

  const routeCandidates = [];
  for (const entry of dynamicEntries) {
    const routeEntries = manifestClosure(manifest, entry);
    const incrementalEntries = new Set(
      [...routeEntries].filter((routeEntry) => !initialEntries.has(routeEntry)),
    );
    const metric = await manifestBytes(manifest, clientRoot, incrementalEntries);
    routeCandidates.push({ entry, ...metric });
  }
  routeCandidates.sort((left, right) => right.rawBytes - left.rawBytes);
  const largestRoute = routeCandidates[0] ?? {
    entry: null,
    fileCount: 0,
    rawBytes: 0,
  };

  const cssFiles = await collectFilesByExtension(clientRoot, new Set([".css"]));
  const fontFiles = await collectFilesByExtension(clientRoot, fontExtensions);
  const imageFiles = await collectFilesByExtension(clientRoot, imageExtensions);
  const workerEntry = await stat(workerEntryPath);

  return {
    measurement: "emitted_raw_bytes",
    browserEntry,
    clientCss: {
      fileCount: cssFiles.length,
      rawBytes: await totalFileBytes(cssFiles),
    },
    initialJs: await manifestBytes(manifest, clientRoot, initialEntries),
    largestRouteJsIncrement: largestRoute,
    clientFonts: {
      fileCount: fontFiles.length,
      rawBytes: await totalFileBytes(fontFiles),
    },
    clientImages: {
      fileCount: imageFiles.length,
      rawBytes: await totalFileBytes(imageFiles),
    },
    workerEntry: {
      fileCount: 1,
      rawBytes: workerEntry.size,
    },
  };
}

export function verifyArtifactPerformanceBudgets(metrics, budgets) {
  const checks = [
    ["clientCss", "client CSS"],
    ["initialJs", "initial browser JS"],
    ["largestRouteJsIncrement", "largest lazy route JS increment"],
    ["clientFonts", "client fonts"],
    ["clientImages", "client images"],
    ["workerEntry", "Worker entry"],
  ].map(([key, label]) => {
    const limit = budgets.limits?.[key];
    assert.equal(typeof limit, "number", `Missing numeric budget limit: ${key}`);
    assert.ok(limit >= 0, `Budget limit must be non-negative: ${key}`);
    const baseline = budgets.baseline?.[key];
    assert.equal(typeof baseline, "number", `Missing numeric baseline: ${key}`);
    assert.ok(baseline >= 0, `Budget baseline must be non-negative: ${key}`);
    return {
      key,
      label,
      baselineBytes: baseline,
      limitBytes: limit,
      ...metrics[key],
      passed: metrics[key].rawBytes <= limit,
    };
  });

  return {
    checks,
    passed: checks.every((check) => check.passed),
  };
}

export function formatArtifactPerformanceBudgetReport(metrics, verification) {
  const lines = [
    "Artifact performance budgets (emitted raw bytes; not Core Web Vitals):",
  ];
  for (const check of verification.checks) {
    const files = check.fileCount === 1 ? "1 file" : `${check.fileCount} files`;
    const largestRoute = check.key === "largestRouteJsIncrement" && check.entry
      ? `; ${check.entry}`
      : "";
    lines.push(
      `${check.passed ? "PASS" : "FAIL"} ${check.label}: ${displayBytes(check.rawBytes)} ` +
      `(baseline ${displayBytes(check.baselineBytes)}, limit ${displayBytes(check.limitBytes)}; ${files}${largestRoute})`,
    );
  }
  lines.push(
    "This verifies emitted artifact regression limits only; it does not measure HTTP transfer, request waterfalls, LCP, INP, CLS, or user-perceived latency.",
  );
  return lines.join("\n");
}

export async function runArtifactPerformanceBudgetCheck({
  artifactRoot = defaultArtifactRoot,
  budgetPath = defaultBudgetPath,
} = {}) {
  const [metrics, budgets] = await Promise.all([
    collectArtifactPerformanceMetrics({ artifactRoot }),
    readFile(budgetPath, "utf8").then((contents) => JSON.parse(contents)),
  ]);
  const verification = verifyArtifactPerformanceBudgets(metrics, budgets);
  return { metrics, verification };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--json")) {
    throw new Error("Usage: node scripts/verify-artifact-performance-budgets.mjs [--json]");
  }
  const { metrics, verification } = await runArtifactPerformanceBudgetCheck();
  if (args[0] === "--json") {
    console.log(JSON.stringify({ metrics, ...verification }, null, 2));
  } else {
    console.log(formatArtifactPerformanceBudgetReport(metrics, verification));
  }
  if (!verification.passed) {
    throw new Error("Artifact performance budget exceeded.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
