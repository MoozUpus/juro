import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseIdentityKeyring } from "../lib/auth/keyring";
import {
  aiDiscoveryLocale,
  aiText,
  parseAiOutputLocale,
} from "../lib/ai/localization";
import { saveAiActionPlanInputSchema } from "../lib/ai/action-plan-save";
import { legalChatResponseSchema } from "../lib/ai/legal-chat-schema";
import {
  aiSuggestedDocumentRequestSchema,
  resolveAiSuggestedDocumentInputSchema,
} from "../lib/ai/suggested-document";
import {
  createGuestAiSession,
  guestSessionCookie,
  resolveGuestAiSession,
} from "../lib/ai/guest-session";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const UUID = "00000000-0000-4000-8000-000000000001";

function encodedKey(seed: number): string {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function keyring() {
  return parseIdentityKeyring(JSON.stringify({
    active: "v1",
    versions: { v1: { aead: encodedKey(1), hmac: encodedKey(33) } },
  }));
}

test("AI output locale supports English while official-source discovery stays RU/UZ bounded", () => {
  assert.equal(aiText("en", "Русский", "O‘zbekcha", "English"), "English");
  assert.equal(parseAiOutputLocale("en"), "en");
  assert.equal(parseAiOutputLocale("de"), "ru");
  assert.equal(aiDiscoveryLocale("en"), "ru");
  assert.equal(aiDiscoveryLocale("uz"), "uz");
});

test("AI schemas accept explicit English output contracts", () => {
  const baseResult = {
    responseKind: "answer",
    summary: "A verified-source answer",
    answer: "The answer is grounded in the cited official source.",
    language: "en",
    jurisdiction: "UZ",
    answerMode: "short",
    reasoningMode: "fast",
    clarificationQuestions: [],
    confirmedFindings: [],
    assumptions: [],
    risks: [],
    sources: [],
    requiredDocuments: [],
    actionPlan: [],
    deadlines: [],
    successOutlook: null,
    urgency: "normal",
    suggestedDocument: null,
    suggestLawyer: false,
    legalDatabaseAsOf: "2026-09-05T00:00:00.000Z",
  };
  assert.equal(legalChatResponseSchema.safeParse(baseResult).success, true);
  assert.equal(saveAiActionPlanInputSchema.safeParse({ assistantMessageId: UUID, locale: "en" }).success, true);
  assert.equal(resolveAiSuggestedDocumentInputSchema.safeParse({ assistantMessageId: UUID, locale: "en" }).success, true);
  assert.equal(aiSuggestedDocumentRequestSchema.safeParse({ action: "preview", assistantMessageId: UUID, locale: "en" }).success, true);
});

test("English guest sessions survive encrypted creation and database hydration", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const identityKeyring = keyring();
    const created = await createGuestAiSession({
      db: d1,
      keyring: identityKeyring,
      connectingIp: "203.0.113.77",
      locale: "en",
      now: "2026-09-05T09:00:00.000Z",
    });
    const cookie = guestSessionCookie(created.session.id, created.token, "https://app.juro.uz/api/guest/ai");
    const resolved = await resolveGuestAiSession({
      db: d1,
      keyring: identityKeyring,
      request: new Request("https://app.juro.uz/api/guest/ai", {
        headers: { cookie: cookie.split(";", 1)[0] },
      }),
      now: "2026-09-05T09:01:00.000Z",
    });
    assert.equal(resolved.locale, "en");
    assert.equal(sqlite.prepare("SELECT locale FROM guest_ai_sessions WHERE id=?").get(created.session.id)?.locale, "en");
  } finally {
    sqlite.close();
  }
});

test("authenticated and guest AI surfaces contain explicit English copy without binary UI fallback", () => {
  const authenticatedClient = readFileSync(new URL("../app/_platform/AiLawyerClient.tsx", import.meta.url), "utf8");
  const guestClient = readFileSync(new URL("../app/_guest/GuestAiClient.tsx", import.meta.url), "utf8");

  for (const source of [authenticatedClient, guestClient]) {
    assert.match(source, /aiText\(/u);
    assert.match(source, /PlatformLocale/u);
    assert.doesNotMatch(source, /\bconst\s+ru\s*=|locale\s*===\s*["']ru["']/u);
  }
  assert.match(authenticatedClient, /"JURO AI Lawyer"/u);
  assert.match(authenticatedClient, /"Legal basis in Lex\.uz"/u);
  assert.match(guestClient, /"Ask JURO AI Lawyer one question"/u);
  assert.match(guestClient, /"Guest data is deleted after 24 hours"/u);
  assert.match(guestClient, /"x-juro-locale": locale/u);
});

test("AI routes preserve English output and keep Lex.uz discovery on a supported source locale", () => {
  const authenticatedRoute = readFileSync(new URL("../app/api/platform/ai/route.ts", import.meta.url), "utf8");
  const guestRoute = readFileSync(new URL("../app/api/guest/ai/route.ts", import.meta.url), "utf8");

  for (const source of [authenticatedRoute, guestRoute]) {
    assert.match(source, /parseAiOutputLocale/u);
    assert.match(source, /const discoveryLocale = aiDiscoveryLocale\(locale\)/u);
    assert.match(source, /retrieveCorpusAwareLegalSources\([\s\S]*?locale: discoveryLocale/u);
    assert.match(source, /retrieveSecondaryInternetSources\([\s\S]*?locale: discoveryLocale/u);
    assert.match(source, /Lex\.uz/u);
    assert.doesNotMatch(source, /(?:body\?\.locale|parsed\.data\.locale)\s*===\s*["']uz["']\s*\?\s*["']uz["']\s*:\s*["']ru["']/u);
  }
  assert.match(authenticatedRoute, /question: rewrite\.query, locale, answerMode/u);
  assert.match(guestRoute, /locale:\s*z\.enum\(\["ru",\s*"uz",\s*"en"\]\)/u);
  assert.match(guestRoute, /"The AI provider is temporarily unavailable\."/u);
});

test("English document handoff fails closed until a reviewed English template exists", () => {
  const route = readFileSync(new URL("../app/api/platform/ai/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/ai/suggested-document.ts", import.meta.url), "utf8");
  const endpoint = readFileSync(new URL("../app/api/platform/ai/suggested-document/route.ts", import.meta.url), "utf8");

  assert.match(route, /if \(locale === "en"\) return \[\];/u);
  assert.match(service, /input\.locale === "en"[\s\S]*AI_SUGGESTED_DOCUMENT_UNAVAILABLE/u);
  assert.match(endpoint, /"A suitable published English template is not available yet\."/u);
});

test("directly related AI endpoints return deliberate English errors", () => {
  const paths = [
    "../app/api/platform/ai/action-plan/route.ts",
    "../app/api/platform/ai/suggested-document/route.ts",
    "../app/api/platform/ai/feedback/route.ts",
    "../app/api/platform/ai/intake/route.ts",
    "../app/api/platform/ai/intake/consume/route.ts",
    "../app/api/platform/ai/intake/finalize/route.ts",
  ];
  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /aiText\(/u, `${path} must select explicit RU, UZ and EN copy`);
    assert.match(source, /\b(?:The|Enter|Finish|Secure|Confirm|Your)\b/u, `${path} must contain professional English copy`);
  }
});
