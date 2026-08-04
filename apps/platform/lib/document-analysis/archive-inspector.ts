const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const MAX_COMMENT_BYTES = 65_535;
const MAX_ARCHIVE_ENTRIES = 200;
const MAX_PACKAGE_FILES = 20;
const MAX_DOCX_ENTRIES = 1_000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_EXPANSION_RATIO = 100;
const DEFAULT_VERIFICATION_TIMEOUT_MS = 15_000;

const supportedPackageExtensions = new Set(["pdf", "docx", "jpg", "jpeg", "png"]);
const nestedArchiveExtensions = new Set(["zip", "7z", "rar", "tar", "gz", "tgz", "bz2", "xz", "docm", "xlsm"]);

export type ArchiveInspection = {
  entryCount: number;
  fileCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
  docxPackage: boolean;
};

type ArchiveEntry = {
  name: string;
  nameBytes: Uint8Array;
  flags: number;
  method: number;
  crc32: number;
  compressedBytes: number;
  uncompressedBytes: number;
  localOffset: number;
  dataStart: number;
  dataEnd: number;
  extentEnd: number;
  directory: boolean;
};

type ParsedArchive = {
  inspection: ArchiveInspection;
  entries: ArchiveEntry[];
};

export class ArchiveInspectionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ArchiveInspectionError";
  }
}

export function inspectArchiveBytes(bytes: Uint8Array, mimeType: string): ArchiveInspection {
  return parseArchiveBytes(bytes, mimeType).inspection;
}

export async function verifyArchiveBytes(
  bytes: Uint8Array,
  mimeType: string,
  options: { timeoutMs?: number } = {},
): Promise<ArchiveInspection> {
  const parsed = parseArchiveBytes(bytes, mimeType);
  const timeoutMs = options.timeoutMs ?? DEFAULT_VERIFICATION_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    fail("ARCHIVE_VERIFICATION_TIMEOUT", "Archive verification timeout is invalid.");
  }
  const deadline = Date.now() + timeoutMs;
  for (const entry of parsed.entries) {
    if (entry.directory) continue;
    ensureBeforeDeadline(deadline);
    const compressed = bytes.subarray(entry.dataStart, entry.dataEnd);
    let actualSize = 0;
    let crc = 0xffffffff;
    if (entry.method === 0) {
      if (entry.compressedBytes !== entry.uncompressedBytes) {
        fail("ARCHIVE_SIZE_MISMATCH", "Stored ZIP entry sizes are inconsistent.");
      }
      actualSize = compressed.byteLength;
      crc = updateCrc32(crc, compressed);
    } else {
      const verified = await verifyDeflatedEntry(compressed, entry.uncompressedBytes, deadline);
      actualSize = verified.size;
      crc = verified.crc;
    }
    if (actualSize !== entry.uncompressedBytes) {
      fail("ARCHIVE_SIZE_MISMATCH", "Expanded ZIP entry size does not match its signed directory metadata.");
    }
    if (finishCrc32(crc) !== entry.crc32) {
      fail("ARCHIVE_CRC_MISMATCH", "ZIP entry CRC does not match its signed directory metadata.");
    }
  }
  return parsed.inspection;
}

function parseArchiveBytes(bytes: Uint8Array, mimeType: string): ParsedArchive {
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
  const entries: ArchiveEntry[] = [];
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
    const crc32 = view.getUint32(position + 16, true);
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
    } else if (compressed !== 0 || uncompressed !== 0) {
      fail("ARCHIVE_CORRUPT", "ZIP directory entries must not contain payload bytes.");
    }
    compressedBytes += compressed;
    uncompressedBytes += uncompressed;
    if (!Number.isSafeInteger(uncompressedBytes) || uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      fail("ARCHIVE_EXPANDED_SIZE_LIMIT", "Expanded archive size exceeds 200 MB.");
    }
    entries.push({
      name,
      nameBytes,
      flags,
      method,
      crc32,
      compressedBytes: compressed,
      uncompressedBytes: uncompressed,
      localOffset,
      dataStart: 0,
      dataEnd: 0,
      extentEnd: 0,
      directory,
    });
    position = end;
  }
  if (position !== eocd) fail("ARCHIVE_CORRUPT", "ZIP central directory contains trailing ambiguity.");
  if (!docxPackage && (fileCount < 1 || fileCount > MAX_PACKAGE_FILES)) {
    fail("ARCHIVE_FILE_LIMIT", `A package must contain between 1 and ${MAX_PACKAGE_FILES} files.`);
  }
  if (compressedBytes > bytes.byteLength) fail("ARCHIVE_CORRUPT", "Compressed entry sizes exceed the archive size.");
  if (docxPackage) validateDocxPackage(names);
  validateLocalEntries(bytes, view, entries, centralOffset);
  return {
    inspection: { entryCount, fileCount, compressedBytes, uncompressedBytes, docxPackage },
    entries,
  };
}

