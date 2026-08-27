import { readFile } from "node:fs/promises";
import path from "node:path";

const permitted = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT OR Apache-2.0",
  "(MIT AND Zlib)",
  "MPL-2.0",
  "Python-2.0",
]);

function packageName(location) {
  const marker = "node_modules/";
  const normalized = location.replaceAll("\\", "/");
  const index = normalized.lastIndexOf(marker);
  const relative = normalized.slice(index + marker.length);
  const segments = relative.split("/");
  return relative.startsWith("@") ? `${segments[0]}/${segments[1]}` : segments[0];
}

function approvedException(name, license) {
  if (name === "@fontsource-variable/manrope" && license === "OFL-1.1") return true;
  if (name === "pizzip" && license === "(MIT OR GPL-3.0)") return true;
  if (name.startsWith("@img/sharp-libvips-") && license === "LGPL-3.0-or-later") return true;
  if (name.startsWith("@img/sharp-") && [
    "Apache-2.0 AND LGPL-3.0-or-later",
    "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  ].includes(license)) return true;
  return false;
}

const targets = process.argv.slice(2);
if (targets.length === 0) targets.push("apps/platform", "apps/website");

let failed = false;
for (const target of targets) {
  const lockPath = path.resolve(target, "package-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const packages = Object.entries(lock.packages ?? {}).filter(([location]) => location !== "");
  const problems = [];
  const counts = new Map();

  for (const [location, entry] of packages) {
    const name = packageName(location);
    const license = typeof entry.license === "string" ? entry.license.trim() : "";
    counts.set(license || "UNDECLARED", (counts.get(license || "UNDECLARED") ?? 0) + 1);
    if (!license) problems.push(`${name}: undeclared licence`);
    else if (/AGPL|SSPL|BUSL|Commons Clause/iu.test(license)) problems.push(`${name}: denied ${license}`);
    else if (!permitted.has(license) && !approvedException(name, license)) problems.push(`${name}: unreviewed ${license}`);
  }

  const summary = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([license, count]) => `${license}=${count}`).join(", ");
  if (problems.length > 0) {
    failed = true;
    console.error(`FAIL ${target}: ${problems.join("; ")}`);
  } else {
    console.log(`PASS ${target}: ${packages.length} locked packages; ${summary}`);
  }
}

if (failed) process.exitCode = 1;
