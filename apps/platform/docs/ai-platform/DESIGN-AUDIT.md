# JURO platform design audit

Audit date: 2026-07-28
Production Sites revision: `4031078`
Integration branch baseline: `1d3d23d` before this documentation update
Method: static code/design-system review, two independent source-based design-contract reviews, and a bounded authenticated Chrome pass of the canonical document-builder. Lighthouse, axe, real-device, 200% zoom, reduced-motion, and full-route passes have not been completed and are not claimed.

The Browser runtime initially failed because its temporary CommonJS files inherited ESM semantics from a user-home `package.json`. A session-local temporary `{ "type": "commonjs" }` package scope restored the bundled Browser runtime without modifying JURO or the user-home package. The recovered runtime selected the user's Chrome connection and produced the bounded evidence below. Desktop screenshot capture timed out twice and is not claimed; the successful mobile screenshot contains no personal document data.

## Browser evidence

| Check | Result |
|---|---|
| `/ru/individual/main`, desktop | one `h1`, skip link and target present, no horizontal overflow, no console warning/error |
| `/ru/individual/document-builder`, desktop | canonical route and title rendered; no console warning/error |
| builder width matrix | zero horizontal overflow at 320, 360, 390, 768, 1024, 1280, and 1440 px |
| mobile navigation | fixed bottom navigation present through 768 px and absent at 1024 px+ |
| `/uz/individual/document-builder` | shell labels and document `lang` are Uzbek, but the builder work surface remains Russian |
| semantic landmarks | builder renders a `<main>` inside the shell `<main>`; must be corrected in the prototype/production migration |
| screenshots | PII-free 390×844 UZ builder screenshot captured; desktop capture timed out and remains open |

The pass confirms responsive containment, not full accessibility or visual approval. It does not cover touch target geometry, focus behavior, 200% zoom, reduced motion, screen readers, or mobile browser keyboards.

## Design posture

JURO is a regulated LegalTech workspace, not a marketing experience.

Approved direction: **Cinematic Legal Intelligence**. The application uses a controlled navy/gold cinematic shell around high-readability light legal work surfaces. It must not become a marketing landing page or Awwwards demo.

Applied context by surface:

- dashboard/AI entry: variance `6/10`, motion `5/10`, density `5/10`;
- AI chat/voice: variance `5/10`, motion `4/10`, density `6/10`;
- documents/analysis/builder/cases/calendar: variance `3/10`, motion `2/10`, density `8/10`;
- onboarding/empty states: variance `6/10`, motion `5/10`, density `5/10`;
- admin: variance `2/10`, motion `1/10`, density `9/10`;
- preserve the working document builder and existing navy/gold/paper brand.

The official upstream Impeccable (Apache-2.0), Emil Kowalski skills (MIT), and Taste Skill (MIT) instructions were reviewed without running install scripts or adding runtime code. Current upstream Impeccable v4.0.3 has no `normalize` command; its relevant responsibilities are split between `extract` and `polish`. Current Emil uses `find-animation-opportunities`, not `find-purposeful-animation`. These names are recorded rather than imitated. Taste guidance is applied as an anti-slop/critique layer because its own frontend skill says it is not a dashboard workflow. Landing-page/Awwwards patterns remain excluded from legal work surfaces.

## Core Before / After / Why direction

| Before | After target | Why |
|---|---|---|
| two unscoped `:root` sets plus a global JURO 2.0 `body` override leak marketing navy/gold/paper/font values into every route | one prototype-scoped semantic token system around `#062844`, `#BE974F`, and `#F8F6F2`, with separate shell/work-surface, text, border, focus, risk, and status roles | stop cascade-dependent visual drift, preserve the brand, and meet contrast/state clarity without changing production before approval |
| marketing-like shell and repeated route-module chrome | stable cinematic application shell with compact entry zone and light reading/work canvases | maintain visual continuity without competing with legal work |
| dashboard AI prompt placed in a query string | protected server-side draft/POST transition into the same case/chat context | keep sensitive legal text out of URLs, history, referrers, and routine logs |
| simulated/ephemeral AI and `202` completion states | durable processing states, job progress, normalized result, retry, and accessible announcements | prevent false success and preserve user agency |
| small controls and 7–11 px metadata declarations | readable type floor, 44×44 targets, 200% zoom-safe layouts | WCAG 2.2 AA and mobile usability |
| static Jurobek raster used as if an avatar foundation existed | use the approved rigged 3D asset only after it is supplied and audited; retain a static fallback meanwhile | avoid inventing identity, rigging, microphone, or voice behavior |
| file-only analysis entry hid the supported public-material workflow | a separate native RU/UZ HTTPS-link form shares case context and explicit consent, with honest quarantine/error status | make the capability discoverable without pretending private cabinets, authentication forwarding or completed analysis work |

