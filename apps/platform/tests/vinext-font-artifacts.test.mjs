import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { pruneUnusedVinextFontArtifacts } from "../scripts/prune-unused-vinext-font-artifacts.mjs";

test("artifact pruning removes cached Vinext families unused by the current build", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "juro-vinext-fonts-"));
  const artifactRoot = join(fixtureRoot, "dist");
  const fontRoot = join(artifactRoot, "client", "assets", "_vinext_fonts");
  const activeFamily = "manrope-76eca2803f7f";
  const staleFamily = "geist-8ac0455e797f";
  const activePath = join(fontRoot, activeFamily);
  const stalePath = join(fontRoot, staleFamily);
  const templatePath = join(artifactRoot, "client", "document-templates", "DejaVuSans-JURO.ttf");
  try {
    await Promise.all([
      mkdir(activePath, { recursive: true }),
      mkdir(stalePath, { recursive: true }),
      mkdir(join(artifactRoot, "server"), { recursive: true }),
      mkdir(join(artifactRoot, "client", "document-templates"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(activePath, "manrope.woff2"), "active"),
      writeFile(join(stalePath, "geist.woff2"), "stale"),
      writeFile(templatePath, "template"),
      writeFile(
        join(artifactRoot, "server", "index.js"),
        `const css = "/assets/_vinext_fonts/${activeFamily}/manrope.woff2";`,
      ),
    ]);

    const result = await pruneUnusedVinextFontArtifacts({ artifactRoot });

    assert.deepEqual(result.removedFamilies, [staleFamily]);
    assert.deepEqual(result.retainedFamilies, [activeFamily]);
    await access(activePath);
    await access(templatePath);
    await assert.rejects(access(stalePath), (error) => error?.code === "ENOENT");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("artifact pruning is a no-op when no Vinext font output exists", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "juro-vinext-fonts-empty-"));
  try {
    assert.deepEqual(
      await pruneUnusedVinextFontArtifacts({ artifactRoot: join(fixtureRoot, "dist") }),
      { removedFamilies: [], retainedFamilies: [] },
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
