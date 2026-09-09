import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(root, { recursive: true });

const C = {
  navy: "#062844",
  navyDeep: "#031B30",
  navySoft: "#0E3A5A",
  gold: "#BE974F",
  goldLight: "#DEC27F",
  paper: "#F8F6F2",
  ivory: "#FFFDFC",
  ink: "#112B3E",
  muted: "#657985",
  line: "#D9E0E3",
  green: "#2E7658",
  greenSoft: "#E7F3EC",
  amberSoft: "#F5ECD7",
};

const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function defs(id = "base") {
  return `
  <defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.navyDeep}"/><stop offset=".62" stop-color="${C.navy}"/><stop offset="1" stop-color="#0B314C"/>
    </linearGradient>
    <linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#A77A31"/><stop offset=".52" stop-color="${C.goldLight}"/><stop offset="1" stop-color="${C.gold}"/>
    </linearGradient>
    <radialGradient id="${id}-glow" cx="50%" cy="50%" r="50%">
      <stop stop-color="${C.gold}" stop-opacity=".18"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="${id}-grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#DDE8EE" stroke-opacity=".065"/>
    </pattern>
    <filter id="${id}-shadow" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#00101E" flood-opacity=".25"/>
    </filter>
    <filter id="${id}-softShadow" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="8" stdDeviation="11" flood-color="#00101E" flood-opacity=".16"/>
    </filter>
  </defs>`;
}

function css() {
  return `<style>
    .ui{font-family:Inter,Manrope,"Segoe UI",Arial,sans-serif}.serif{font-family:Georgia,"Times New Roman",serif}
    .caps{font-weight:800;letter-spacing:2.2px}.tiny{font-size:13px}.small{font-size:16px}.body{font-size:19px}.title{font-size:28px;font-weight:800}.muted{fill:${C.muted}}
  </style>`;
}

function wrap({ w, h, title, desc, body, id = "asset", dark = false }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}-title ${id}-desc">
  <title id="${id}-title">${xml(title)}</title><desc id="${id}-desc">${xml(desc)}</desc>${defs(id)}${css()}
  <rect width="${w}" height="${h}" rx="28" fill="${dark ? `url(#${id}-bg)` : C.paper}"/>${body}
