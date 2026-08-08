import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, Zip, ZipDeflate, zipSync } from "fflate";
import {
  ArchiveInspectionError,
  inspectArchiveBytes,
  verifyArchiveBytes,
} from "../lib/document-analysis/archive-inspector";

test("bounded ZIP packages accept only supported safe document members", () => {
  const bytes = zipSync({ "contract.pdf": strToU8("%PDF-1.7 safe"), "photo.png": strToU8("png") });
  const result = inspectArchiveBytes(bytes, "application/zip");
  assert.equal(result.fileCount, 2);
  assert.equal(result.docxPackage, false);
  assert.throws(
    () => inspectArchiveBytes(zipSync({ "../escape.pdf": strToU8("x") }), "application/zip"),
    (error) => error instanceof ArchiveInspectionError && error.code === "ARCHIVE_PATH_UNSAFE",
  );
  assert.throws(
    () => inspectArchiveBytes(zipSync({ "nested.zip": strToU8("PK") }), "application/zip"),
    (error) => error instanceof ArchiveInspectionError && error.code === "ARCHIVE_NESTED_UNSUPPORTED",
  );
  assert.throws(
    () => inspectArchiveBytes(zipSync({ "script.exe": strToU8("MZ") }), "application/zip"),
    (error) => error instanceof ArchiveInspectionError && error.code === "ARCHIVE_MEMBER_UNSUPPORTED",
  );
});

test("ZIP inspection rejects expansion bombs and more than twenty package files", () => {
  assert.throws(
    () => inspectArchiveBytes(zipSync({ "large.pdf": new Uint8Array(256 * 1024) }, { level: 9 }), "application/zip"),
    (error) => error instanceof ArchiveInspectionError && error.code === "ARCHIVE_RATIO_LIMIT",
  );
  const files = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`file-${index}.pdf`, strToU8("safe")])) as Record<string, Uint8Array>;
  assert.throws(
    () => inspectArchiveBytes(zipSync(files), "application/zip"),
    (error) => error instanceof ArchiveInspectionError && error.code === "ARCHIVE_FILE_LIMIT",
  );
});

test("DOCX inspection requires core OOXML parts and rejects active content", () => {
  const required = {
    "[Content_Types].xml": strToU8("<Types/>"),
    "_rels/.rels": strToU8("<Relationships/>"),
    "word/document.xml": strToU8("<w:document/>"),
  };
  assert.equal(inspectArchiveBytes(zipSync(required), "application/vnd.openxmlformats-officedocument.wordprocessingml.document").docxPackage, true);
  assert.throws(
    () => inspectArchiveBytes(zipSync({ "[Content_Types].xml": strToU8("x") }), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    (error) => error instanceof ArchiveInspectionError && error.code === "DOCX_STRUCTURE_INVALID",
  );
  assert.throws(
    () => inspectArchiveBytes(zipSync({ ...required, "word/vbaProject.bin": strToU8("macro") }), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    (error) => error instanceof ArchiveInspectionError && error.code === "DOCX_ACTIVE_CONTENT",
  );
});

test("local ZIP headers must identify the exact central-directory member", () => {
  const bytes = zipSync({ "contract.pdf": strToU8("safe payload") }, { level: 0 });
  const tampered = bytes.slice();
  const view = new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength);
  const localNameLength = view.getUint16(26, true);
  assert.ok(localNameLength > 0);
  tampered[30] = "x".charCodeAt(0);
  assert.throws(
    () => inspectArchiveBytes(tampered, "application/zip"),
    (error) => error instanceof ArchiveInspectionError && error.code === "ARCHIVE_LOCAL_HEADER_MISMATCH",
  );

  const prefixed = new Uint8Array(bytes.byteLength + 2);
  prefixed.set([0x4d, 0x5a]);
  prefixed.set(bytes, 2);
  assert.throws(
    () => inspectArchiveBytes(prefixed, "application/zip"),
    (error) => error instanceof ArchiveInspectionError && error.code === "ARCHIVE_CORRUPT",
  );
});

test("deep archive verification streams deflate and rejects corrupted CRC payloads", async () => {
  const deflated = zipSync({ "contract.pdf": strToU8("A normal legal document payload repeated. ".repeat(20)) }, { level: 6 });
  const verified = await verifyArchiveBytes(deflated, "application/zip");
  assert.equal(verified.fileCount, 1);

  const stored = zipSync({ "contract.pdf": strToU8("stored payload for crc") }, { level: 0 });
  const corrupted = stored.slice();
  const view = new DataView(corrupted.buffer, corrupted.byteOffset, corrupted.byteLength);
  const dataStart = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  corrupted[dataStart] = corrupted[dataStart]! ^ 0xff;
  await assert.rejects(
    () => verifyArchiveBytes(corrupted, "application/zip"),
    (error) => error instanceof ArchiveInspectionError && error.code === "ARCHIVE_CRC_MISMATCH",
  );
});

test("streaming ZIP data descriptors are matched to their central-directory evidence", async () => {
  const bytes = await streamingZip("contract.pdf", strToU8("streaming legal payload"));
  const result = await verifyArchiveBytes(bytes, "application/zip");
  assert.equal(result.fileCount, 1);
});

function streamingZip(name: string, payload: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const archive = new Zip((error, chunk, final) => {
      if (error) {
        reject(error);
        return;
      }
      chunks.push(chunk);
      if (!final) return;
      const output = new Uint8Array(chunks.reduce((total, value) => total + value.byteLength, 0));
      let offset = 0;
      for (const value of chunks) {
        output.set(value, offset);
        offset += value.byteLength;
      }
      resolve(output);
    });
    const entry = new ZipDeflate(name, { level: 6 });
    archive.add(entry);
    entry.push(payload, true);
    archive.end();
  });
}
