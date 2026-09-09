import { z } from "zod";

export const legalIdentifierSchema = z.string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/u);

export const legalEnvironmentSchema = z.enum(["development", "staging", "production"]);
export const utcInstantSchema = z.string().datetime().regex(/Z$/u);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
export const legalLanguageSchema = z.enum(["uz-Latn", "uz-Cyrl", "ru", "en"]);
export const legalScriptSchema = z.enum(["Latn", "Cyrl"]);

export const lexDocumentUrlSchema = z.string().url().max(2_048).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:"
    && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz")
    && /^\/(?:[a-z]{2}\/)?docs\/-?\d+/u.test(url.pathname);
}, "Official Lex.uz document URL required");

export const legalInstrumentIdSchema = legalIdentifierSchema.brand<"LegalInstrumentId">();
export const officialExpressionIdSchema = legalIdentifierSchema.brand<"OfficialExpressionId">();
export const textRevisionIdSchema = legalIdentifierSchema.brand<"TextRevisionId">();
export const provisionConceptIdSchema = legalIdentifierSchema.brand<"ProvisionConceptId">();
export const provisionRenditionIdSchema = legalIdentifierSchema.brand<"ProvisionRenditionId">();
export const corpusSnapshotIdSchema = legalIdentifierSchema.brand<"CorpusSnapshotId">();
export const searchReleaseIdSchema = legalIdentifierSchema.brand<"SearchReleaseId">();
export const canonicalChunkIdSchema = legalIdentifierSchema.brand<"CanonicalChunkId">();
export const captureIdSchema = legalIdentifierSchema.brand<"CaptureId">();
export const candidateInstanceIdSchema = legalIdentifierSchema.brand<"CandidateInstanceId">();
export const candidateShardIdSchema = legalIdentifierSchema.brand<"CandidateShardId">();
export const candidateConfigurationIdSchema = legalIdentifierSchema.brand<"CandidateConfigurationId">();
export const providerProjectIdSchema = legalIdentifierSchema.brand<"ProviderProjectId">();

export function serializeLegalEnvironmentControlObject(input: {
  environment: z.infer<typeof legalEnvironmentSchema>;
  bucketName: string;
}): string {
  return `${JSON.stringify({
    environment: input.environment,
    bucketName: input.bucketName,
    schemaVersion: 1,
  })}\n`;
}

export type LegalInstrumentId = z.infer<typeof legalInstrumentIdSchema>;
export type OfficialExpressionId = z.infer<typeof officialExpressionIdSchema>;
export type TextRevisionId = z.infer<typeof textRevisionIdSchema>;
export type ProvisionConceptId = z.infer<typeof provisionConceptIdSchema>;
export type ProvisionRenditionId = z.infer<typeof provisionRenditionIdSchema>;
export type CorpusSnapshotId = z.infer<typeof corpusSnapshotIdSchema>;
export type SearchReleaseId = z.infer<typeof searchReleaseIdSchema>;
export type CanonicalChunkId = z.infer<typeof canonicalChunkIdSchema>;
