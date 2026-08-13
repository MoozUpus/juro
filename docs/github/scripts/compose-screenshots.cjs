/*
 * Rebuild README presentation frames around privacy-reviewed JURO product captures.
 * Run after `npm run install:all` from the repository root:
 *   node docs/github/scripts/compose-screenshots.cjs
 */
const path = require('path');
const sharp = require(path.resolve(__dirname, '../../../apps/platform/node_modules/sharp'));

const githubRoot = path.resolve(__dirname, '..');
const screenshotRoot = path.join(githubRoot, 'screenshots');
const rawRoot = path.join(screenshotRoot, 'raw');

const captures = [
  {
    file: 'public-website.webp',
    label: 'PUBLIC WEBSITE',
    status: 'LIVE',
    title: 'juro.uz · legal intelligence starts with the situation',
    note: 'Real JURO public-product capture · no personal data',
  },
  {
    file: 'platform-dashboard.webp',
    label: 'PROTECTED WORKSPACE',
    status: 'LIVE ENTRY',
    title: 'app.juro.uz · a connected legal workspace',
    note: 'Real JURO product capture · account data removed',
  },
  {
    file: 'ai-chat.webp',
    label: 'LEGAL INFORMATION FLOW',
    status: 'WORKING',
    title: 'Ask with context · inspect the source boundary',
    note: 'Real interface starting state · no conversation data',
    crop: { left: 210, top: 0, width: 625, height: 720 },
    sidePanel: 'context',
  },
  {
    file: 'document-builder.webp',
    label: 'DOCUMENT WORKFLOW',
    status: 'WORKING',
    title: 'Build a draft through a structured document flow',
    note: 'Real JURO product capture · no user documents or personal data',
  },
  {
    file: 'document-analysis.webp',
    label: 'DOCUMENT REVIEW',
    status: 'PARTIAL',
    title: 'Review and compare surfaces in the protected product',
    note: 'Real interface capture · end-to-end review remains PARTIAL',
  },
];

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function chromeSvg({ label, status, title, note, sidePanel }) {
  const statusFill = status === 'PARTIAL' ? '#e7d3a5' : '#BE974F';
  const statusText = status === 'PARTIAL' ? '#6a4c1d' : '#062844';
  const documentPanel = sidePanel === 'document'
    ? `<g>
        <rect x="965" y="256" width="470" height="596" rx="22" fill="#0d314b"/>
        <text x="1010" y="316" fill="#caa866" font-family="Inter,Arial,sans-serif" font-size="12" font-weight="800" letter-spacing="1.5">DOCUMENT WORKFLOW</text>
        <text x="1010" y="382" fill="#fff" font-family="Georgia,serif" font-size="34" font-weight="700">From context</text>
        <text x="1010" y="423" fill="#fff" font-family="Georgia,serif" font-size="34" font-weight="700">to a draft.</text>
        <path d="M1010 472H1388" stroke="#ffffff" stroke-opacity=".16"/>
        <circle cx="1022" cy="514" r="6" fill="#BE974F"/><text x="1042" y="520" fill="#d7e3e8" font-family="Inter,Arial,sans-serif" font-size="16">Structured document workflows</text>
        <circle cx="1022" cy="559" r="6" fill="#BE974F"/><text x="1042" y="565" fill="#d7e3e8" font-family="Inter,Arial,sans-serif" font-size="16">Protected storage paths</text>
        <circle cx="1022" cy="604" r="6" fill="#BE974F"/><text x="1042" y="610" fill="#d7e3e8" font-family="Inter,Arial,sans-serif" font-size="16">Generated-file workflows</text>
        <rect x="1010" y="683" width="224" height="34" rx="17" fill="#ffffff" fill-opacity=".08" stroke="#ffffff" stroke-opacity=".16"/>
        <text x="1028" y="705" fill="#f8f6f2" font-family="Inter,Arial,sans-serif" font-size="11" font-weight="800" letter-spacing="1">WORKING SURFACE</text>
      </g>`
    : '';
  const contextPanel = sidePanel === 'context'
    ? `<g>
        <rect x="965" y="256" width="470" height="596" rx="22" fill="#0d314b"/>
        <text x="1010" y="316" fill="#caa866" font-family="Inter,Arial,sans-serif" font-size="12" font-weight="800" letter-spacing="1.5">STARTING STATE</text>
        <text x="1010" y="382" fill="#fff" font-family="Georgia,serif" font-size="34" font-weight="700">Begin with</text>
        <text x="1010" y="423" fill="#fff" font-family="Georgia,serif" font-size="34" font-weight="700">the context.</text>
        <path d="M1010 472H1388" stroke="#ffffff" stroke-opacity=".16"/>
        <circle cx="1022" cy="514" r="6" fill="#BE974F"/><text x="1042" y="520" fill="#d7e3e8" font-family="Inter,Arial,sans-serif" font-size="16">Describe the legal situation</text>
        <circle cx="1022" cy="559" r="6" fill="#BE974F"/><text x="1042" y="565" fill="#d7e3e8" font-family="Inter,Arial,sans-serif" font-size="16">Keep personal data to a minimum</text>
        <circle cx="1022" cy="604" r="6" fill="#BE974F"/><text x="1042" y="610" fill="#d7e3e8" font-family="Inter,Arial,sans-serif" font-size="16">Show sources only when available</text>
        <rect x="1010" y="683" width="264" height="34" rx="17" fill="#ffffff" fill-opacity=".08" stroke="#ffffff" stroke-opacity=".16"/>
        <text x="1028" y="705" fill="#f8f6f2" font-family="Inter,Arial,sans-serif" font-size="11" font-weight="800" letter-spacing="1">NO CONVERSATION DATA</text>
      </g>`
    : '';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#041f37"/><stop offset="1" stop-color="#062844"/></linearGradient>
      <radialGradient id="glow" cx="90%" cy="40%" r="58%"><stop stop-color="#BE974F" stop-opacity=".18"/><stop offset="1" stop-color="#BE974F" stop-opacity="0"/></radialGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#dce6ed" stroke-opacity=".05"/></pattern>
      <filter id="shadow" x="-15%" y="-15%" width="140%" height="150%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000d18" flood-opacity=".36"/></filter>
    </defs>
    <rect width="1600" height="1000" fill="url(#bg)"/><rect width="1600" height="1000" fill="url(#grid)"/><rect width="1600" height="1000" fill="url(#glow)"/>
    <text x="80" y="74" fill="#caa866" font-family="Inter,Arial,sans-serif" font-size="12" font-weight="800" letter-spacing="1.8">JURO / ${escapeXml(label)}</text>
    <text x="80" y="111" fill="#fff" font-family="Georgia,serif" font-size="30" font-weight="700">${escapeXml(title)}</text>
    <rect x="1290" y="55" width="150" height="36" rx="18" fill="${statusFill}"/><text x="1365" y="78" text-anchor="middle" fill="${statusText}" font-family="Inter,Arial,sans-serif" font-size="11" font-weight="800" letter-spacing="1.1">${escapeXml(status)}</text>
    <g filter="url(#shadow)"><rect x="80" y="150" width="1440" height="740" rx="25" fill="#f8f6f2"/><rect x="100" y="174" width="1400" height="692" rx="16" fill="#e4eaec"/></g>
    ${documentPanel}${contextPanel}
    <text x="80" y="948" fill="#b9c9d2" font-family="Inter,Arial,sans-serif" font-size="14">${escapeXml(note)}</text>
    <text x="1440" y="948" text-anchor="end" fill="#caa866" font-family="Inter,Arial,sans-serif" font-size="11" font-weight="800" letter-spacing="1.2">JURO · PRODUCT CAPTURE</text>
  </svg>`);
}

async function createCapture(capture) {
  const sourcePath = path.join(rawRoot, capture.file);
  let source = sharp(sourcePath);
  if (capture.crop) source = source.extract(capture.crop);
  const screenshot = await source
    .resize({
      width: capture.sidePanel ? 820 : 1400,
      height: capture.sidePanel ? 692 : 692,
      fit: 'contain',
      background: '#f8f6f2',
    })
    .webp({ quality: 88 })
    .toBuffer();
  await sharp(chromeSvg(capture))
    .composite([{ input: screenshot, left: 100, top: 174 }])
    .webp({ quality: 88 })
    .toFile(path.join(screenshotRoot, capture.file));
}

(async () => {
  await Promise.all([
    ...captures.map(createCapture),
    sharp(path.join(githubRoot, 'social-preview-source.svg'))
      .png()
      .toFile(path.join(githubRoot, 'social-preview.png')),
  ]);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
