import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import {
  collectArtifactPerformanceMetrics,
  verifyArtifactPerformanceBudgets,
} from "../scripts/verify-artifact-performance-budgets.mjs";

async function writeFixtureFile(root, relativePath, contents) {
  const path = join(root, relativePath);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
}

test("measures the static boot graph separately from a lazy route increment", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "juro-artifact-budget-"));
  try {
    const artifactRoot = join(fixtureRoot, "dist");
    await writeFixtureFile(
      artifactRoot,
      "client/.vite/manifest.json",
      JSON.stringify({
        "virtual:vinext-app-browser-entry": {
          file: "assets/entry.js",
          isEntry: true,
          imports: ["_shared.js"],
          dynamicImports: ["app/example-route.tsx"],
        },
        "_shared.js": { file: "assets/shared.js" },
        "app/example-route.tsx": {
          file: "assets/route.js",
          imports: ["_shared.js"],
        },
      }),
    );
    await writeFixtureFile(artifactRoot, "client/assets/entry.js", "entry");
    await writeFixtureFile(artifactRoot, "client/assets/shared.js", "shared");
    await writeFixtureFile(artifactRoot, "client/assets/route.js", "route-file");
    await writeFixtureFile(artifactRoot, "client/assets/index.css", "stylesheet");
    await writeFixtureFile(artifactRoot, "client/assets/font.woff2", "font");
    await writeFixtureFile(artifactRoot, "client/brand.webp", "image");
    await writeFixtureFile(artifactRoot, "server/index.js", "worker-entry");

    const metrics = await collectArtifactPerformanceMetrics({ artifactRoot });
    assert.equal(metrics.clientCss.rawBytes, 10);
    assert.equal(metrics.initialJs.rawBytes, 11);
    assert.equal(metrics.largestRouteJsIncrement.rawBytes, 10);
    assert.equal(metrics.largestRouteJsIncrement.entry, "app/example-route.tsx");
    assert.equal(metrics.clientFonts.rawBytes, 4);
    assert.equal(metrics.clientImages.rawBytes, 5);
    assert.equal(metrics.workerEntry.rawBytes, 12);

    const pass = verifyArtifactPerformanceBudgets(metrics, {
      baseline: {
        clientCss: 10,
        initialJs: 11,
        largestRouteJsIncrement: 10,
        clientFonts: 4,
        clientImages: 5,
        workerEntry: 12,
      },
      limits: {
        clientCss: 10,
        initialJs: 11,
        largestRouteJsIncrement: 10,
        clientFonts: 4,
        clientImages: 5,
        workerEntry: 12,
      },
    });
    assert.equal(pass.passed, true);

    const failure = verifyArtifactPerformanceBudgets(metrics, {
      baseline: {
        clientCss: 10,
        initialJs: 11,
        largestRouteJsIncrement: 10,
        clientFonts: 4,
        clientImages: 5,
        workerEntry: 12,
      },
      limits: {
        clientCss: 9,
        initialJs: 11,
        largestRouteJsIncrement: 10,
        clientFonts: 4,
        clientImages: 5,
        workerEntry: 12,
      },
    });
    assert.equal(failure.passed, false);
    assert.equal(failure.checks.find(({ key }) => key === "clientCss")?.passed, false);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
