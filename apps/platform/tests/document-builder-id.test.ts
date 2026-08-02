import assert from "node:assert/strict";
import test from "node:test";
import { createRowId } from "../lib/document-builder/id";

test("document-builder row identifiers are UUIDs from Web Crypto", () => {
  const identifier = createRowId();
  assert.match(
    identifier,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});
