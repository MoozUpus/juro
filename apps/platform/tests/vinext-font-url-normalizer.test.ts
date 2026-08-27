import assert from "node:assert/strict";
import test from "node:test";

import { normalizeVinextFontCacheUrls } from "../build/vinext-font-url-normalizer";

test("rewrites Windows vinext font cache paths to public asset URLs", () => {
  const code = String.raw`src: url(C:/Users/Builder/JURO/apps/platform/.vinext/fonts/manrope/hash.woff2)`;

  const normalized = normalizeVinextFontCacheUrls(
    code,
    String.raw`C:\Users\Builder\JURO\apps\platform\.vinext\fonts`,
  );

  assert.equal(
    normalized,
    "src: url(/assets/_vinext_fonts/manrope/hash.woff2)",
  );
  assert.doesNotMatch(normalized, /C:\/Users\//);
});

test("honours a custom Vite assets directory", () => {
  const code = "src: url(/workspace/platform/.vinext/fonts/geist/hash.woff2)";

  assert.equal(
    normalizeVinextFontCacheUrls(
      code,
      "/workspace/platform/.vinext/fonts",
      "/static/",
    ),
    "src: url(/static/_vinext_fonts/geist/hash.woff2)",
  );
});

test("leaves unrelated modules unchanged", () => {
  const code = "export const value = '/assets/app.js';";
  assert.equal(
    normalizeVinextFontCacheUrls(code, "C:\\workspace\\.vinext\\fonts"),
    code,
  );
});
