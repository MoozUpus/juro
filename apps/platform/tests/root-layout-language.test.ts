import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("root layout permits only the pre-hydration locale attribute update", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<html lang="ru" suppressHydrationWarning>/);
  assert.match(layout, /location\.pathname\.match\(\/\^\\\\\/\(ru\|uz\)/);
  assert.match(layout, /document\.documentElement\.lang=m\?m\[1\]:\(q===\"uz\"\?\"uz\":\"ru\"\)/);
});
