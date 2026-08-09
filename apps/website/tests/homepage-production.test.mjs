import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rootPage = fs.readFileSync("app/page.tsx", "utf8");
const localizedPage = fs.readFileSync("app/[locale]/page.tsx", "utf8");
const adapter = fs.readFileSync("app/components/cinematic/CinematicLandingPage.tsx", "utf8");
const homepage = fs.readFileSync("app/components/public/JuroHomepage.tsx", "utf8");
const homepageStyles = fs.readFileSync("app/components/public/juro-home.module.css", "utf8");
const motionDirector = fs.readFileSync("app/components/public/JuroMotionDirector.tsx", "utf8");
const motionStyles = fs.readFileSync("app/components/public/juro-motion.module.css", "utf8");
const editorialStyles = fs.readFileSync("app/components/public/juro-editorial.module.css", "utf8");
const decisionStyles = fs.readFileSync("app/components/public/juro-decision.module.css", "utf8");
const laptopStyles = fs.readFileSync("app/components/public/juro-laptop.module.css", "utf8");
const chrome = fs.readFileSync("app/components/public/SiteChrome.tsx", "utf8");
const chromeStyles = fs.readFileSync("app/components/public/site-chrome.module.css", "utf8");
const sitemap = fs.readFileSync("app/sitemap.ts", "utf8");

test("selected JURO direction is the only public homepage implementation", () => {
  assert.match(rootPage, /CinematicLandingPage language="ru"/);
  assert.match(localizedPage, /CinematicLandingPage language=\{locale\}/);
  assert.match(adapter, /JuroHomepage/);
  assert.doesNotMatch(rootPage + localizedPage + adapter, /PrototypeHarness|prototypeRoot|router\.push/);
  assert.equal(fs.existsSync("app/prototypes/homepage/page.tsx"), false);
});

test("homepage explains the legal journey through concrete product states", () => {
  for (const marker of [
    "activeScenario.facts",
    "activeScenario.source",
    "activeScenario.risk",
    "activeScenario.action",
    "activeClause",
    "continuity",
    "handoff",
    "audiences",
  ]) assert.match(homepage, new RegExp(marker));
  assert.match(homepage, /document-analysis/);
  assert.match(homepage, /\/lawyers/);
  assert.match(homepage, /\/video/);
  assert.match(homepage, /\/trust/);
  assert.doesNotMatch(homepage, /<textarea|type="file"/);
});

test("production interactions have complete keyboard and reduced-motion contracts", () => {
  assert.match(homepage, /onKeyDown=\{\(event\) => moveTab/);
  assert.match(homepage, /role="tabpanel"/);
  assert.match(homepage, /tabIndex=\{scenario === index \? 0 : -1\}/);
  assert.match(homepage, /aria-live="polite"/);
  assert.match(chrome, /aria-modal="true"/);
  assert.match(chrome, /event\.key === "Escape"/);
  assert.match(chrome, /trigger\?\.focus\(\)/);
  assert.match(homepageStyles, /prefers-reduced-motion:\s*reduce/);
  assert.match(motionStyles, /prefers-reduced-motion:\s*reduce/);
  assert.match(motionDirector, /IntersectionObserver/);
  assert.match(motionDirector, /requestAnimationFrame/);
  assert.match(chromeStyles, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(homepageStyles + motionStyles + editorialStyles + decisionStyles + laptopStyles + chromeStyles, /transition:\s*all/);
  assert.doesNotMatch(homepageStyles + motionStyles + editorialStyles + decisionStyles + laptopStyles + chromeStyles, /ease-in(?:\s|;|,|\))/);
});

test("public chrome exposes every primary public destination in both locales", () => {
  for (const route of ["/trust", "/video", "/lawyers", "/legal", "/knowledge/"]) {
    assert.match(chrome, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(chrome, /languageHref/);
  assert.match(chrome, /app\.juro\.uz/);
  assert.match(sitemap, /\/lawyers/);
  assert.doesNotMatch(sitemap, /prototype/);
});

test("Jurobek uses a lightweight, reduced-motion-safe ambient treatment", () => {
  assert.match(homepage, /jurobek-point\.webp/);
  assert.match(homepage, /unoptimized/);
  assert.match(homepage, /jurobekMotion/);
  assert.match(motionStyles, /jurobek-breathe/);
  assert.match(motionStyles, /prefers-reduced-motion:\s*reduce/);
});

test("homepage chapters provide orientation without hiding SSR content", () => {
  assert.match(homepage, /data-chapter-link/);
  assert.match(homepage, /id="analysis"/);
  assert.match(homepage, /id="case-flow"/);
  assert.match(homepage, /id="lawyer-handoff"/);
  assert.doesNotMatch(homepage, /data-motion-ready="true"/);
  assert.match(motionDirector, /aria-current/);
  assert.match(motionDirector, /revealObserver\.unobserve/);
});

test("trust and resource gateways use an editorial hierarchy", () => {
  assert.match(homepage, /editorialStyles\.trustGrid/);
  assert.match(homepage, /editorialStyles\.resourceGrid/);
  assert.match(homepage, /data-primary=\{index === 0/);
  assert.match(homepage, /Смотреть обзор/);
  assert.match(homepage, /Sharhni ko‘rish/);
  assert.match(editorialStyles, /prefers-reduced-motion:\s*reduce/);
});

test("start pathways retain direct-linking and responsive decision states", () => {
  assert.match(homepage, /hashchange/);
  assert.match(homepage, /scrollIntoView/);
  assert.match(homepage, /decodeURIComponent/);
  assert.match(homepage, /decisionStyles\.accessPlans/);
  assert.match(homepage, /data-featured=\{index === 1/);
  assert.match(decisionStyles, /prefers-reduced-motion:\s*reduce/);
  assert.match(decisionStyles, /@media \(max-width: 620px\)/);
});

test("laptop layouts prevent large headline and product-grid clipping", () => {
  assert.match(homepage, /laptopStyles\.heroGrid/);
  assert.match(homepage, /laptopStyles\.heroProduct/);
  assert.match(homepage, /laptopStyles\.transitionSection/);
  assert.match(laptopStyles, /@media \(max-width: 1420px\)/);
  assert.match(laptopStyles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(laptopStyles, /min-width: 0/);
});

test("brand mark crops the baked-in miniature label and keeps one intentional wordmark", () => {
  assert.match(chrome, /brandStyles\.markFrame/);
  assert.match(chrome, /brandStyles\.mobileMarkFrame/);
  assert.match(chrome, /brandStyles\.footerMarkFrame/);
  assert.match(chrome, /brandStyles\.wordmark\}>JURO/);
  assert.match(fs.readFileSync("app\/components\/public\/brand-lockup.module.css", "utf8"), /\.markFrame[\s\S]*?overflow: hidden/);
  assert.match(fs.readFileSync("app\/components\/public\/brand-lockup.module.css", "utf8"), /\.wordmark[\s\S]*?font-size: 1\.38rem/);
});
