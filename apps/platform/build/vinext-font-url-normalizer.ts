import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

const VINEXT_FONT_NAMESPACE = "_vinext_fonts";

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

export function normalizeVinextFontCacheUrls(
  code: string,
  cacheDirectory: string,
  assetsDirectory = "assets",
): string {
  const normalizedCacheDirectory = cacheDirectory
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  if (!normalizedCacheDirectory || !code.includes(normalizedCacheDirectory)) {
    return code;
  }

  const normalizedAssetsDirectory = trimSlashes(assetsDirectory) || "assets";
  return code
    .split(normalizedCacheDirectory)
    .join(`/${normalizedAssetsDirectory}/${VINEXT_FONT_NAMESPACE}`);
}

/**
 * vinext 0.0.50 normalizes cached font CSS to forward slashes, but compares it
 * with a Windows cache path that still contains backslashes. The comparison
 * therefore misses on Windows and leaks the build-machine path into rendered
 * HTML. Keep the app-level workaround narrow and remove it when vinext ships
 * the equivalent cross-platform normalization.
 */
export function normalizeVinextFontUrls(): Plugin {
  let cacheDirectory = "";
  let assetsDirectory = "assets";

  return {
    name: "juro:normalize-vinext-font-urls",
    enforce: "post",
    configResolved(config: ResolvedConfig) {
      cacheDirectory = resolve(config.root, ".vinext", "fonts");
      assetsDirectory = config.build.assetsDir || "assets";
    },
    transform(code) {
      const normalized = normalizeVinextFontCacheUrls(
        code,
        cacheDirectory,
        assetsDirectory,
      );
      return normalized === code ? null : { code: normalized, map: null };
    },
  };
}
