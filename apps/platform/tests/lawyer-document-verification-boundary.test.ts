import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);

test("lawyer verification is voluntary, case-scoped, and invalidated on a new document version", async () => {
  const [route, revisions, migration] = await Promise.all([
    readFile(new URL("app/api/platform/document-analysis/[analysisId]/lawyer-verification/route.ts", root), "utf8"),
    readFile(new URL("lib/document-analysis/revisions.ts", root), "utf8"),
    readFile(new URL("drizzle/0118_document_analysis_lawyer_verification.sql", root), "utf8"),
  ]);
  assert.match(route, /lawyer_access_grants/);
  assert.match(route, /document_version_id/);
  assert.match(route, /LAWYER_CASE_ACCESS_REQUIRED/);
  assert.match(route, /не является одобрением/u);
  assert.match(revisions, /lawyer_verifications_require_recheck/);
  assert.match(revisions, /status='needs_recheck'/);
  assert.match(migration, /UNIQUE INDEX.*analysis_id.*document_version_id.*lawyer_user_id/s);
});