</svg>\n`;
}

function save(name, content) {
  writeFileSync(join(root, name), content.replace(/[ \t]+$/gm, ""), "utf8");
}

function status(x, y, label, tone = "gold", width = 140) {
  const palette = tone === "green"
    ? { bg: C.greenSoft, fg: C.green, dot: C.green }
    : tone === "dark"
      ? { bg: C.navy, fg: C.ivory, dot: C.gold }
      : { bg: C.amberSoft, fg: "#795B22", dot: C.gold };
  return `<g transform="translate(${x} ${y})"><rect width="${width}" height="32" rx="16" fill="${palette.bg}"/><circle cx="17" cy="16" r="4" fill="${palette.dot}"/><text x="29" y="21" class="ui caps" font-size="10" fill="${palette.fg}">${xml(label)}</text></g>`;
}

function pill(x, y, label, width) {
  return `<g transform="translate(${x} ${y})"><rect width="${width}" height="42" rx="21" fill="#FFFFFF" fill-opacity=".055" stroke="#FFFFFF" stroke-opacity=".17"/><circle cx="19" cy="21" r="4" fill="${C.gold}"/><text x="31" y="26" class="ui caps" font-size="12" fill="#E7EEF2">${xml(label)}</text></g>`;
}

function windowChrome(x, y, w, title, meta = "") {
  return `<g transform="translate(${x} ${y})"><rect width="${w}" height="58" rx="18" fill="#103955"/><rect y="40" width="${w}" height="18" fill="#103955"/><circle cx="24" cy="26" r="5" fill="${C.gold}"/><circle cx="42" cy="26" r="5" fill="#B8C8D0"/><circle cx="60" cy="26" r="5" fill="#617C8E"/><text x="88" y="31" class="ui caps" font-size="12" fill="#EAF1F4">${xml(title)}</text>${meta ? `<text x="${w - 24}" y="31" text-anchor="end" class="ui" font-size="11" fill="#B6C8D2">${xml(meta)}</text>` : ""}</g>`;
}

const heroLocales = {
  en: {
    eyebrow: "AI-POWERED LEGALTECH · UZBEKISTAN",
    headline: ["Legal intelligence", "for real next steps."],
    description: ["AI legal assistance, protected document workflows,", "source-aware answers and human lawyers in one workspace."],
  },
  ru: {
    eyebrow: "AI-POWERED LEGALTECH · UZBEKISTAN",
    headline: ["Юрист в кармане", "Рабочая среда — рядом."],
    description: ["AI-помощь, защищённая работа с документами,", "ответы с источниками и связь с юристом в одном пространстве."],
  },
  uz: {
    eyebrow: "AI-POWERED LEGALTECH · UZBEKISTAN",
    headline: ["Huquqiy aniqlik.", "Amaliy keyingi qadam."],
    description: ["AI yordami, himoyalangan hujjat jarayonlari,", "manbali javoblar va yurist bilan aloqa — bir ish maydonida."],
  },
};

function heroDesktop(locale) {
  const copy = heroLocales[locale];
  const isRu = locale === "ru";
  const body = `
  <rect width="1600" height="820" rx="28" fill="url(#hero-${locale}-grid)"/>
  <circle cx="1390" cy="112" r="420" fill="url(#hero-${locale}-glow)"/>
  <path d="M1040 -30C1210 110 1350 158 1640 160M1010 790C1230 640 1425 608 1650 630" fill="none" stroke="${C.gold}" stroke-opacity=".2"/>
  <path d="M925 0V820M0 664H1600" stroke="#DCE8EE" stroke-opacity=".07"/>
  <g transform="translate(78 64)">
    <path d="M0 14h18v10c0 14-10 22-18 26V14Z" fill="${C.gold}"/><path d="M0 50c11-5 18-13 18-26" fill="none" stroke="#091E31" stroke-width="3"/>
    <text x="38" y="39" class="ui caps" font-size="38" fill="#fff" letter-spacing="9">JURO</text>
    <text x="0" y="126" class="ui caps" font-size="14" fill="${C.goldLight}">${xml(copy.eyebrow)}</text>
    <text x="0" y="213" class="serif" font-size="${isRu ? 61 : 65}" font-weight="700" fill="#fff">${xml(copy.headline[0])}</text>
    <text x="0" y="284" class="serif" font-size="${isRu ? 50 : 57}" font-weight="700" fill="#fff">${xml(copy.headline[1])}</text>
    <text x="0" y="344" class="ui" font-size="20" fill="#C5D2D9">${xml(copy.description[0])}</text>
    <text x="0" y="376" class="ui" font-size="20" fill="#C5D2D9">${xml(copy.description[1])}</text>
    ${pill(0, 420, "AI LEGAL ASSISTANT", 184)}${pill(196, 420, "VERIFIED SOURCES", 184)}${pill(392, 420, "DOCUMENTS", 132)}
    ${pill(0, 474, "CASE WORKSPACE", 170)}${pill(182, 474, "LAWYER · PARTIAL", 188)}${pill(382, 474, "AI AVATAR · DEV", 172)}
    <text x="0" y="592" class="ui caps" font-size="12" fill="#E0E9EE">RU · UZ · EN</text>
    <circle cx="145" cy="588" r="3" fill="${C.gold}"/><text x="158" y="593" class="ui" font-size="15" fill="#B7C7D0">juro.uz</text>
    <circle cx="248" cy="588" r="3" fill="${C.gold}"/><text x="261" y="593" class="ui" font-size="15" fill="#B7C7D0">app.juro.uz</text>
    <text x="0" y="676" class="ui caps" font-size="10" fill="#7892A2">PRODUCT ILLUSTRATION · NO CUSTOMER DATA</text>
  </g>
  <g filter="url(#hero-${locale}-shadow)">
    <rect x="815" y="72" width="705" height="648" rx="22" fill="${C.ivory}"/>
    ${windowChrome(815, 72, 705, "JURO / CASE WORKSPACE", "CASE #UZ-2048 · 09:41")}
    <g transform="translate(849 154)">
      <text class="ui caps" font-size="11" fill="${C.gold}">EMPLOYMENT · ACTIVE CASE</text>
      <text y="36" class="ui" font-size="24" font-weight="800" fill="${C.ink}">From question to a verified next step</text>
      ${status(500, 0, "PROTECTED", "green", 132)}
      <rect y="66" width="637" height="85" rx="14" fill="#F0F3F4" stroke="${C.line}"/>
      <text x="18" y="91" class="ui caps" font-size="10" fill="${C.muted}">QUESTION · 09:41</text>
      <text x="18" y="124" class="ui" font-size="17" font-weight="700" fill="${C.ink}">Can my employer terminate my contract without notice?</text>
      <path d="M38 186V428" stroke="#CAD5DA" stroke-width="2"/>
      <g class="ui" font-size="12" font-weight="800">
        <circle cx="38" cy="190" r="13" fill="${C.navy}"/><text x="38" y="194" text-anchor="middle" fill="#fff">1</text><text x="64" y="195" fill="${C.ink}">QUESTION</text>
        <circle cx="38" cy="250" r="13" fill="${C.gold}"/><text x="38" y="254" text-anchor="middle" fill="${C.navyDeep}">2</text><text x="64" y="255" fill="${C.ink}">SOURCES</text>
        <circle cx="38" cy="310" r="13" fill="#D4DDE2"/><text x="38" y="314" text-anchor="middle" fill="${C.ink}">3</text><text x="64" y="315" fill="${C.ink}">ANALYSIS</text>
        <circle cx="38" cy="370" r="13" fill="#D4DDE2"/><text x="38" y="374" text-anchor="middle" fill="${C.ink}">4</text><text x="64" y="375" fill="${C.ink}">DOCUMENT</text>
        <circle cx="38" cy="430" r="13" fill="#D4DDE2"/><text x="38" y="434" text-anchor="middle" fill="${C.ink}">5</text><text x="64" y="435" fill="${C.ink}">ACTION</text>
      </g>
      <g transform="translate(176 178)">
        <rect width="274" height="136" rx="15" fill="${C.navy}"/>
        <text x="18" y="25" class="ui caps" font-size="10" fill="${C.goldLight}">AI ANALYSIS · STRUCTURING</text>
        <rect x="18" y="48" width="225" height="8" rx="4" fill="#fff" fill-opacity=".82"/><rect x="18" y="70" width="195" height="8" rx="4" fill="#fff" fill-opacity=".45"/><rect x="18" y="92" width="234" height="8" rx="4" fill="#fff" fill-opacity=".45"/>
        <rect x="18" y="117" width="116" height="4" rx="2" fill="${C.gold}"/>
      </g>
      <g transform="translate(464 178)">
        <rect width="173" height="136" rx="15" fill="#F5EBD5" stroke="#DDC58D"/>
        <text x="16" y="25" class="ui caps" font-size="9" fill="#7B5A1D">SOURCE 01</text>
        <text x="16" y="52" class="ui" font-size="14" font-weight="800" fill="${C.ink}">Labour law</text>
        <text x="16" y="75" class="ui" font-size="11" fill="${C.muted}">Article reference</text>
        ${status(14, 91, "VERIFIED", "green", 112)}
      </g>
      <g transform="translate(176 330)">
        <rect width="318" height="117" rx="15" fill="#fff" stroke="${C.line}"/>
        <text x="17" y="26" class="ui caps" font-size="9" fill="${C.muted}">DOCUMENT · EMPLOYMENT_AGREEMENT.PDF</text>
        <text x="17" y="57" class="ui" font-size="15" font-weight="800" fill="${C.ink}">Review termination clause</text>
        <rect x="17" y="78" width="232" height="7" rx="3.5" fill="#E2E8EA"/><rect x="17" y="78" width="168" height="7" rx="3.5" fill="url(#hero-${locale}-gold)"/>
        <text x="273" y="86" class="ui" font-size="10" fill="${C.muted}">72%</text>
      </g>
      <g transform="translate(508 330)">
        <rect width="129" height="117" rx="15" fill="#ECF4F0" stroke="#C3DCCF"/>
        <text x="15" y="26" class="ui caps" font-size="9" fill="${C.green}">NEXT STEP</text>
        <text x="15" y="54" class="ui" font-size="14" font-weight="800" fill="${C.ink}">Action plan</text>
        <text x="15" y="76" class="ui" font-size="11" fill="${C.muted}">Ready to review</text>
        <circle cx="16" cy="96" r="4" fill="${C.green}"/><text x="28" y="100" class="ui caps" font-size="8" fill="${C.green}">TRACEABLE</text>
      </g>
    </g>
  </g>
  <g transform="translate(757 532)" filter="url(#hero-${locale}-softShadow)">
    <rect width="210" height="151" rx="18" fill="#112F47" stroke="${C.gold}"/>
    <circle cx="38" cy="55" r="27" fill="#1E4865"/><path d="M25 63c5-17 22-22 29-7v12H25Z" fill="#7994A5"/><circle cx="40" cy="44" r="10" fill="#9BB0BD"/>
    <text x="76" y="37" class="ui caps" font-size="9" fill="${C.goldLight}">JURO AI AVATAR</text><text x="76" y="62" class="ui" font-size="14" font-weight="800" fill="#fff">Visual assistant</text>
    ${status(18, 105, "IN DEVELOPMENT", "gold", 166)}
  </g>
  <g transform="translate(1388 485)" filter="url(#hero-${locale}-softShadow)">
    <rect width="154" height="226" rx="25" fill="#0B2941" stroke="${C.gold}" stroke-width="2"/>
    <rect x="16" y="18" width="122" height="26" rx="8" fill="#294B63"/><text x="77" y="35" text-anchor="middle" class="ui caps" font-size="8" fill="#fff">JURO · MOBILE</text>
    <text x="18" y="80" class="ui caps" font-size="7.5" fill="${C.goldLight}">LAWYER HAND-OFF · PARTIAL</text><text x="18" y="111" class="ui" font-size="16" font-weight="800" fill="#fff">Case context</text><text x="18" y="134" class="ui" font-size="16" font-weight="800" fill="#fff">is ready</text>
    <rect x="18" y="164" width="118" height="30" rx="15" fill="${C.gold}"/><text x="77" y="183" text-anchor="middle" class="ui caps" font-size="8" fill="${C.navyDeep}">REQUEST REVIEW</text>
  </g>`;
  return wrap({ w: 1600, h: 820, title: `JURO product hero — ${locale}`, desc: "Premium LegalTech product composition with case workspace, source verification, documents, human hand-off and an AI Avatar clearly marked in development.", body, id: `hero-${locale}`, dark: true });
}

function heroMobile(locale) {
  const copy = heroLocales[locale];
  const body = `
  <rect width="760" height="1220" rx="28" fill="url(#hero-mobile-${locale}-grid)"/><circle cx="650" cy="90" r="310" fill="url(#hero-mobile-${locale}-glow)"/>
  <g transform="translate(48 48)"><path d="M0 8h15v8c0 12-8 18-15 22V8Z" fill="${C.gold}"/><text x="30" y="32" class="ui caps" font-size="30" fill="#fff" letter-spacing="7">JURO</text>
  <text y="90" class="ui caps" font-size="12" fill="${C.goldLight}">${xml(copy.eyebrow)}</text>
  <text y="158" class="serif" font-size="48" font-weight="700" fill="#fff">${xml(copy.headline[0])}</text><text y="216" class="serif" font-size="42" font-weight="700" fill="#fff">${xml(copy.headline[1])}</text>
  <text y="265" class="ui" font-size="18" fill="#C7D4DB">${xml(copy.description[0])}</text><text y="293" class="ui" font-size="18" fill="#C7D4DB">${xml(copy.description[1])}</text>
  ${pill(0, 329, "AI + SOURCES", 150)}${pill(162, 329, "DOCUMENTS", 132)}${pill(306, 329, "CASE WORKSPACE", 166)}${pill(484, 329, "AI AVATAR · DEV", 168)}</g>
  <g transform="translate(42 464)" filter="url(#hero-mobile-${locale}-shadow)"><rect width="676" height="620" rx="22" fill="${C.ivory}"/>${windowChrome(0,0,676,"JURO / CASE WORKSPACE","#UZ-2048")}
    <g transform="translate(28 86)"><text class="ui caps" font-size="11" fill="${C.gold}">EMPLOYMENT · ACTIVE CASE</text><text y="37" class="ui" font-size="25" font-weight="800" fill="${C.ink}">Question → source → next step</text>${status(462,0,"PROTECTED","green",132)}
    <rect y="66" width="620" height="92" rx="14" fill="#EFF3F4"/><text x="17" y="94" class="ui caps" font-size="10" fill="${C.muted}">QUESTION</text><text x="17" y="127" class="ui" font-size="17" font-weight="700" fill="${C.ink}">Can my employer terminate my contract</text><text x="17" y="149" class="ui" font-size="17" font-weight="700" fill="${C.ink}">without notice?</text>
    <g transform="translate(0 182)"><rect width="392" height="144" rx="15" fill="${C.navy}"/><text x="18" y="28" class="ui caps" font-size="10" fill="${C.goldLight}">AI ANALYSIS · STRUCTURING</text><rect x="18" y="52" width="330" height="9" rx="4.5" fill="#fff" fill-opacity=".8"/><rect x="18" y="78" width="288" height="9" rx="4.5" fill="#fff" fill-opacity=".42"/><rect x="18" y="104" width="314" height="9" rx="4.5" fill="#fff" fill-opacity=".42"/><rect x="18" y="128" width="160" height="4" rx="2" fill="${C.gold}"/></g>
    <g transform="translate(410 182)"><rect width="210" height="144" rx="15" fill="#F5EBD5" stroke="#DDC58D"/><text x="16" y="28" class="ui caps" font-size="10" fill="#76551B">SOURCE 01</text><text x="16" y="59" class="ui" font-size="16" font-weight="800" fill="${C.ink}">Labour law</text><text x="16" y="84" class="ui" font-size="12" fill="${C.muted}">Article reference</text>${status(15,101,"VERIFIED","green",122)}</g>
    <g transform="translate(0 344)"><rect width="620" height="107" rx="15" fill="#fff" stroke="${C.line}"/><text x="17" y="28" class="ui caps" font-size="10" fill="${C.muted}">DOCUMENT · EMPLOYMENT_AGREEMENT.PDF</text><text x="17" y="60" class="ui" font-size="17" font-weight="800" fill="${C.ink}">Review termination clause</text><rect x="17" y="80" width="430" height="8" rx="4" fill="#E1E7E9"/><rect x="17" y="80" width="318" height="8" rx="4" fill="${C.gold}"/><text x="468" y="89" class="ui" font-size="11" fill="${C.muted}">72%</text>${status(500,66,"READY","green",105)}</g>
    <g transform="translate(0 468)"><rect width="300" height="52" rx="13" fill="#E9F3EE"/><circle cx="22" cy="26" r="5" fill="${C.green}"/><text x="38" y="31" class="ui caps" font-size="10" fill="${C.green}">SOURCE VERIFIED</text><rect x="318" width="302" height="52" rx="13" fill="${C.amberSoft}"/><circle cx="340" cy="26" r="5" fill="${C.gold}"/><text x="356" y="31" class="ui caps" font-size="10" fill="#76551B">AI AVATAR · IN DEVELOPMENT</text></g>
    </g></g>
  <text x="48" y="1158" class="ui caps" font-size="11" fill="#BFCED6">RU · UZ · EN</text><text x="710" y="1158" text-anchor="end" class="ui" font-size="14" fill="#BFCED6">juro.uz · app.juro.uz</text>`;
  return wrap({ w: 760, h: 1220, title: `JURO mobile product hero — ${locale}`, desc: "Mobile-readable LegalTech product composition with sources, document status, case context and avatar development status.", body, id: `hero-mobile-${locale}`, dark: true });
}

const capabilities = [
  ["01", "AI LEGAL ASSISTANT", "Ask legal questions|Structured answers|Practical next steps", "spark"],
  ["02", "DOCUMENT INTELLIGENCE", "Analyse documents|Compare versions|Identify risks", "doc"],
  ["03", "DOCUMENT BUILDER", "Guided questionnaires|Reusable templates|RU · UZ support", "build"],
  ["04", "CASE WORKSPACE", "Questions and documents|Actions and history|Case progress", "case"],
  ["05", "LAWYER HAND-OFF", "Keep the case context|Request human review|Continue one workflow", "human"],
  ["06", "LEGAL SOURCES", "Source-aware responses|Relevant legislation|Traceable citations", "source"],
  ["07", "AI AVATAR", "Visual conversation|Accessible interaction|Legal guidance interface", "avatar"],
  ["08", "LEGAL MONITORING", "Track legal changes|Review source context|Understand implications", "monitor"],
];

function glyph(kind, x, y, dark = false) {
  const stroke = dark ? C.goldLight : C.navy;
  const paths = {
    spark: `<path d="M16 1l3.8 10.2L30 15l-10.2 3.8L16 29l-3.8-10.2L2 15l10.2-3.8L16 1Z"/>`,
    doc: `<rect x="5" y="3" width="22" height="28" rx="4"/><path d="M10 11h12M10 17h12M10 23h8"/>`,
    build: `<path d="M5 27V8l8-5 8 5v19M2 29h28M11 13h4M11 19h4M21 13h4M21 19h4"/>`,
    case: `<rect x="3" y="7" width="26" height="21" rx="4"/><path d="M11 7V4h10v3M3 15h26M13 18h6"/>`,
    human: `<circle cx="12" cy="11" r="6"/><path d="M2 29c1-7 5-10 10-10s9 3 10 10M23 9h7v12h-7l-4 4v-4"/>`,
    source: `<path d="M6 4h20v25H6zM11 10h10M11 15h10M11 20h7"/><circle cx="25" cy="25" r="6" fill="${dark ? C.navy : C.paper}"/><path d="M22 25l2 2 4-5"/>`,
    avatar: `<circle cx="16" cy="12" r="7"/><path d="M5 30c1-8 5-11 11-11s10 3 11 11M4 12H1v8h4M28 12h3v8h-4"/>`,
    monitor: `<circle cx="16" cy="16" r="13"/><path d="M16 8v8l6 4M5 5l-3 3M27 5l3 3"/>`,
  };
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</g>`;
}

