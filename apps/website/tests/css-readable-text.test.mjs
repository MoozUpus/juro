import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const MINIMUM_TEXT_PX = 12;
const appRoot = path.resolve("app");

function listCssFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listCssFiles(target);
    return entry.isFile() && entry.name.endsWith(".css") ? [target] : [];
  });
}

test("public CSS keeps explicit px/rem font sizes at or above 12 CSS px", () => {
  const offenders = [];
  const declarationPattern = /font-size\s*:\s*(\d*\.?\d+)(px|rem)\b/g;

  for (const file of listCssFiles(appRoot)) {
    const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(declarationPattern)) {
      const value = Number.parseFloat(match[1]);
      const computedPixels = match[2] === "rem" ? value * 16 : value;
      if (computedPixels + 0.01 >= MINIMUM_TEXT_PX) continue;
      const line = css.slice(0, match.index).split("\n").length;
      offenders.push(`${path.relative(appRoot, file)}:${line} ${match[0]} (${computedPixels}px)`);
    }
  }

  assert.deepEqual(offenders, [], `Explicit public text sizes below ${MINIMUM_TEXT_PX}px:\n${offenders.join("\n")}`);
});
