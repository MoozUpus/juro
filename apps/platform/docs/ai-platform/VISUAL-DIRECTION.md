# JURO visual direction

Updated: 2026-07-28
Status: owner-approved direction documented; source audit and bounded authenticated builder/browser pass complete; full accessibility/performance validation remains open; production UI unchanged.

## Direction

The approved direction is **Cinematic Legal Intelligence**: a professional Uzbekistan LegalTech product that combines technical depth, legal reliability, confidentiality, human support, and premium craft without becoming a marketing spectacle.

The public website may use stronger storytelling. `app.juro.uz` must use the same visual universe as a functional application:

- a cinematic navy shell for orientation, AI entry, onboarding, selected empty states, and major mode transitions;
- light or neutral reading-first work surfaces for documents, analysis, redline, comparison, tables, forms, and long legal answers;
- controlled gold only for selected/premium/key brand actions, never every border or icon;
- information hierarchy and object context before decorative depth;
- motion for feedback, state, spatial consistency, explanation, and restrained brand recognition;
- static/reduced-motion fallbacks that preserve all information and actions.

## Surface calibration

| Surface | Design variance | Motion intensity | Visual density | Operational rule |
|---|---:|---:|---:|---|
| Dashboard / AI entry | 6/10 | 5/10 | 5/10 | compact cinematic entry; open cases/deadlines/documents remain visible early |
| AI chat / voice | 5/10 | 4/10 | 6/10 | readable answer surface; sources/risks/plan use progressive panels |
| Documents / analysis / builder / cases / calendar | 3/10 | 2/10 | 8/10 | light reading surface; no animated background below legal text |
| Onboarding / empty states | 6/10 | 5/10 | 5/10 | guide the next action; Jurobek only in approved controlled contexts |
| Admin | 2/10 | 1/10 | 9/10 | dense, keyboard-efficient, no cinematic hero |

## Source-based audit conclusion

The current product exposes three competing mental models: the localized platform shell, a legacy document-builder world with separate route/language behavior, and a cinematic demo that is more coherent but not real-system evidence. The design migration must unify object context, localization, and navigation before applying polish.

Highest-priority human-factors defects:

1. OTP skips the required resumable onboarding and lands directly in a dashboard.
2. Account types expose `individual/business` instead of `individual/entrepreneur/lawyer`, while business should be a workspace.
3. Major dashboard promises lead to generic empty states.
4. Case detail does not preserve the requested case object context.
5. Consultation booking and document handoff perform consequential writes without sufficient preview/confirmation/least-privilege selection.
6. Builder routes, language modes, dialogs, navigation, and autosave warnings break continuity and agency.

The full evidence and Before/After/Why table live in `DESIGN-AUDIT.md`.

## Non-negotiable design rules

- No full-dark document/editor canvas.
- No scroll hijacking, decorative WebGL, purposeless parallax, purple generic AI gradients, excessive glass, or cards inside cards.
- No huge marketing headline inside working modules.
- No score that visually outranks evidence, severity, uncertainty, and recommended action.
- No fake AI, voice, microphone, lawyer, payment, analysis, upload, or completed-job state.
- No source marked verified without server-side source/version validation.
- No handoff with all sensitive materials preselected.
- No inaccessible animation-only state or hover-only function.
- No production visual replacement from the prototype route.

## Skill application record

- Official `pbakaus/impeccable` was used for source audit, critique, craft floor, anti-pattern detection, and Before/After/Why framing.
- Official `emilkowalski/skills` was used for motion vocabulary, animation review criteria, purposeful-opportunity filtering, library restraint, and Apple-style purpose/agency/responsibility checks.
- Official `Leonxlnx/taste-skill` was used only as an anti-slop/visual-quality critique layer; its landing-page-specific guidance does not override dashboard density or legal readability.

Current upstream naming differences are explicit: Impeccable v4.0.3 no longer has a `normalize` command (relevant work is split between `extract` and `polish`), and Emil's current official skill is `find-animation-opportunities` rather than the older requested name. No skill installation script or runtime dependency was added.

## Verification status

A bounded authenticated Chrome pass verifies canonical RU/UZ builder rendering and zero horizontal overflow at 320, 360, 390, 768, 1024, 1280, and 1440 px. Keyboard order, focus trap/restoration, touch targets, 200% zoom, contrast, screen readers, reduced motion, animation interruptibility, WebGL fallback, Lighthouse, axe, GPU/memory, real devices, and the wider route matrix remain unverified.
