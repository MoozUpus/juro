import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";

const root = dirname(fileURLToPath(import.meta.url));
const sharpPath = process.env.JURO_README_SHARP;
const gifencPath = process.env.JURO_README_GIFENC;

if (!sharpPath || !gifencPath) {
  throw new Error("Set JURO_README_SHARP to sharp's entry file and JURO_README_GIFENC to gifenc's ESM entry file.");
}

const require = createRequire(import.meta.url);
const sharp = require(sharpPath);
const { GIFEncoder, quantize, applyPalette } = await import(pathToFileURL(gifencPath).href);

const C = {
  navy: "#062844", deep: "#031B30", panel: "#103955", blue: "#1A4764", gold: "#BE974F",
  goldLight: "#DEC27F", paper: "#F8F6F2", ivory: "#FFFDFC", ink: "#112B3E",
  muted: "#687C88", line: "#D9E1E4", green: "#2E7658", greenSoft: "#E7F3EC", amber: "#F5ECD7",
};

const steps = [
  ["01", "QUESTION", "Question received"],
  ["02", "AI", "Analysing"],
  ["03", "SOURCE", "Source found"],
  ["04", "ANALYSIS", "Legal analysis"],
  ["05", "NEXT STEP", "Review agreement"],
  ["06", "DOCUMENT", "Upload contract"],
  ["07", "LAWYER", "Human review"],
];

const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const style = `<style>.ui{font-family:Inter,Manrope,"Segoe UI",Arial,sans-serif}.serif{font-family:Georgia,"Times New Roman",serif}.caps{font-weight:800;letter-spacing:1.8px}</style>`;
const defs = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${C.deep}"/><stop offset=".7" stop-color="${C.navy}"/><stop offset="1" stop-color="#0B334E"/></linearGradient><pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse"><path d="M42 0H0V42" fill="none" stroke="#DCE8EE" stroke-opacity=".055"/></pattern><filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#00111F" flood-opacity=".28"/></filter></defs>`;

function badge(x, y, label, tone = "green", width = 140) {
  const bg = tone === "green" ? C.greenSoft : tone === "dark" ? C.navy : C.amber;
  const fg = tone === "green" ? C.green : tone === "dark" ? "#fff" : "#76551B";
  const dot = tone === "green" ? C.green : C.gold;
  return `<g transform="translate(${x} ${y})"><rect width="${width}" height="34" rx="17" fill="${bg}"/><circle cx="18" cy="17" r="4" fill="${dot}"/><text x="31" y="22" class="ui caps" font-size="10" fill="${fg}">${esc(label)}</text></g>`;
}

function bars(x, y, widths, fill = "#B8C7CF") {
  return widths.map((width, index) => `<rect x="${x}" y="${y + index * 26}" width="${width}" height="9" rx="4.5" fill="${fill}" fill-opacity="${index ? .46 : .86}"/>`).join("");
}

