import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesheet = new URL("../app/_platform/platform-shell.css", import.meta.url);

test("platform shell never animates layout properties while collapsing navigation", async () => {
  const css = await readFile(stylesheet, "utf8");

  assert.doesNotMatch(css, /transition\s*:\s*grid-template-columns/i);
  assert.doesNotMatch(css, /transition\s*:\s*width/i);
  assert.match(css, /\.platform-sidebar\{transition:transform var\(--motion-base\) var\(--ease-out\)\}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
