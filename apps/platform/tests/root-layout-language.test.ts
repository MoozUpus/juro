import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("root layout permits only the pre-hydration locale attribute update", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<html[\s\S]*?lang="ru"[\s\S]*?suppressHydrationWarning[\s\S]*?>/);
  assert.doesNotMatch(layout, /<body[^>]*suppressHydrationWarning/);
  assert.match(layout, /location\.pathname\.match\(\/\^\\\\\/\(ru\|uz\)/);
  assert.match(layout, /location\.hostname\.toLowerCase\(\)===\"status\.juro\.uz\"/);
  assert.match(layout, /location\.hostname\.toLowerCase\(\)===\"status\.staging\.juro\.uz\"/);
  assert.match(layout, /document\.documentElement\.lang=m\?m\[1\]:\(q===\"uz\"\?\"uz\":q===\"ru\"\?\"ru\":s\?\"uz\":\"ru\"\)/);
});

test("root metadata keeps first-party assets on each allowed platform host", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  for (const hostname of [
    "app.juro.uz",
    "app.staging.juro.uz",
    "lawyer.juro.uz",
    "lawyer.staging.juro.uz",
    "status.juro.uz",
    "status.staging.juro.uz",
  ]) {
    assert.match(layout, new RegExp(`"${hostname.replaceAll(".", "\\.")}"`));
  }
  assert.match(layout, /metadataBaseForHost\(requestHeaders\.get\("host"\)\)/);
  assert.match(layout, /metadataHosts\.has\(hostname\) \? hostname : "app\.juro\.uz"/);
  assert.match(layout, /icon: "\/favicon\.png"/);
});
