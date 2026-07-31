const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const MAX_COMMENT_BYTES = 65_535;
const MAX_ARCHIVE_ENTRIES = 200;
const MAX_PACKAGE_FILES = 20;
const MAX_DOCX_ENTRIES = 1_000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_EXPANSION_RATIO = 100;

const supportedPackageExtensions = new Set(["pdf", "docx", "jpg", "jpeg", "png"]);
const nestedArchiveExtensions = new Set(["zip", "7z", "rar", "tar", "gz", "tgz", "bz2", "xz", "docm", "xlsm"]);

export type ArchiveInspection = {
  entryCount: number;
  fileCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
  docxPackage: boolean;
};

export class ArchiveInspectionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ArchiveInspectionError";
  }
}

export function inspectArchiveBytes(bytes: Uint8Array, mimeType: string): ArchiveInspection {
  if (bytes.byteLength < 22) fail("ARCHIVE_CORRUPT", "ZIP does not contain an end record.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) {
    fail("ARCHIVE_SPLIT_UNSUPPORTED", "Split or multi-disk ZIP archives are not accepted.");
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    fail("ARCHIVE_ZIP64_UNSUPPORTED", "ZIP64 metadata is not accepted for this bounded upload path.");
  }
  const docxPackage = mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const entryLimit = docxPackage ? MAX_DOCX_ENTRIES : MAX_ARCHIVE_ENTRIES;
  if (entryCount < 1 || entryCount > entryLimit) {
    fail("ARCHIVE_ENTRY_LIMIT", `Archive entry count must be between 1 and ${entryLimit}.`);
  }
  if (centralOffset + centralSize !== eocd || centralOffset + centralSize > bytes.byteLength) {
    fail("ARCHIVE_CORRUPT", "ZIP central directory bounds are inconsistent.");
  }

  const names = new Set<string>();
  let position = centralOffset;
  let fileCount = 0;
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (position + 46 > eocd || view.getUint32(position, true) !== CENTRAL_SIGNATURE) {
      fail("ARCHIVE_CORRUPT", "ZIP central directory entry is malformed.");
    }
    const versionMadeBy = view.getUint16(position + 4, true);
    const flags = view.getUint16(position + 8, true);
    const method = view.getUint16(position + 10, true);
    const compressed = view.getUint32(position + 20, true);
    const uncompressed = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const startDisk = view.getUint16(position + 34, true);
    const externalAttributes = view.getUint32(position + 38, true);
    const localOffset = view.getUint32(position + 42, true);
    const end = position + 46 + nameLength + extraLength + commentLength;
    if (!nameLength || end > eocd || startDisk !== 0 || localOffset >= centralOffset) {
      fail("ARCHIVE_CORRUPT", "ZIP entry bounds are inconsistent.");
    }
    if (compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff) {
      fail("ARCHIVE_ZIP64_UNSUPPORTED", "ZIP64 entries are not accepted.");
    }
    if ((flags & 0x1) !== 0) fail("ARCHIVE_ENCRYPTED", "Encrypted archive entries are not accepted.");
    if (method !== 0 && method !== 8) fail("ARCHIVE_COMPRESSION_UNSUPPORTED", "Only stored and deflated entries are accepted.");
    const nameBytes = bytes.subarray(position + 46, position + 46 + nameLength);
    const name = decodeName(nameBytes, (flags & 0x800) !== 0);
    validatePath(name);
    const canonical = name.normalize("NFKC").toLocaleLowerCase();
    if (names.has(canonical)) fail("ARCHIVE_DUPLICATE_ENTRY", "Duplicate archive paths are not accepted.");
    names.add(canonical);
    if ((versionMadeBy >>> 8) === 3 && (((externalAttributes >>> 16) & 0o170000) === 0o120000)) {
      fail("ARCHIVE_SYMLINK", "Symbolic links are not accepted in archives.");
    }
    const directory = name.endsWith("/");
    if (!directory) {
      fileCount += 1;
      if (compressed === 0 && uncompressed > 0) fail("ARCHIVE_RATIO_LIMIT", "Archive expansion ratio is unsafe.");
      if (compressed > 0 && uncompressed / compressed > MAX_EXPANSION_RATIO) {
        fail("ARCHIVE_RATIO_LIMIT", "Archive expansion ratio exceeds the safe limit.");
      }
      if (!docxPackage) validatePackageMember(name);
    }
    compressedBytes += compressed;
    uncompressedBytes += uncompressed;
    if (!Number.isSafeInteger(uncompressedBytes) || uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      fail("ARCHIVE_EXPANDED_SIZE_LIMIT", "Expanded archive size exceeds 200 MB.");
    }
    position = end;
  }
  if (position !== eocd) fail("ARCHIVE_CORRUPT", "ZIP central directory contains trailing ambiguity.");
  if (!docxPackage && (fileCount < 1 || fileCount > MAX_PACKAGE_FILES)) {
    fail("ARCHIVE_FILE_LIMIT", `A package must contain between 1 and ${MAX_PACKAGE_FILES} files.`);
  }
  if (compressedBytes > bytes.byteLength) fail("ARCHIVE_CORRUPT", "Compressed entry sizes exceed the archive size.");
  if (docxPackage) validateDocxPackage(names);
  return { entryCount, fileCount, compressedBytes, uncompressedBytes, docxPackage };
}

function findEocd(view: DataView): number {
  const first = Math.max(0, view.byteLength - 22 - MAX_COMMENT_BYTES);
  for (let offset = view.byteLength - 22; offset >= first; offset -= 1) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === view.byteLength) return offset;
  }
  fail("ARCHIVE_CORRUPT", "ZIP end record is missing or ambiguous.");
}

function decodeName(bytes: Uint8Array, utf8: boolean): string {
  if (!utf8 && bytes.some((byte) => byte > 0x7f)) {
    fail("ARCHIVE_FILENAME_ENCODING", "Non-UTF-8 non-ASCII archive names are not accepted.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("ARCHIVE_FILENAME_ENCODING", "Archive path is not valid UTF-8.");
  }
}

function validatePath(name: string) {
  if (name.length > 512 || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[a-z]:/iu.test(name)) {
    fail("ARCHIVE_PATH_UNSAFE", "Archive path is absolute or malformed.");
  }
  const segments = name.split("/").filter(Boolean);
  if (!segments.length || segments.length > 16 || segments.some((segment) => segment === "." || segment === "..")) {
    fail("ARCHIVE_PATH_UNSAFE", "Archive path escapes or exceeds the safe depth.");
  }
}

function validatePackageMember(name: string) {
  const leaf = name.split("/").at(-1) ?? "";
  const extension = leaf.split(".").at(-1)?.toLocaleLowerCase() ?? "";
  if (nestedArchiveExtensions.has(extension)) fail("ARCHIVE_NESTED_UNSUPPORTED", "Nested archives are not accepted.");
  if (!supportedPackageExtensions.has(extension)) fail("ARCHIVE_MEMBER_UNSUPPORTED", "Archive contains an unsupported file type.");
}

function validateDocxPackage(names: Set<string>) {
  for (const required of ["[content_types].xml", "_rels/.rels", "word/document.xml"]) {
    if (!names.has(required)) fail("DOCX_STRUCTURE_INVALID", "DOCX package is missing a required OOXML part.");
  }
  if ([...names].some((name) => name.endsWith("vbaproject.bin") || name.endsWith(".exe") || name.endsWith(".dll"))) {
    fail("DOCX_ACTIVE_CONTENT", "DOCX active or executable content is not accepted.");
  }
}

function fail(code: string, message: string): never {
  throw new ArchiveInspectionError(code, message);
}
