import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PUBLIC_API_BODY_LIMIT_BYTES,
  DOCUMENT_BUILDER_API_BODY_LIMIT_BYTES,
  LAWYER_PROFILE_PHOTO_BODY_LIMIT_BYTES,
  publicApiRequestBodyLimit,
  requestWithBoundedBody,
  requiredContentLength,
} from "../lib/request-body";

function request(contentLength?: string): Request {
  return new Request("https://app.juro.uz/upload", {
    method: "POST",
    headers: contentLength === undefined ? undefined : { "content-length": contentLength },
  });
}

test("required content length rejects missing, malformed, empty, and oversized bodies before parsing", () => {
  assert.deepEqual(requiredContentLength(request(), 100), { ok: false, reason: "missing" });
  assert.deepEqual(requiredContentLength(request("1e2"), 100), { ok: false, reason: "invalid" });
  assert.deepEqual(requiredContentLength(request("0"), 100), { ok: false, reason: "invalid" });
  assert.deepEqual(requiredContentLength(request("101"), 100), { ok: false, reason: "too_large" });
});

test("required content length preserves an ordinary bounded upload", () => {
  assert.deepEqual(requiredContentLength(request("100"), 100), { ok: true, bytes: 100 });
});

test("public API body policy protects JSON routes without buffering streaming uploads", () => {
  assert.equal(publicApiRequestBodyLimit("/api/platform/team", "POST"), DEFAULT_PUBLIC_API_BODY_LIMIT_BYTES);
  assert.equal(publicApiRequestBodyLimit("/api/document-builder/configured-documents/1", "PATCH"), DOCUMENT_BUILDER_API_BODY_LIMIT_BYTES);
  assert.equal(publicApiRequestBodyLimit("/api/platform/voice/recordings/1", "PATCH"), DEFAULT_PUBLIC_API_BODY_LIMIT_BYTES);
  assert.equal(publicApiRequestBodyLimit("/api/platform/lawyer-profile/photo", "POST"), LAWYER_PROFILE_PHOTO_BODY_LIMIT_BYTES);
  assert.equal(publicApiRequestBodyLimit("/api/platform/voice/recordings/1", "PUT"), null);
  assert.equal(publicApiRequestBodyLimit("/api/platform/document-analysis/uploads/1", "PUT"), null);
  assert.equal(publicApiRequestBodyLimit("/api/document-builder/documents/1/attachments", "POST"), null);
  assert.equal(publicApiRequestBodyLimit("/api/platform/team", "GET"), null);
});

test("bounded request rejects declared, chunked, and understated oversized bodies", async () => {
  const declared = await requestWithBoundedBody(new Request("https://app.juro.uz/api/platform/team", {
    method: "POST",
    headers: { "content-length": "129" },
    body: "{}",
  }), 128);
  assert.deepEqual(declared, { ok: false, reason: "too_large" });

  for (const declaredLength of [undefined, "1"]) {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(64));
        if (pulls >= 20) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const bounded = await requestWithBoundedBody(new Request("https://app.juro.uz/api/platform/team", {
      method: "POST",
      headers: declaredLength === undefined ? undefined : { "content-length": declaredLength },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" }), 128);
    assert.deepEqual(bounded, { ok: false, reason: "too_large" });
    assert.equal(cancelled, true);
    assert.ok(pulls < 20);
  }
});

test("bounded request preserves ordinary JSON and maximum bilingual document content", async () => {
  const ordinary = await requestWithBoundedBody(new Request("https://app.juro.uz/api/platform/team", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "viewer" }),
  }), DEFAULT_PUBLIC_API_BODY_LIMIT_BYTES);
  assert.equal(ordinary.ok, true);
  if (ordinary.ok) assert.deepEqual(await ordinary.request.json(), { role: "viewer" });

  const maximumDocument = JSON.stringify({
    autoContent: "ў".repeat(500_000),
    finalContent: "ю".repeat(500_000),
  });
  const documentRequest = await requestWithBoundedBody(new Request("https://app.juro.uz/api/document-builder/configured-documents/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: maximumDocument,
  }), DOCUMENT_BUILDER_API_BODY_LIMIT_BYTES);
  assert.equal(documentRequest.ok, true);
  if (documentRequest.ok) assert.equal(await documentRequest.request.text(), maximumDocument);
});
