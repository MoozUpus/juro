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
const MIN_VISIBLE_TEXT_PX = 12;
const MIN_CONTROL_TARGET_PX = 44;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ROUTE_FILTER = process.env.A11Y_ROUTE_PATTERN ? new RegExp(process.env.A11Y_ROUTE_PATTERN) : null;
const RESPONSIVE_WIDTH_FILTER = process.env.A11Y_RESPONSIVE_WIDTH
  ? Number.parseInt(process.env.A11Y_RESPONSIVE_WIDTH, 10)
  : null;
const PUBLIC_ROUTE_SUFFIXES = [
  "",
  "/trust",
  "/lawyers",
  "/legal",
  "/legal/privacy-policy",
  "/knowledge/contract-review-preparation",
  "/video",
];
const LOCALIZED_PUBLIC_ROUTES = ["ru", "uz", "en"]
  .flatMap((locale) => PUBLIC_ROUTE_SUFFIXES.map((suffix) => `/${locale}${suffix}`));
const REPRESENTATIVE_DARK_ROUTES = PUBLIC_ROUTE_SUFFIXES.map((suffix) => `/ru${suffix}`);
const PROFILES = [
  { colorScheme: "light", name: "desktop-light", routes: LOCALIZED_PUBLIC_ROUTES, viewport: { width: 1280, height: 900 } },
  { colorScheme: "dark", name: "desktop-dark", routes: REPRESENTATIVE_DARK_ROUTES, viewport: { width: 1280, height: 900 } },
  { colorScheme: "light", name: "mobile-light", routes: LOCALIZED_PUBLIC_ROUTES, viewport: { width: 390, height: 844 } },
  { colorScheme: "dark", name: "mobile-dark", routes: REPRESENTATIVE_DARK_ROUTES, viewport: { width: 390, height: 844 } },
];
const REQUIRED_RESPONSIVE_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const FULL_A11Y_VIEWPORT_WIDTHS = new Set(PROFILES.map((profile) => profile.viewport.width));
const RESPONSIVE_ONLY_VIEWPORTS = REQUIRED_RESPONSIVE_VIEWPORTS
  .filter((viewport) => !FULL_A11Y_VIEWPORT_WIDTHS.has(viewport.width));
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

      const workerHeaders = new Headers(request.headers);
      workerHeaders.set("x-juro-request-path", url.pathname);
      const workerResponse = await worker.fetch(
        new Request(url, { headers: workerHeaders, method: request.method }),
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

async function waitForStablePage(page, expectedLocale) {
  await page.waitForLoadState("load", { timeout: 15_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  if (expectedLocale) {
    await page.waitForFunction(
      (locale) => document.documentElement.lang === locale,
      expectedLocale,
      { timeout: 5_000 },
    );
  }
}

async function findSmallVisibleText(page, label) {
  const results = await page.evaluate((minimum) => {
    const findings = [];
    for (const element of document.querySelectorAll("body *")) {
      if (element.closest('[aria-hidden="true"]')) continue;
      const text = [...element.childNodes]
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent ?? "")
        .join(" ")
        .trim()
        .replace(/\s+/g, " ");
      if (!text) continue;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      const fontSize = Number.parseFloat(style.fontSize);
      if (!Number.isFinite(fontSize) || fontSize + 0.01 >= minimum) continue;
      const className = typeof element.className === "string"
        ? element.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".")
        : "";
      const selector = `${element.tagName.toLowerCase()}${className ? `.${className}` : ""}`;
      const owner = element.closest("a[href],button,input,select,textarea,summary");
      findings.push(`${selector} ${fontSize}px ${owner ? "interactive" : "noninteractive"} \"${text.slice(0, 80)}\"`);
    }
    return findings;
  }, MIN_VISIBLE_TEXT_PX);
  return [...new Set(results)].map((finding) => `${label}: ${finding}`);
}

async function findBrokenAriaReferences(page, label) {
  const results = await page.evaluate(() => {
    const findings = [];
    for (const element of document.querySelectorAll("[aria-controls],[aria-labelledby],[aria-describedby]")) {
      for (const attribute of ["aria-controls", "aria-labelledby", "aria-describedby"]) {
        const value = element.getAttribute(attribute);
        if (!value) continue;
        for (const id of value.trim().split(/\s+/)) {
          if (document.getElementById(id)) continue;
          const name = element.getAttribute("aria-label") ?? element.textContent?.trim().replace(/\s+/g, " ") ?? "";
          findings.push(`${element.tagName.toLowerCase()}[${attribute}="${id}"] "${name.slice(0, 80)}"`);
        }
      }
    }
    return findings;
  });
  return [...new Set(results)].map((finding) => `${label}: broken ARIA reference ${finding}`);
}

async function findSmallControlTargets(page, label) {
  const results = await page.evaluate((minimum) => {
    const findings = [];
    const selector = "button,input:not([type=hidden]),select,textarea,summary,[role=tab]";
    for (const element of document.querySelectorAll(selector)) {
      if (element.closest('[aria-hidden="true"]')) continue;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      if (rect.width + 0.01 >= minimum && rect.height + 0.01 >= minimum) continue;
      const name = element.getAttribute("aria-label") ?? element.textContent?.trim().replace(/\s+/g, " ") ?? "";
      findings.push(`${element.tagName.toLowerCase()} ${rect.width.toFixed(1)}x${rect.height.toFixed(1)} "${name.slice(0, 80)}"`);
    }
    return findings;
  }, MIN_CONTROL_TARGET_PX);
  return [...new Set(results)].map((finding) => `${label}: control target below ${MIN_CONTROL_TARGET_PX}px ${finding}`);
}

async function findResponsiveDocumentFailures(page, label, expectedLocale) {
  const results = await page.evaluate(({ locale }) => {
    const failures = [];
    if (document.documentElement.lang !== locale) failures.push(`document lang is "${document.documentElement.lang}" instead of "${locale}"`);
    if (document.querySelectorAll("h1").length !== 1) failures.push(`expected one h1, found ${document.querySelectorAll("h1").length}`);
    if (document.querySelectorAll("main").length !== 1) failures.push(`expected one main, found ${document.querySelectorAll("main").length}`);
    if (!document.querySelector("main#main-content")) failures.push("main#main-content is missing");
    const overflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
    if (overflow > 1) failures.push(`horizontal overflow is ${overflow.toFixed(1)}px`);
    return failures;
  }, { locale: expectedLocale });
  return results.map((failure) => `${label}: ${failure}`);
}

async function findHorizontallyClippedInteractiveTargets(page, label) {
  const results = await page.evaluate(() => {
    const findings = [];
    const selector = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=tab]";
    for (const element of document.querySelectorAll(selector)) {
      if (element.closest('[aria-hidden="true"]')) continue;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      if (rect.left >= -1 && rect.right <= window.innerWidth + 1) continue;
      const name = element.getAttribute("aria-label") ?? element.textContent?.trim().replace(/\s+/g, " ") ?? "";
      findings.push(`${element.tagName.toLowerCase()} [${rect.left.toFixed(1)}, ${rect.right.toFixed(1)}] "${name.slice(0, 80)}"`);
    }
    return findings;
  });
  return [...new Set(results)].map((finding) => `${label}: horizontally clipped interactive target ${finding}`);
}

