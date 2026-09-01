#!/usr/bin/env node

const origin = process.env.LEGAL_SOURCE_SNAPSHOT_BUILD_ORIGIN ?? "http://127.0.0.1:8787";
const root = `${origin}/internal/legal-corpus/source-snapshot-build`;
const buildId = "build:staging:current:source-snapshot-qualification-v2";
const lanes = [..."0123456789abcdef"].flatMap((first) =>
  [..."0123456789abcdef"].map((second) => `${first}${second}`));
const laneConcurrency = 32;
const replayLaneConcurrency = 8;

async function call(action, body = {}, attempt = 0) {
  try {
    const response = await fetch(`${root}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buildId, ...body }),
      signal: AbortSignal.timeout(120_000),
    });
    const responseText = await response.text();
    let packet;
    try { packet = JSON.parse(responseText); } catch { packet = null; }
    if (!response.ok) {
      if (packet?.code !== "SOURCE_SNAPSHOT_INJECTED_PARTIAL_FAILURE"
        && (response.status >= 500 || packet?.code === "SOURCE_SNAPSHOT_BUILD_FAILED")
        && attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
        return call(action, body, attempt + 1);
      }
      const error = new Error(packet?.code ?? `SOURCE_SNAPSHOT_HTTP_${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (!packet) throw new Error("SOURCE_SNAPSHOT_INVALID_RESPONSE");
    return packet.result;
  } catch (error) {
    if (!(error instanceof Error && "status" in error) && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
      return call(action, body, attempt + 1);
    }
    throw error;
  }
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
    await call("advance", { injectPartialFailure: true, lane: "00" });
    throw new Error("SOURCE_SNAPSHOT_INJECTION_DID_NOT_FAIL");
  } catch (error) {
    if (error.status !== 503 || error.message !== "SOURCE_SNAPSHOT_INJECTED_PARTIAL_FAILURE") throw error;
    console.log(JSON.stringify({ event: "source_snapshot.injected_failure_observed" }));
  }
}

let advanceCalls = 0;
if (started.phase === "projections") {
  const laneQueue = [...lanes];
  let wave = 0;
  while (laneQueue.length > 0) {
    wave += 1;
    const active = laneQueue.splice(0, laneConcurrency);
    const results = await Promise.all(active.map((lane) => call("advance", { lane })));
    advanceCalls += results.length;
    for (let index = 0; index < results.length; index += 1) {
      if (!results[index].laneComplete) laneQueue.push(active[index]);
    }
    console.log(JSON.stringify({ event: "source_snapshot.advance_wave", wave, calls: advanceCalls,
      activeLanes: active.length, remainingLanes: laneQueue.length,
      processedCount: Math.max(...results.map((result) => result.processedCount ?? 0)) }));
  }
  const projectionComplete = await call("advance");
  advanceCalls += 1;
  console.log(JSON.stringify({ event: "source_snapshot.advance", calls: advanceCalls,
    result: projectionComplete }));
}

let reconcileCalls = 0;
while (started.phase !== "complete") {
  const result = await call("reconcile");
  reconcileCalls += 1;
  if (result.laneRequired) {
    const r2LaneQueue = [...lanes];
    let r2Wave = 0;
    while (r2LaneQueue.length > 0) {
      r2Wave += 1;
      const active = r2LaneQueue.splice(0, laneConcurrency);
      const results = await Promise.all(active.map((lane) => call("reconcile", { lane })));
      reconcileCalls += results.length;
      for (let index = 0; index < results.length; index += 1) {
        if (!results[index].laneComplete) r2LaneQueue.push(active[index]);
      }
      console.log(JSON.stringify({ event: "source_snapshot.r2_reconcile_wave", r2Wave,
        calls: reconcileCalls, activeLanes: active.length, remainingLanes: r2LaneQueue.length }));
    }
    continue;
  }
  if (reconcileCalls % 25 === 0 || result.complete || result.phase !== "reconciliation") {
    console.log(JSON.stringify({ event: "source_snapshot.reconcile", calls: reconcileCalls, result }));
  }
  if (result.phase === "release" || result.phase === "complete") break;
}

const finalized = await call("finalize");

async function replay(runId) {
  const laneQueue = [...lanes];
  let calls = 0;
  while (laneQueue.length > 0) {
    const active = laneQueue.splice(0, replayLaneConcurrency);
    const results = await Promise.all(active.map((lane) => call("replay", { runId, lane })));
    calls += results.length;
    for (let index = 0; index < results.length; index += 1) {
      if (!results[index].laneComplete) laneQueue.push(active[index]);
    }
    if (calls % 256 === 0 || laneQueue.length === 0) {
      console.log(JSON.stringify({ event: "source_snapshot.replay_wave", runId, calls,
        remainingLanes: laneQueue.length }));
    }
  }
  return call("replay", { runId });
}

const baselineReplay = await replay("baseline");
const repeatedReplay = await replay("repeat");
if (!baselineReplay.complete || !repeatedReplay.complete
  || baselineReplay.itemCount !== repeatedReplay.itemCount
  || baselineReplay.identitySha256 !== repeatedReplay.identitySha256) {
  throw new Error("SOURCE_SNAPSHOT_REPEATED_BUILD_IDENTITY_MISMATCH");
}
const dryRun = await call("dry-run");
if (identity(finalized) !== identity(dryRun)) throw new Error("SOURCE_SNAPSHOT_DRY_RUN_IDENTITY_MISMATCH");
console.log(JSON.stringify({
  event: "source_snapshot.complete",
  advanceCalls,
  reconcileCalls,
  repeatedBuildIdentity: baselineReplay.identitySha256,
  repeatedBuildItemCount: baselineReplay.itemCount,
  result: dryRun,
}));
