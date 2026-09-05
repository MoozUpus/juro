import { createHash } from "node:crypto";

import { stableSourceSnapshotJson } from "../lib/legal-corpus/source-snapshot";

const DATA_OBJECT_KINDS = new Set([
  "raw_capture",
  "normalized_revision",
  "provision_rendition",
]);

export type Ticket29ReconstructionObject = {
  objectKind: string;
  sha256: string;
  r2Key: string;
  byteCount: number;
};

export type Ticket29ReconstructionLaneProof = {
  schemaVersion: 1;
  kind: "reconstruction-lane";
  runId: string;
  lane: string;
  pageCount: number;
  verifiedObjectCount: number;
  byteCount: number;
  missingObjects: 0;
  hashMismatches: 0;
  rootSha256: string;
  pages: Array<{ count: number; byteCount: number; rootSha256: string }>;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableRoot(value: unknown): string {
  return sha256(stableSourceSnapshotJson(value));
}

export function buildTicket29ReconstructionLaneProofs(
  runId: string,
  objects: readonly Ticket29ReconstructionObject[],
): Ticket29ReconstructionLaneProof[] {
  const dataObjects = objects
    .filter((object) => DATA_OBJECT_KINDS.has(object.objectKind))
    .toSorted((left, right) => left.sha256 < right.sha256 ? -1 : left.sha256 > right.sha256 ? 1
      : left.objectKind < right.objectKind ? -1 : left.objectKind > right.objectKind ? 1 : 0);

  return [..."0123456789abcdef"].map((lane) => {
    const laneObjects = dataObjects.filter((object) => object.sha256.startsWith(lane));
    const pages: Ticket29ReconstructionLaneProof["pages"] = [];
    for (let offset = 0; offset < laneObjects.length; offset += 100) {
      const page = laneObjects.slice(offset, offset + 100).map((object) => ({
        objectKind: object.objectKind,
        sha256: object.sha256,
        objectKey: object.r2Key,
        expectedByteCount: object.byteCount,
        byteCount: object.byteCount,
      }));
      pages.push({
        count: page.length,
        byteCount: page.reduce((sum, object) => sum + object.byteCount, 0),
        rootSha256: stableRoot(page),
      });
    }
    return {
      schemaVersion: 1,
      kind: "reconstruction-lane",
      runId,
      lane,
      pageCount: pages.length,
      verifiedObjectCount: laneObjects.length,
      byteCount: laneObjects.reduce((sum, object) => sum + object.byteCount, 0),
      missingObjects: 0,
      hashMismatches: 0,
      rootSha256: stableRoot(pages),
      pages,
    };
  });
}

export function ticket29ReconstructionLaneReportMatches(
  expected: Ticket29ReconstructionLaneProof,
  actual: unknown,
): boolean {
  return stableSourceSnapshotJson(actual) === stableSourceSnapshotJson(expected);
}