function validateLocalEntries(bytes: Uint8Array, view: DataView, entries: ArchiveEntry[], centralOffset: number): void {
  const ordered = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  if (ordered[0]?.localOffset !== 0) {
    fail("ARCHIVE_POLYGLOT_REJECTED", "ZIP preambles and executable polyglots are not accepted.");
  }
  let expectedOffset = 0;
  for (const entry of ordered) {
    if (entry.localOffset !== expectedOffset || entry.localOffset + 30 > centralOffset) {
      fail("ARCHIVE_LOCAL_HEADER_MISMATCH", "ZIP local entry layout is ambiguous or non-contiguous.");
    }
    if (view.getUint32(entry.localOffset, true) !== LOCAL_SIGNATURE) {
      fail("ARCHIVE_LOCAL_HEADER_MISMATCH", "ZIP local header signature does not match its directory entry.");
    }
    const flags = view.getUint16(entry.localOffset + 6, true);
    const method = view.getUint16(entry.localOffset + 8, true);
    const localCrc32 = view.getUint32(entry.localOffset + 14, true);
    const localCompressed = view.getUint32(entry.localOffset + 18, true);
    const localUncompressed = view.getUint32(entry.localOffset + 22, true);
    const nameLength = view.getUint16(entry.localOffset + 26, true);
    const extraLength = view.getUint16(entry.localOffset + 28, true);
    const nameStart = entry.localOffset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedBytes;
    if (flags !== entry.flags || method !== entry.method || nameLength !== entry.nameBytes.byteLength || dataEnd > centralOffset) {
      fail("ARCHIVE_LOCAL_HEADER_MISMATCH", "ZIP local entry metadata does not match its directory entry.");
    }
    if (!bytesEqual(bytes.subarray(nameStart, nameStart + nameLength), entry.nameBytes)) {
      fail("ARCHIVE_LOCAL_HEADER_MISMATCH", "ZIP local path does not match its directory path.");
    }
    const usesDescriptor = (entry.flags & 0x8) !== 0;
    if (!usesDescriptor && (
      localCrc32 !== entry.crc32 ||
      localCompressed !== entry.compressedBytes ||
      localUncompressed !== entry.uncompressedBytes
    )) {
      fail("ARCHIVE_LOCAL_HEADER_MISMATCH", "ZIP local size or CRC does not match its directory entry.");
    }
    if (usesDescriptor && (
      (localCrc32 !== 0 && localCrc32 !== entry.crc32) ||
      (localCompressed !== 0 && localCompressed !== entry.compressedBytes) ||
      (localUncompressed !== 0 && localUncompressed !== entry.uncompressedBytes)
    )) {
      fail("ARCHIVE_LOCAL_HEADER_MISMATCH", "ZIP deferred local metadata conflicts with its directory entry.");
    }
    let extentEnd = dataEnd;
    if (usesDescriptor) extentEnd = validateDataDescriptor(view, dataEnd, centralOffset, entry);
    entry.dataStart = dataStart;
    entry.dataEnd = dataEnd;
    entry.extentEnd = extentEnd;
    expectedOffset = extentEnd;
  }
  if (expectedOffset !== centralOffset) {
    fail("ARCHIVE_LOCAL_HEADER_MISMATCH", "ZIP contains unreferenced bytes before its central directory.");
  }
}

