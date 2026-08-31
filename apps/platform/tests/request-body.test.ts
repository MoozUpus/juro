import assert from "node:assert/strict";
import test from "node:test";

import { requiredContentLength } from "../lib/request-body";

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