function capabilityCard(x, y, w, h, item) {
  const [n, title, details, kind] = item;
  const avatar = kind === "avatar";
  const partial = kind === "doc" || kind === "human";
  const lines = details.split("|");
  return `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="20" fill="${avatar ? C.navy : C.ivory}" stroke="${avatar ? C.gold : C.line}"/>
    <text x="24" y="35" class="ui caps" font-size="11" fill="${avatar ? C.goldLight : C.gold}">${n} / CAPABILITY</text>${glyph(kind, w - 62, 24, avatar)}
    <text x="24" y="82" class="ui" font-size="22" font-weight="850" fill="${avatar ? "#fff" : C.ink}">${title}</text>
    ${lines.map((line, i) => `<circle cx="28" cy="${118 + i * 28}" r="3" fill="${avatar ? C.gold : C.navy}"/><text x="42" y="${124 + i * 28}" class="ui" font-size="15" fill="${avatar ? "#C8D6DD" : C.muted}">${line}</text>`).join("")}
    ${avatar ? status(24, h - 48, "IN DEVELOPMENT", "gold", 164) : partial ? status(24, h - 48, "PARTIAL WORKFLOW", "gold", 166) : ""}
  </g>`;
}

function capabilityBoard(mobile = false) {
  const w = mobile ? 760 : 1600;
  const columns = mobile ? 1 : 2;
  const cardW = mobile ? 664 : 704;
  const cardH = mobile ? 260 : 245;
  const gapX = 28, gapY = 24, startX = mobile ? 48 : 72, startY = 154;
  const rows = Math.ceil(capabilities.length / columns);
  const h = startY + rows * cardH + (rows - 1) * gapY + 64;
  const body = `<text x="${startX}" y="58" class="ui caps" font-size="13" fill="${C.gold}">PRODUCT SYSTEM / 08 CAPABILITIES</text><text x="${startX}" y="108" class="serif" font-size="42" font-weight="700" fill="${C.ink}">What JURO can do</text>
  ${capabilities.map((item, i) => capabilityCard(startX + (i % columns) * (cardW + gapX), startY + Math.floor(i / columns) * (cardH + gapY), cardW, cardH, item)).join("")}`;
  return wrap({ w, h, title: "What JURO can do", desc: "Eight product capability panels for AI legal assistance, documents, cases, sources, lawyer hand-off, monitoring and an AI Avatar marked in development.", body, id: mobile ? "cap-mobile" : "cap", dark: false });
}

const workflow = [
  ["01", "ASK", "Legal question"], ["02", "UNDERSTAND", "AI analysis"], ["03", "VERIFY", "Sources"],
  ["04", "WORK", "Document / case"], ["05", "ACT", "Next action"], ["06", "HUMAN", "Lawyer if needed"],
];

function workflowAsset(mobile = false) {
  const w = mobile ? 760 : 1600, h = mobile ? 1330 : 500;
  let nodes = "";
  if (mobile) {
    nodes = workflow.map((item, i) => {
      const y = 162 + i * 184;
      return `<g transform="translate(72 ${y})"><rect width="616" height="132" rx="18" fill="${i === 5 ? C.navy : C.ivory}" stroke="${i === 5 ? C.gold : C.line}"/><text x="25" y="35" class="ui caps" font-size="11" fill="${C.gold}">${item[0]} / ${item[1]}</text><text x="25" y="78" class="ui" font-size="26" font-weight="820" fill="${i === 5 ? "#fff" : C.ink}">${item[2]}</text>${i < 5 ? `<path d="M308 132v52" stroke="${C.gold}" stroke-width="2"/><path d="m301 174 7 10 7-10" fill="none" stroke="${C.gold}" stroke-width="2"/>` : ""}</g>`;
    }).join("");
  } else {
    nodes = workflow.map((item, i) => {
      const x = 58 + i * 250;
      return `<g transform="translate(${x} 198)"><rect width="214" height="168" rx="18" fill="${i === 5 ? C.navy : C.ivory}" stroke="${i === 5 ? C.gold : C.line}"/><text x="20" y="34" class="ui caps" font-size="10" fill="${C.gold}">${item[0]} / ${item[1]}</text><text x="20" y="83" class="ui" font-size="20" font-weight="820" fill="${i === 5 ? "#fff" : C.ink}">${item[2]}</text><circle cx="20" cy="132" r="5" fill="${i < 2 ? C.navy : i < 5 ? C.gold : C.green}"/><text x="34" y="137" class="ui caps" font-size="9" fill="${i === 5 ? "#C8D5DC" : C.muted}">${i < 2 ? "CONTEXT" : i < 5 ? "TRACEABLE" : "WHEN NEEDED"}</text>${i < 5 ? `<path d="M214 84h36" stroke="${C.gold}" stroke-width="2"/><path d="m240 78 10 6-10 6" fill="none" stroke="${C.gold}" stroke-width="2"/>` : ""}</g>`;
    }).join("");
  }
  const body = `<text x="${mobile ? 48 : 58}" y="58" class="ui caps" font-size="13" fill="${C.gold}">HOW IT WORKS / ONE CONNECTED WORKFLOW</text><text x="${mobile ? 48 : 58}" y="113" class="serif" font-size="42" font-weight="700" fill="${C.ink}">From question to action</text>${nodes}`;
  return wrap({ w, h, title: "From question to action", desc: "Connected six-step legal workflow from asking and understanding through sources, document work, action and optional human review.", body, id: mobile ? "flow-mobile" : "flow", dark: false });
}

