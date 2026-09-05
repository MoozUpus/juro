import {
  malwareScannerResponseSchema,
  type MalwareScannerResponse,
} from "../../document-analysis/malware-scanner";
import { sha256Hex } from "./file-validation";
import { requireQuarantineR2, requireR2, runtimeEnv } from "./runtime";

export class QuarantinedUploadError extends Error {
  constructor(
    readonly code:
      | "FILE_UNSAFE"
      | "MALWARE_SCANNER_UNAVAILABLE"
      | "UPLOAD_QUARANTINE_FAILED"
      | "UPLOAD_PROMOTION_FAILED",
  ) {
    super(code);
    this.name = "QuarantinedUploadError";
  }
}

export type CleanUploadEvidence = {
  sha256: string;
  scan: MalwareScannerResponse;
};

/**
 * User-controlled builder files are staged in the isolated bucket, scanned,
 * and copied into private storage only after a checksum-bound clean verdict.
 * Any failed request removes its untracked quarantine object so retries cannot
 * accumulate inaccessible orphan data.
 */
export async function quarantineScanAndStorePrivateObject(input: {
  key: string;
  bytes: Uint8Array;
  mimeType: string;
  metadata?: Record<string, string>;
}): Promise<CleanUploadEvidence> {
  const env = runtimeEnv();
  if (env.MALWARE_SCAN_ENABLED !== "true" || !env.MALWARE_SCANNER) {
    throw new QuarantinedUploadError("MALWARE_SCANNER_UNAVAILABLE");
  }
  const quarantine = requireQuarantineR2();
  const destination = requireR2();
  const checksum = await sha256Hex(input.bytes);
  const quarantineKey = `builder-upload-v1/${crypto.randomUUID()}`;
  let promoted = false;
  try {
    const quarantined = await quarantine.put(quarantineKey, input.bytes, {
      onlyIf: new Headers({ "if-none-match": "*" }),
      sha256: checksum,
      httpMetadata: { contentType: input.mimeType, cacheControl: "private, no-store" },
      customMetadata: { lifecycle: "builder-upload-quarantine", sha256: checksum },
    });
    if (
      !quarantined
      || quarantined.size !== input.bytes.byteLength
      || checksumHex(quarantined.checksums.sha256) !== checksum
    ) {
      throw new QuarantinedUploadError("UPLOAD_QUARANTINE_FAILED");
    }
    const source = await quarantine.get(quarantineKey);
    if (
      !source
      || !("body" in source)
      || source.size !== input.bytes.byteLength
      || checksumHex(source.checksums.sha256) !== checksum
    ) {
      throw new QuarantinedUploadError("UPLOAD_QUARANTINE_FAILED");
    }

    let scannerResponse: Response;
    try {
      scannerResponse = await env.MALWARE_SCANNER.fetch(
        "https://malware-scanner.internal/v1/scan",
        {
          method: "POST",
          headers: {
            "content-type": input.mimeType,
            "content-length": String(input.bytes.byteLength),
            "x-juro-scan-schema": "1",
            "x-content-sha256": checksum,
          },
          body: source.body,
        },
      );
    } catch {
      throw new QuarantinedUploadError("MALWARE_SCANNER_UNAVAILABLE");
    }
    if (!scannerResponse.ok) {
      throw new QuarantinedUploadError("MALWARE_SCANNER_UNAVAILABLE");
    }
    const declaredLength = Number(scannerResponse.headers.get("content-length") ?? "0");
    if (declaredLength > 65_536) {
      throw new QuarantinedUploadError("MALWARE_SCANNER_UNAVAILABLE");
    }
    const responseText = await scannerResponse.text();
    if (new TextEncoder().encode(responseText).byteLength > 65_536) {
      throw new QuarantinedUploadError("MALWARE_SCANNER_UNAVAILABLE");
    }
    const parsed = malwareScannerResponseSchema.safeParse(parseJson(responseText));
    if (!parsed.success || parsed.data.sourceSha256 !== checksum) {
      throw new QuarantinedUploadError("MALWARE_SCANNER_UNAVAILABLE");
    }
    if (parsed.data.verdict !== "clean") {
      throw new QuarantinedUploadError("FILE_UNSAFE");
    }

    const cleanSource = await quarantine.get(quarantineKey);
    if (
      !cleanSource
      || !("body" in cleanSource)
      || cleanSource.size !== input.bytes.byteLength
      || checksumHex(cleanSource.checksums.sha256) !== checksum
    ) {
      throw new QuarantinedUploadError("UPLOAD_QUARANTINE_FAILED");
    }
    const stored = await destination.put(input.key, cleanSource.body, {
      onlyIf: new Headers({ "if-none-match": "*" }),
      sha256: checksum,
      httpMetadata: { contentType: input.mimeType, cacheControl: "private, no-store" },
      customMetadata: {
        ...(input.metadata ?? {}),
        sha256: checksum,
        scanStatus: "clean",
        scanProvider: parsed.data.provider,
        scanEngine: parsed.data.engine,
        scanEngineVersion: parsed.data.engineVersion,
        scanSignatureVersion: parsed.data.signatureVersion,
        scanId: parsed.data.scanId,
      },
    });
    if (
      !stored
      || stored.size !== input.bytes.byteLength
      || checksumHex(stored.checksums.sha256) !== checksum
    ) {
      await destination.delete(input.key).catch(() => undefined);
      throw new QuarantinedUploadError("UPLOAD_PROMOTION_FAILED");
    }
    promoted = true;
    return { sha256: checksum, scan: parsed.data };
  } finally {
    await quarantine.delete(quarantineKey).catch(() => undefined);
    if (!promoted) {
      await destination.delete(input.key).catch(() => undefined);
    }
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function checksumHex(value: ArrayBuffer | undefined): string | null {
  if (!value) return null;
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