The link form adds no decorative reveal or scroll motion. It uses visible focus,
44 px controls, pointer-only hover and a 140 ms press response; reduced-motion
removes the transform. This keeps a frequent legal-work action immediate.

## Scorecard

| Area | Score | Finding |
|---|---:|---|
| Accessibility | 2/4 | skip link/focus foundations exist; document language, dialogs, contrast, targets, and live states block AA |
| Performance | 2/4 | comparison virtualization exists; global CSS and unoptimized image strategy require measurement and splitting |
| Responsive | 2/4 | breakpoints exist; overlay, touch, and double-header risks need real viewport testing |
| Theming | 1/4 | competing navy/gold/cream sets and many hardcoded values |
| Implementation integrity | 1/4 | false completion, unconditional verification badge, raw ephemeral AI JSON, and placeholders |
| **Total** | **8/20** | **Staging design gate not passed** |

## P0 integrity and privacy blockers

### False asynchronous completion

`DocumentReviewClient` accepts HTTP `202` and can default to “Анализ завершён”.

Required behavior:

- `202` means queued/processing;
- persist and display `jobId`, stages, progress, recoverable failure, and terminal state;
- announce progress accessibly;
- show completion only after the normalized result is durably persisted.

### Unverified sources marked verified

In deployed Sites v20, `ComparisonResultClient` accepts any HTTPS URL and labels every source “Проверен”; `GlobalSearch` has the same HTTPS-only concept of a safe official URL. The integration branch locally replaces that promotion path with one server-owned exact-host allowlist for LexUZ/AdviceUZ, but it is not staged and still lacks source ID/version/status/freshness verification.

Required behavior:

- server-provided verification status;
- official-domain allowlist;
- source ID/version/status/freshness validation;
- distinguish official norm, Advice scenario, internal JURO material, user-provided evidence, AI inference, and unconfirmed basis;
- never infer verification from the URL scheme.

### Ephemeral raw AI output

`DocumentAssetsPanel` renders raw serialized output and explicitly states that the analysis is not saved.

Required behavior:

- Zod-validated structured result;
- stored analysis and history;
- safe human-readable UI;
- no raw provider JSON in the user interface;
- failed validation must not produce success.

### Sensitive question in URL

The dashboard links to AI with `?prompt=...`.

Required behavior:

- create a server-side short-lived draft/intake record, or perform a protected POST transition;
- keep legal text out of URLs, browser history, referrers, and routine access logs.

### Unsupported upload contract presented as product capability

Dashboard and review currently use one ordinary multipart file, a 10 MB limit, and synchronous processing.

Required behavior:

- private direct/multipart R2 upload;
- up to the approved limits;
- multiple documents and packages;
- real scan/OCR/analysis stages;
- no AI handoff before `safe/ready`;
- honest disabled states until the backend is available.

### Visible configuration placeholders

`config/pricing.ts` exposes literal price placeholders.

Required behavior:

- display “Скоро” until a real configured price is approved;
- show only Free, Individual, Family, Business, and Lawyer entitlements supported by the backend;
- do not place fake prices or placeholder syntax in UI or metadata.

## Structural UX blockers

### Routing and account model

Current root and account routing supports only `individual` and `business`, with legacy `/login` and `/main`. The target localized dashboard, entrepreneur/lawyer profiles, and business workspace ID are absent.

### Incorrect SSR language

