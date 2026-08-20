import assert from "node:assert/strict";
import test from "node:test";

import { createOwnerCorpusUpload, OwnerCorpusUploadError } from "../lib/legal-corpus/owner-upload";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = new Date("2026-08-16T12:00:00.000Z");

class MemoryBucket {
  readonly objects = new Map<string, { bytes: Uint8Array; sha256: string }>();

  async put(key: string, value: unknown, options?: { onlyIf?: Headers; sha256?: string }) {
    if (!(value instanceof Uint8Array)) throw new TypeError("Expected bytes");
    if (options?.onlyIf?.get("if-none-match") === "*" && this.objects.has(key)) return null;
    const bytes = value.slice();
    const sha256 = await sha256Hex(bytes);
    assert.equal(options?.sha256, sha256);
    const stored = { bytes, sha256 };
    this.objects.set(key, stored);
    return metadata(key, stored);
  }

  async head(key: string) {
    const stored = this.objects.get(key);
    return stored ? metadata(key, stored) : null;
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

function seedOwner() {
  const fixture = sqliteD1Fixture();
  const nowIso = now.toISOString();
  fixture.sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?)")
    .run("owner-user", "owner@example.test", nowIso, nowIso);
  fixture.sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("owner-workspace", "individual", "Owner workspace", nowIso, nowIso);
  fixture.sqlite.prepare(`INSERT INTO workspace_members
    (id,workspace_id,user_id,role,status,joined_at,created_at,updated_at)
    VALUES ('owner-member','owner-workspace','owner-user','owner','active',?,?,?)`).run(nowIso, nowIso, nowIso);
  fixture.sqlite.prepare(`INSERT INTO platform_staff_assignments
    (id,user_id,role,grant_source,granted_by_user_id,grant_reason,granted_at,expires_at,
     revoked_at,revocation_source,revoked_by_user_id,revocation_reason,created_at,updated_at)
    VALUES ('owner-assignment','owner-user','administrator','operator_bootstrap',NULL,
     'Protected owner corpus upload','2026-08-16T10:00:00.000Z','2026-08-17T10:00:00.000Z',
     NULL,NULL,NULL,NULL,?,?)`).run(nowIso, nowIso);
  return fixture;
}

test("protected owner upload enters private quarantine and queues malware scan without legal approval", async () => {
  const fixture = seedOwner();
  const quarantine = new MemoryBucket();
  const primary = new MemoryBucket();
  const bytes = new TextEncoder().encode("%PDF-1.7\nJURO owner legal material\n%%EOF");
  const result = await createOwnerCorpusUpload({
    env: {
      APP_ENV: "staging",
      DB: fixture.d1,
      BUCKET: primary as unknown as R2Bucket,
      QUARANTINE_BUCKET: quarantine as unknown as R2Bucket,
      LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST: "true",
    },
    staff: {
      userId: "owner-user",
      sessionId: "owner-session",
      assignmentIds: ["owner-assignment"],
      mfaVerifiedAt: "2026-08-16T11:55:00.000Z",
    },
    idempotencyKey: "owner-upload:00000000-0000-4000-8000-000000000001",
    fileName: "owner-act.pdf",
    mimeType: "application/pdf",
    bytes,
    title: "Материал владельца JURO",
    language: "ru",
    rightsConfirmed: true,
    reason: "Прямая загрузка владельца из защищённой панели JURO.",
    now,
  });
  assert.equal(result.status, "scan_queued");
  const state = fixture.sqlite.prepare(`SELECT analysis.status AS analysisStatus,file.kind AS fileKind,
      request.status AS requestStatus,request.rights_confirmed AS rightsConfirmed
    FROM document_analyses analysis JOIN document_files file ON file.id=analysis.uploaded_file_id
    JOIN legal_corpus_owner_upload_requests request ON request.analysis_id=analysis.id
    WHERE analysis.id=?`).get(result.analysisId) as {
    analysisStatus: string; fileKind: string; requestStatus: string; rightsConfirmed: number;
  };
  assert.equal(state.analysisStatus, "quarantined");
  assert.equal(state.fileKind, "analysis_quarantined");
  assert.equal(state.requestStatus, "scan_queued");
  assert.equal(state.rightsConfirmed, 1);
  const job = fixture.sqlite.prepare("SELECT queue_binding AS queueBinding,job_type AS jobType FROM job_outbox WHERE subject_id=?")
    .get(result.analysisId) as { queueBinding: string; jobType: string };
  assert.equal(job.queueBinding, "MALWARE_SCAN_QUEUE");
  assert.equal(job.jobType, "malware.scan");
  assert.equal(quarantine.objects.size, 1);
  assert.equal(primary.objects.size, 0);
  assert.throws(
    () => fixture.sqlite.prepare("UPDATE legal_corpus_owner_upload_requests SET title='tampered title' WHERE analysis_id=?").run(result.analysisId),
    /AUTHORIZATION_IMMUTABLE/,
  );
});

test("owner upload rejects stale MFA and active HTML before publication", async () => {
  const stale = seedOwner();
  await assert.rejects(
    createOwnerCorpusUpload({
      env: {
        APP_ENV: "staging", DB: stale.d1,
        BUCKET: new MemoryBucket() as unknown as R2Bucket,
        QUARANTINE_BUCKET: new MemoryBucket() as unknown as R2Bucket,
        LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST: "true",
      },
      staff: {
        userId: "owner-user", sessionId: "owner-session", assignmentIds: ["owner-assignment"],
        mfaVerifiedAt: "2026-08-16T11:40:00.000Z",
      },
      idempotencyKey: "owner-upload:00000000-0000-4000-8000-000000000002",
      fileName: "owner.txt", mimeType: "text/plain", bytes: new TextEncoder().encode("Статья 1. Правовая норма."),
      title: "Материал владельца", language: "ru", rightsConfirmed: true,
      reason: "Прямая загрузка владельца из защищённой панели JURO.", now,
    }),
    (error: unknown) => error instanceof OwnerCorpusUploadError && error.code === "OWNER_UPLOAD_ACCESS_DENIED",
  );

  const active = seedOwner();
  const quarantine = new MemoryBucket();
  await assert.rejects(
    createOwnerCorpusUpload({
      env: {
        APP_ENV: "staging", DB: active.d1,
        BUCKET: new MemoryBucket() as unknown as R2Bucket,
        QUARANTINE_BUCKET: quarantine as unknown as R2Bucket,
        LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST: "true",
      },
      staff: {
        userId: "owner-user", sessionId: "owner-session", assignmentIds: ["owner-assignment"],
        mfaVerifiedAt: "2026-08-16T11:55:00.000Z",
      },
      idempotencyKey: "owner-upload:00000000-0000-4000-8000-000000000003",
      fileName: "owner.html", mimeType: "text/html",
      bytes: new TextEncoder().encode("<article onclick=\"steal()\">Статья 1. Правовая норма.</article>"),
      title: "Материал владельца", language: "ru", rightsConfirmed: true,
      reason: "Прямая загрузка владельца из защищённой панели JURO.", now,
    }),
    (error: unknown) => error instanceof OwnerCorpusUploadError && error.code === "OWNER_UPLOAD_UNSAFE",
  );
  assert.equal(quarantine.objects.size, 0);
  assert.equal(Number((active.sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_owner_upload_requests").get() as { count: number }).count), 0);
});

function metadata(key: string, stored: { bytes: Uint8Array; sha256: string }) {
  return {
    key, version: "test", size: stored.bytes.byteLength, etag: stored.sha256,
    httpEtag: `"${stored.sha256}"`, uploaded: now, httpMetadata: {}, customMetadata: {}, range: undefined,
    checksums: { sha256: hexArrayBuffer(stored.sha256) }, storageClass: "Standard", ssecKeyMd5: undefined,
    writeHttpMetadata() {},
  };
}

function hexArrayBuffer(value: string): ArrayBuffer {
  return Uint8Array.from(value.match(/.{2}/gu) ?? [], (part) => Number.parseInt(part, 16)).buffer;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
