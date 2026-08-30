import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const fixture = JSON.parse(await readFile(path.join(root, ".scratch", "legal-retrieval-redesign", "live-matrix.json"), "utf8"));
const artifacts = path.resolve(root, ".scratch", "legal-retrieval-redesign", "artifacts");
const profilePath = path.resolve(artifacts, `chrome-${process.pid}-${Date.now()}`);
if (!profilePath.startsWith(`${artifacts}${path.sep}`)) throw new Error("Unsafe Chrome profile path");
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const origin = process.env.JURO_LIVE_ORIGIN || "http://localhost:5173";
const retrievalProfile = process.env.JURO_RETRIEVAL_PROFILE || "indexed-isolation";
const expectedIndexVersion = process.env.JURO_INDEX_VERSION || "staging-20260830-provision-v1";
const requestedScenarioIds = new Set((process.env.JURO_SCENARIO_IDS ?? "")
  .split(",").map((value) => value.trim()).filter(Boolean));
const scenarios = requestedScenarioIds.size > 0
  ? fixture.scenarios.filter((scenario) => requestedScenarioIds.has(scenario.id))
  : fixture.scenarios;
if (scenarios.length === 0) throw new Error("JURO_SCENARIO_IDS matched no scenarios");
const singleRun = process.env.JURO_SINGLE_RUN === "true";
const port = 9500 + (process.pid % 400);
await mkdir(artifacts, { recursive: true });

const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profilePath}`, "about:blank",
], { stdio: "ignore", windowsHide: true });

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).ok, 10_000, "Chrome");
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const cdp = connectCdp(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: `${origin}/api/auth/dev-login?returnTo=${encodeURIComponent("/ru/individual/ai-chat")}` });
  await waitForEvaluation(cdp, `Boolean(document.querySelector(".ai-workspace"))`, 30_000, "authenticated AI workspace");

  const runs = [];
  for (const scenario of scenarios) {
    for (const cacheState of singleRun ? ["cold"] : ["cold", "warm"]) {
      const modes = singleRun ? ["fast"] : scenario.critical ? ["fast", "deep"] : ["fast"];
      for (const reasoningMode of modes) {
        const result = await evaluate(cdp, requestExpression({ scenario, reasoningMode, cacheState }), true);
        const failures = validateRun(scenario, result, retrievalProfile, cacheState);
        const entry = { scenarioId: scenario.id, area: scenario.area, locale: scenario.locale, cacheState, reasoningMode, ...result, failures };
        runs.push(entry);
        process.stdout.write(`${JSON.stringify({
          scenarioId: scenario.id,
          cacheState,
          reasoningMode,
          elapsedMs: result.elapsedMs,
          indexedRetrievalMs: result.trace?.indexedRetrievalMs ?? null,
          articles: result.sources.map((source) => source.article).filter(Boolean),
          failures,
        })}\n`);
      }
    }
  }

  const percentile = (values, ratio) => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? null;
  };
  const p95IndexedMs = percentile(runs.map((run) => run.trace?.indexedRetrievalMs).filter(Number.isFinite), 0.95);
  const p95CompleteMs = percentile(runs.map((run) => run.elapsedMs).filter(Number.isFinite), 0.95);
  const observedIndexVersions = new Set(runs.map((run) => run.trace?.indexVersion).filter(Boolean));
  const summaryFailures = [
    ...(observedIndexVersions.size !== 1 || !observedIndexVersions.has(expectedIndexVersion)
      ? [`observed index versions ${[...observedIndexVersions].join(",") || "none"}`]
      : []),
    ...(p95IndexedMs === null || p95IndexedMs > 5_000 ? [`indexed p95 ${p95IndexedMs} ms exceeds 5000 ms`] : []),
    ...(p95CompleteMs === null || p95CompleteMs > 30_000 ? [`complete p95 ${p95CompleteMs} ms exceeds 30000 ms`] : []),
    ...runs.flatMap((run) => run.failures.map((failure) => `${run.scenarioId}/${run.cacheState}/${run.reasoningMode}: ${failure}`)),
  ];
  const report = {
    schemaVersion: 1,
    matrixVersion: fixture.version,
    indexVersion: expectedIndexVersion,
    retrievalProfile,
    origin,
    generatedAt: new Date().toISOString(),
    scenarioCount: scenarios.length,
    requestCount: runs.length,
    p95IndexedMs,
    p95CompleteMs,
    passed: summaryFailures.length === 0,
    failures: summaryFailures,
    runs,
  };
  const outputPath = path.join(artifacts, `${retrievalProfile}-${Date.now()}.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ outputPath, passed: report.passed, p95IndexedMs, p95CompleteMs, failureCount: summaryFailures.length }, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
  await cdp.send("Browser.close").catch(() => undefined);
  cdp.close();
} finally {
  chrome.kill();
  await rm(profilePath, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }).catch(() => undefined);
}

