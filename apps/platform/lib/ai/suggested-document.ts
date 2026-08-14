import { z } from "zod";
import { getDocumentByCode } from "../document-builder/registry";
import type { DocumentDefinition, QuestionnaireField } from "../document-builder/registry";
import { createQuestionnaireAnswers, localize, setAnswer } from "../document-builder/registry/engine";
import { createConfiguredDocument } from "../document-builder/storage/configured-documents";
import type { UserProfile } from "../document-builder/types";
import { parseLegalChatResponse } from "./legal-chat-schema";

export const resolveAiSuggestedDocumentInputSchema = z.object({
  assistantMessageId: z.string().uuid(),
  locale: z.enum(["ru", "uz"]).default("uz"),
}).strict();

export const aiSuggestedDocumentSelectionSchema = z.array(z.object({
  fieldId: z.string().min(1).max(150),
  value: z.string().max(50_000),
}).strict()).max(50).superRefine((items, context) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.fieldId)) context.addIssue({ code: "custom", path: [index, "fieldId"], message: "Duplicate field" });
    seen.add(item.fieldId);
  });
});

export const aiSuggestedDocumentRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("preview"),
    assistantMessageId: z.string().uuid(),
    locale: z.enum(["ru", "uz"]),
  }).strict(),
  z.object({
    action: z.literal("confirm"),
    assistantMessageId: z.string().uuid(),
    locale: z.enum(["ru", "uz"]),
    fields: aiSuggestedDocumentSelectionSchema,
    sensitiveDataConsent: z.boolean().default(false),
  }).strict(),
]);

export const aiSuggestedDocumentIdempotencyKeySchema = z.string().min(8).max(180)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u);

export class AiSuggestedDocumentError extends Error {
  constructor(
    readonly code: "AI_SUGGESTED_DOCUMENT_NOT_FOUND" | "AI_SUGGESTED_DOCUMENT_INVALID" | "AI_SUGGESTED_DOCUMENT_UNAVAILABLE" | "AI_SUGGESTED_DOCUMENT_CONFLICT" | "AI_SUGGESTED_DOCUMENT_SENSITIVE_CONSENT_REQUIRED",
  ) {
    super(code);
    this.name = "AiSuggestedDocumentError";
  }
}

type StoredSuggestedDocumentMessage = { structuredJson: string | null; caseId: string | null };

export type AiDocumentPrefillCandidate = {
  fieldId: string;
  label: string;
  value: string;
  source: "profile" | "workspace" | "ai_answer";
  sensitive: boolean;
};

export type AiSuggestedDocumentPreview = {
  templateCode: string;
  categorySlug: string;
  title: string;
  reason: string;
  caseId: string | null;
  candidates: AiDocumentPrefillCandidate[];
};

type SuggestedContext = {
  definition: DocumentDefinition;
  reason: string;
  result: ReturnType<typeof parseLegalChatResponse>;
  caseId: string | null;
};

async function loadSuggestedContext(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  assistantMessageId: string;
}): Promise<SuggestedContext> {
  const stored = await input.db.prepare(`
    SELECT message.structured_json AS structuredJson,
      CASE WHEN EXISTS (
        SELECT 1 FROM cases owned_case
        WHERE owned_case.id=conversation.case_id
          AND owned_case.workspace_id=conversation.workspace_id
          AND owned_case.archived_at IS NULL
      ) THEN conversation.case_id ELSE NULL END AS caseId
    FROM conversation_messages message
    INNER JOIN conversations conversation ON conversation.id=message.conversation_id
    WHERE message.id=? AND message.author_type='assistant'
      AND conversation.workspace_id=? AND conversation.owner_user_id=?
    LIMIT 1
  `).bind(input.assistantMessageId, input.workspaceId, input.userId).first<StoredSuggestedDocumentMessage>();
  if (!stored) throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_NOT_FOUND");
  if (!stored.structuredJson) throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_INVALID");

  try {
    const result = parseLegalChatResponse(JSON.parse(stored.structuredJson));
    const suggested = result.responseKind === "answer" ? result.suggestedDocument : null;
    if (!suggested?.templateCode) throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_UNAVAILABLE");
    const definition = getDocumentByCode(suggested.templateCode);
    if (!definition || definition.status !== "published") {
      throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_UNAVAILABLE");
    }
    return { definition, reason: suggested.reason, result, caseId: stored.caseId };
  } catch (error) {
    if (error instanceof AiSuggestedDocumentError) throw error;
    throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_INVALID");
  }
}

