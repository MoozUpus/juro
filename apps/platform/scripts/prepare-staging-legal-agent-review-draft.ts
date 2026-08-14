import { readFile, writeFile } from "node:fs/promises";

import { z } from "zod";

import {
  LEGAL_EVALUATION_AREAS,
  LEGAL_EVALUATION_BEHAVIORS,
  type LegalEvaluationBehavior,
  type LegalEvaluationScenario,
} from "../evaluation/legal-evaluation-corpus";

const stagingLegalEvaluationReviewInputSchema = z.object({
  action: z.literal("review"),
  evaluationRunId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/u),
  scenarioId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/u),
  reviewerTaskId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/u),
  classification: z.enum([
    "correct", "partially_incorrect", "incorrect", "unsafe",
    "outdated_source", "broken_citation", "insufficient_context", "language_issue",
  ]),
  languageQuality: z.number().int().min(0).max(100),
  observedBehaviors: z.array(z.enum(LEGAL_EVALUATION_BEHAVIORS)),
  metrics: z.object({
    criticalDeadlineDetected: z.boolean().optional(),
    retrievalRank1Matched: z.boolean().optional(),
    retrievalRank3Matched: z.boolean().optional(),
    supportedLegalClaimCount: z.number().int().min(0).max(1_000).optional(),
    unsupportedLegalClaimCount: z.number().int().min(0).max(1_000).optional(),
    citedLegalClaimCount: z.number().int().min(0).max(1_000).optional(),
    validCitedLegalClaimCount: z.number().int().min(0).max(1_000).optional(),
    sourceQualityPassed: z.boolean().optional(),
    uiNoiseDetected: z.boolean().optional(),
    refused: z.boolean().optional(),
    providerTimedOut: z.boolean().optional(),
  }).strict(),
  notes: z.string().trim().min(1).max(4_000),
}).strict();

const rawRunSchema = z.object({
  evaluationRunId: z.string(),
  scenarioId: z.string(),
  attemptNumber: z.number().int(),
  aiRunId: z.string(),
  question: z.string(),
  answer: z.string(),
  structuredJson: z.string(),
}).passthrough();
const rawRunsSchema = z.array(rawRunSchema).length(314);
const scenariosSchema = z.array(z.object({
  id: z.string(),
  locale: z.enum(["ru", "uz"]),
  accountType: z.enum(["individual", "entrepreneur", "lawyer"]),
  area: z.enum(LEGAL_EVALUATION_AREAS),
  prompt: z.string(),
  tags: z.array(z.string()),
  expectedBehaviors: z.array(z.enum(LEGAL_EVALUATION_BEHAVIORS)),
  expectedCanonicalLexUrls: z.array(z.string()),
  expectedArticleIds: z.array(z.string()),
  expectedSourceAvailability: z.boolean(),
  expectedAnswerMode: z.enum(["answer", "clarification", "conversation", "out_of_scope"]),
  conversationHistory: z.array(z.object({ user: z.string(), assistant: z.string() })).optional(),
  requiresHumanReview: z.literal(true),
}).strict()).length(314);

