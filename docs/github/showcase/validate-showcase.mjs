import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const showcase = resolve(root, "docs/github/showcase");
const sharpPath = process.env.JURO_README_SHARP;

if (!sharpPath) throw new Error("Set JURO_README_SHARP to the installed sharp package path.");
const sharp = createRequire(import.meta.url)(sharpPath);

const readmes = ["README.md", "README.ru.md", "README.uz.md"];
const requiredAnchors = {
  "README.md": ["product-demo", "how-it-works", "product-experience", "architecture"],
  "README.ru.md": ["product-demo", "как-это-работает", "продуктовый-опыт", "архитектура"],
  "README.uz.md": ["product-demo", "qanday-ishlaydi", "mahsulot-tajribasi", "arxitektura"],
};

for (const file of readmes) {
  const absolute = resolve(root, file);
  const text = readFileSync(absolute, "utf8");
  if (!text.includes("AI Avatar") || !text.includes("IN DEVELOPMENT")) throw new Error(`${file} lacks the explicit AI Avatar development boundary`);
  if ((text.match(/<picture>/g) || []).length < 8) throw new Error(`${file} does not include all responsive showcase pictures`);
  for (const anchor of requiredAnchors[file]) {
    if (!text.includes(`name="${anchor}"`) && !text.includes(`href="#${anchor}"`)) throw new Error(`${file} lacks anchor ${anchor}`);
  }

  const references = [...text.matchAll(/(?:href|src|srcset)="([^"]+)"|\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1] || match[2]);
  for (const reference of references) {
    if (/^(https?:|mailto:|#)/.test(reference)) continue;
    const clean = reference.split(/[?#]/)[0];
    if (clean && !existsSync(resolve(dirname(absolute), clean))) throw new Error(`${file} has a missing local reference: ${reference}`);
  }
}

const svgFiles = readdirSync(showcase).filter((file) => extname(file) === ".svg");
for (const file of svgFiles) {
  const absolute = resolve(showcase, file);
  const source = readFileSync(absolute, "utf8");
  const withoutNamespace = source.replace("http://www.w3.org/2000/svg", "");
  if (/<(?:script|foreignObject)\b/i.test(source) || /https?:\/\//i.test(withoutNamespace)) throw new Error(`${file} contains unsupported or external SVG content`);
  const metadata = await sharp(Buffer.from(source)).metadata();
  if (metadata.format !== "svg" || !metadata.width || !metadata.height) throw new Error(`${file} did not parse as an SVG image`);
}

for (const [file, width, height] of [["product-demo.gif", 1280, 720], ["product-demo-mobile.gif", 720, 1060]]) {
  const absolute = resolve(showcase, file);
  const metadata = await sharp(absolute, { animated: true }).metadata();
  if (metadata.width !== width || metadata.pageHeight !== height || metadata.pages !== 37) {
    throw new Error(`${file} has unexpected animation metadata: ${JSON.stringify({ width: metadata.width, pageHeight: metadata.pageHeight, pages: metadata.pages })}`);
  }
  if (statSync(absolute).size >= 10 * 1024 * 1024) throw new Error(`${file} exceeds GitHub's 10 MB image limit`);
  if (!metadata.delay?.every((delay) => delay === 340)) throw new Error(`${file} has an unexpected frame delay`);
}

if (process.argv.includes("--github")) {
  for (const file of readmes) {
    const response = await fetch("https://api.github.com/markdown", {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "JURO-README-showcase-validator",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ text: readFileSync(resolve(root, file), "utf8"), mode: "gfm", context: "MoozUpus/juro" }),
    });
    if (!response.ok) throw new Error(`GitHub Markdown API rejected ${file}: ${response.status} ${await response.text()}`);
    const html = await response.text();
    const pictureCount = (html.match(/<picture>/g) || []).length;
    const sourceCount = (html.match(/<source\b/g) || []).length;
    if (pictureCount < 8 || sourceCount < 10) throw new Error(`GitHub sanitizer removed responsive markup from ${file}: picture=${pictureCount} source=${sourceCount}`);
    for (const anchor of requiredAnchors[file]) {
      if (!html.includes(`name="${anchor}"`) && !html.includes(`id="${anchor}"`) && !html.includes(`user-content-${anchor}`)) throw new Error(`GitHub-rendered ${file} lacks preserved anchor ${anchor}`);
    }
    if (/<script\b/i.test(html)) throw new Error(`GitHub-rendered ${file} unexpectedly includes script content`);
    console.log(`GITHUB_MARKDOWN_OK file=${file} pictures=${pictureCount} sources=${sourceCount} bytes=${Buffer.byteLength(html)}`);
  }
}

console.log(`README_SHOWCASE_OK readmes=${readmes.length} svg=${svgFiles.length} gif=2 frames=37 duration_ms=12580`);