/**
 * Resolves a template only from an already persisted, tenant-owned AI result.
 * The client is deliberately unable to choose either a template code or a
 * document title, so an AI response cannot be repurposed across workspaces.
 */
export async function resolveAiSuggestedDocument(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  assistantMessageId: string;
  locale: "ru" | "uz";
}): Promise<{ templateCode: string; categorySlug: string; title: string; reason: string }> {
  const { definition, reason } = await loadSuggestedContext(input);
  return {
    templateCode: definition.code,
    categorySlug: definition.categorySlug,
    title: input.locale === "ru" ? definition.titleRu : definition.titleUz,
    reason,
  };
}

const selfPartyPrefixes = new Set([
  "applicant", "claimant", "employee", "creditor", "consumer", "requester", "principal", "author",
]);

function fieldsOf(definition: DocumentDefinition): QuestionnaireField[] {
  return definition.questionnaire.flatMap((step) => step.fields);
}

function profileValue(field: QuestionnaireField, user: UserProfile): string | null {
  const [prefix] = field.id.split(".");
  if (!selfPartyPrefixes.has(prefix)) return null;
  if (field.type === "company-name") return null;
  if (field.id.endsWith(".fullName")) return user.fullName;
  if (field.id.endsWith(".birthDate")) return user.birthDate;
  if (field.id.endsWith(".idDocumentNumber")) return user.idDocumentNumber;
  if (field.id.endsWith(".pinfl")) return user.pinfl;
  if (field.id.endsWith(".address") || field.id.endsWith(".registeredAddress")) return user.registeredAddress;
  if (field.id.endsWith(".phone")) return user.phone;
  if (field.id.endsWith(".email")) return user.email;
  return null;
}

function bounded(value: string | null | undefined, max = 10_000): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, max) : null;
}

