#!/usr/bin/env node

const origin = process.env.LEGAL_AI_SEARCH_PROJECTION_ORIGIN ?? "http://127.0.0.1:8787";
const endpoint = `${origin}/internal/legal-corpus/ai-search-projection/advance`;
const buildId = "projection:staging:current:source-snapshot-v1";
const lanes = [..."0123456789abcdef"].flatMap((first) =>
  [..."0123456789abcdef"].map((second) => `${first}${second}`));
const concurrency = 16;
let calls = 0;

async function advance(lane, attempt = 0) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buildId, limit: 100, ...(lane ? { lane } : {}) }),
      signal: AbortSignal.timeout(120_000),
    });
    const packet = await response.json().catch(() => null);
    if (!response.ok || !packet?.result) {
      const error = new Error(packet?.code ?? `AI_SEARCH_PROJECTION_HTTP_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return packet.result;
  } catch (error) {
    if (attempt >= 10) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    return advance(lane, attempt + 1);
  }
}

const laneQueue = [...lanes];
let wave = 0;
while (laneQueue.length > 0) {
  wave += 1;
  const active = laneQueue.splice(0, concurrency);
  const results = await Promise.all(active.map((lane) => advance(lane)));
  calls += results.length;
  results.forEach((result, index) => {
    if (!result.laneComplete) laneQueue.push(active[index]);
  });
  if (wave % 5 === 0 || laneQueue.length === 0) {
    console.log(JSON.stringify({ event: "ai_search.projection_wave", wave, calls,
      activeLanes: active.length, remainingLanes: laneQueue.length,
      totalCopied: Math.max(...results.map((result) => result.totalCopied)) }));
  }
}
const completed = await advance();
if (completed.status !== "complete") throw new Error("AI_SEARCH_PROJECTION_NOT_COMPLETE");
console.log(JSON.stringify({ event: "ai_search.projection_complete", calls: calls + 1, result: completed }));