The root layout emits `<html lang="ru">` and corrects it in client JavaScript. Uzbek and JavaScript-disabled users receive incorrect document language.

### Onboarding order and fields

Registration collects profile/business details before OTP and onboarding only supports individual/business. Target order is email OTP first, then required personal fields, language, individual/entrepreneur/lawyer type, goal, consent, and overview. Business is a workspace created later.

### Case shell is misleading

The case detail route ignores `caseId` and renders a general plan. It must not imply that a specific case is loaded.

### AI lawyer is an intake form, not target chat

The current real POST is honest when the provider is unavailable, but lacks streaming, stop, regenerate, edit/branch history, attachments, voice, sources panel, recovery, and mobile drawer behavior.

### Missing areas

Calendar, lawyer directory/workspace, admin, searchable localized help articles, and operational status are absent.

## Document builder regression risks

The canonical localized builder wraps a legacy builder page inside `PlatformShell`, which adds a second sticky header.

Issues:

- builder header `z-index` exceeds the platform top bar;
- header links use unlocalized `/document-builder/*` paths;
- accessible label still says “Тестовый модуль документов”;
- old component name retains `Test`;
- shared account layout imports builder CSS on all workspace routes;
- mobile preview is an `<aside>` rather than an accessible dialog;
- contacts/delete dialogs and document menus lack the complete keyboard contract;
- notification cards perform an action from a non-focusable `<article>`;
- legacy draft recovery key must be migrated, not silently replaced.

Required regression matrix:

- RU and UZ canonical builder;
- library/category/template;
- document list/detail/edit;
- invitations;
- share and signed share;
- contacts and notifications;
- legacy redirects;
- keyboard, focus restoration, mobile preview, and no double chrome.

## Design-system and accessibility gaps

### Tokens and contrast

There are competing sets:

- brand baseline: `#062844`, `#BE974F`, `#F8F6F2`;
- platform variants: `#071a2e`, `#c79d4e`, `#f6f2e9`;
- an undefined `--p-ink` reference.

Measured examples:

- `#BE974F` on white: `2.72:1`;
- `#BE974F` on `#F8F6F2`: `2.52:1`;
- `#728096` on white: `4.00:1`.

Gold must not serve as small-text color. A semantic token system must separate brand decoration, interactive controls, text, borders, focus, and status.

### Typography

The CSS scan found 141 declarations between 7 and 11 px. Legal content, metadata, controls, citations, and admin tables require a readable floor and zoom testing.

### Touch targets

Several controls are 34–40 px, including auth language buttons, builder header links, preview close, and document actions. Interactive targets must reach at least 44×44 CSS px or provide equivalent hit area.

### Navigation

- mobile order is Home, AI, Cases, Documents, More rather than Home, AI, Documents, Cases, Profile;
- desktop primary navigation omits Calendar, Tariff, and Settings;
- mobile/sidebar/search overlays do not fully inert or hide background content;
- global search does not restore trigger focus and lacks a full combobox/live-result contract.

### State coverage

Loading, error, and some live states exist, but the full target state matrix is incomplete:

- first-use;
- partial success;
- offline/stale;
- permission denied;
- plan limit;
- cancelled;
- retry;
- archived;
- recoverable background processing.

Skeletons often do not match the future content shape.

### Other accessibility findings

- action-plan accordions lack `aria-expanded`/`aria-controls`;
- progress lacks `role="progressbar"`;
- comparison mobile selectors lack pressed/tab semantics;
- redline labels risk replacing the text screen readers need;
- consultation loading/error states are incompletely announced;
- raw status/category values are not consistently localized;
- repeated generic disclaimers conflict with contextual-warning policy.

## Motion review

Additional decorative motion is not needed.

Required changes:

| Current | Required |
|---|---|
| unbounded `transition: .18s ease` in builder CSS | explicit properties only, generally 150–200 ms |
| hover transform on touch-capable rules | wrap with `(hover: hover) and (pointer: fine)` |
| reduced-motion rule sets nearly zero duration globally | remove displacement but retain 100–150 ms opacity/color feedback |
| JavaScript always requests smooth scroll | use `auto` when reduced motion is preferred |
| stopped spinner is the only progress cue | persistent text/status and `aria-busy` |
| motion on frequent keyboard workflows | instant command search; motion only for occasional spatial drawer transitions |