export async function previewAiSuggestedDocument(input: {
  db: D1Database;
  workspaceId: string;
  user: UserProfile;
  assistantMessageId: string;
  locale: "ru" | "uz";
}): Promise<AiSuggestedDocumentPreview> {
  const context = await loadSuggestedContext({ ...input, userId: input.user.id });
  const workspace = await input.db.prepare(
    "SELECT type,name,full_name AS fullName FROM workspaces WHERE id=? LIMIT 1",
  ).bind(input.workspaceId).first<{ type: string; name: string; fullName: string | null }>();
  const candidates = new Map<string, AiDocumentPrefillCandidate>();
  const fields = fieldsOf(context.definition);
  const addCandidate = (candidate: AiDocumentPrefillCandidate, replace = false) => {
    if (replace || !candidates.has(candidate.fieldId)) candidates.set(candidate.fieldId, candidate);
  };
  for (const field of fields) {
    const value = bounded(profileValue(field, input.user), field.validation?.maxLength ?? 10_000);
    if (value) addCandidate({
      fieldId: field.id,
      label: localize(field.label, input.locale),
      value,
      source: "profile",
      sensitive: ["pinfl", "passport", "phone", "email", "address", "date"].includes(field.type),
    });
  }
  if (workspace?.type === "business") {
    const organizationName = bounded(workspace.fullName || workspace.name, 300);
    for (const field of fields) {
      const [prefix] = field.id.split(".");
      if (organizationName && field.type === "company-name" && ["applicant", "claimant", "creditor"].includes(prefix)) {
        addCandidate({ fieldId: field.id, label: localize(field.label, input.locale), value: organizationName, source: "workspace", sensitive: false }, true);
      }
    }
  }
  const aiValues = new Map<string, string | null>([
    ["case.background", bounded(context.result.answer, 8_000)],
    ["matter.details", bounded(context.result.summary, 4_000)],
    ["claim.attachments", bounded(context.result.requiredDocuments.map((item) => item.name).join("\n"), 8_000)],
  ]);
  for (const field of fields) {
    const value = aiValues.get(field.id);
    if (value) addCandidate({ fieldId: field.id, label: localize(field.label, input.locale), value, source: "ai_answer", sensitive: true });
  }
  return {
    templateCode: context.definition.code,
    categorySlug: context.definition.categorySlug,
    title: input.locale === "ru" ? context.definition.titleRu : context.definition.titleUz,
    reason: context.reason,
    caseId: context.caseId,
    candidates: Array.from(candidates.values()).slice(0, 30),
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type ExistingHandoff = {
  documentId: string;
  assistantMessageId: string;
  templateCode: string;
  selectionSha256: string;
};

async function existingHandoff(db: D1Database, workspaceId: string, userId: string, idempotencyKeySha256: string) {
  return db.prepare(
    `SELECT document_id AS documentId,assistant_message_id AS assistantMessageId,
      template_code AS templateCode,selection_sha256 AS selectionSha256
     FROM ai_document_prefill_handoffs
     WHERE workspace_id=? AND user_id=? AND idempotency_key_sha256=? LIMIT 1`,
  ).bind(workspaceId, userId, idempotencyKeySha256).first<ExistingHandoff>();
}

function replay(existing: ExistingHandoff | null, expected: Omit<ExistingHandoff, "documentId">) {
  if (!existing) return null;
  if (
    existing.assistantMessageId !== expected.assistantMessageId
    || existing.templateCode !== expected.templateCode
    || existing.selectionSha256 !== expected.selectionSha256
  ) throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_CONFLICT");
  return { documentId: existing.documentId, replayed: true };
}

export async function createAiSuggestedDocumentDraft(input: {
  db: D1Database;
  workspaceId: string;
  user: UserProfile;
  assistantMessageId: string;
  locale: "ru" | "uz";
  fields: Array<{ fieldId: string; value: string }>;
  sensitiveDataConsent?: boolean;
  idempotencyKey: string;
}): Promise<{ documentId: string; replayed: boolean }> {
  const preview = await previewAiSuggestedDocument(input);
  const allowed = new Map(preview.candidates.map((item) => [item.fieldId, item]));
  const selected = aiSuggestedDocumentSelectionSchema.parse(input.fields)
    .map((item) => ({ fieldId: item.fieldId, value: item.value.trim() }))
    .filter((item) => item.value.length > 0)
    .sort((left, right) => left.fieldId.localeCompare(right.fieldId));
  if (selected.some((item) => !allowed.has(item.fieldId))) {
    throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_INVALID");
  }
  if (selected.some((item) => allowed.get(item.fieldId)?.sensitive) && !input.sensitiveDataConsent) {
    throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_SENSITIVE_CONSENT_REQUIRED");
  }
  const definition = getDocumentByCode(preview.templateCode);
  if (!definition || definition.status !== "published") throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_UNAVAILABLE");
  const definitionFields = new Map(fieldsOf(definition).map((field) => [field.id, field]));
  if (selected.some((item) => {
    const field = definitionFields.get(item.fieldId);
    const maximum = Math.min(field?.validation?.maxLength ?? 20_000, 50_000);
    return !field || item.value.length > maximum;
  })) throw new AiSuggestedDocumentError("AI_SUGGESTED_DOCUMENT_INVALID");
  const selectionSha256 = await sha256(JSON.stringify({
    assistantMessageId: input.assistantMessageId,
    templateCode: preview.templateCode,
    fields: selected,
  }));
  const idempotencyKeySha256 = await sha256(input.idempotencyKey);
  const expected = { assistantMessageId: input.assistantMessageId, templateCode: preview.templateCode, selectionSha256 };
  const prior = replay(await existingHandoff(input.db, input.workspaceId, input.user.id, idempotencyKeySha256), expected);
  if (prior) return prior;
  let answers = createQuestionnaireAnswers(definition);
  for (const item of selected) answers = setAnswer(answers, item.fieldId, item.value);
  try {
    const document = await createConfiguredDocument(input.user, {
      definition,
      language: input.locale,
      answers,
      caseId: preview.caseId ?? undefined,
      aiHandoff: {
        id: crypto.randomUUID(),
        assistantMessageId: input.assistantMessageId,
        idempotencyKeySha256,
        selectionSha256,
        selectedFieldIds: selected.map((item) => item.fieldId),
        locale: input.locale,
      },
    }, { db: input.db, workspace: { id: input.workspaceId } });
    return { documentId: document.id, replayed: false };
  } catch (error) {
    const concurrent = replay(await existingHandoff(input.db, input.workspaceId, input.user.id, idempotencyKeySha256), expected);
    if (concurrent) return concurrent;
    throw error;
  }
}
