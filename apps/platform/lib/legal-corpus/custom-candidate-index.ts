import { z } from "zod";

import { fuseCustomRankedLanes } from "./custom-bm25";
import { CUSTOM_EMBEDDING_DIMENSIONS } from "./custom-hybrid-index";
import { legalLanguageSchema, sha256Schema } from "./target-domain-schemas";

export const CUSTOM_VECTORIZE_OPEN_ENDED_EPOCH = 253_402_300_799 as const;

type CustomTemporalFilter = {
  releaseId: string;
  language?: z.infer<typeof legalLanguageSchema>;
  documentTypes?: readonly string[];
  atEpoch: number;
};

export function buildCustomVectorizeFilter(input: CustomTemporalFilter): NonNullable<
  VectorizeQueryOptions["filter"]
> {
  // The index itself is release-scoped. Keep release_id in returned metadata
  // for fail-closed identity checks, but do not pretend it is one of the four
  // declared Vectorize metadata indexes.
  z.string().min(1).max(200).parse(input.releaseId);
  const filter: VectorizeVectorMetadataFilter = {
    valid_from_epoch: { $lte: z.number().int().parse(input.atEpoch) },
    valid_to_epoch: { $gt: input.atEpoch },
  };
  if (input.language) filter.language = { $eq: legalLanguageSchema.parse(input.language) };
  if (input.documentTypes) {
    const documentTypes = z.array(z.string().min(1).max(300)).min(1)
      .parse([...input.documentTypes]);
    filter.document_type = { $in: [...new Set(documentTypes)].sort() };
  }
  return filter;
}

const denseMetadataSchema = z.object({
  item_key: z.string().min(1).max(700),
  release_id: z.string().min(1).max(200),
  language: legalLanguageSchema,
  document_type: z.string().min(1).max(300),
  valid_from_epoch: z.number().int(),
  valid_to_epoch: z.number().int(),
}).passthrough();

export async function queryCustomDenseLane(
  index: VectorizeIndex,
  input: {
    releaseId: string;
    vector: readonly number[];
    filter: NonNullable<VectorizeQueryOptions["filter"]>;
    topK: number;
  },
): Promise<Array<{ itemKey: string; vectorId: string; score: number }>> {
  if (
    input.vector.length !== CUSTOM_EMBEDDING_DIMENSIONS
    || !input.vector.every(Number.isFinite)
  ) throw new TypeError("CUSTOM_DENSE_QUERY_VECTOR_INVALID");
  if (!Number.isSafeInteger(input.topK) || input.topK < 1 || input.topK > 50) {
    throw new TypeError("CUSTOM_DENSE_TOP_K_INVALID");
  }
  const result = await index.query([...input.vector], {
    topK: input.topK,
    returnValues: false,
    returnMetadata: "all",
    filter: input.filter,
  });
  if (result.matches.length > input.topK) throw new TypeError("CUSTOM_DENSE_TOP_K_EXCEEDED");
  return result.matches.map((match) => {
    const metadata = denseMetadataSchema.parse(match.metadata);
    if (metadata.release_id !== input.releaseId || !Number.isFinite(match.score)) {
      throw new TypeError("CUSTOM_DENSE_RELEASE_OR_SCORE_MISMATCH");
    }
    return { itemKey: metadata.item_key, vectorId: match.id, score: match.score };
  }).sort((left, right) => right.score - left.score
    || left.itemKey.localeCompare(right.itemKey));
}

export type CustomCatalogCandidate = {
  itemKey: string;
  releaseId: string;
  language: z.infer<typeof legalLanguageSchema>;
  documentType: string;
  validFromEpoch: number;
  validToEpoch: number | null;
  evidenceR2Key: string;
  evidenceSha256: string;
};

/**
 * D1-backed ownership seam. A second catalog can implement this contract once
 * measured legal-catalog size reaches the documented 7 GB sharding threshold.
 */
export interface CustomLegalCatalog {
  revalidate(input: {
    releaseId: string;
    itemKeys: readonly string[];
  }): Promise<readonly CustomCatalogCandidate[]>;
}

export async function revalidateCustomCandidateIdentities(
  catalog: CustomLegalCatalog,
  input: CustomTemporalFilter & { itemKeys: readonly string[] },
): Promise<CustomCatalogCandidate[]> {
  const requested = [...new Set(input.itemKeys)];
  if (requested.length !== input.itemKeys.length || requested.length > 300) {
    throw new TypeError("CUSTOM_CANDIDATE_IDENTITY_SET_INVALID");
  }
  const rows = await catalog.revalidate({ releaseId: input.releaseId, itemKeys: requested });
  const byKey = new Map(rows.map((row) => [row.itemKey, row]));
  const allowedTypes = input.documentTypes ? new Set(input.documentTypes) : null;
  const valid = requested.map((itemKey) => byKey.get(itemKey)).filter((row): row is CustomCatalogCandidate =>
    Boolean(row)
    && row!.releaseId === input.releaseId
    && (!input.language || row!.language === input.language)
    && (!allowedTypes || allowedTypes.has(row!.documentType))
    && row!.validFromEpoch <= input.atEpoch
    && (row!.validToEpoch === null || input.atEpoch < row!.validToEpoch)
    && row!.evidenceR2Key.length > 0
    && sha256Schema.safeParse(row!.evidenceSha256).success);
  if (valid.length !== requested.length || byKey.size !== requested.length) {
    throw new TypeError("CUSTOM_CANDIDATE_CATALOG_REVALIDATION_FAILED");
  }
  return valid;
}

export function fuseCustomHybridFormulations(
  formulations: ReadonlyArray<{
    formulationId: string;
    wordSparse: readonly string[];
    characterSparse?: readonly string[];
    dense: readonly string[];
  }>,
  options: { k: 60; topK: number },
): Array<{ itemKey: string; score: number }> {
  const ordered = [...formulations].sort((left, right) =>
    left.formulationId.localeCompare(right.formulationId));
  if (new Set(ordered.map((value) => value.formulationId)).size !== ordered.length) {
    throw new TypeError("CUSTOM_FORMULATION_ID_DUPLICATE");
  }
  const formulationLanes = ordered.map((formulation) => {
    const sparse = formulation.characterSparse
      ? fuseCustomRankedLanes(
        [formulation.wordSparse, formulation.characterSparse],
        { k: options.k, topK: options.topK },
      ).map((hit) => hit.itemKey)
      : [...formulation.wordSparse];
    return fuseCustomRankedLanes(
      [sparse, formulation.dense],
      { k: options.k, topK: options.topK },
    ).map((hit) => hit.itemKey);
  });
  return fuseCustomRankedLanes(formulationLanes, options);
}