Animation staging gate:

- no `transition: all` or property-omitted transitions;
- no programmatic smooth scrolling in reduced motion;
- no delayed keyboard interactions;
- exit generally faster than enter;
- transform/opacity only for spatial transitions;
- tactile button active state without slowing frequent work.

## Performance risks

- reviewed global/module CSS totals about 301,566 raw bytes;
- the workspace layout imports all module styles and builder styles;
- `ModuleContent` statically links all module clients;
- images are configured as unoptimized;
- actual LCP, INP, CLS, and route bundle costs are not measured.

Required:

- route-level loading/code splitting;
- keep builder CSS out of unrelated routes;
- bundle analysis;
- representative mobile CWV;
- skeleton/content-size stability;
- no heavy motion library in common routes.

## Jurobek / 3D evidence

No GLB, FBX, USDZ, glTF, Blender, DAE, OBJ, VRM, or other rigged Jurobek source is present in the reconciled repository, synced workspaces, inspected Sites checkout, or either local delivery archive. Twenty-two raster copies reduce to six unique byte sequences and four visual poses: neutral, wave, point, and approve. The canonical platform static fallback is `public/jurobek-avatar.webp`, 1024×1792, 60,670 bytes, SHA-256 `9f42f50c39b71abb8a1792ab67780b08b010b28439437d4789d55aa72a83c8df`.

Therefore armature, skinning, bone weights, materials, animation clips, facial details, lip sync, mesh statistics, and the requested shirt-lettering correction cannot be truthfully implemented or verified. The cinematic prototype must keep the static fallback, textual/ARIA state labels, and the avatar/voice-with-avatar enhancement disabled until the owner-approved source asset is supplied through an appropriate file channel. Text and voice must remain usable without WebGL.

## Positive foundations

- professional navy/gold/paper visual direction;
- no generic purple AI, decorative WebGL, glass-heavy workspace, or animated Jurobek;
- global skip link and visible focus styling;
- Escape and focus trapping exist in parts of the mobile shell/search;
- comparison tabs have keyboard navigation;
- long comparison lists use virtualization;
- several form errors and processing states already use alert/live semantics;
- provider-off behavior is generally honest;
- the current Jurobek fallback is static and avoids a fake microphone/voice state.

## Required verification pass

Before the staging design gate:

1. extend the completed builder width checks at 320, 360, 390, 768, 1024, 1280, and 1440+ to dashboard, chat, analysis, cases, and builder detail routes;
2. zoom 200%;
3. keyboard-only and screen-reader smoke;
4. reduced motion;
5. storage-disabled/privacy mode;
6. iOS Safari keyboard behavior and Android Chrome;
7. horizontal overflow and touch targets;
8. focus trap, inert background, Escape, and restoration;
9. source/progress announcements;
10. complete canonical builder regression;
11. axe and Lighthouse;
12. measured bundle and Core Web Vitals.
13. rerun visual Impeccable/Taste passes on the staged prototype; the two source-contract reviews now have no High/P1/P2 findings, but that is not a visual score.

## Legal bookmark control — local Before / After / Why

| Before | After | Why |
|---|---|---|
| AI sources were outbound links only | Each verified source has an explicit RU/UZ save form with personal/case destination and optional comment | Converts a cited norm into durable user work without trusting client tenant/version data |
| Case Sources mixed only incidental chat citations | Explicit pinned bookmarks are separated from incidental AI-dialog sources | Clarifies user agency and why an item remains in the case |
| A later source revision had no visible bookmark semantics | The case row says current version or saved historical version | Prevents silent legal-context drift |
| No removal control | A 44 px labelled archive control with live status removes the bookmark from the case | WCAG target size, keyboard access and reversible mental model |

Motion review: this is a frequent legal-work action, so save/archive use no
decorative transition or stagger. Native `details`, form state, disabled state
and `aria-live` provide feedback. No dependency or animation runtime was added.

