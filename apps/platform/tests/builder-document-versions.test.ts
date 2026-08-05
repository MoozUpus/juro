import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDocumentVersion, DocumentVersionError, listDocumentVersions, restoreDocumentVersion } from "../lib/document-builder/document-versions";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-05T14:00:00.000Z";
const documentId = "00000000-0000-4000-8000-000000000001";

class FakeR2Bucket {
  readonly objects = new Map<string, { bytes: Uint8Array; sha256: string }>();
  putCalls = 0;
  failPut = false;
  async head(key: string) { const value = this.objects.get(key); return value ? this.metadata(key, value) : null; }
  async get(key: string) {
    const value = this.objects.get(key); if (!value) return null;
    return { ...this.metadata(key, value), body: new ReadableStream(), bodyUsed: false, arrayBuffer: async () => value.bytes.slice().buffer, text: async () => new TextDecoder().decode(value.bytes), json: async () => JSON.parse(new TextDecoder().decode(value.bytes)), blob: async () => new Blob([value.bytes.slice().buffer as ArrayBuffer]) };
  }
  async put(key: string, value: unknown, options?: { onlyIf?: Headers; sha256?: string }) {
    this.putCalls += 1; if (this.failPut) throw new Error("synthetic R2 failure");
    if (options?.onlyIf?.get("if-none-match") === "*" && this.objects.has(key)) return null;
    assert.ok(value instanceof Uint8Array); const bytes = value.slice(); const sha256 = await sha256Hex(bytes); assert.equal(options?.sha256, sha256);
    const stored = { bytes, sha256 }; this.objects.set(key, stored); return this.metadata(key, stored);
  }
  private metadata(key: string, value: { bytes: Uint8Array; sha256: string }) { return { key, version: "synthetic", size: value.bytes.byteLength, etag: value.sha256, httpEtag: `"${value.sha256}"`, uploaded: new Date(now), httpMetadata: { contentType: "application/json; charset=utf-8" }, customMetadata: {}, range: undefined, checksums: { sha256: hexArrayBuffer(value.sha256) }, storageClass: "Standard", ssecKeyMd5: undefined, writeHttpMetadata() {} }; }
}

test("Builder checkpoints are immutable, owner-scoped, idempotent and restorable", async () => {
  const { sqlite, d1 } = seed(); const bucket = new FakeR2Bucket();
  const base = { db: d1, bucket: bucket as unknown as R2Bucket, documentId, workspaceId: "workspace-a", ownerUserId: "user-a" };
  try {
    const created = await createDocumentVersion({ ...base, revision: 1, idempotencyKey: "builder-version-test-0001" });
    assert.equal(created.replayed, false); assert.equal(created.version.status, "ready"); assert.equal(bucket.putCalls, 1);
    const replay = await createDocumentVersion({ ...base, revision: 1, idempotencyKey: "builder-version-test-0001" });
    assert.equal(replay.replayed, true); assert.equal(replay.version.id, created.version.id); assert.equal(bucket.putCalls, 1);
    assert.equal((await listDocumentVersions({ db: d1, documentId, workspaceId: "workspace-a", ownerUserId: "user-a" })).length, 1);

    sqlite.prepare("UPDATE documents SET title='Changed',revision=2,updated_at=? WHERE id=?").run(now, documentId);
    sqlite.prepare("UPDATE document_current_content SET final_content='Changed legal text',manually_edited=1,updated_at=? WHERE document_id=?").run(now, documentId);
    const restored = await restoreDocumentVersion({ ...base, versionId: created.version.id, revision: 2, idempotencyKey: "builder-restore-test-0001" });
    assert.equal(restored.revision, 3); assert.equal(restored.replayed, false);
    const current = sqlite.prepare("SELECT title,revision FROM documents WHERE id=?").get(documentId) as { title: string; revision: number };
    const content = sqlite.prepare("SELECT final_content AS finalContent FROM document_current_content WHERE document_id=?").get(documentId) as { finalContent: string };
    assert.deepEqual({ ...current }, { title: "Original", revision: 3 }); assert.equal(content.finalContent, "Original legal text");
    const restoreReplay = await restoreDocumentVersion({ ...base, versionId: created.version.id, revision: 2, idempotencyKey: "builder-restore-test-0001" });
    assert.equal(restoreReplay.replayed, true); assert.equal((sqlite.prepare("SELECT count(*) AS total FROM builder_document_version_restore_events").get() as { total: number }).total, 1);
    assert.equal((sqlite.prepare("SELECT source FROM document_revisions WHERE document_id=? AND revision=3").get(documentId) as { source: string }).source, "restore_version");
  } finally { sqlite.close(); }
});

