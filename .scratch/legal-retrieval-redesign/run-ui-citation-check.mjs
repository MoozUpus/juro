import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifacts = path.resolve(root, ".scratch", "legal-retrieval-redesign", "artifacts");
const profilePath = path.resolve(artifacts, `chrome-ui-${process.pid}-${Date.now()}`);
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const origin = process.env.JURO_LIVE_ORIGIN || "http://localhost:5173";
const question = process.env.JURO_UI_QUESTION || "Можно ли уволить сотрудницу в декрете?";
const expectedArticles = (process.env.JURO_UI_ARTICLES || "215,237,404,405,408,409").split(",");
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
  await waitForEvaluation(cdp, `Boolean(document.querySelector("#ai-question:not([disabled])"))`, 30_000, "AI composer");
  await evaluate(cdp, `document.querySelector("#ai-question").focus()`);
  await cdp.send("Input.insertText", { text: question });
  await waitForEvaluation(cdp, `document.querySelector("#ai-question").value === ${JSON.stringify(question)}`, 5_000, "question input");
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await waitForEvaluation(cdp, `Boolean(document.querySelector('.legal-answer[data-answer-kind="legal-answer"]'))`, 40_000, "rendered legal answer");
  const result = await evaluate(cdp, `(() => {
    const answer = document.querySelector('.legal-answer[data-answer-kind="legal-answer"]');
    const links = [...answer.querySelectorAll('.legal-answer__citations a')].map(link => ({
      label: link.textContent.trim(), href: link.href, target: link.target, rel: link.rel
    }));
    const facts = [...document.querySelectorAll('.ai-fact p')].map(node => node.textContent.trim());
    return { answerText: answer.innerText, links, facts };
  })()`, true);
  const labels = result.links.map((link) => link.label);
  const failures = [
    ...expectedArticles.flatMap((article) => labels.some((label) => label.startsWith(`Ст. ${article} —`)) ? [] : [`missing linked Ст. ${article}`]),
    ...result.links.flatMap((link) => /^https:\/\/(?:www\.)?lex\.uz\/(?:ru\/)?docs\/-?\d+/u.test(link.href) ? [] : [`non-Lex link ${link.href}`]),
    ...result.links.flatMap((link) => link.target === "_blank" && link.rel.includes("noopener") ? [] : [`unsafe external link ${link.label}`]),
    ...result.facts.flatMap((fact) => /^\s*(?:ст\.?\s*)?\d+(?:[.-]\d+)?\s*$/iu.test(fact) ? [`bare fact ${fact}`] : []),
  ];
  const report = { generatedAt: new Date().toISOString(), origin, question, expectedArticles, ...result, failures, passed: failures.length === 0 };
  const outputPath = path.join(artifacts, `ui-citations-${Date.now()}.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ outputPath, linkCount: result.links.length, labels, facts: result.facts, failures }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
  await cdp.send("Browser.close").catch(() => undefined);
  cdp.close();
} finally {
  chrome.kill();
  await rm(profilePath, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }).catch(() => undefined);
}

function connectCdp(url) {
  let nextId = 0;
  const pending = new Map();
  const socket = new WebSocket(url);
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}
