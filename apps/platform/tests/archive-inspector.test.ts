import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { ArchiveInspectionError, inspectArchiveBytes } from "../lib/document-analysis/archive-inspector";

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