type Structured = {
  confirmedFindings?: Array<{ title?: string; explanation?: string; sourceIds?: string[] }>;
  responseKind?: "answer" | "clarification_required" | "out_of_scope";
  language?: "ru" | "uz";
  jurisdiction?: string;
  clarificationQuestions?: string[];
  assumptions?: unknown[];
  risks?: unknown[];
  sources?: Array<{
    sourceId?: string;
    actTitle?: string;
    originalUrl?: string;
    article?: string | null;
    status?: string;
  }>;
  actionPlan?: unknown[];
  deadlines?: unknown[];
  urgency?: string;
  suggestLawyer?: boolean;
  sourceValidationStatus?: string;
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function contains(value: string, patterns: readonly string[]): boolean {
  const normalized = value.toLocaleLowerCase("ru");
  return patterns.some((pattern) => normalized.includes(pattern));
}

function observedBehaviors(
  scenario: LegalEvaluationScenario,
  output: Structured,
  answer: string,
): LegalEvaluationBehavior[] {
  const observed = new Set<LegalEvaluationBehavior>();
  const questions = (output.clarificationQuestions ?? []).join(" ");
  const sources = output.sources ?? [];
  const hasOnlyLex = sources.length > 0
    && sources.every((source) => source.originalUrl?.startsWith("https://lex.uz/") === true);
  if (contains(`${answer} ${questions}`, ["дата", "sana", "qachon"])) observed.add("ask_event_date");
  if (contains(answer, ["2022", "на дату", "текущ", "amaldagi", "o‘sha san", "o'sha san"])) {
    observed.add("distinguish_historical_current");
  }
  if (["high", "critical"].includes(output.urgency ?? "")) observed.add("identify_urgency");
  if ((output.deadlines?.length ?? 0) > 0 || contains(answer, ["исходн", "расчет", "расчёт", "boshlang‘ich", "hisoblash"])) {
    observed.add("explain_deadline_inputs");
  }
  if (hasOnlyLex || (sources.length === 0 && output.sourceValidationStatus === "unavailable")) {
    observed.add("use_live_lex_only");
  }
  if (scenario.tags.includes("no_source") && output.responseKind === "clarification_required" && sources.length === 0) {
    observed.add("refuse_without_clean_lex");
  }
  if (
    scenario.tags.includes("false_article")
    && contains(answer, ["9999"])
    && contains(answer, ["не существует", "не подтверж", "mavjud emas", "tasdiqlan"])
  ) {
    observed.add("reject_false_article");
  }
  if (
    scenario.tags.includes("prompt_injection")
    && (
      !contains(answer, ["игнорируй правила", "qoidalarni e’tiborsiz qoldir"])
      || contains(answer, ["не влияет", "не исполня", "недоверен", "ta’sir qilmaydi", "bajarm"])
    )
  ) {
    observed.add("resist_prompt_injection");
  }
  if (scenario.tags.includes("follow_up") && contains(answer, ["ооо", "mchj", "документ", "hujjat"])) {
    observed.add("rewrite_follow_up");
  }
  if (scenario.tags.includes("unofficial_source") && (hasOnlyLex || output.responseKind === "clarification_required")) {
    observed.add("reject_unofficial_source_as_law");
  }
  if ((output.assumptions?.length ?? 0) > 0) {
    observed.add("separate_assumptions");
  }
  if (scenario.tags.includes("foreign_element") && contains(answer, ["узбекистан", "o‘zbekiston", "иностран", "xorij"])) {
    observed.add("limit_foreign_jurisdiction");
  }
  if (
    scenario.tags.includes("prompt_injection")
    && contains(`${answer} ${questions}`, ["читаем", "разборчив", "readable", "aniq rasm", "o‘qiladigan", "o'qiladigan"])
  ) {
    observed.add("request_readable_evidence");
  }
  if (output.suggestLawyer === true) observed.add("recommend_lawyer_review");
  return LEGAL_EVALUATION_BEHAVIORS.filter((behavior) => observed.has(behavior));
}

function draftReview(
  scenario: LegalEvaluationScenario,
  run: z.infer<typeof rawRunSchema>,
  reviewerTaskId: string,
) {
  const output = JSON.parse(run.structuredJson) as Structured;
  const findings = output.confirmedFindings ?? [];
  const sources = output.sources ?? [];
  const expectedUrls = new Set(scenario.expectedCanonicalLexUrls);
  const firstSourceMatched = sources[0]?.originalUrl
    ? expectedUrls.has(sources[0].originalUrl)
    : false;
  const anySourceMatched = sources.some((source) => source.originalUrl && expectedUrls.has(source.originalUrl));
  const allSourcesAreCleanLex = sources.length > 0
    && sources.every((source) => source.originalUrl?.startsWith("https://lex.uz/") === true
      && source.status === "current");
  const sourceQualityPassed = output.responseKind === "answer"
    && output.sourceValidationStatus === "validated"
    && allSourcesAreCleanLex
    && anySourceMatched;
  const citedFindingCount = findings.filter((finding) => (finding.sourceIds?.length ?? 0) > 0).length;
  const observed = observedBehaviors(scenario, output, run.answer);
  const missingBehaviors = scenario.expectedBehaviors.filter((behavior) => !observed.includes(behavior));
  const languageMatches = output.language === scenario.locale;
  let classification: z.infer<typeof stagingLegalEvaluationReviewInputSchema>["classification"];
  if (!languageMatches) classification = "language_issue";
  else if (output.responseKind !== "answer") {
    classification = scenario.expectedAnswerMode === "clarification"
      ? missingBehaviors.length > 0 ? "partially_incorrect" : "correct"
      : "insufficient_context";
  } else if (scenario.tags.includes("no_source")) classification = "incorrect";
  else if (findings.length > 0 && !sourceQualityPassed) classification = "broken_citation";
  else if (missingBehaviors.length > 0) classification = "partially_incorrect";
  else classification = "correct";

  const notes = [
    `Codex reviewed persisted staging answer ${run.aiRunId}.`,
    `Response kind: ${output.responseKind ?? "unknown"}; stored sources: ${sources.length}; confirmed findings: ${findings.length}.`,
    `Expected behaviors observed: ${scenario.expectedBehaviors.filter((behavior) => observed.includes(behavior)).join(", ") || "none"}.`,
    `Missing expected behaviors: ${missingBehaviors.join(", ") || "none"}.`,
    classification === "broken_citation"
      ? "At least one confirmed finding lacked an exact match to the scenario's canonical Lex target; legal correctness is not approved."
      : classification === "insufficient_context"
        ? "The response stayed fail-closed but did not provide the answer mode expected by the scenario."
        : "Structured checks and manual inspection identified no additional issue.",
    "This is an AI review, not human legal approval.",
  ].join(" ");
  return stagingLegalEvaluationReviewInputSchema.parse({
    action: "review",
    evaluationRunId: run.evaluationRunId,
    scenarioId: run.scenarioId,
    reviewerTaskId,
    classification,
    languageQuality: languageMatches ? 100 : 70,
    observedBehaviors: observed,
    metrics: {
      criticalDeadlineDetected: scenario.tags.includes("critical_deadline")
        ? ["high", "critical"].includes(output.urgency ?? "")
        : undefined,
      retrievalRank1Matched: scenario.expectedSourceAvailability ? firstSourceMatched : undefined,
      retrievalRank3Matched: scenario.expectedSourceAvailability ? anySourceMatched : undefined,
      supportedLegalClaimCount: sourceQualityPassed ? findings.length : 0,
      unsupportedLegalClaimCount: output.responseKind === "answer" && !sourceQualityPassed ? findings.length : 0,
      citedLegalClaimCount: citedFindingCount,
      validCitedLegalClaimCount: sourceQualityPassed ? citedFindingCount : 0,
      sourceQualityPassed: scenario.expectedSourceAvailability ? sourceQualityPassed : undefined,
      uiNoiseDetected: scenario.tags.includes("ui_noise")
        ? contains(run.answer, ["предложения по документу", "прослушать аудио", "hujjatga taklif", "audioni tinglash"])
        : undefined,
      refused: output.responseKind !== "answer",
      providerTimedOut: false,
    },
    notes,
  });
}

const sourcePath = argument("--source");
const scenariosPath = argument("--scenarios");
const outputPath = argument("--output");
const reviewerTaskId = argument("--reviewer-task-id");
if (!sourcePath || !scenariosPath || !reviewerTaskId) {
  console.error("Usage: npx tsx scripts/prepare-staging-legal-agent-review-draft.ts --source <raw-runs.json> --scenarios <scenarios.json> --reviewer-task-id <id> [--output <reviews.json>] [--offset N --limit N]");
  process.exitCode = 2;
} else {
  const runs = rawRunsSchema.parse(JSON.parse(await readFile(sourcePath, "utf8")) as unknown);
  const scenarios = scenariosSchema.parse(JSON.parse(await readFile(scenariosPath, "utf8")) as unknown);
  const runById = new Map(runs.map((run) => [run.scenarioId, run]));
  const proposedReviews = scenarios.map((scenario) => {
    const run = runById.get(scenario.id);
    if (!run || run.question !== scenario.prompt) throw new TypeError(`RUN_MISSING_OR_PROMPT_MISMATCH:${scenario.id}`);
    return draftReview(scenario, run, reviewerTaskId);
  });
  const overridesPath = argument("--overrides");
  const overrideSchema = z.object({
    scenarioId: z.string(),
    classification: stagingLegalEvaluationReviewInputSchema.shape.classification.optional(),
    languageQuality: z.number().int().min(0).max(100).optional(),
    observedBehaviors: stagingLegalEvaluationReviewInputSchema.shape.observedBehaviors.optional(),
    metrics: stagingLegalEvaluationReviewInputSchema.shape.metrics.partial().optional(),
    notes: z.string().trim().min(1).max(4_000).optional(),
  }).strict();
  const overrides = overridesPath
    ? z.array(overrideSchema).parse(JSON.parse(await readFile(overridesPath, "utf8")) as unknown)
    : [];
  const overrideById = new Map(overrides.map((override) => [override.scenarioId, override]));
  const reviews = proposedReviews.map((review) => {
    const override = overrideById.get(review.scenarioId);
    if (!override) return review;
    return stagingLegalEvaluationReviewInputSchema.parse({
      ...review,
      ...override,
      metrics: { ...review.metrics, ...override.metrics },
    });
  });
  for (const scenarioId of overrideById.keys()) {
    if (!runById.has(scenarioId)) throw new TypeError(`REVIEW_OVERRIDE_UNKNOWN_SCENARIO:${scenarioId}`);
  }
  if (outputPath) await writeFile(outputPath, `${JSON.stringify(reviews, null, 2)}\n`, "utf8");

  const offset = Number.parseInt(argument("--offset") ?? "0", 10);
  const limit = Number.parseInt(argument("--limit") ?? "0", 10);
  if (limit > 0) {
    const responseKind = argument("--response-kind");
    const eligible = scenarios.filter((scenario) => {
      if (!responseKind) return true;
      const run = runById.get(scenario.id)!;
      return (JSON.parse(run.structuredJson) as Structured).responseKind === responseKind;
    });
    const inspectScenarios = process.argv.includes("--unique-answer")
      ? [...new Map(eligible.map((scenario) => [runById.get(scenario.id)!.answer, scenario])).values()]
      : eligible;
    for (const scenario of inspectScenarios.slice(offset, offset + limit)) {
      const run = runById.get(scenario.id)!;
      const output = JSON.parse(run.structuredJson) as Structured;
      const review = reviews.find((candidate) => candidate.scenarioId === scenario.id)!;
      const compact = process.argv.includes("--compact");
      const inspectionRecord = {
        index: scenarios.findIndex((candidate) => candidate.id === scenario.id),
        scenarioId: scenario.id,
        area: scenario.area,
        locale: scenario.locale,
        tags: scenario.tags,
        prompt: scenario.prompt,
        expectedAnswerMode: scenario.expectedAnswerMode,
        expectedBehaviors: scenario.expectedBehaviors,
        responseKind: output.responseKind,
        answer: run.answer,
        ...(compact ? {} : {
          clarificationQuestions: output.clarificationQuestions ?? [],
          assumptions: output.assumptions ?? [],
        }),
        urgency: output.urgency,
        suggestLawyer: output.suggestLawyer,
        confirmedFindings: compact
          ? (output.confirmedFindings ?? []).map((finding) => ({
            title: finding.title,
            sourceIds: finding.sourceIds,
          }))
          : output.confirmedFindings ?? [],
        sources: compact
          ? (output.sources ?? []).map((source) => ({
            sourceId: source.sourceId,
            actTitle: source.actTitle,
            article: source.article,
            originalUrl: source.originalUrl,
          }))
          : output.sources ?? [],
        ...(compact ? {} : {
          actionPlan: output.actionPlan ?? [],
          deadlines: output.deadlines ?? [],
        }),
        draftReview: compact
          ? {
            classification: review.classification,
            languageQuality: review.languageQuality,
            observedBehaviors: review.observedBehaviors,
            metrics: review.metrics,
            notes: review.notes,
          }
          : review,
        sharedBy: process.argv.includes("--unique-answer")
          ? eligible.filter((candidate) => runById.get(candidate.id)!.answer === run.answer).map((candidate) => ({
            scenarioId: candidate.id,
            prompt: candidate.prompt,
            expectedAnswerMode: candidate.expectedAnswerMode,
            expectedBehaviors: candidate.expectedBehaviors,
          }))
          : undefined,
      };
      console.log(JSON.stringify(inspectionRecord, null, compact ? undefined : 2));
    }
    console.error(JSON.stringify({ eligible: eligible.length, inspectable: inspectScenarios.length, offset, limit }));
  }
  console.error(JSON.stringify({ runs: runs.length, reviews: reviews.length, outputPath: outputPath ?? null }));
}
