import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => argument !== "--dry-run")) {
  throw new Error("Usage: npm run deploy:production [-- --dry-run]");
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit", windowsHide: true });
    let stdout = "";
    if (options.capture) child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.once("error", rejectRun);
    child.once("exit", (code) => code === 0 ? resolveRun(stdout) : rejectRun(new Error(`${command} exited with ${code}`)));
  });
}

const wrangler = resolve(root, "node_modules", "wrangler", "bin", "wrangler.js");
const requiredSecretNames = new Set([
  "ADMIN_CONSOLE_TOKEN",
  "ADMIN_INTERNAL_TOKEN",
  "ANTHROPIC_API_KEY",
  "IDENTITY_KEYRING",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "TURNSTILE_SECRET_KEY",
]);

const secretOutput = await run(process.execPath, [wrangler, "secret", "list", "--name", "juro", "--format", "json"], { capture: true });
const configuredSecretNames = new Set(JSON.parse(secretOutput).map((secret) => secret.name));
const missingSecrets = [...requiredSecretNames].filter((name) => !configuredSecretNames.has(name));
if (missingSecrets.length > 0) {
  throw new Error(`Refusing incomplete production release: missing production secret bindings ${missingSecrets.join(", ")}.`);
}

await run(process.execPath, ["scripts/platform-tasks.mjs", "build", "--environment", "production"]);
const configPath = resolve(root, "dist", "server", "wrangler.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const serializedConfig = JSON.stringify(config);
if (
  config.targetEnvironment !== "production"
  || config.name !== "juro"
  || config.vars?.APP_ENV !== "production"
  || config.d1_databases?.[0]?.database_name !== "juro-production"
  || serializedConfig.includes("juro-staging")
  || serializedConfig.includes("staging-")
) {
  throw new Error("Refusing deployment: generated artifact is not an isolated production platform configuration.");
}
// The platform Worker has an attached Container definition. A normal Wrangler
// deploy may follow the application upload with a separately generated
// Container rollout version. That follow-up version is derived from the
// top-level development environment and can replace the verified production
// bindings. The scanner Container is deployed independently; the application
// release must therefore leave its rollout unchanged.
await run(process.execPath, [
  wrangler,
  "deploy",
  "--config",
  configPath,
  "--containers-rollout",
  "none",
  ...arguments_,
]);
