import { z } from "zod";

const sourceIds = z.array(z.string().min(1).max(160)).max(12);

export const documentPartySchema = z.object({
  name: z.string().min(1).max(500),
  role: z.string().min(1).max(240),
  isUserSide: z.boolean(),
}).strict();

export const documentObligationSchema = z.object({
  party: z.string().min(1).max(500),
  obligation: z.string().min(1).max(2_000),
  clause: z.string().max(120).nullable(),
  deadline: z.string().max(240).nullable(),
}).strict();

export const documentDeadlineSchema = z.object({
  title: z.string().min(1).max(500),
  value: z.string().min(1).max(240),
  clause: z.string().max(120).nullable(),
  consequence: z.string().max(1_500).nullable(),
}).strict();

export const riskFindingSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "informational"]),
  riskType: z.enum(["document_internal", "legal_compliance"]),
  title: z.string().min(1).max(500),
  clause: z.string().max(120).nullable(),
  page: z.number().int().min(1).max(500).nullable(),
  exactExcerpt: z.string().max(2_000).nullable(),
  problem: z.string().min(1).max(4_000),
  consequence: z.string().min(1).max(4_000),
  legalBasisSourceIds: sourceIds,
  recommendation: z.string().min(1).max(4_000),
  proposedWording: z.string().max(6_000).nullable(),
  confidence: z.enum(["low", "medium", "high"]),
}).strict();

export const missingClauseSchema = z.object({
  title: z.string().min(1).max(500),
  reason: z.string().min(1).max(3_000),
  proposedWording: z.string().max(6_000).nullable(),
  legalBasisSourceIds: sourceIds,
}).strict();

export const documentAnalysisSourceSchema = z.object({
  sourceId: z.string().min(1).max(160),
  actTitle: z.string().min(1).max(500),
  actIdentifier: z.string().max(240).nullable(),
  article: z.string().max(240).nullable(),
  excerpt: z.string().max(1_200).nullable(),
  originalUrl: z.string().url().max(2_000),
  verifiedAt: z.string().min(1).max(64),
}).strict();

export const documentAnalysisResultSchema = z.object({
  documentType: z.string().min(1).max(300),
  summary: z.string().min(1).max(4_000),
  language: z.enum(["ru", "uz", "en", "mixed", "unknown"]),
  outputLanguage: z.enum(["ru", "uz"]),
  jurisdiction: z.literal("UZ"),
  mode: z.enum(["quick", "full", "expert"]),
  userSide: z.string().max(500).nullable(),
  legalComplianceStatus: z.enum(["verified", "partial", "unverified"]),
  parties: z.array(documentPartySchema).max(30),
  amounts: z.array(z.string().min(1).max(500)).max(50),
  dates: z.array(z.string().min(1).max(500)).max(50),
  obligations: z.array(documentObligationSchema).max(100),
  deadlines: z.array(documentDeadlineSchema).max(50),
  risks: z.array(riskFindingSchema).max(100),
  missingClauses: z.array(missingClauseSchema).max(50),
  contradictions: z.array(z.string().min(1).max(3_000)).max(50),
  questions: z.array(z.string().min(1).max(1_000)).max(30),
  recommendations: z.array(z.string().min(1).max(3_000)).max(50),
  overallQuality: z.object({
    score: z.number().int().min(0).max(100),
    explanation: z.string().min(1).max(3_000),
  }).strict(),
  sources: z.array(documentAnalysisSourceSchema).max(12),
  legalDatabaseAsOf: z.string().max(64),
  extractionWarnings: z.array(z.string().min(1).max(500)).max(20),
}).strict();

export type DocumentAnalysisResult = z.infer<typeof documentAnalysisResultSchema>;

export const documentAnalysisJsonSchema = z.toJSONSchema(documentAnalysisResultSchema, {
  target: "draft-7",
  unrepresentable: "throw",
}) as Record<string, unknown>;

export function parseDocumentAnalysisResult(value: unknown): DocumentAnalysisResult {
  return documentAnalysisResultSchema.parse(value);
}

export function referencedDocumentAnalysisSourceIds(result: DocumentAnalysisResult): Set<string> {
  return new Set([
    ...result.sources.map((source) => source.sourceId),
    ...result.risks.flatMap((risk) => risk.legalBasisSourceIds),
    ...result.missingClauses.flatMap((clause) => clause.legalBasisSourceIds),
  ]);
}

export function enforceDocumentAnalysisSourceBoundary(
  result: DocumentAnalysisResult,
  allowedSourceIds: ReadonlySet<string>,
): DocumentAnalysisResult {
  for (const sourceId of referencedDocumentAnalysisSourceIds(result)) {
    if (!allowedSourceIds.has(sourceId)) throw new Error(`AI_SOURCE_NOT_ALLOWED:${sourceId}`);
  }
  if (allowedSourceIds.size === 0) {
    if (result.legalComplianceStatus !== "unverified") throw new Error("LEGAL_COMPLIANCE_REQUIRES_VERIFIED_SOURCE");
    if (result.risks.some((risk) => risk.riskType === "legal_compliance")) {
      throw new Error("LEGAL_COMPLIANCE_RISK_REQUIRES_VERIFIED_SOURCE");
    }
  }
  return result;
}

export function enforceDocumentExcerptBoundary(
  result: DocumentAnalysisResult,
  documentText: string,
): DocumentAnalysisResult {
  if (result.risks.some((risk) => risk.exactExcerpt && !documentText.includes(risk.exactExcerpt))) {
    throw new Error("AI_DOCUMENT_EXCERPT_NOT_FOUND");
  }
  return result;
}
