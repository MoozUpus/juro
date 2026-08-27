import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";

const HOST = "127.0.0.1";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PROFILES = [
  { colorScheme: "light", name: "desktop-light", routes: ["/ru", "/uz", "/en", "/ru/trust", "/ru/lawyers"], viewport: { width: 1280, height: 900 } },
  { colorScheme: "dark", name: "desktop-dark", routes: ["/ru", "/ru/trust", "/ru/lawyers"], viewport: { width: 1280, height: 900 } },
  { colorScheme: "light", name: "mobile-light", routes: ["/ru", "/uz", "/en", "/ru/trust", "/ru/lawyers"], viewport: { width: 390, height: 844 } },
  { colorScheme: "dark", name: "mobile-dark", routes: ["/ru", "/ru/trust", "/ru/lawyers"], viewport: { width: 390, height: 844 } },
];
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLIENT_ROOT = path.resolve(PROJECT_ROOT, "dist/client");
const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object", "Unable to reserve a local port");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function createSiteServer(port) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("a11y", `${process.pid}-${Date.now()}`);
  const worker = (await import(workerUrl.href)).default;
  assert.equal(typeof worker?.fetch, "function", "Built site Worker must export fetch()");

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${HOST}:${port}`);
      const decodedPath = decodeURIComponent(url.pathname);
      const relativePath = decodedPath.split("/").filter(Boolean);
      const candidate = path.resolve(CLIENT_ROOT, ...relativePath);
      if (candidate.startsWith(`${CLIENT_ROOT}${path.sep}`)) {
        const file = await stat(candidate).catch(() => null);
        if (file?.isFile()) {
          response.writeHead(200, {
            "cache-control": "no-store",
            "content-length": String(file.size),
            "content-type": CONTENT_TYPES.get(path.extname(candidate)) ?? "application/octet-stream",
          });
          createReadStream(candidate).pipe(response);
          return;
        }
      }

      const workerResponse = await worker.fetch(
        new Request(url, { headers: request.headers, method: request.method }),
        undefined,
        { passThroughOnException() {}, waitUntil() {} },
      );
      response.writeHead(workerResponse.status, Object.fromEntries(workerResponse.headers));
      if (!workerResponse.body || request.method === "HEAD") response.end();
      else Readable.fromWeb(workerResponse.body).pipe(response);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, resolve);
  });
  return server;
}

function formatViolation(label, violation) {
  const targets = violation.nodes
    .flatMap((node) => node.target)
    .map((target) => String(target))
    .slice(0, 5)
    .join(", ");
  return `${label}: ${violation.id} (${violation.impact ?? "unknown"}, ${violation.nodes.length} nodes) ${targets}`;
}

async function verifySkipLink(page, label) {
  const skipLink = page.locator('a[href="#main-content"]');
  await skipLink.focus();
  await page.keyboard.press("Enter");
  const focusedId = await page.evaluate(() => document.activeElement?.id ?? "");
  assert.equal(focusedId, "main-content", `${label} skip link must move keyboard focus to main content`);
}

const port = await reservePort();
const origin = `http://${HOST}:${port}`;
const server = await createSiteServer(port);

let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const failures = [];

  for (const profile of PROFILES) {
    const context = await browser.newContext({
      colorScheme: profile.colorScheme,
      locale: "ru-RU",
      reducedMotion: "reduce",
      viewport: profile.viewport,
    });
    for (const route of profile.routes) {
      const label = `${profile.name} ${route}`;
      const page = await context.newPage();
      const response = await page.goto(`${origin}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
      assert(response, `${label} did not return a document response`);
      assert.equal(response.status(), 200, `${label} returned ${response.status()}`);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      failures.push(...results.violations.map((violation) => formatViolation(label, violation)));
      await verifySkipLink(page, label);
      const verdict = results.violations.length === 0 ? "PASS" : "FAIL";
      console.log(`${verdict} a11y ${label}: ${results.passes.length} automated checks, ${results.incomplete.length} manual-review candidates`);
      await page.close();
    }
    await context.close();
  }

  assert.deepEqual(failures, [], `Automated WCAG smoke found violations:\n${failures.join("\n")}`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
