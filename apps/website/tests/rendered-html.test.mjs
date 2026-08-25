import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

async function createWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const runtime = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const context = { waitUntil() {}, passThroughOnException() {} };
const legalStyles = fs.readFileSync("app/[locale]/legal/legal.module.css", "utf8");
const trustStyles = fs.readFileSync("app/[locale]/trust/trust.module.css", "utf8");

test("mobile legal document titles can wrap without widening the page", () => {
  assert.match(legalStyles, /\.documentHero h1\{font-size:clamp\(39px,10\.5vw,41px\);overflow-wrap:anywhere\}/);
});

test("Trust Center keeps narrow mobile grids and Uzbek headings inside the viewport", () => {
  assert.match(trustStyles, /\.hero\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(trustStyles, /\.details\{gap:3rem;grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(trustStyles, /\.details header h2,\.details article h3\{overflow-wrap:anywhere\}/);
});

test("renders the production landing with localized canonical metadata and real actions", async () => {
  const worker = await createWorker();
  for (const locale of ["ru", "uz"]) {
    const response = await worker.fetch(new Request(`http://localhost/${locale}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, locale);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src/);
    assert.match(response.headers.get("content-security-policy") ?? "", /img-src 'self' data: blob: https:\/\/app\.juro\.uz/);
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

test("renders the complete English public landing and routes product actions to an available product locale", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/en", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html\b[^>]*\blang="en"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/juro\.uz\/en"/);
  assert.match(html, /Tell us/);
  assert.match(html, /Get a clear next step/);
  assert.match(html, /https:\/\/app\.juro\.uz\/register\?lang=ru&amp;accountType=individual/);
  for (const route of ["/en/video", "/en/lawyers", "/en/legal", "/en/trust"]) assert.match(html, new RegExp(`href="${route}"`));
});

test("removed landing test routes return not found", async () => {
  const worker = await createWorker();
  for (const route of ["/landing-test", "/lending-test"]) {
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 404, route);
  }
});

test("not-found state keeps the visitor in the requested public language", async () => {
  const worker = await createWorker();
  const expectations = {
    ru: ["Неверный адрес не должен обрывать путь", 'href="/ru"'],
    uz: ["Noto‘g‘ri manzil yo‘lingizni to‘xtatmasin", 'href="/uz"'],
    en: ["A wrong route should not stop the right next step", 'href="/en"'],
  };
  for (const [locale, [message, href]] of Object.entries(expectations)) {
    const response = await worker.fetch(new Request(`http://localhost/${locale}/missing-route`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 404, locale);
    const html = await response.text();
    assert.match(html, new RegExp(`<html\\b[^>]*\\blang="${locale}"`), locale);
    assert.match(html, new RegExp(message), locale);
    assert.match(html, new RegExp(href), locale);
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
    assert.match(html, new RegExp(`<link rel="alternate" hrefLang="en" href="https://juro\\.uz/en/legal/${canonicalSlug}"`), canonicalRoute);
    assert.match(html, /<meta property="og:title" content="/, canonicalRoute);
  }
});

test("serves all knowledge articles in every public language", async () => {
  const worker = await createWorker();
  const slugs = ["contract-review-preparation", "facts-for-action-plan", "when-lawyer-review-is-needed"];
  for (const locale of ["ru", "uz", "en"]) for (const slug of slugs) {
    const route = `/${locale}/knowledge/${slug}`;
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-security-policy") ?? "", /media-src 'self' https:\/\/pub-28041c6b6dff4877a700421e6cd2c986\.r2\.dev/);
    const html = await response.text();
    assert.match(html, new RegExp(`<div[^>]+lang="${locale}"`), route);
    assert.match(html, new RegExp(`https://juro\\.uz/${locale}/knowledge/${slug}`), route);
  }
});

test("serves the Trust Center in every public language", async () => {
  const worker = await createWorker();
  for (const locale of ["ru", "uz", "en"]) {
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

test("serves the English investor video from its dedicated public route", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/en/video", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html\b[^>]*\blang="en"/);
  assert.match(html, /https:\/\/juro\.uz\/en\/video/);
  assert.match(html, /https:\/\/pub-28041c6b6dff4877a700421e6cd2c986\.r2\.dev\/investor\/juro-investor-presentation-en-v1\.mp4/);
  assert.match(html, /autoplay/i);
  assert.match(html, /muted/);
});

test("every discoverable internal public link resolves", async () => {
  const worker = await createWorker();
  const queue = ["/ru", "/uz", "/en"];
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
      if (!url.pathname.startsWith("/ru") && !url.pathname.startsWith("/uz") && !url.pathname.startsWith("/en")) continue;
      if (!visited.has(url.pathname)) queue.push(url.pathname);
    }
  }

  assert.ok(visited.size >= 50, `Expected a full public graph, visited ${visited.size} routes`);
});

test("serves an English legal guide for every published document without claiming a legal translation", async () => {
  const worker = await createWorker();
  const slugs = ["legal-information", "user-agreement", "public-offer", "privacy-policy", "personal-data-processing-policy", "personal-data-consent", "cross-border-ai-consent", "cookie-policy", "payments-subscriptions-refunds", "ai-use-policy", "marketplace-client-rules", "lawyer-platform-terms", "document-storage-rules", "electronic-communications-consent", "marketing-consent", "acceptable-use-policy", "complaints-disputes", "data-subject-request-form"];
  for (const slug of slugs) {
    const response = await worker.fetch(new Request(`http://localhost/en/legal/${slug}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, slug);
    const html = await response.text();
    assert.match(html, /not an English legal translation/i, slug);
    assert.match(html, new RegExp(`href="/ru/legal/${slug}"`), slug);
    assert.match(html, new RegExp(`href="/uz/legal/${slug}"`), slug);
    assert.match(html, new RegExp(`<link rel="alternate" hrefLang="en" href="https://juro\\.uz/en/legal/${slug}"`), slug);
    assert.match(html, /<meta property="og:title" content="/, slug);
  }
});

test("publishes complete multilingual and Open Graph metadata for every legal centre", async () => {
  const worker = await createWorker();
  for (const locale of ["ru", "uz", "en"]) {
    const route = `/${locale}/legal`;
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    for (const alternateLocale of ["ru", "uz", "en"]) {
      assert.match(html, new RegExp(`<link rel="alternate" hrefLang="${alternateLocale}" href="https://juro\\.uz/${alternateLocale}/legal"`), `${route}:${alternateLocale}`);
    }
    assert.match(html, /<meta property="og:title" content="/, route);
  }
});

test("renders the correct document language on each public lawyer catalogue locale", async () => {
  const worker = await createWorker();
  for (const locale of ["ru", "uz", "en"]) {
    const response = await worker.fetch(
      new Request(`http://localhost/${locale}/lawyers`, { headers: { accept: "text/html" } }),
      runtime,
      context,
    );
    assert.equal(response.status, 200, locale);
    const html = await response.text();
    assert.match(html, new RegExp(`<html\\b[^>]*\\blang="${locale}"`), locale);
    assert.match(html, new RegExp(`https://juro\\.uz/${locale}/lawyers`), locale);
    for (const alternateLocale of ["ru", "uz", "en"]) {
      assert.match(html, new RegExp(`<link rel="alternate" hrefLang="${alternateLocale}" href="https://juro\\.uz/${alternateLocale}/lawyers"`), `${locale}:${alternateLocale}`);
    }
    assert.match(html, /<meta property="og:title" content="/, locale);
  }
});
