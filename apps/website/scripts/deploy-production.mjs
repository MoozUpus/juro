import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const arguments_ = process.argv.slice(2);

if (arguments_.some((argument) => argument !== "--dry-run")) {
  throw new Error("Usage: npm run deploy:production [-- --dry-run]");
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", rejectRun);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : rejectRun(new Error(`${command} exited with ${code}`)),
    );
  });
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("npm_execpath is unavailable; run this deployment through npm.");
}
await run(process.execPath, [npmCli, "run", "build"]);

const configPath = resolve(root, "dist", "server", "wrangler.json");
const config = JSON.parse(await readFile(configPath, "utf8"));

if (
  config.topLevelName !== "juro-legaltech" ||
  config.main !== "index.js" ||
  config.assets?.directory !== "../client"
) {
  throw new Error(
    "Refusing deployment: generated artifact is not the expected JURO website Worker.",
  );
}

// Vinext currently emits this deprecated field. Wrangler 4.119+ rejects it.
delete config.legacy_env;

// Keep the existing hosted site as the DNS origin and place this Worker route
// in front of it. Removing the route therefore remains a fast rollback path.
config.name = "juro-legaltech";
config.workers_dev = false;
config.preview_urls = false;
config.routes = [{ pattern: "juro.uz/*", zone_name: "juro.uz" }];
config.assets = {
  ...config.assets,
  binding: "ASSETS",
};
config.images = { binding: "IMAGES" };

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

const wrangler = resolve(root, "node_modules", "wrangler", "bin", "wrangler.js");
await run(process.execPath, [
  wrangler,
  "deploy",
  "--config",
  configPath,
  ...arguments_,
]);
