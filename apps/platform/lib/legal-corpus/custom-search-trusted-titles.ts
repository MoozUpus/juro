import { z } from "zod";

import { searchReleaseIdSchema } from "./target-domain-schemas";

const titleSchema = z.string().trim().min(1).max(16_384);

/** The digest covers the release identity and sorted, distinct NFC source titles. */
export async function buildCustomTrustedTitleInventory(releaseId: string, sourceTitles: readonly string[]) {
  const titles = [...new Set(sourceTitles.map((title) =>
    titleSchema.parse(title).normalize("NFC")))].sort();
  if (titles.length === 0) throw new TypeError("CUSTOM_TRUSTED_TITLE_INVENTORY_EMPTY");
  const inventory = { schemaVersion: "custom-search-trusted-titles-v1" as const,
    releaseId: searchReleaseIdSchema.parse(releaseId), titles };
  const bytes = new TextEncoder().encode(JSON.stringify(inventory));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return { ...inventory, titleCount: titles.length, sha256 };
}

export async function resolveCustomTrustedLegalTitles(
  db: D1Database, releaseId: string,
): Promise<string[] | null> {
  const rows = await db.prepare(`SELECT inventory.title_count AS titleCount,
      inventory.inventory_sha256 AS inventorySha256
    FROM legal_custom_search_runtime_components runtime
    LEFT JOIN legal_custom_search_title_inventories inventory
      ON inventory.search_release_id=runtime.search_release_id
    WHERE runtime.search_release_id=?`).bind(releaseId)
    .all<{ titleCount: number | null; inventorySha256: string | null }>();
  if (rows.results.length === 0) return null;
  const header = rows.results[0]!;
  if (rows.results.length !== 1 || header.titleCount === null || header.inventorySha256 === null) {
    throw new TypeError("CUSTOM_TRUSTED_TITLE_INVENTORY_UNAVAILABLE");
  }
  const stored = await db.prepare(`SELECT title FROM legal_custom_search_trusted_titles
    WHERE search_release_id=? ORDER BY title`).bind(releaseId).all<{ title: string }>();
  const inventory = await buildCustomTrustedTitleInventory(releaseId, stored.results.map((row) => row.title));
  if (stored.results.length !== inventory.titleCount || inventory.titleCount !== Number(header.titleCount)
    || inventory.sha256 !== header.inventorySha256) {
    throw new TypeError("CUSTOM_TRUSTED_TITLE_INVENTORY_MISMATCH");
  }
  return inventory.titles;
}
