import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("RU, UZ and English dictionaries expose the public content contract", () => {
  const ru = fs.readFileSync("content/ru.ts", "utf8");
  const uz = fs.readFileSync("content/uz.ts", "utf8");
  const en = fs.readFileSync("content/en.ts", "utf8");
  for (const section of ["hero", "audience", "capabilities", "how", "comparison", "handoff", "security", "pricing", "knowledge", "faq", "final", "footer"]) {
    assert.match(ru, new RegExp(`${section}:`), `RU ${section}`);
    assert.match(uz, new RegExp(`${section}:`), `UZ ${section}`);
  }
  assert.match(en, /meta:/);
  assert.match(en, /faq:/);
  assert.match(ru, /faq:[\s\S]*items:/);
  assert.match(uz, /faq:[\s\S]*items:/);
  assert.match(en, /not an English legal translation|English summaries/i);
});

test("public copy avoids unresolved commercial and legal claims", () => {
  const homepage = fs.readFileSync("app/components/public/JuroHomepage.tsx", "utf8");
  const experience = fs.readFileSync("content/experience.ts", "utf8");
  const localizedCopy = fs.readFileSync("content/ru.ts", "utf8") + fs.readFileSync("content/uz.ts", "utf8");
  assert.doesNotMatch(homepage + experience + localizedCopy, /\{PRICE_|\{OFFICIAL_EMAIL\}|\{COMPLAINT_URL\}|lorem ipsum/i);
  assert.doesNotMatch(homepage + experience + localizedCopy, /100% (?:точн|безопас|secure)|гарантируем результат/i);
  assert.match(localizedCopy, /не заменяет/);
  assert.match(localizedCopy, /almashtirmaydi/);
});

test("public surface does not accept sensitive legal text or files", () => {
  const homepage = fs.readFileSync("app/components/public/JuroHomepage.tsx", "utf8");
  const analytics = fs.readFileSync("lib/analytics.ts", "utf8");
  const analyticsUi = fs.readFileSync("app/components/public/PublicAnalytics.tsx", "utf8");
  const worker = fs.readFileSync("worker/index.ts", "utf8");
  assert.doesNotMatch(homepage, /type="file"|<textarea|FormData/);
  assert.match(analytics, /juro-cookie-consent/);
  assert.match(analytics, /JSON\.stringify\(\{ event, \.\.\.payload \}\)/);
  assert.match(worker, /keys\.join\(","\) !== "accountType,event,locale"/);
  assert.doesNotMatch(worker, /cf-connecting-ip|user-agent|referer/i);
  for (const event of ["landing_view", "start_scenario", "source_opened", "lawyer_viewed"]) {
    assert.match(analytics + analyticsUi, new RegExp(event));
  }
});

test("public analytics remains optional, first-party and reconfigurable", () => {
  const analytics = fs.readFileSync("lib/analytics.ts", "utf8");
  const analyticsUi = fs.readFileSync("app/components/public/PublicAnalytics.tsx", "utf8");
  const chrome = fs.readFileSync("app/components/public/SiteChrome.tsx", "utf8");
  assert.match(analytics, /juro_consent/);
  assert.match(analytics, /Domain=\.juro\.uz; Secure/);
  assert.match(analytics, /readAnalyticsConsent\(\) !== "analytics"/);
  assert.match(analyticsUi, /"essential"/);
  assert.match(analyticsUi, /"analytics"/);
  assert.match(chrome, /openAnalyticsConsentSettings/);
});
