import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => argument !== "--dry-run")) {
  throw new Error("Usage: npm run deploy:staging [-- --dry-run]");
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", windowsHide: true });
    child.once("error", rejectRun);
    child.once("exit", (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited with ${code}`)));
  });
}

await run(process.execPath, ["scripts/platform-tasks.mjs", "build", "--environment", "staging"]);
const configPath = resolve(root, "dist", "server", "wrangler.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
if (config.targetEnvironment !== "staging" || config.name !== "juro-platform-staging" || config.vars?.APP_ENV !== "staging") {
  throw new Error("Refusing deployment: generated artifact is not the verified juro-platform-staging configuration.");
}
await run(process.execPath, [resolve(root, "node_modules", "wrangler", "bin", "wrangler.js"), "deploy", "--config", configPath, ...arguments_]);