function dynamicPanel(step, phase, layout) {
  const { x, y, w, h, mobile } = layout;
  const pad = mobile ? 28 : 34;
  const titleSize = mobile ? 27 : 30;
  const textSize = mobile ? 17 : 16;
  const commonStart = `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="20" fill="${C.ivory}" stroke="${C.line}"/><text x="${pad}" y="38" class="ui caps" font-size="11" fill="${C.gold}">${steps[step][0]} / ${steps[step][1]}</text>`;
  const close = `</g>`;
  if (step === 0) {
    const cursor = phase % 2 === 0 ? `<rect x="${pad + (mobile ? 428 : 514)}" y="105" width="3" height="26" rx="1.5" fill="${C.gold}"/>` : "";
    return `${commonStart}<text x="${pad}" y="84" class="ui" font-size="${titleSize}" font-weight="850" fill="${C.ink}">Can my employer terminate my contract</text><text x="${pad}" y="120" class="ui" font-size="${titleSize}" font-weight="850" fill="${C.ink}">without notice?</text>${cursor}<rect x="${pad}" y="${mobile ? 166 : 158}" width="${w - pad * 2}" height="${mobile ? 242 : 146}" rx="15" fill="#F0F3F4"/><text x="${pad + 20}" y="${mobile ? 202 : 196}" class="ui caps" font-size="10" fill="${C.muted}">CASE INTAKE</text><text x="${pad + 20}" y="${mobile ? 240 : 233}" class="ui" font-size="${textSize}" font-weight="800" fill="${C.ink}">Employment · contract · termination</text><text x="${pad + 20}" y="${mobile ? 278 : 268}" class="ui" font-size="${textSize}" fill="${C.muted}">The question becomes structured case context.</text>${badge(pad + 20, mobile ? 319 : 296, "CONTEXT READY", "green", 150)}${close}`;
  }
  if (step === 1) {
    const scanY = (mobile ? 183 : 169) + phase * (mobile ? 42 : 26);
    return `${commonStart}<text x="${pad}" y="84" class="ui" font-size="${titleSize}" font-weight="850" fill="${C.ink}">JURO is analysing the request</text><text x="${pad}" y="116" class="ui" font-size="${textSize}" fill="${C.muted}">Identifying context, constraints and source needs.</text><rect x="${pad}" y="${mobile ? 154 : 146}" width="${w - pad * 2}" height="${mobile ? 270 : 210}" rx="15" fill="${C.navy}"/>${bars(pad + 22, mobile ? 188 : 180, [w - pad * 2 - 58, w - pad * 2 - 134, w - pad * 2 - 92], "#FFFFFF")}<rect x="${pad + 18}" y="${scanY}" width="${w - pad * 2 - 36}" height="3" rx="1.5" fill="${C.gold}" fill-opacity=".78"/>${badge(pad + 20, mobile ? 374 : 308, "ANALYSING", "gold", 132)}${close}`;
  }
  if (step === 2) {
    const pulse = [.65, .82, 1, .82, .65][phase] ?? 1;
    return `${commonStart}<text x="${pad}" y="84" class="ui" font-size="${titleSize}" font-weight="850" fill="${C.ink}">Source found</text><text x="${pad}" y="116" class="ui" font-size="${textSize}" fill="${C.muted}">A relevant source is attached to the answer path.</text><rect x="${pad}" y="${mobile ? 154 : 146}" width="${w - pad * 2}" height="${mobile ? 260 : 205}" rx="16" fill="${C.amber}" stroke="#DCC185"/><text x="${pad + 24}" y="${mobile ? 196 : 187}" class="ui caps" font-size="10" fill="#76551B">SOURCE 01 · LEGAL ID L-382</text><text x="${pad + 24}" y="${mobile ? 244 : 232}" class="ui" font-size="${mobile ? 25 : 23}" font-weight="850" fill="${C.ink}">Labour legislation</text><text x="${pad + 24}" y="${mobile ? 280 : 267}" class="ui" font-size="${textSize}" fill="${C.muted}">Article context · retrieved for this request</text><g opacity="${pulse}">${badge(pad + 24, mobile ? 324 : 298, "VERIFIED SOURCE", "green", 172)}</g>${close}`;
  }
  if (step === 3) {
    return `${commonStart}<text x="${pad}" y="84" class="ui" font-size="${titleSize}" font-weight="850" fill="${C.ink}">Legal analysis</text><text x="${pad}" y="116" class="ui" font-size="${textSize}" fill="${C.muted}">The response separates rule, context and next step.</text>${[["01","LEGAL RULE","Relevant termination requirements"],["02","CASE CONTEXT","Contract terms and available facts"],["03","BOUNDARY","Information, not individual legal advice"]].map((row,i)=>`<g transform="translate(${pad} ${mobile ? 154+i*104 : 146+i*72})"><rect width="${w-pad*2}" height="${mobile ? 86 : 60}" rx="12" fill="${i===0?C.amber:"#F0F3F4"}"/><text x="16" y="${mobile ? 28 : 23}" class="ui caps" font-size="9" fill="${i===0?"#76551B":C.muted}">${row[0]} / ${row[1]}</text><text x="16" y="${mobile ? 62 : 46}" class="ui" font-size="${textSize}" font-weight="800" fill="${C.ink}">${row[2]}</text></g>`).join("")}${close}`;
  }
  if (step === 4) {
    return `${commonStart}<text x="${pad}" y="84" class="ui" font-size="${titleSize}" font-weight="850" fill="${C.ink}">Next step</text><text x="${pad}" y="116" class="ui" font-size="${textSize}" fill="${C.muted}">Move from understanding to practical work.</text><rect x="${pad}" y="${mobile ? 154 : 146}" width="${w-pad*2}" height="${mobile ? 258 : 205}" rx="16" fill="${C.navy}"/><text x="${pad+24}" y="${mobile ? 198 : 189}" class="ui caps" font-size="10" fill="${C.goldLight}">RECOMMENDED ACTION · A-01</text><text x="${pad+24}" y="${mobile ? 248 : 238}" class="ui" font-size="${mobile ? 26 : 25}" font-weight="850" fill="#fff">Review your employment agreement</text><text x="${pad+24}" y="${mobile ? 288 : 276}" class="ui" font-size="${textSize}" fill="#BDD0D9">Check termination and notice clauses first.</text>${badge(pad+24,mobile?330:302,"ACTION READY","gold",148)}${close}`;
  }
  if (step === 5) {
    const labels = ["UPLOADING", "UPLOADING", "ANALYSING", "ANALYSING", "READY"];
    const values = [18, 38, 58, 78, 100];
    const value = values[phase] ?? 100;
    return `${commonStart}<text x="${pad}" y="84" class="ui" font-size="${titleSize}" font-weight="850" fill="${C.ink}">Upload contract</text><text x="${pad}" y="116" class="ui" font-size="${textSize}" fill="${C.muted}">Add the document without leaving the case workflow.</text><rect x="${pad}" y="${mobile ? 154 : 146}" width="${w-pad*2}" height="${mobile ? 260 : 205}" rx="16" fill="#F0F3F4"/><text x="${pad+24}" y="${mobile ? 197 : 187}" class="ui caps" font-size="10" fill="${C.muted}">EMPLOYMENT_AGREEMENT.PDF · 2.4 MB</text><rect x="${pad+24}" y="${mobile ? 232 : 220}" width="${w-pad*2-48}" height="10" rx="5" fill="#D4DDE1"/><rect x="${pad+24}" y="${mobile ? 232 : 220}" width="${(w-pad*2-48)*value/100}" height="10" rx="5" fill="${C.gold}"/><text x="${pad+24}" y="${mobile ? 282 : 267}" class="ui" font-size="${textSize}" font-weight="800" fill="${C.ink}">${labels[phase] ?? "READY"}</text><text x="${w-pad-24}" y="${mobile ? 282 : 267}" text-anchor="end" class="ui caps" font-size="10" fill="${C.muted}">${value}%</text>${badge(pad+24,mobile?326:302,value===100?"DOCUMENT READY":"PROTECTED",value===100?"green":"gold",value===100?166:132)}${close}`;
  }
  const lawyerLabel = phase < 2 ? "PREPARING CONTEXT" : "READY TO REQUEST";
  return `${commonStart}<text x="${pad}" y="84" class="ui" font-size="${titleSize}" font-weight="850" fill="${C.ink}">Escalate to a human lawyer</text><text x="${pad}" y="116" class="ui" font-size="${textSize}" fill="${C.muted}">The source, document and case context travel together.</text><rect x="${pad}" y="${mobile ? 154 : 146}" width="${w-pad*2}" height="${mobile ? 262 : 205}" rx="16" fill="${C.navy}"/><text x="${pad+24}" y="${mobile ? 197 : 187}" class="ui caps" font-size="10" fill="${C.goldLight}">LAWYER HAND-OFF · CASE #UZ-2048</text><text x="${pad+24}" y="${mobile ? 244 : 232}" class="ui" font-size="${mobile ? 25 : 24}" font-weight="850" fill="#fff">Case context attached</text><text x="${pad+24}" y="${mobile ? 280 : 267}" class="ui" font-size="${textSize}" fill="#BDD0D9">No need to explain everything again.</text>${badge(pad+24,mobile?325:301,lawyerLabel,"gold",phase<2?188:174)}${close}`;
}