test("Builder versions fail closed across tenants and retry R2 with the same key", async () => {
  const { sqlite, d1 } = seed(); const bucket = new FakeR2Bucket(); bucket.failPut = true;
  try {
    await assert.rejects(createDocumentVersion({ db: d1, bucket: bucket as unknown as R2Bucket, documentId, workspaceId: "workspace-b", ownerUserId: "user-b", revision: 1, idempotencyKey: "builder-version-foreign-0001" }), (error: unknown) => error instanceof DocumentVersionError && error.code === "DOCUMENT_NOT_FOUND");
    const input = { db: d1, bucket: bucket as unknown as R2Bucket, documentId, workspaceId: "workspace-a", ownerUserId: "user-a", revision: 1, idempotencyKey: "builder-version-retry-0001" };
    await assert.rejects(createDocumentVersion(input), (error: unknown) => error instanceof DocumentVersionError && error.code === "VERSION_STORAGE_FAILED");
    assert.deepEqual({ ...(sqlite.prepare("SELECT status,attempt_count AS attempts,last_error_code AS code FROM builder_document_versions").get() as object) }, { status: "pending", attempts: 1, code: "R2_WRITE_FAILED" });
    bucket.failPut = false; const retry = await createDocumentVersion(input); assert.equal(retry.replayed, true); assert.equal(retry.version.status, "ready");
  } finally { sqlite.close(); }
});

test("Builder version routes and RU/UZ UI retain owner, CSRF and recovery contracts", async () => {
  const root = new URL("../", import.meta.url);
  const [versionsRoute, restoreRoute, component, configured] = await Promise.all([
    readFile(new URL("app/api/document-builder/documents/[id]/versions/route.ts", root), "utf8"),
    readFile(new URL("app/api/document-builder/documents/[id]/versions/[versionId]/restore/route.ts", root), "utf8"),
    readFile(new URL("app/_document-builder/_components/BuilderVersionHistory.tsx", root), "utf8"),
    readFile(new URL("app/_document-builder/_components/ConfigurableDocumentBuilder.tsx", root), "utf8"),
  ]);
  for (const route of [versionsRoute, restoreRoute]) {
    assert.match(route, /assertSafeWrite/);
    assert.match(route, /requireApiUser/);
    assert.match(route, /requireOwner/);
    assert.match(route, /idempotency-key/);
  }
  assert.match(component, /Versiyalar tarixi/);
  assert.match(component, /История версий/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /window\.confirm/);
  assert.match(configured, /saveQueue/);
  assert.match(configured, /skipNextAutosave/);
});

function seed() {
  const fixture = sqliteD1Fixture(); const { sqlite } = fixture;
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('user-a','a@example.invalid',?,?),('user-b','b@example.invalid',?,?)").run(now, now, now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES ('workspace-a','individual','A',?,?),('workspace-b','individual','B',?,?)").run(now, now, now, now);
  sqlite.prepare("INSERT INTO workspace_members(id,workspace_id,user_id,role,status,joined_at,created_at,updated_at) VALUES ('member-a','workspace-a','user-a','owner','active',?,?,?),('member-b','workspace-b','user-b','owner','active',?,?,?)").run(now, now, now, now, now, now);
  sqlite.prepare("INSERT INTO document_templates(id,key,category,active,created_at,updated_at) VALUES ('template-a','template-a','contracts',1,?,?)").run(now, now);
  sqlite.prepare(`INSERT INTO documents (id,workspace_id,owner_user_id,template_id,template_code,template_version,language,participant_mode,title,category,status,revision,created_at,updated_at) VALUES (?,'workspace-a','user-a','template-a','1234567','1','ru','configurable','Original','contracts','Черновик',1,?,?)`).run(documentId, now, now);
  sqlite.prepare("INSERT INTO document_answers(document_id,answers_json,updated_at) VALUES (?,?,?)").run(documentId, JSON.stringify({ "employee.fullName": "Alice", "employer.name": "Acme" }), now);
  sqlite.prepare("INSERT INTO document_current_content(document_id,auto_content,final_content,manually_edited,updated_at) VALUES (?,'Original legal text','Original legal text',0,?)").run(documentId, now);
  return fixture;
}
async function sha256Hex(value: Uint8Array) { const digest = await crypto.subtle.digest("SHA-256", value.slice().buffer); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function hexArrayBuffer(value: string) { const bytes = new Uint8Array(value.length / 2); for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16); return bytes.buffer; }
