import { access, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const GENERATED_FAMILY_DIRECTORY = /^[a-z0-9][a-z0-9-]*-[a-f0-9]{8,}$/iu;
const REFERENCE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".rsc",
  ".txt",
]);
const MAX_REFERENCE_FILE_BYTES = 32 * 1024 * 1024;

function isDescendant(parent, candidate) {
  const path = relative(parent, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`);
}

async function entriesOrEmpty(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return [];
    throw error;
  }
}

async function generatedFontRoots(clientRoot) {
  const roots = [];
  const stack = [clientRoot];
  while (stack.length > 0) {
    const directory = stack.pop();
    if (!directory) continue;
    for (const entry of await entriesOrEmpty(directory)) {
      if (!entry.isDirectory()) continue;
      const path = resolve(directory, entry.name);
      if (entry.name === "_vinext_fonts") {
        roots.push(path);
      } else {
        stack.push(path);
      }
    }
  }
  return roots;
}

async function referenceCorpus(artifactRoot, excludedRoots) {
  const chunks = [];
  let scannedFiles = 0;
  const stack = [artifactRoot];
  while (stack.length > 0) {
    const directory = stack.pop();
    if (!directory) continue;
    for (const entry of await entriesOrEmpty(directory)) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!excludedRoots.has(path)) stack.push(path);
        continue;
      }
      if (!entry.isFile() || !REFERENCE_EXTENSIONS.has(extname(entry.name).toLocaleLowerCase())) continue;
      const metadata = await stat(path);
      if (metadata.size > MAX_REFERENCE_FILE_BYTES) continue;
      chunks.push(await readFile(path, "utf8"));
      scannedFiles += 1;
    }
  }
  return { text: chunks.join("\n"), scannedFiles };
}

/**
 * Vinext's Windows font loader can leave absolute build-machine paths in the
 * server-side CSS it inlines into HTML. Rewrite only references rooted in this
 * build's own font cache, and fail closed if any other cache path survives.
 */
export async function normalizeVinextFontArtifactReferences({
  artifactRoot,
  fontCacheRoot,
}) {
  const resolvedArtifactRoot = resolve(artifactRoot);
  const resolvedFontCacheRoot = resolve(fontCacheRoot);
  const normalizedFontCacheRoot = resolvedFontCacheRoot.split(sep).join("/");
  const fontCacheUrl = pathToFileURL(resolvedFontCacheRoot).href.replace(/\/$/u, "");
  const publicFontRoot = "/assets/_vinext_fonts/";
  const rewrittenFiles = [];
  const referencedAssets = new Set();
  const stack = [resolvedArtifactRoot];

  while (stack.length > 0) {
    const directory = stack.pop();
    if (!directory) continue;
    for (const entry of await entriesOrEmpty(directory)) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
        continue;
      }
      if (!entry.isFile() || !REFERENCE_EXTENSIONS.has(extname(entry.name).toLocaleLowerCase())) continue;
      const metadata = await stat(path);
      if (metadata.size > MAX_REFERENCE_FILE_BYTES) continue;

      const original = await readFile(path, "utf8");
      let normalized = original
        .split(`${fontCacheUrl}/`).join(publicFontRoot)
        .split(`${normalizedFontCacheRoot}/`).join(publicFontRoot);
      if (normalized.includes(".vinext/fonts/")) {
        throw new Error(
          `Refusing artifact with an unresolved Vinext font-cache path: ${relative(resolvedArtifactRoot, path)}`,
        );
      }
      for (const match of normalized.matchAll(/\/assets\/_vinext_fonts\/([a-z0-9][a-z0-9-]*-[a-f0-9]{8,})\/([a-z0-9][a-z0-9-]*\.woff2)/giu)) {
        referencedAssets.add(`${match[1]}/${match[2]}`);
      }
      if (normalized !== original) {
        await writeFile(path, normalized, "utf8");
        rewrittenFiles.push(relative(resolvedArtifactRoot, path).split(sep).join("/"));
      }
    }
  }

  for (const asset of referencedAssets) {
    await access(resolve(resolvedArtifactRoot, "client", "assets", "_vinext_fonts", asset));
  }

  return {
    rewrittenFiles,
    referencedAssets: [...referencedAssets].sort(),
  };
}

/**
 * Vinext caches every downloaded Google font under `.vinext/fonts` and copies
 * that entire cache into every client build. Remove only generated family
 * directories that the current artifact does not reference; keep the cache so
 * subsequent offline builds can still reuse it.
 */
export async function pruneUnusedVinextFontArtifacts({ artifactRoot }) {
  const resolvedArtifactRoot = resolve(artifactRoot);
  const clientRoot = resolve(resolvedArtifactRoot, "client");
  const fontRoots = await generatedFontRoots(clientRoot);
  if (fontRoots.length === 0) return { removedFamilies: [], retainedFamilies: [] };
  if (fontRoots.some((root) => !isDescendant(resolvedArtifactRoot, root))) {
    throw new Error("Refusing to prune a generated font directory outside the build artifact");
  }

  const candidates = [];
  for (const root of fontRoots) {
    for (const entry of await entriesOrEmpty(root)) {
      if (entry.isDirectory() && GENERATED_FAMILY_DIRECTORY.test(entry.name)) {
        candidates.push({ family: entry.name, path: resolve(root, entry.name), root });
      }
    }
  }
  if (candidates.length === 0) return { removedFamilies: [], retainedFamilies: [] };

  const references = await referenceCorpus(resolvedArtifactRoot, new Set(fontRoots));
  // Fail closed if an incomplete/corrupt artifact has no readable metadata.
  // A valid Vinext build always contains JS or manifests that name active font
  // families; pruning nothing is safer than guessing in this exceptional case.
  if (references.scannedFiles === 0) {
    return { removedFamilies: [], retainedFamilies: candidates.map(({ family }) => family) };
  }

  const removedFamilies = [];
  const retainedFamilies = [];
  for (const candidate of candidates) {
    if (references.text.includes(candidate.family)) {
      retainedFamilies.push(candidate.family);
      continue;
    }
    if (!isDescendant(candidate.root, candidate.path)) {
      throw new Error(`Refusing to prune unexpected font artifact path: ${candidate.path}`);
    }
    await rm(candidate.path, { recursive: true, force: true });
    removedFamilies.push(candidate.family);
  }
  return { removedFamilies, retainedFamilies };
}