async function verifyResponsiveMenu(page, label) {
  const trigger = page.locator("header button[aria-expanded]");
  assert.equal(await trigger.count(), 1, `${label} must expose one compact-menu trigger`);
  assert.equal(await trigger.isVisible(), true, `${label} compact-menu trigger must be visible`);
  await trigger.click();
  const panelId = await trigger.getAttribute("aria-controls");
  assert(panelId, `${label} open trigger must reference its dialog`);
  const dialog = page.locator('[role="dialog"]');
  assert.equal(await dialog.count(), 1, `${label} must expose one open dialog`);
  assert.equal(await dialog.getAttribute("id"), panelId, `${label} trigger and dialog IDs must match`);
  assert.equal(await page.locator('[role="dialog"] button[aria-label="Закрыть меню"]').count(), 1, `${label} must expose one accessible close button`);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Закрыть меню", `${label} must move focus to the close button`);
  const failures = [
    ...await findBrokenAriaReferences(page, `${label} open-menu`),
    ...await findSmallControlTargets(page, `${label} open-menu`),
    ...await findHorizontallyClippedInteractiveTargets(page, `${label} open-menu`),
  ];
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0, `${label} Escape must close the dialog`);
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true, `${label} Escape must return focus to the trigger`);
  return failures;
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
      if (ROUTE_FILTER && !ROUTE_FILTER.test(route)) continue;
      const label = `${profile.name} ${route}`;
      const page = await context.newPage();
      const response = await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      assert(response, `${label} did not return a document response`);
      assert.equal(response.status(), 200, `${label} returned ${response.status()}`);
      await waitForStablePage(page, route.split("/")[1]);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const routeFailures = results.violations.map((violation) => formatViolation(label, violation));
      await verifySkipLink(page, label);
      routeFailures.push(...await findResponsiveDocumentFailures(page, label, route.split("/")[1]));
      routeFailures.push(...await findSmallVisibleText(page, label));
      routeFailures.push(...await findBrokenAriaReferences(page, label));
      routeFailures.push(...await findSmallControlTargets(page, label));
      routeFailures.push(...await findHorizontallyClippedInteractiveTargets(page, label));
      failures.push(...routeFailures);
      const verdict = routeFailures.length === 0 ? "PASS" : "FAIL";
      console.log(`${verdict} a11y ${label}: ${results.passes.length} automated checks, ${results.incomplete.length} manual-review candidates`);
      await page.close();
    }
    await context.close();
  }

  for (const viewport of RESPONSIVE_ONLY_VIEWPORTS) {
    if (RESPONSIVE_WIDTH_FILTER && viewport.width !== RESPONSIVE_WIDTH_FILTER) continue;
    const responsiveContext = await browser.newContext({
      colorScheme: "light",
      locale: "ru-RU",
      reducedMotion: "reduce",
      viewport,
    });
    for (const route of LOCALIZED_PUBLIC_ROUTES) {
      if (ROUTE_FILTER && !ROUTE_FILTER.test(route)) continue;
      const label = `responsive-${viewport.width} ${route}`;
      const responsivePage = await responsiveContext.newPage();
      const response = await responsivePage.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      assert(response, `${label} did not return a document response`);
      assert.equal(response.status(), 200, `${label} returned ${response.status()}`);
      await waitForStablePage(responsivePage, route.split("/")[1]);
      await verifySkipLink(responsivePage, label);
      const routeFailures = [
        ...await findResponsiveDocumentFailures(responsivePage, label, route.split("/")[1]),
        ...await findSmallVisibleText(responsivePage, label),
        ...await findBrokenAriaReferences(responsivePage, label),
        ...await findSmallControlTargets(responsivePage, label),
        ...await findHorizontallyClippedInteractiveTargets(responsivePage, label),
      ];
      failures.push(...routeFailures);
      console.log(`${routeFailures.length === 0 ? "PASS" : "FAIL"} responsive ${label}`);
      await responsivePage.close();
    }
    if (viewport.width <= 1100 && (!ROUTE_FILTER || ROUTE_FILTER.test("/ru"))) {
      const label = `responsive-menu-${viewport.width} /ru`;
      const responsivePage = await responsiveContext.newPage();
      const response = await responsivePage.goto(`${origin}/ru`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      assert(response, `${label} did not return a document response`);
      assert.equal(response.status(), 200, `${label} returned ${response.status()}`);
      await waitForStablePage(responsivePage, "ru");
      const menuFailures = await verifyResponsiveMenu(responsivePage, label);
      failures.push(...menuFailures);
      console.log(`${menuFailures.length === 0 ? "PASS" : "FAIL"} responsive menu ${viewport.width}px`);
      await responsivePage.close();
    }
    await responsiveContext.close();
  }

  assert.deepEqual(failures, [], `Automated accessibility smoke found violations:\n${failures.join("\n")}`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
