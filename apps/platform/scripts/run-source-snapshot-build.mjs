#!/usr/bin/env node

const origin = process.env.LEGAL_SOURCE_SNAPSHOT_BUILD_ORIGIN ?? "http://127.0.0.1:8787";
const root = `${origin}/internal/legal-corpus/source-snapshot-build`;
const buildId = "build:staging:current:source-snapshot-v1";

async function call(action, body = {}) {
  const response = await fetch(`${root}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ buildId, ...body }),
  });
  const packet = await response.json();
  if (!response.ok) {
    const error = new Error(packet?.code ?? `SOURCE_SNAPSHOT_HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return packet.result;
}

function identity(result) {
  return JSON.stringify({
    build: result.build,
    counts: result.counts,
    release: result.release,
    activeActivationSetCount: result.activeActivationSetCount,
    releaseId: result.releaseId,
    corpusSnapshotId: result.corpusSnapshotId,
  });
}

const started = await call("start");
console.log(JSON.stringify({ event: "source_snapshot.start", result: started }));

if (started.phase === "projections" && !started.resumed) {
  try {
    await call("advance", { injectPartialFailure: true });
    throw new Error("SOURCE_SNAPSHOT_INJECTION_DID_NOT_FAIL");
  } catch (error) {
    if (error.status !== 503 || error.message !== "SOURCE_SNAPSHOT_INJECTED_PARTIAL_FAILURE") throw error;
    console.log(JSON.stringify({ event: "source_snapshot.injected_failure_observed" }));
  }
}

let advanceCalls = 0;
for (;;) {
  const result = await call("advance");
  advanceCalls += 1;
  if (advanceCalls % 25 === 0 || result.phase !== "projections") {
    console.log(JSON.stringify({ event: "source_snapshot.advance", calls: advanceCalls, result }));
  }
  if (result.phase === "reconciliation" || result.phase === "release" || result.phase === "complete") break;
}

let reconcileCalls = 0;
for (;;) {
  const result = await call("reconcile");
  reconcileCalls += 1;
  if (reconcileCalls % 25 === 0 || result.complete || result.phase !== "reconciliation") {
    console.log(JSON.stringify({ event: "source_snapshot.reconcile", calls: reconcileCalls, result }));
  }
  if (result.phase === "release" || result.phase === "complete") break;
}

const finalized = await call("finalize");
const dryRunOne = await call("dry-run");
const dryRunTwo = await call("dry-run");
if (identity(finalized) !== identity(dryRunOne) || identity(dryRunOne) !== identity(dryRunTwo)) {
  throw new Error("SOURCE_SNAPSHOT_REPEATED_BUILD_IDENTITY_MISMATCH");
}
console.log(JSON.stringify({
  event: "source_snapshot.complete",
  advanceCalls,
  reconcileCalls,
  repeatedDryRunIdentity: true,
  result: finalized,
}));