function frameSvg(width, height, step, phase, previousStep = null, previousOpacity = 0, currentOpacity = 1) {
  const mobile = width < 900;
  const progress = ((step * 5 + phase + 1) / 35) * 100;
  const panel = mobile ? { x: 34, y: 342, w: 652, h: 510, mobile } : { x: 324, y: 213, w: 868, h: 370, mobile };
  const prev = previousStep === null ? "" : `<g opacity="${previousOpacity}">${dynamicPanel(previousStep, 4, panel)}</g>`;
  const current = `<g opacity="${currentOpacity}">${dynamicPanel(step, phase, panel)}</g>`;
  const sidebar = mobile ? "" : `<g transform="translate(68 118)"><text class="ui caps" font-size="10" fill="${C.goldLight}">DEMO SEQUENCE</text>${steps.map((item,i)=>`<g transform="translate(0 ${40+i*56})"><circle cx="12" cy="12" r="12" fill="${i===step?C.gold:i<step?C.green:C.blue}"/><text x="12" y="16" text-anchor="middle" class="ui" font-size="9" font-weight="800" fill="${i===step?C.deep:"#fff"}">${item[0]}</text><text x="38" y="17" class="ui caps" font-size="9" fill="${i===step?"#fff":"#9FB4BF"}">${item[1]}</text></g>`).join("")}</g>`;
  const mobileSteps = mobile ? `<g transform="translate(34 232)"><rect width="652" height="78" rx="15" fill="#FFFFFF" fill-opacity=".055"/>${steps.map((item,i)=>`<g transform="translate(${24+i*88} 17)"><circle cx="20" cy="20" r="17" fill="${i===step?C.gold:i<step?C.green:C.blue}"/><text x="20" y="24" text-anchor="middle" class="ui" font-size="10" font-weight="800" fill="${i===step?C.deep:"#fff"}">${item[0]}</text><text x="20" y="54" text-anchor="middle" class="ui caps" font-size="7" fill="#B7C8D0">${item[1]}</text></g>`).join("")}</g>` : "";
  const question = mobile ? `<g transform="translate(34 96)"><rect width="652" height="108" rx="16" fill="#fff" fill-opacity=".07" stroke="#fff" stroke-opacity=".1"/><text x="20" y="30" class="ui caps" font-size="9" fill="${C.goldLight}">USER · QUESTION</text><text x="20" y="66" class="ui" font-size="17" font-weight="800" fill="#fff">Can my employer terminate my contract</text><text x="20" y="90" class="ui" font-size="17" font-weight="800" fill="#fff">without notice?</text></g>` : `<g transform="translate(324 106)"><rect width="868" height="78" rx="15" fill="#fff" fill-opacity=".07" stroke="#fff" stroke-opacity=".1"/><text x="20" y="29" class="ui caps" font-size="9" fill="${C.goldLight}">USER · QUESTION · 09:41</text><text x="20" y="58" class="ui" font-size="17" font-weight="800" fill="#fff">Can my employer terminate my contract without notice?</text></g>`;
  const footerY = mobile ? 882 : 610;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}${style}<rect width="${width}" height="${height}" rx="26" fill="url(#bg)"/><rect width="${width}" height="${height}" rx="26" fill="url(#grid)"/><path d="M${width*.68} 0c${width*.08} ${height*.15} ${width*.18} ${height*.2} ${width*.34} ${height*.21}" fill="none" stroke="${C.gold}" stroke-opacity=".18"/>
  <g transform="translate(${mobile?34:48} ${mobile?34:34})"><path d="M0 7h14v8c0 11-8 17-14 20V7Z" fill="${C.gold}"/><text x="28" y="29" class="ui caps" font-size="26" fill="#fff" letter-spacing="6">JURO</text><text x="${mobile?652:1144}" y="27" text-anchor="end" class="ui caps" font-size="9" fill="#B6C8D1">PRODUCT DEMO · ILLUSTRATIVE FLOW</text></g>
  ${sidebar}${mobileSteps}${question}${prev}${current}
  <g transform="translate(${mobile?34:324} ${footerY})"><rect width="${mobile?652:868}" height="${mobile?112:76}" rx="15" fill="#fff" fill-opacity=".055" stroke="#fff" stroke-opacity=".09"/><text x="20" y="30" class="ui caps" font-size="9" fill="${C.goldLight}">CURRENT STATE</text><text x="20" y="59" class="ui" font-size="${mobile?18:16}" font-weight="800" fill="#fff">${esc(steps[step][2])}</text><rect x="${mobile?20:500}" y="${mobile?78:32}" width="${mobile?612:338}" height="6" rx="3" fill="#fff" fill-opacity=".13"/><rect x="${mobile?20:500}" y="${mobile?78:32}" width="${(mobile?612:338)*progress/100}" height="6" rx="3" fill="${C.gold}"/>${!mobile?`<text x="838" y="60" text-anchor="end" class="ui caps" font-size="8" fill="#9CB2BD">${step+1} / 7 · 12 SEC LOOP</text>`:""}</g>
  ${mobile?`<g transform="translate(34 1022)"><circle cx="5" cy="5" r="5" fill="${C.green}"/><text x="20" y="10" class="ui caps" font-size="9" fill="#BFD0D8">SOURCE-AWARE · PROTECTED · HUMAN WHEN NEEDED</text></g>`:`<g transform="translate(68 678)"><circle cx="5" cy="5" r="5" fill="${C.green}"/><text x="20" y="10" class="ui caps" font-size="9" fill="#BFD0D8">SOURCE-AWARE</text><circle cx="174" cy="5" r="5" fill="${C.gold}"/><text x="189" y="10" class="ui caps" font-size="9" fill="#BFD0D8">PROTECTED WORKFLOW</text><circle cx="400" cy="5" r="5" fill="${C.gold}"/><text x="415" y="10" class="ui caps" font-size="9" fill="#BFD0D8">HUMAN WHEN NEEDED</text></g>`}
  </svg>`;
}

async function encode(name, width, height) {
  const frames = [];
  for (let step = 0; step < steps.length; step += 1) {
    for (let phase = 0; phase < 5; phase += 1) {
      const crossfade = step > 0 && phase < 2;
      const svg = frameSvg(width, height, step, phase, crossfade ? step - 1 : null, crossfade ? (phase === 0 ? .58 : .26) : 0, crossfade ? (phase === 0 ? .42 : .74) : 1);
      const data = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
      frames.push(data);
    }
  }
  for (const [previousOpacity, currentOpacity, phase] of [[.58, .42, 0], [.26, .74, 1]]) {
    const svg = frameSvg(width, height, 0, phase, 6, previousOpacity, currentOpacity);
    frames.push(await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer());
  }

  const stride = Math.max(1, Math.floor((width * height) / 18000));
  const sample = new Uint8Array(Math.ceil(frames.length * width * height / stride) * 4);
  let cursor = 0;
  for (const frame of frames) {
    for (let pixel = 0; pixel < width * height; pixel += stride) {
      const offset = pixel * 4;
      sample[cursor++] = frame[offset]; sample[cursor++] = frame[offset + 1]; sample[cursor++] = frame[offset + 2]; sample[cursor++] = 255;
    }
  }
  const palette = quantize(sample.subarray(0, cursor), 128, { format: "rgb565" });
  const gif = GIFEncoder();
  for (let index = 0; index < frames.length; index += 1) {
    gif.writeFrame(applyPalette(frames[index], palette, "rgb565"), width, height, { palette: index === 0 ? palette : undefined, delay: 340, repeat: 0 });
  }
  gif.finish();
  writeFileSync(join(root, name), gif.bytes());

  const poster = frameSvg(width, height, 6, 4);
  writeFileSync(join(root, name.replace(".gif", "-poster.svg")), poster, "utf8");
}

await encode("product-demo.gif", 1280, 720);
await encode("product-demo-mobile.gif", 720, 1060);
  console.log("Rendered 12.6-second JURO product demo GIFs and reduced-motion posters.");
