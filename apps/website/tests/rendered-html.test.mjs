import assert from "node:assert/strict";
import test from "node:test";

async function createWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const runtime = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const context = { waitUntil() {}, passThroughOnException() {} };

test("renders the production landing with localized canonical metadata and real actions", async () => {
  const worker = await createWorker();
  for (const locale of ["ru", "uz"]) {
    const response = await worker.fetch(new Request(`http://localhost/${locale}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, locale);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src/);
    assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
    const html = await response.text();
    assert.match(html, new RegExp(`<link rel="canonical" href="https://juro\\.uz/${locale}"`));
    assert.match(html, new RegExp(`https://app\\.juro\\.uz/register\\?lang=${locale}&amp;accountType=individual`));
    assert.doesNotMatch(html, /jurobek-avatar\.avif/);
    assert.match(html, /Контекст не теряется между инструментами|Kontekst vositalar o‘rtasida yo‘qolmaydi/);
    assert.doesNotMatch(html, /ГОЛОСОВОЙ AI-АВАТАР|OVOZLI AI-AVATAR/);
    assert.match(html, /Право Узбекистана|O‘zbekiston huquqi/);
    assert.match(html, /FAQPage/);
    assert.match(html, new RegExp(`href="/${locale}/video"`));
    assert.match(html, new RegExp(`href="/${locale}/lawyers"`));
    assert.match(html, new RegExp(`href="/${locale}/legal"`));
    assert.match(html, new RegExp(`href="/${locale}/trust"`));
    assert.doesNotMatch(html, /landing-test|lending-test/);
    assert.doesNotMatch(html, /\{PRICE_|\{OFFICIAL_EMAIL\}|\{COMPLAINT_URL\}/);
  }
});

test("removed landing test routes return not found", async () => {
  const worker = await createWorker();
  for (const route of ["/landing-test", "/lending-test"]) {
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 404, route);
  }
});

test("serves all RU and UZ legal pages without authentication", async () => {
  const worker = await createWorker();
  const routes = {
    terms: "user-agreement",
    "privacy-policy": "privacy-policy",
    "personal-data-processing": "personal-data-processing-policy",
    cookies: "cookie-policy",
    "ai-rules": "ai-use-policy",
  };
  for (const locale of ["ru", "uz"]) for (const [slug, canonicalSlug] of Object.entries(routes)) {
    const route = `/${locale}/${slug}`;
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 308, route);
    assert.equal(response.headers.get("location"), `http://localhost/${locale}/legal/${canonicalSlug}`);
    const canonicalRoute = `/${locale}/legal/${canonicalSlug}`;
    const canonical = await worker.fetch(new Request(`http://localhost${canonicalRoute}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(canonical.status, 200, canonicalRoute);
    const html = await canonical.text();
    assert.match(html, new RegExp(`<div[^>]+lang="${locale}"`), route);
    assert.match(html, new RegExp(`https://juro\\.uz/${locale}/legal/${canonicalSlug}`), canonicalRoute);
  }
});

test("serves all knowledge articles in both languages", async () => {
  const worker = await createWorker();
  const slugs = ["contract-review-preparation", "facts-for-action-plan", "when-lawyer-review-is-needed"];
  for (const locale of ["ru", "uz"]) for (const slug of slugs) {
    const route = `/${locale}/knowledge/${slug}`;
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-security-policy") ?? "", /media-src 'self' https:\/\/pub-28041c6b6dff4877a700421e6cd2c986\.r2\.dev/);
    const html = await response.text();
    assert.match(html, new RegExp(`<div[^>]+lang="${locale}"`), route);
    assert.match(html, new RegExp(`https://juro\\.uz/${locale}/knowledge/${slug}`), route);
  }
});

test("serves the bilingual Trust Center with canonical metadata", async () => {
  const worker = await createWorker();
  for (const locale of ["ru", "uz"]) {
    const route = `/${locale}/trust`;
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, new RegExp(`https://juro\\.uz/${locale}/trust`));
    assert.match(html, /Trust Center/);
  }
});

test("serves the public investor video in both languages with muted autoplay", async () => {
  const worker = await createWorker();
  for (const locale of ["ru", "uz"]) {
    const route = `/${locale}/video`;
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, new RegExp(`https://juro\\.uz/${locale}/video`));
    assert.match(html, /https:\/\/pub-28041c6b6dff4877a700421e6cd2c986\.r2\.dev\/investor\/juro-investor-presentation-v1\.mp4/);
    assert.match(html, /autoplay/i);
    assert.match(html, /muted/);
    assert.match(html, /preload="auto"/);
  }
});

test("every discoverable internal public link resolves", async () => {
  const worker = await createWorker();
  const queue = ["/ru", "/uz"];
  const visited = new Set();

  while (queue.length > 0) {
    const path = queue.shift();
    if (!path || visited.has(path)) continue;
    visited.add(path);
    const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.ok(response.status === 200 || response.status === 308, `${path}: ${response.status}`);

    if (response.status === 308) {
      const location = response.headers.get("location");
      if (location) queue.push(new URL(location, "http://localhost").pathname);
      continue;
    }

    const html = await response.text();
    for (const match of html.matchAll(/\shref="([^"]+)"/g)) {
      const raw = match[1].replaceAll("&amp;", "&");
      if (!raw.startsWith("/")) continue;
      const url = new URL(raw, "http://localhost");
      if (!url.pathname.startsWith("/ru") && !url.pathname.startsWith("/uz")) continue;
      if (!visited.has(url.pathname)) queue.push(url.pathname);
    }
  }

  assert.ok(visited.size >= 50, `Expected a full public graph, visited ${visited.size} routes`);
});

test("renders the correct document language on each public lawyer catalogue locale", async () => {
  const worker = await createWorker();
  for (const locale of ["ru", "uz"]) {
    const response = await worker.fetch(
      new Request(`http://localhost/${locale}/lawyers`, { headers: { accept: "text/html" } }),
      runtime,
      context,
    );
    assert.equal(response.status, 200, locale);
    const html = await response.text();
    assert.match(html, new RegExp(`<html lang="${locale}"`), locale);
    assert.match(html, new RegExp(`https://juro\\.uz/${locale}/lawyers`), locale);
  }
});
