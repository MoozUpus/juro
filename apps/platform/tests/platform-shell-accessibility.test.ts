import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellSource = new URL("../app/_platform/PlatformShell.tsx", import.meta.url);
const searchStylesheet = new URL("../app/_platform/global-search.css", import.meta.url);
const shellStylesheet = new URL("../app/_platform/platform-shell.css", import.meta.url);

test("skip link moves focus to the platform main landmark", async () => {
  const shell = await readFile(shellSource, "utf8");

  assert.match(shell, /className="platform-skip-link" href="#main-content"/);
  assert.match(shell, /<main className="platform-content" id="main-content" tabIndex=\{-1\}>/);
});

test("compact global-search trigger retains a 44px touch target", async () => {
  const css = await readFile(searchStylesheet, "utf8");

  assert.match(css, /\.global-search-trigger\{[^}]*min-height:44px/);
  assert.match(css, /@media\(max-width:1050px\)\{\.global-search-trigger\{min-width:44px!important\}/);
});

test("closed mobile navigation cannot create horizontal page scrolling", async () => {
  const [shell, css] = await Promise.all([
    readFile(shellSource, "utf8"),
    readFile(shellStylesheet, "utf8"),
  ]);

  assert.match(css, /@media\(max-width:800px\)\{\.platform-shell\{display:block;overflow-x:clip\}/);
  assert.match(shell, /if \(event\.key === "Escape"\) \{\s+setOpen\(false\);\s+openButtonRef\.current\?\.focus\(\);/);
  assert.match(shell, /const closeMobileMenu = \(\) => \{\s+setOpen\(false\);\s+window\.requestAnimationFrame\(\(\) => openButtonRef\.current\?\.focus\(\)\);/);
});