function requestExpression({ scenario, reasoningMode, cacheState }) {
  return `(async () => {
    const started = performance.now();
    const response = await fetch("/api/platform/ai", {
      method: "POST",
      headers: { accept: "text/event-stream", "content-type": "application/json", "x-juro-csrf": "1", "idempotency-key": crypto.randomUUID(), ${JSON.stringify("x-juro-retrieval-cache")}: ${JSON.stringify(cacheState === "cold" ? "refresh" : "replay")} },
      body: JSON.stringify(${JSON.stringify({
        question: scenario.question,
        locale: scenario.locale,
        answerMode: "detailed",
        operation: "new",
      }).replace(/}$/, `,"reasoningMode":${JSON.stringify(reasoningMode)}}`)})
    });
    const text = await response.text();
    let terminal = null;
    let trace = null;
    for (const frame of text.replace(/\\r\\n/g, "\\n").split("\\n\\n")) {
      const event = frame.split("\\n").find(line => line.startsWith("event:"))?.slice(6).trim();
      const data = frame.split("\\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\\n");
      if (!data) continue;
      const packet = JSON.parse(data);
      if (event === "status" && packet.stage === "retrieval_trace") trace = packet.trace;
      if (event === "complete" || event === "error") terminal = packet;
    }
    const body = terminal?.body ?? {};
    return {
      elapsedMs: Math.round(performance.now() - started),
      streamStatus: response.status,
      terminalStatus: terminal?.status ?? null,
      errorCode: body.code ?? null,
      responseKind: body.result?.responseKind ?? null,
      coverageStatus: body.result?.coverageStatus ?? null,
      sourceValidationStatus: body.result?.sourceValidationStatus ?? null,
      evidenceMode: body.result?.evidenceMode ?? null,
      sources: Array.isArray(body.result?.sources) ? body.result.sources.map(source => ({
        sourceId: source.sourceId,
        article: source.article,
        originalUrl: source.originalUrl,
        actIdentifier: source.actIdentifier,
        actTitle: source.actTitle
      })) : [],
      facts: Array.isArray(body.facts) ? body.facts.map(fact => fact.statement) : [],
      trace
    };
  })()`;
}

function validateRun(scenario, run, profile, cacheState) {
  const failures = [];
  if (run.terminalStatus < 200 || run.terminalStatus >= 300) failures.push(`terminal status ${run.terminalStatus} (${run.errorCode})`);
  if (run.elapsedMs > 30_000) failures.push(`complete latency ${run.elapsedMs} ms`);
  if (run.responseKind !== "answer") failures.push(`responseKind=${run.responseKind}`);
  if (run.coverageStatus !== "good_coverage") failures.push(`coverageStatus=${run.coverageStatus}`);
  if (run.sourceValidationStatus !== "validated") failures.push("official sources were not validated");
  if (!run.trace) failures.push("development retrieval trace missing");
  const expectedCacheOutcome = cacheState === "cold" ? "refresh" : "hit";
  if (run.trace?.cacheOutcome !== expectedCacheOutcome) {
    failures.push(`cacheOutcome=${run.trace?.cacheOutcome}, expected ${expectedCacheOutcome}`);
  }
  if (run.trace?.rerankingOutcome !== "selected") failures.push(`rerankingOutcome=${run.trace?.rerankingOutcome}`);
  if (run.trace?.denseUnavailable !== false) failures.push("dense channel unavailable");
  if ((run.trace?.requirements ?? []).some(requirement => requirement.status !== "covered")) failures.push("uncovered Coverage Requirement");
  if (profile === "indexed-isolation" && run.trace?.fusionOutcome !== "indexed") failures.push(`fusionOutcome=${run.trace?.fusionOutcome}`);
  const documentIds = run.sources.flatMap(source => [
    String(source.actIdentifier ?? "").match(/^lexuz-family:(\d+)$/u)?.[1],
    String(source.originalUrl ?? "").match(/\/docs\/-?(\d+)/u)?.[1],
  ]).filter(Boolean);
  if (!scenario.documentIds.some(documentId => documentIds.includes(documentId))) failures.push(`expected document ${scenario.documentIds.join("|")} absent`);
  const articles = new Set(run.sources.map(source => String(source.article ?? "").match(/\d+(?:[.-]\d+)?/u)?.[0]).filter(Boolean));
  for (const article of scenario.articles ?? []) if (!articles.has(article)) failures.push(`required article ${article} absent`);
  if (run.sources.some(source => !/^https:\/\/(?:www\.)?lex\.uz\/(?:ru|uz|uzc|en)?\/?docs\/-?\d+/u.test(source.originalUrl ?? ""))) failures.push("non-Lex citation URL");
  if (run.facts.some(fact => /^\s*(?:ст\.?\s*)?\d+(?:[.-]\d+)?\s*$/iu.test(fact))) failures.push("bare article persisted as Case Fact");
  return failures;
}

function connectCdp(url) {
  let nextId = 0;
  const pending = new Map();
  const socket = new WebSocket(url);
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(String(event.data));
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  return {
    ready,
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForEvaluation(cdp, expression, timeout, label) {
  await waitFor(async () => Boolean(await evaluate(cdp, expression)), timeout, label);
}

async function waitFor(check, timeout, label) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}
