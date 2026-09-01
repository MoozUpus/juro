import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  normalizeVinextFontArtifactReferences,
  pruneUnusedVinextFontArtifacts,
} from "../scripts/prune-unused-vinext-font-artifacts.mjs";

test("artifact normalization removes build-machine font paths and preserves public assets", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "juro-vinext-font-normalize-"));
  const artifactRoot = join(fixtureRoot, "dist");
  const fontCacheRoot = join(fixtureRoot, "project", ".vinext", "fonts");
  const family = "manrope-76eca2803f7f";
  const fontFile = "manrope-37facb2a.woff2";
  const publicFont = join(artifactRoot, "client", "assets", "_vinext_fonts", family, fontFile);
  const serverEntry = join(artifactRoot, "server", "index.js");
  try {
    await Promise.all([
      mkdir(join(fontCacheRoot, family), { recursive: true }),
      mkdir(join(artifactRoot, "server"), { recursive: true }),
      mkdir(join(artifactRoot, "client", "assets", "_vinext_fonts", family), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(fontCacheRoot, family, fontFile), "font"),
      writeFile(publicFont, "font"),
      writeFile(
        serverEntry,
        `const css = "src:url(${fontCacheRoot.split("\\").join("/")}/${family}/${fontFile})";`,
      ),
    ]);

    const result = await normalizeVinextFontArtifactReferences({ artifactRoot, fontCacheRoot });

    assert.deepEqual(result.rewrittenFiles, ["server/index.js"]);
    assert.deepEqual(result.referencedAssets, [`${family}/${fontFile}`]);
    assert.equal(
      await readFile(serverEntry, "utf8"),
      `const css = "src:url(/assets/_vinext_fonts/${family}/${fontFile})";`,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

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
