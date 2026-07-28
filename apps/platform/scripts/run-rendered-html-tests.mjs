import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const loaderUrl = new URL("./cloudflare-workers-loader.mjs", import.meta.url).href;
const result = spawnSync(
  process.execPath,
  [
    "--experimental-loader",
    loaderUrl,
    "--test",
    "tests/rendered-html.test.mjs",
  ],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

if (result.signal) {
  throw new Error(`Rendered HTML tests terminated by ${result.signal}.`);
}

process.exitCode = result.status ?? 1;