function validateDataDescriptor(view: DataView, offset: number, centralOffset: number, entry: ArchiveEntry): number {
  if (offset + 12 > centralOffset) fail("ARCHIVE_LOCAL_HEADER_MISMATCH", "ZIP data descriptor is truncated.");
  const signed = view.getUint32(offset, true) === DATA_DESCRIPTOR_SIGNATURE;
  const payloadOffset = signed ? offset + 4 : offset;
  if (payloadOffset + 12 > centralOffset) fail("ARCHIVE_LOCAL_HEADER_MISMATCH", "ZIP data descriptor is truncated.");
  if (
    view.getUint32(payloadOffset, true) !== entry.crc32 ||
    view.getUint32(payloadOffset + 4, true) !== entry.compressedBytes ||
    view.getUint32(payloadOffset + 8, true) !== entry.uncompressedBytes
  ) {
    fail("ARCHIVE_LOCAL_HEADER_MISMATCH", "ZIP data descriptor does not match its directory entry.");
  }
  return payloadOffset + 12;
}

async function verifyDeflatedEntry(
  compressed: Uint8Array,
  expectedSize: number,
  deadline: number,
): Promise<{ size: number; crc: number }> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const source = new ReadableStream<ArrayBuffer | ArrayBufferView>({
      start(controller) {
        controller.enqueue(compressed);
        controller.close();
      },
    });
    const decompressor = new DecompressionStream("deflate-raw");
    reader = source.pipeThrough(decompressor).getReader();
    let size = 0;
    let crc = 0xffffffff;
    while (true) {
      const result = await readBeforeDeadline(reader, deadline);
      if (result.done) break;
      size += result.value.byteLength;
      if (size > expectedSize || size > MAX_UNCOMPRESSED_BYTES) {
        fail("ARCHIVE_SIZE_MISMATCH", "Expanded ZIP entry exceeds its declared bounded size.");
      }
      crc = updateCrc32(crc, result.value);
    }
    return { size, crc };
  } catch (error) {
    if (error instanceof ArchiveInspectionError) throw error;
    throw new ArchiveInspectionError(
      "ARCHIVE_DECOMPRESSION_FAILED",
      "ZIP entry could not be decompressed safely.",
    );
  } finally {
    try {
      await reader?.cancel();
    } catch {
      // Reader cancellation is cleanup only; the validation result remains authoritative.
    }
  }
}

async function readBeforeDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadline: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) fail("ARCHIVE_VERIFICATION_TIMEOUT", "Archive decompression exceeded the allowed time.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ArchiveInspectionError("ARCHIVE_VERIFICATION_TIMEOUT", "Archive decompression exceeded the allowed time.")),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ensureBeforeDeadline(deadline: number): void {
  if (Date.now() >= deadline) fail("ARCHIVE_VERIFICATION_TIMEOUT", "Archive decompression exceeded the allowed time.");
}

const crc32Table = createCrc32Table();

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

function updateCrc32(crc: number, bytes: Uint8Array): number {
  let value = crc >>> 0;
  for (const byte of bytes) value = (value >>> 8) ^ crc32Table[(value ^ byte) & 0xff]!;
  return value >>> 0;
}

function finishCrc32(crc: number): number {
  return (crc ^ 0xffffffff) >>> 0;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
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

function validatePath(name: string): void {
  if (name.length > 512 || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[a-z]:/iu.test(name)) {
    fail("ARCHIVE_PATH_UNSAFE", "Archive path is absolute or malformed.");
  }
  const segments = name.split("/").filter(Boolean);
  if (!segments.length || segments.length > 16 || segments.some((segment) => segment === "." || segment === "..")) {
    fail("ARCHIVE_PATH_UNSAFE", "Archive path escapes or exceeds the safe depth.");
  }
}

function validatePackageMember(name: string): void {
  const leaf = name.split("/").at(-1) ?? "";
  const extension = leaf.split(".").at(-1)?.toLocaleLowerCase() ?? "";
  if (nestedArchiveExtensions.has(extension)) fail("ARCHIVE_NESTED_UNSUPPORTED", "Nested archives are not accepted.");
  if (!supportedPackageExtensions.has(extension)) fail("ARCHIVE_MEMBER_UNSUPPORTED", "Archive contains an unsupported file type.");
}

function validateDocxPackage(names: Set<string>): void {
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