function sourceAware(mobile = false) {
  const w = mobile ? 760 : 1600, h = mobile ? 1260 : 760;
  const left = mobile ? { x: 46, y: 150, w: 668, h: 350 } : { x: 66, y: 150, w: 555, h: 530 };
  const right = mobile ? { x: 46, y: 530, w: 668, h: 650 } : { x: 651, y: 150, w: 883, h: 530 };
  const body = `<text x="${mobile ? 46 : 66}" y="58" class="ui caps" font-size="13" fill="${C.gold}">AI + SOURCES / EVIDENCE LAYER</text><text x="${mobile ? 46 : 66}" y="110" class="serif" font-size="42" font-weight="700" fill="${C.ink}">Source-aware legal AI</text>
  <g transform="translate(${left.x} ${left.y})"><rect width="${left.w}" height="${left.h}" rx="22" fill="${C.navy}"/><text x="28" y="40" class="ui caps" font-size="11" fill="${C.goldLight}">QUESTION · Q-2048 · 09:41</text><text x="28" y="92" class="ui" font-size="${mobile ? 25 : 27}" font-weight="800" fill="#fff">Можно ли расторгнуть</text><text x="28" y="127" class="ui" font-size="${mobile ? 25 : 27}" font-weight="800" fill="#fff">договор без уведомления?</text><path d="M28 166h${left.w - 56}" stroke="#fff" stroke-opacity=".13"/>
  <text x="28" y="205" class="ui caps" font-size="10" fill="#AFC2CC">REQUEST PIPELINE</text><g class="ui" font-size="13" font-weight="800" fill="#E9F0F3"><circle cx="34" cy="244" r="5" fill="${C.gold}"/><text x="50" y="249">Identify legal context</text><circle cx="34" cy="282" r="5" fill="${C.gold}"/><text x="50" y="287">Retrieve source candidates</text><circle cx="34" cy="320" r="5" fill="${C.gold}"/><text x="50" y="325">Structure a bounded answer</text></g>${!mobile ? `<rect x="28" y="376" width="${left.w - 56}" height="78" rx="13" fill="#FFFFFF" fill-opacity=".06"/><text x="45" y="408" class="ui caps" font-size="9" fill="${C.goldLight}">BOUNDARY</text><text x="45" y="437" class="ui" font-size="13" fill="#C6D3DA">Legal information · not individual legal advice</text>` : ""}</g>
  <g transform="translate(${right.x} ${right.y})"><rect width="${right.w}" height="${right.h}" rx="22" fill="${C.ivory}" stroke="${C.line}"/><text x="28" y="39" class="ui caps" font-size="11" fill="${C.gold}">JURO ANSWER · SOURCE-AWARE</text>${status(right.w - 164, 22, "TRACEABLE", "green", 138)}
  <text x="28" y="88" class="ui" font-size="18" font-weight="800" fill="${C.ink}">The answer separates the legal rule, context and next step.</text><rect x="28" y="113" width="${right.w - 56}" height="98" rx="14" fill="#F0F3F4"/><rect x="45" y="136" width="${right.w - 104}" height="9" rx="4.5" fill="#BFCBD1"/><rect x="45" y="163" width="${right.w - (mobile ? 190 : 230)}" height="9" rx="4.5" fill="#D5DDE1"/><rect x="45" y="188" width="${right.w - (mobile ? 120 : 330)}" height="9" rx="4.5" fill="#D5DDE1"/>
  <text x="28" y="248" class="ui caps" font-size="10" fill="${C.muted}">SOURCES / 03 MATCHES</text>
  ${["Civil Code", "Relevant regulation", "JURO legal material"].map((name, i) => { const y = 270 + i * 78; return `<g transform="translate(28 ${y})"><rect width="${right.w - 56}" height="64" rx="12" fill="${i === 0 ? C.amberSoft : "#F3F5F5"}" stroke="${i === 0 ? "#DDC590" : C.line}"/><text x="16" y="24" class="ui caps" font-size="9" fill="${i === 0 ? "#76551B" : C.muted}">0${i + 1} · SOURCE ID L-${382 + i}</text><text x="16" y="48" class="ui" font-size="15" font-weight="800" fill="${C.ink}">${name}</text>${status(right.w - 190, 16, i === 2 ? "REVIEWED" : "VERIFIED", "green", 120)}</g>`; }).join("")}
  <rect x="28" y="${mobile ? 526 : 486}" width="${right.w - 56}" height="1" fill="${C.line}"/><circle cx="36" cy="${mobile ? 560 : 513}" r="5" fill="${C.green}"/><text x="52" y="${mobile ? 565 : 518}" class="ui caps" font-size="9" fill="${C.green}">SOURCE STATUS VISIBLE TO THE USER</text></g>`;
  return wrap({ w, h, title: "Source-aware legal AI", desc: "A question, structured answer and three source cards with source identifiers and verification status.", body, id: mobile ? "source-mobile" : "source", dark: false });
}

function documentIntel(mobile = false) {
  const w = mobile ? 760 : 1600, h = mobile ? 1180 : 700;
  const panelX = mobile ? 46 : 70, panelY = 150, panelW = mobile ? 668 : 1460;
  const body = `<text x="${panelX}" y="58" class="ui caps" font-size="13" fill="${C.gold}">DOCUMENT INTELLIGENCE / PROTECTED WORKFLOW</text>${mobile ? "" : `<text x="${w-panelX}" y="58" text-anchor="end" class="ui caps" font-size="11" fill="${C.muted}">PRODUCT ILLUSTRATION · PARTIAL WORKFLOW</text>`}<text x="${panelX}" y="110" class="serif" font-size="42" font-weight="700" fill="${C.ink}">From file to action plan</text>
  <g transform="translate(${panelX} ${panelY})"><rect width="${panelW}" height="${mobile ? 940 : 470}" rx="24" fill="${C.navy}"/>
  <g transform="translate(${mobile ? 28 : 34} 32)"><rect width="${mobile ? 612 : 430}" height="${mobile ? 224 : 402}" rx="18" fill="#113A56" stroke="#31536A"/><text x="22" y="36" class="ui caps" font-size="11" fill="${C.goldLight}">CONTRACT.PDF · 2.4 MB</text><rect x="22" y="64" width="${mobile ? 568 : 386}" height="8" rx="4" fill="#fff" fill-opacity=".12"/><rect x="22" y="64" width="${mobile ? 448 : 312}" height="8" rx="4" fill="${C.gold}"/><text x="22" y="105" class="ui" font-size="22" font-weight="800" fill="#fff">Analysing document…</text><text x="22" y="139" class="ui" font-size="14" fill="#BBD0DA">Clauses · obligations · dates · risks</text><g transform="translate(22 172)">${status(0,0,"PROTECTED","green",132)}${status(146,0,"72% SCANNED","gold",142)}</g>${!mobile ? `<path d="M22 248h386" stroke="#fff" stroke-opacity=".13"/><text x="22" y="281" class="ui caps" font-size="10" fill="#AFC1CA">SCAN TRACE</text>${[0,1,2,3].map((i)=>`<rect x="22" y="${301+i*22}" width="${318-i*34}" height="7" rx="3.5" fill="#fff" fill-opacity="${.34-i*.04}"/>`).join("")}` : ""}</g>
  <g transform="translate(${mobile ? 28 : 492} ${mobile ? 286 : 32})"><rect width="${mobile ? 612 : 558}" height="${mobile ? 364 : 402}" rx="18" fill="${C.ivory}"/><text x="24" y="37" class="ui caps" font-size="11" fill="${C.gold}">ANALYSIS RESULT · 3 RISKS FOUND</text>
  ${[["01","Termination clause","High priority"],["02","Liability","Needs review"],["03","Payment conditions","Clarify dates"]].map((r,i)=>`<g transform="translate(24 ${70+i*86})"><rect width="${mobile ? 564 : 510}" height="70" rx="12" fill="${i===0?C.amberSoft:"#F0F3F4"}"/><text x="16" y="27" class="ui caps" font-size="9" fill="${i===0?"#775719":C.muted}">${r[0]} / RISK</text><text x="16" y="52" class="ui" font-size="16" font-weight="800" fill="${C.ink}">${r[1]}</text><text x="${mobile ? 548 : 494}" y="43" text-anchor="end" class="ui caps" font-size="9" fill="${i===0?"#9A6722":C.muted}">${r[2]}</text></g>`).join("")}</g>
  <g transform="translate(${mobile ? 28 : 1080} ${mobile ? 680 : 32})"><rect width="${mobile ? 612 : 346}" height="${mobile ? 224 : 402}" rx="18" fill="#F3E8CE" stroke="#D8BC7A"/><text x="22" y="38" class="ui caps" font-size="10" fill="#745317">NEXT STEP / ACTION ENGINE</text><text x="22" y="83" class="ui" font-size="23" font-weight="850" fill="${C.ink}">Generate action plan</text><text x="22" y="119" class="ui" font-size="14" fill="${C.muted}">Turn findings into review tasks.</text><g transform="translate(22 156)"><rect width="${mobile ? 568 : 302}" height="48" rx="12" fill="${C.navy}"/><text x="${mobile ? 284 : 151}" y="30" text-anchor="middle" class="ui caps" font-size="10" fill="#fff">CREATE ACTION PLAN</text></g>${!mobile ? `<path d="M22 244h302" stroke="#C8AD70"/><text x="22" y="279" class="ui caps" font-size="9" fill="#85652A">OUTPUTS</text><text x="22" y="313" class="ui" font-size="14" fill="${C.ink}">• Prioritised issues</text><text x="22" y="342" class="ui" font-size="14" fill="${C.ink}">• Suggested revisions</text><text x="22" y="371" class="ui" font-size="14" fill="${C.ink}">• Lawyer-ready context</text>`:""}</g>
  </g>`;
  return wrap({ w, h, title: "Document intelligence", desc: "A protected document analysis workflow showing a contract scan, three risks and an action-plan hand-off.", body, id: mobile ? "document-mobile" : "document", dark: false });
}

function avatarAsset(mobile = false) {
  const w = mobile ? 760 : 1600, h = mobile ? 1030 : 620;
  const body = mobile ? `
  <circle cx="620" cy="120" r="300" fill="url(#avatar-mobile-glow)"/><text x="48" y="62" class="ui caps" font-size="13" fill="${C.goldLight}">JURO LAB / HUMAN-CENTRED AI</text><text x="48" y="118" class="serif" font-size="42" font-weight="700" fill="#fff">AI Avatar</text>${status(48,144,"IN DEVELOPMENT","gold",170)}
  <g transform="translate(170 226)"><circle cx="210" cy="210" r="174" fill="#0D3A59" stroke="${C.gold}" stroke-opacity=".65"/><circle cx="210" cy="191" r="63" fill="#7893A4"/><path d="M100 362c14-94 57-132 110-132s96 38 110 132" fill="#7893A4"/><circle cx="210" cy="210" r="197" fill="none" stroke="#D7BD7A" stroke-dasharray="2 14" stroke-linecap="round" opacity=".55"/><path d="M48 210h-30M402 210h-30M210 18V-12M210 432v-30" stroke="${C.gold}" stroke-opacity=".5"/></g>
  <g transform="translate(48 662)"><rect width="664" height="282" rx="22" fill="#0A314C" stroke="#2B536C"/><text x="28" y="43" class="ui" font-size="24" font-weight="850" fill="#fff">A more natural way to interact with JURO</text><text x="28" y="78" class="ui" font-size="16" fill="#BFD0D8">A visual AI legal assistant for accessible conversation.</text>${[["VOICE INTERACTION","RESEARCH"],["VISUAL CONVERSATION","BUILDING"],["LEGAL GUIDANCE UI","PROTOTYPING"]].map((r,i)=>`<g transform="translate(28 ${111+i*52})"><rect width="608" height="40" rx="10" fill="#fff" fill-opacity=".055"/><circle cx="18" cy="20" r="4" fill="${C.gold}"/><text x="34" y="25" class="ui caps" font-size="10" fill="#E7EEF1">${r[0]}</text><text x="590" y="25" text-anchor="end" class="ui caps" font-size="9" fill="${C.goldLight}">${r[1]}</text></g>`).join("")}</g>` : `
  <circle cx="1310" cy="110" r="430" fill="url(#avatar-glow)"/><path d="M1000 0c120 130 285 188 620 180M1110 620c130-130 300-180 520-166" fill="none" stroke="${C.gold}" stroke-opacity=".2"/>
  <g transform="translate(76 76)"><text class="ui caps" font-size="13" fill="${C.goldLight}">JURO LAB / HUMAN-CENTRED AI</text><text y="75" class="serif" font-size="58" font-weight="700" fill="#fff">AI Avatar</text>${status(0,105,"IN DEVELOPMENT","gold",170)}<text y="190" class="ui" font-size="23" font-weight="800" fill="#fff">A visual AI legal assistant designed for</text><text y="224" class="ui" font-size="23" font-weight="800" fill="#fff">more natural and accessible interaction.</text><text y="275" class="ui" font-size="16" fill="#BDCED6">No face claim. No production claim. A clear development track.</text>
  ${[["VOICE INTERACTION","RESEARCH"],["VISUAL CONVERSATION","BUILDING"],["LEGAL GUIDANCE INTERFACE","PROTOTYPING"]].map((r,i)=>`<g transform="translate(0 ${320+i*58})"><rect width="580" height="44" rx="11" fill="#fff" fill-opacity=".055" stroke="#fff" stroke-opacity=".08"/><circle cx="21" cy="22" r="4" fill="${C.gold}"/><text x="38" y="27" class="ui caps" font-size="10" fill="#E8EFF2">${r[0]}</text><text x="556" y="27" text-anchor="end" class="ui caps" font-size="9" fill="${C.goldLight}">${r[1]}</text></g>`).join("")}</g>
  <g transform="translate(790 58)"><circle cx="342" cy="252" r="203" fill="#0D3A59" stroke="${C.gold}" stroke-opacity=".65"/><circle cx="342" cy="225" r="77" fill="#7893A4"/><path d="M206 432c18-114 70-159 136-159s118 45 136 159" fill="#7893A4"/><circle cx="342" cy="252" r="232" fill="none" stroke="#D7BD7A" stroke-dasharray="2 16" stroke-linecap="round" opacity=".55"/><circle cx="342" cy="252" r="263" fill="none" stroke="#fff" stroke-opacity=".06"/><path d="M88 252H43M641 252h-45M342 22v-45M342 527v-45" stroke="${C.gold}" stroke-opacity=".45"/>
  <g transform="translate(483 410)"><rect width="236" height="105" rx="17" fill="#102F47" stroke="${C.gold}"/><text x="18" y="29" class="ui caps" font-size="9" fill="${C.goldLight}">BUILD STATUS</text><rect x="18" y="49" width="200" height="8" rx="4" fill="#fff" fill-opacity=".12"/><rect x="18" y="49" width="126" height="8" rx="4" fill="${C.gold}"/><text x="18" y="82" class="ui" font-size="13" fill="#D3DEE3">Research → development</text></g></g>`;
  return wrap({ w, h, title: "JURO AI Avatar — in development", desc: "Abstract, faceless AI assistant silhouette with voice, visual conversation and legal guidance interface tracks, all marked as development work.", body, id: mobile ? "avatar-mobile" : "avatar", dark: true });
}

function lawyerAsset(mobile = false) {
  const w = mobile ? 760 : 1600, h = mobile ? 1020 : 520;
  const body = `<text x="${mobile ? 48 : 68}" y="58" class="ui caps" font-size="13" fill="${C.gold}">HUMAN LAYER / CONTROLLED HAND-OFF</text>${mobile ? `<text x="48" y="112" class="serif" font-size="40" font-weight="700" fill="${C.ink}">AI when useful.</text><text x="48" y="160" class="serif" font-size="40" font-weight="700" fill="${C.ink}">A lawyer when needed.</text>${status(48,182,"PARTIAL WORKFLOW","gold",166)}` : `<text x="${w-68}" y="58" text-anchor="end" class="ui caps" font-size="11" fill="${C.muted}">PARTIAL WORKFLOW · WHERE AVAILABLE</text><text x="68" y="110" class="serif" font-size="42" font-weight="700" fill="${C.ink}">AI when useful. A lawyer when needed.</text>`}
  ${mobile ? `
  <g transform="translate(76 248)">${[["01","AI ASSISTANCE","Question and structured context"],["02","CASE CONTEXT","Sources, documents and action history"],["03","LAWYER REVIEW","Request human assistance without starting over"]].map((r,i)=>`<g transform="translate(0 ${i*190})"><rect width="608" height="142" rx="19" fill="${i===2?C.navy:C.ivory}" stroke="${i===2?C.gold:C.line}"/><text x="24" y="38" class="ui caps" font-size="11" fill="${C.gold}">${r[0]} / ${r[1]}</text><text x="24" y="83" class="ui" font-size="20" font-weight="800" fill="${i===2?"#fff":C.ink}">${r[2]}</text>${i<2?`<path d="M304 142v48" stroke="${C.gold}" stroke-width="2"/><path d="m297 180 7 10 7-10" fill="none" stroke="${C.gold}" stroke-width="2"/>`:""}</g>`).join("")}</g><rect x="76" y="832" width="608" height="86" rx="16" fill="${C.amberSoft}"/><text x="100" y="866" class="ui caps" font-size="10" fill="#76551B">CONTEXT PRESERVED</text><text x="100" y="897" class="ui" font-size="16" font-weight="800" fill="${C.ink}">Transfer the case without explaining everything again.</text>` : `
  <path d="M300 292H1300" stroke="#C9D3D8" stroke-width="2"/><path d="M1290 285l12 7-12 7" fill="none" stroke="${C.gold}" stroke-width="2"/>
  ${[["01","AI ASSISTANCE","Question + answer"],["02","CASE CONTEXT","Sources + documents"],["03","LAWYER REVIEW","Human judgment"]].map((r,i)=>{const x=70+i*510;return `<g transform="translate(${x} 166)"><rect width="454" height="202" rx="21" fill="${i===2?C.navy:C.ivory}" stroke="${i===2?C.gold:C.line}"/><text x="25" y="40" class="ui caps" font-size="11" fill="${C.gold}">${r[0]} / ${r[1]}</text><text x="25" y="91" class="ui" font-size="26" font-weight="850" fill="${i===2?"#fff":C.ink}">${r[2]}</text><text x="25" y="129" class="ui" font-size="15" fill="${i===2?"#BDCED7":C.muted}">${i===0?"AI structures the request.":i===1?"Evidence travels with the case.":"The user requests assistance."}</text>${status(25,151,i===0?"PROCESSING":i===1?"PROTECTED":"REQUESTABLE",i===2?"gold":"green",142)}</g>`;}).join("")}
  <rect x="70" y="401" width="1474" height="66" rx="16" fill="${C.amberSoft}"/><text x="98" y="429" class="ui caps" font-size="10" fill="#745317">CONTEXT PRESERVED</text><text x="98" y="452" class="ui" font-size="17" font-weight="800" fill="${C.ink}">Transfer the case without explaining everything again.</text><text x="1516" y="442" text-anchor="end" class="ui caps" font-size="10" fill="#745317">HUMAN ASSISTANCE · WHERE AVAILABLE</text>`}
  `;
  return wrap({ w, h, title: "Lawyer hand-off", desc: "A three-step hand-off from AI assistance through preserved case context to requested lawyer review.", body, id: mobile ? "lawyer-mobile" : "lawyer", dark: false });
}

function technologyAsset(mobile = false) {
  const w = mobile ? 760 : 1600, h = mobile ? 1560 : 860;
  const groups = [["FRONTEND","React · Next.js · TypeScript"],["EDGE & BACKEND","Cloudflare Workers · Node.js"],["DATA","Cloudflare D1 · private R2"],["AI","OpenAI · server-side orchestration"],["ENGINEERING","CI/CD · release validation"]];
  const body = `<text x="${mobile ? 48 : 68}" y="58" class="ui caps" font-size="13" fill="${C.gold}">JURO TECHNOLOGY / PRODUCTION-ORIENTED ARCHITECTURE</text><text x="${mobile ? 48 : 68}" y="110" class="serif" font-size="42" font-weight="700" fill="${C.ink}">Built for production</text>
  ${mobile ? `<g transform="translate(48 154)">${groups.map((g,i)=>`<g transform="translate(0 ${i*112})"><rect width="664" height="88" rx="16" fill="${i===0?C.navy:C.ivory}" stroke="${i===0?C.gold:C.line}"/><text x="22" y="31" class="ui caps" font-size="10" fill="${C.gold}">${xml(g[0])}</text><text x="22" y="62" class="ui" font-size="18" font-weight="800" fill="${i===0?"#fff":C.ink}">${xml(g[1])}</text></g>`).join("")}</g>
  <g transform="translate(48 742)"><rect width="664" height="744" rx="22" fill="${C.navy}"/><text x="28" y="42" class="ui caps" font-size="11" fill="${C.goldLight}">SYSTEM FLOW</text>${[["USER","Protected entry"],["JURO APP","Public + platform surfaces"],["AI ORCHESTRATION","Bounded server-side context"],["LEGAL SOURCES","Source-aware retrieval"],["DOCUMENTS + CASE","Private work context"],["ACTION ENGINE","Document · lawyer · next step"]].map((g,i)=>`<g transform="translate(54 ${80+i*105})"><rect width="556" height="70" rx="14" fill="#fff" fill-opacity="${i===2?.11:.065}" stroke="#fff" stroke-opacity=".1"/><text x="18" y="28" class="ui caps" font-size="9" fill="${C.goldLight}">${g[0]}</text><text x="18" y="54" class="ui" font-size="15" font-weight="800" fill="#fff">${g[1]}</text>${i<5?`<path d="M278 70v35" stroke="${C.gold}"/><path d="m273 97 5 8 5-8" fill="none" stroke="${C.gold}"/>`:""}</g>`).join("")}</g>` : `
  <g transform="translate(68 154)">${groups.map((g,i)=>`<g transform="translate(${i*294} 0)"><rect width="270" height="110" rx="17" fill="${i===0?C.navy:C.ivory}" stroke="${i===0?C.gold:C.line}"/><text x="19" y="34" class="ui caps" font-size="9" fill="${C.gold}">${xml(g[0])}</text><text x="19" y="69" class="ui" font-size="15" font-weight="800" fill="${i===0?"#fff":C.ink}">${xml(g[1].split(" · ")[0])}</text><text x="19" y="91" class="ui" font-size="13" fill="${i===0?"#C5D4DB":C.muted}">${xml(g[1].split(" · ").slice(1).join(" · "))}</text></g>`).join("")}</g>
  <g transform="translate(68 300)"><rect width="1464" height="492" rx="24" fill="${C.navy}"/><text x="28" y="42" class="ui caps" font-size="11" fill="${C.goldLight}">ARCHITECTURE / REQUEST TO ACTION</text>
  ${[["USER","Protected entry"],["JURO APP","Website · platform · admin"],["AI ORCHESTRATION","Server-side context"],["ACTION ENGINE","Document · lawyer · next step"]].map((g,i)=>`<g transform="translate(${38+i*354} 86)"><rect width="300" height="98" rx="16" fill="#fff" fill-opacity="${i===2?.12:.065}" stroke="#fff" stroke-opacity=".11"/><text x="20" y="33" class="ui caps" font-size="9" fill="${C.goldLight}">${g[0]}</text><text x="20" y="67" class="ui" font-size="16" font-weight="800" fill="#fff">${g[1]}</text>${i<3?`<path d="M300 49h54" stroke="${C.gold}"/><path d="m344 43 10 6-10 6" fill="none" stroke="${C.gold}"/>`:""}</g>`).join("")}
  <path d="M770 184v66M770 250H340M770 250h430" fill="none" stroke="#D7BE7E" stroke-opacity=".7"/>
  ${[["LEGAL SOURCES","Retrieval + citations",188],["USER DOCUMENTS","Private R2 files",618],["CASE CONTEXT","D1 + permissions",1048]].map(g=>`<g transform="translate(${g[2]} 276)"><rect width="326" height="104" rx="16" fill="#0D3A58" stroke="#315670"/><text x="20" y="35" class="ui caps" font-size="9" fill="${C.goldLight}">${g[0]}</text><text x="20" y="72" class="ui" font-size="16" font-weight="800" fill="#fff">${g[1]}</text></g>`).join("")}
  <path d="M351 380v50h861v-50" fill="none" stroke="#D7BE7E" stroke-opacity=".7"/><rect x="523" y="422" width="504" height="44" rx="13" fill="${C.gold}"/><text x="775" y="449" text-anchor="middle" class="ui caps" font-size="10" fill="${C.navyDeep}">TRACEABLE OUTPUT · DOCUMENT / LAWYER / NEXT STEP</text></g>`}
  `;
  return wrap({ w, h, title: "JURO technology architecture", desc: "Technology groups and architecture from user entry through the JURO app, AI orchestration, legal sources, documents, case context and action engine.", body, id: mobile ? "tech-mobile" : "tech", dark: false });
}

for (const locale of Object.keys(heroLocales)) {
  save(`hero-${locale}.svg`, heroDesktop(locale));
  save(`hero-${locale}-mobile.svg`, heroMobile(locale));
}
save("capability-board.svg", capabilityBoard(false));
save("capability-board-mobile.svg", capabilityBoard(true));
save("question-to-action.svg", workflowAsset(false));
save("question-to-action-mobile.svg", workflowAsset(true));
save("source-aware-ai.svg", sourceAware(false));
save("source-aware-ai-mobile.svg", sourceAware(true));
save("document-intelligence.svg", documentIntel(false));
save("document-intelligence-mobile.svg", documentIntel(true));
save("ai-avatar.svg", avatarAsset(false));
save("ai-avatar-mobile.svg", avatarAsset(true));
save("lawyer-handoff.svg", lawyerAsset(false));
save("lawyer-handoff-mobile.svg", lawyerAsset(true));
save("technology-architecture.svg", technologyAsset(false));
save("technology-architecture-mobile.svg", technologyAsset(true));

console.log("Generated JURO README showcase SVG assets.");
