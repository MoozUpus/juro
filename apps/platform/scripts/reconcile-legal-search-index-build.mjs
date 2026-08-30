const origin = new URL(process.env.JURO_CORPUS_BUILD_ORIGIN || "http://127.0.0.1:8787");
const manifestId = process.argv[2];
if (!/^[A-Za-z0-9:_-]{1,160}$/u.test(manifestId ?? "")) {
  throw new Error("Usage: reconcile-legal-search-index-build.mjs <manifest-id>");
}

const retryable = /^(?:BUILD_PROXY_REQUEST_FAILED|QDRANT_REQUEST_FAILED|LEGAL_CORPUS_EMBEDDING_(?:REQUEST|USAGE)_FAILED|HTTP_5\d\d)$/u;

async function call(action, body) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(new URL(`/internal/legal-corpus/search-index-build/${action}`, origin), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const packet = await response.json();
      const code = `${packet.code ?? `HTTP_${response.status}`}`;
      if (response.ok) return packet.result;
      if (!retryable.test(code) || attempt >= 7) {
        throw new Error(`${code}: ${JSON.stringify(packet)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.split(":", 1)[0] : "";
      const code = /^[A-Z][A-Z0-9_]{2,100}$/u.test(message)
        ? message
        : "BUILD_PROXY_REQUEST_FAILED";
      if (!retryable.test(code) || attempt >= 7) throw error;
    }
    const delayMs = Math.min(30_000, 1_000 * 2 ** attempt);
    process.stderr.write(`${JSON.stringify({ status: "retrying", action, attempt: attempt + 1, delayMs })}\n`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

let afterChunkId;
let scannedChunkCount = 0;
let repairedChunkCount = 0;
let batches = 0;
for (;;) {
  const result = await call("reconcile", {
    manifestId,
    maxChunks: 256,
    ...(afterChunkId ? { afterChunkId } : {}),
  });
  batches += 1;
  scannedChunkCount += result.scannedChunkCount;
  repairedChunkCount += result.repairedChunkCount;
  afterChunkId = result.lastChunkId ?? afterChunkId;
  if (result.repairedChunkCount > 0 || batches % 50 === 0 || result.status === "complete") {
    process.stdout.write(`${JSON.stringify({
      status: result.status,
      batches,
      scannedChunkCount,
      repairedChunkCount,
      lastChunkId: afterChunkId ?? null,
    })}\n`);
  }
  if (result.status === "complete") break;
}

const manifest = await call("finalize", { manifestId, maxChunks: 256 });
process.stdout.write(`${JSON.stringify({ status: "finalized", manifest, repairedChunkCount })}\n`);
