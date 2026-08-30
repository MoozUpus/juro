const origin = new URL(process.env.JURO_CORPUS_BUILD_ORIGIN || "http://127.0.0.1:8787");
const manifestId = process.argv[2];
if (!/^[A-Za-z0-9:_-]{1,160}$/u.test(manifestId ?? "")) {
  throw new Error("Usage: run-legal-search-index-build.mjs <manifest-id>");
}
const cursorIntervalMs = Math.max(0, Math.min(30_000,
  Number(process.env.JURO_CORPUS_BUILD_INTERVAL_MS ?? 4_000) || 0));

const retryable = /^(?:BUILD_PROXY_REQUEST_FAILED|QDRANT_REQUEST_FAILED|LEGAL_CORPUS_EMBEDDING_(?:REQUEST|USAGE)_FAILED|HTTP_5\d\d)/u;

async function call(action) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(new URL(`/internal/legal-corpus/search-index-build/${action}`, origin), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifestId, maxChunks: 256 }),
      });
      const packet = await response.json();
      const code = `${packet.code ?? `HTTP_${response.status}`}`;
      if (response.ok) return packet.result;
      if (!retryable.test(code) || attempt >= 7) throw new Error(code);
      const delayMs = Math.min(30_000, 1_000 * 2 ** attempt);
      process.stderr.write(`${JSON.stringify({ status: "retrying", action, code, attempt: attempt + 1, delayMs })}\n`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = /^[A-Z][A-Z0-9_]{2,100}$/u.test(message)
        ? message
        : "BUILD_PROXY_REQUEST_FAILED";
      if (!retryable.test(code) || attempt >= 7) throw error;
      const delayMs = Math.min(30_000, 1_000 * 2 ** attempt);
      process.stderr.write(`${JSON.stringify({ status: "retrying", action, code, attempt: attempt + 1, delayMs })}\n`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

let result;
do {
  result = await call("advance");
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "complete" && cursorIntervalMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, cursorIntervalMs));
  }
} while (result.status !== "complete");

const manifest = await call("finalize");
process.stdout.write(`${JSON.stringify({ status: "finalized", manifest })}\n`);
