import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("agent artifacts are strict, content-free evidence and never claim human approval", async () => {
  const [contract, validator, builder, preparer, packageJson] = await Promise.all([
    readFile(new URL("../evaluation/staging-legal-evaluation-agent-artifacts.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/validate-staging-legal-evaluation-agent.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build-staging-legal-agent-artifacts.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/prepare-staging-legal-agent-review-draft.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(contract, /AI_REVIEW_NOT_HUMAN_LEGAL_APPROVAL/u);
  assert.match(contract, /agent_review_only_human_legal_approval_pending/u);
  assert.match(contract, /staging_persisted_agent_review_evidence/u);
  assert.match(contract, /reviewEventHash/u);
  assert.match(contract, /AGENT_EVIDENCE_CHAIN_LINK_INVALID/u);
  assert.match(contract, /AGENT_EVIDENCE_SERIALIZED_REVIEW_MISMATCH/u);
  assert.match(contract, /JSON\.parse\(record\.metricsJson\)/u);
  assert.match(contract, /new Date\(record\.reviewedAt\)\.toISOString\(\)/u);
  assert.doesNotMatch(contract, /humanReviewerId|actor_mfa_verified_at/u);
  assert.doesNotMatch(contract, /question:\s*z\.|answer:\s*z\./u);
  assert.match(validator, /verifyStagingLegalAgentEvidence/u);
  assert.match(builder, /AGENT_RECORD_HASH_MISMATCH/u);
  assert.match(builder, /orderReviewChain/u);
  assert.doesNotMatch(builder, /humanReviewerId/u);
  assert.match(preparer, /draftReview/u);
  assert.match(preparer, /RUN_MISSING_OR_PROMPT_MISMATCH/u);
  assert.match(packageJson, /evaluate:legal:validate-agent/u);
  assert.match(packageJson, /evaluate:legal:build-agent/u);
});
