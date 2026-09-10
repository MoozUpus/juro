import { z } from "zod";

/** A scope describes what must be answered, not evidence that it is covered. */
export const legalCoverageScopeSchema = z.enum([
  "general", "personal_status", "action_stage", "forum", "claim_kind", "consequence",
]);
export type LegalCoverageScope = z.infer<typeof legalCoverageScopeSchema>;

/** A special case cannot stand in for the ordinary rule of an explicit scope. */
export function requiredCoverageAnswerRole(requirement: {
  priority: "core" | "supporting";
  scopeKind?: LegalCoverageScope;
}): "governing_rule" | null {
  return requirement.priority === "core" && requirement.scopeKind !== undefined
    && requirement.scopeKind !== "consequence" ? "governing_rule" : null;
}
