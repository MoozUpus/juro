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

test("document review opens on the first clause and changes only by direct selection", () => {
  assert.match(homepage, /const \[clause, setClause\] = useState\(0\)/);
  assert.match(homepage, /const selectClause = \(index: number\) => \{\s*setClause\(index\);\s*\}/);
  assert.doesNotMatch(homepage + motionDirector, /juro:document-step/);
});

test("public chrome exposes every primary public destination in both locales", () => {
  for (const route of ["/trust", "/video", "/lawyers", "/legal", "/knowledge/"]) {
    assert.match(chrome, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(chrome, /languageHref/);
  assert.equal((chrome.match(/scroll=\{false\}/g) ?? []).length, 3);
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

test("story progress rail ends at the active row without shifting its marker", () => {
  assert.match(motionDirector, /rect\.top - railRect\.top \+ rect\.height \/ 2/);
  assert.match(motionDirector, /--story-track-start-px/);
  assert.match(motionDirector, /--story-track-height-px/);
  assert.match(motionDirector, /--story-progress-px/);
  assert.match(motionStyles, /\.storyRail::after/);
  assert.match(motionStyles, /height: var\(--story-track-height-px\)/);
  assert.match(motionStyles, /top: var\(--story-track-start-px\)/);
  assert.match(motionStyles, /height: var\(--story-progress-px\)/);
  assert.match(motionStyles, /\.storyRail[\s\S]*?align-self: start/);
  assert.match(motionStyles, /\.storyRail[\s\S]*?position: sticky[\s\S]*?top: clamp\(6rem, 12vh, 9rem\)/);
  assert.match(motionStyles, /@media \(max-width: 980px\)[\s\S]*?\.storyRail \{ position: relative; top: auto; \}/);
  assert.match(motionDirector, /const storyProgress = sectionRect \? clamp\(\(stickyOffset - sectionRect\.top\) \/ storyRange\) : 0/);
  assert.match(motionStyles, /\.storyStep\[data-active="true"\][\s\S]*?transform: none/);
  assert.match(motionDirector, /step\.dataset\.complete = index < active/);
  assert.match(motionStyles, /\.storyStep\[data-complete="true"\]::after/);
  assert.match(motionStyles, /\.storyStep::after[\s\S]*?height: 12px[\s\S]*?opacity: 1/);
  assert.match(motionStyles, /\.storyStep\.storyStep[\s\S]*?padding-inline: clamp\(\.9rem, 2vw, 1\.35rem\)/);
  assert.match(motionStyles, /\.storyStep\.storyStep[\s\S]*?grid-template-columns: 3rem minmax\(0, 1fr\)/);
  assert.doesNotMatch(homepage, /ChevronRight/);
  assert.match(motionStyles, /box-shadow: inset 0 0 0 1px rgba\(190, 151, 79, \.2\)/);
  assert.doesNotMatch(motionStyles, /scaleY\(var\(--story-progress\)\)/);
  assert.match(laptopStyles, /\.transitionSection\.transitionSection[\s\S]*?min-height: auto/);
});

test("case continuity timeline keeps active and pending segments on one axis", () => {
  assert.match(motionStyles, /\.continuityMotion[\s\S]*?min-height: 180vh/);
  assert.match(motionStyles, /\.continuityVisualMotion[\s\S]*?position: sticky[\s\S]*?top: clamp\(1rem, 5vh, 3\.5rem\)/);
  assert.match(motionStyles, /@media \(max-width: 1100px\)[\s\S]*?\.continuityVisualMotion \{ position: relative; top: auto; \}/);
  assert.match(motionStyles, /\.continuityVisualMotion li\[data-active\][^}]*transform: none/);
  assert.doesNotMatch(motionStyles, /\.continuityVisualMotion li\[data-active\][^}]*translateX/);
  assert.match(homepage, /continuityStep/);
  assert.match(homepage, /selectContinuityStep/);
  assert.match(homepage, /aria-current=\{index === continuityStep \? "step"/);
  assert.match(homepage, /--continuity-stage-progress/);
  assert.match(motionDirector, /juro:continuity-step/);
  assert.match(motionDirector, /const progress = clamp\(\(stickyOffset - rect\.top\) \/ Math\.max\(1, rect\.height - viewport\)\)/);
  assert.match(motionStyles, /\.continuitySteps::after[\s\S]*?scaleY\(var\(--continuity-stage-progress\)\)/);
  assert.match(motionStyles, /\.continuitySteps button[\s\S]*?grid-template-columns: 2\.5rem 1fr/);
  assert.match(homepage, /<div className=\{styles\.nextCard\}><span>\{t\.continuity\.next\}<\/span><strong>\{t\.continuity\.nextBody\}<\/strong><\/div>/);
  assert.doesNotMatch(homepage, /nextCard[^\n]*ArrowDownRight/);
});

test("trust and resource gateways use an editorial hierarchy", () => {
  assert.match(homepage, /editorialStyles\.trustGrid/);
  assert.match(homepage, /data-trust-card/);
  assert.doesNotMatch(homepage, /data-trust-card[^>]*data-reveal|data-reveal[^>]*data-trust-card/);
  assert.match(homepage, /editorialStyles\.resourceGrid/);
  assert.match(homepage, /data-primary=\{index === 0/);
  assert.match(homepage, /Смотреть обзор/);
  assert.match(homepage, /Sharhni ko‘rish/);
  assert.match(homepage, /resourceFeatureMeta/);
  assert.match(homepage, /resourceFeatureCopy/);
  assert.match(homepage, /resourceFeaturePlay/);
  assert.match(homepage, /resourceFeatureAction/);
  assert.match(editorialStyles, /prefers-reduced-motion:\s*reduce/);
  assert.match(editorialStyles, /grid-template-columns: 64px minmax\(0, 1\.2fr\) minmax\(300px, \.8fr\)/);
  assert.match(editorialStyles, /grid-column: 1 \/ -1;\s*grid-row: 1;\s*justify-self: start/);
  assert.match(editorialStyles, /@media \(max-width: 1180px\)/);
  assert.match(editorialStyles, /radial-gradient\(circle at 82% 16%/);
  assert.match(editorialStyles, /border-radius: 18px 18px 0 0/);
  assert.match(editorialStyles, /max-width: 19ch/);
  assert.match(editorialStyles, /\.trustSection[\s\S]*?padding-bottom: clamp\(3rem, 5vw, 5rem\)/);
  assert.match(editorialStyles, /\.resourcesSection\.resourcesSection[\s\S]*?padding-top: clamp\(3rem, 5vw, 5rem\)/);
  assert.match(editorialStyles, /linear-gradient\(145deg, #123854/);
  assert.match(editorialStyles, /\.resourceFeatureMeta[\s\S]*?justify-content: space-between/);
  assert.match(editorialStyles, /\.resourceFeatureCopy[\s\S]*?gap: clamp\(6rem, 20vw, 17rem\)[\s\S]*?grid-template-columns: minmax\(0, max-content\) auto[\s\S]*?width: fit-content/);
  assert.match(editorialStyles, /\.resourceFeaturePlay[\s\S]*?border-radius: 50%/);
  assert.match(editorialStyles, /\.resourceItem\.resourceItem\[data-primary\] \.resourceFeaturePlay > svg[\s\S]*?position: static/);
  assert.match(editorialStyles, /\.resourceFeatureAction[\s\S]*?justify-content: flex-start/);
  assert.match(editorialStyles, /\.resourceItem\.resourceItem\[data-primary\] \.watchSignal > svg[\s\S]*?bottom: auto[\s\S]*?position: static[\s\S]*?right: auto[\s\S]*?transform: none/);
  assert.match(editorialStyles, /\.resourceItem\[data-primary\]:hover \.watchSignal[\s\S]*?background: #d7b56f/);
  assert.match(editorialStyles, /\.resourceItem\[data-primary\]:active \.watchSignal/);
});

test("start pathways retain direct-linking and responsive decision states", () => {
  assert.match(homepage, /hashchange/);
  assert.match(homepage, /scrollIntoView/);
  assert.match(homepage, /decodeURIComponent/);
  assert.match(homepage, /decisionStyles\.accessPlans/);
  assert.match(homepage, /data-access-plan/);
  assert.doesNotMatch(homepage, /data-access-plan[^>]*data-reveal|data-reveal[^>]*data-access-plan/);
  assert.match(homepage, /styles\.accessNote.*laptopStyles\.accessNote/);
  assert.match(laptopStyles, /\.accessNote\.accessNote[\s\S]*?line-height: 1\.65[\s\S]*?margin: clamp\(1\.35rem, 2\.4vw, 1\.75rem\) auto 0/);
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
  assert.match(laptopStyles, /\.heroCopy\.heroCopy \{ max-width: 900px; \}/);
  assert.match(homepage, /styles\.heroNote.*laptopStyles\.heroNote/);
  assert.match(laptopStyles, /\.heroNote\.heroNote[\s\S]*?margin: clamp\(1\.35rem, 2\.4vw, 1\.75rem\) 0 0[\s\S]*?line-height: 1\.65|\.heroNote\.heroNote[\s\S]*?line-height: 1\.65[\s\S]*?margin: clamp\(1\.35rem, 2\.4vw, 1\.75rem\) 0 0/);
  assert.match(motionStyles, /100% \{ clip-path: none; opacity: 1; transform: translateY\(0\); \}/);
  assert.match(laptopStyles, /font-size: clamp\(2\.05rem, 8vw, 3\.25rem\)/);
  assert.match(laptopStyles, /\.transitionTitle\.transitionTitle[\s\S]*?max-width: 100%/);
  assert.match(motionStyles, /\[data-reveal\]\[data-reveal-state="visible"\]\) \{\s*clip-path: none/);
  assert.match(motionStyles, /\[data-reveal="mask"\]\[data-reveal-state="visible"\]\) \{\s*clip-path: inset/);
});

test("localized scenario questions keep a readable measure", () => {
  assert.match(homepageStyles, /\.caseMap\.caseMap[\s\S]*?grid-template-columns: minmax\(18rem, \.88fr\) 42px minmax\(0, 1\.12fr\)/);
  assert.match(homepageStyles, /\.caseInput\.caseInput p[\s\S]*?max-width: 18ch[\s\S]*?text-wrap: balance/);
  assert.match(homepageStyles, /@media \(max-width: 860px\)[\s\S]*?\.caseMap\.caseMap \{ grid-template-columns: minmax\(0, 1fr\)/);
});

test("editorial section introductions stay on one aligned content axis", () => {
  assert.match(homepage, /laptopStyles\.audienceHeader/);
  assert.match(homepage, /laptopStyles\.documentHeader/);
  assert.match(homepage, /laptopStyles\.trustHeader/);
  assert.match(homepage, /laptopStyles\.resourcesHeader/);
  assert.match(homepage, /laptopStyles\.accessHeader/);
  assert.match(laptopStyles, /\.audienceHeader\.audienceHeader/);
  assert.match(laptopStyles, /\.documentHeader\.documentHeader/);
  assert.match(laptopStyles, /\.trustHeader\.trustHeader/);
  assert.match(laptopStyles, /\.resourcesHeader\.resourcesHeader/);
  assert.match(laptopStyles, /\.accessHeader\.accessHeader/);
  assert.match(laptopStyles, /grid-column: auto/);
});

test("brand lockups use standalone marks and one intentional wordmark", () => {
  assert.match(chrome, /brandStyles\.markFrame/);
  assert.match(chrome, /brandStyles\.mobileMarkFrame/);
  assert.match(chrome, /brandStyles\.footerMarkFrame/);
  assert.match(chrome, /src=\{tone === "dark" && !scrolled \? "\/juro-mark-light\.png" : "\/juro-mark\.png"\}/);
  assert.match(chrome, /src="\/juro-mark\.png"/);
  assert.match(chrome, /src="\/juro-mark-light\.png"/);
  assert.match(chrome, /brandStyles\.wordmark\}>JURO/);
  assert.doesNotMatch(chrome, /juro-logo-(?:light|primary)\.avif/);
  assert.match(fs.readFileSync("app\/components\/public\/brand-lockup.module.css", "utf8"), /\.wordmark[\s\S]*?font-size: 1\.38rem/);
});
