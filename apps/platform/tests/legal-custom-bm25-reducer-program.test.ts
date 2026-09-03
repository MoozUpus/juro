import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";

import { CUSTOM_CURRENT_REDUCER_PROGRAM } from "../worker/legal-custom-bm25-reducer-program";

test("container reducer program parses and fails closed before touching an unknown mode", () => {
  const result = spawnSync(process.execPath, [
    "--input-type=module", "-e", CUSTOM_CURRENT_REDUCER_PROGRAM,
  ], {
    encoding: "utf8",
    input: JSON.stringify({
      schemaVersion: 1,
      releaseId: "release:staging:current:custom-v1:2026-09-03",
      mode: "unknown",
      outputPrefix: "search-releases/release:staging:current:custom-v1:2026-09-03/sparse/word-v1/reduced",
    }),
  });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /REDUCER_MODE_INVALID/u);
  assert.equal(result.stdout, "");
});

test("container reducer uses deterministic external sort and scoped virtual R2 only", () => {
  assert.match(CUSTOM_CURRENT_REDUCER_PROGRAM, /LC_ALL:"C"/u);
  assert.match(CUSTOM_CURRENT_REDUCER_PROGRAM, /ARTIFACT_HOST\+"\/object\//u);
  assert.match(CUSTOM_CURRENT_REDUCER_PROGRAM, /ARTIFACT_HOST\+"\/output\//u);
  assert.equal(CUSTOM_CURRENT_REDUCER_PROGRAM.includes("https://api.cloudflare.com"), false);
  assert.equal(CUSTOM_CURRENT_REDUCER_PROGRAM.includes("OPENAI"), false);
});

test("container reducer builds documents, hashed postings, lexicon and manifest", async (context) => {
  const objects = new Map<string, Buffer>();
  const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const putJson = (key: string, value: unknown) => {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
    objects.set(key, bytes);
    return { key, sizeBytes: bytes.length, sha256: sha256(bytes) };
  };
  const server = createServer(async (request, response) => {
    const [, operation, encoded] = request.url!.split("/");
    const key = Buffer.from(encoded!, "base64url").toString("utf8");
    if (operation === "object" && request.method === "GET") {
      const bytes = objects.get(key);
      if (!bytes || sha256(bytes) !== request.headers["x-expected-sha256"]) {
        response.writeHead(409).end(); return;
      }
      response.writeHead(200).end(bytes); return;
    }
    if (operation === "output" && request.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      const digest = sha256(bytes);
      if (digest !== request.headers["x-content-sha256"] || bytes.length !== Number(
        request.headers["content-length"],
      )) { response.writeHead(409).end(); return; }
      objects.set(key, bytes);
      response.writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ key, sizeBytes: bytes.length, sha256: digest }));
      return;
    }
    response.writeHead(405).end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const releaseId = "release:staging:current:custom-v1:2026-09-03";
  const outputPrefix = `search-releases/${releaseId}/sparse/word-v1/reduced`;
  const run = async (input: unknown) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", CUSTOM_CURRENT_REDUCER_PROGRAM], {
      env: {
        ...process.env,
        JURO_ARTIFACT_HOST: `http://127.0.0.1:${address.port}`,
        PATH: `C:\\Program Files (x86)\\Atmel\\Studio\\7.0\\shellutils;${process.env.PATH ?? ""}`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => { stdout += value; });
    child.stderr.setEncoding("utf8").on("data", (value) => { stderr += value; });
    child.stdin.end(JSON.stringify(input));
    const [code] = await once(child, "close") as [number];
    assert.equal(code, 0, stderr);
    assert.equal(stderr, "");
    return JSON.parse(stdout) as {
      artifact: { key: string };
      postings: { key: string };
      sourceRecordCount: number;
      statistics: { documentCount: number };
    };
  };
  const documentPage = putJson("input/documents.json", {
    schemaVersion: 1, releaseId, documents: [{
      ordinal: 0, itemKey: "chunk-a", segmentId: "current-base-v1", language: "ru",
      documentType: "Кодекс", validFromEpoch: 100, validToEpoch: null,
      fieldLengths: { title: 2, hierarchy: 0, article: 1, text: 4 },
    }],
  });
  const documentPlan = putJson("plans/documents.json", {
    schemaVersion: 1, releaseId, inputs: [documentPage],
  });
  const documents = await run({
    schemaVersion: 1, releaseId, mode: "documents", outputPrefix, plan: documentPlan,
  });
  assert.equal(documents.statistics.documentCount, 1);
  const termHash = "a".repeat(64);
  const partitionPage = putJson("input/a.json", {
    schemaVersion: 1, releaseId, partition: "a",
    records: [{ termHash, itemOrdinal: 0, itemKey: "chunk-a", field: "text", termFrequency: 2 }],
  });
  const partitionPlan = putJson("plans/a.json", {
    schemaVersion: 1, releaseId, partition: "a", inputs: [partitionPage],
  });
  const partition = await run({
    schemaVersion: 1, releaseId, mode: "partition", partition: "a", outputPrefix,
    plan: partitionPlan, documents: documents.artifact,
  });
  assert.equal(partition.sourceRecordCount, 1);
  const posting = JSON.parse(objects.get(partition.postings.key)!.toString("utf8"));
  assert.equal(posting.termHash, termHash);
  assert.equal(JSON.stringify(posting).includes("chunk-a"), false);
  const manifestPlan = putJson("plans/manifest.json", {
    schemaVersion: 1, releaseId, documents: documents.artifact,
    partitions: "0123456789abcdef".split("").map((value) => ({ ...partition, partition: value })),
  });
  const manifest = await run({
    schemaVersion: 1, releaseId, mode: "manifest", outputPrefix, plan: manifestPlan,
  });
  const manifestValue = JSON.parse(objects.get(manifest.artifact.key)!.toString("utf8"));
  assert.equal(manifestValue.schemaVersion, "custom-bm25-manifest-v1");
  assert.deepEqual(Object.keys(manifestValue.segments[0].postings), "0123456789abcdef".split(""));
});
