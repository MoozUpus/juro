---
name: JURO
description: Trust-first LegalTech interface for clear legal action
colors:
  primary-navy: "#062844"
  primary-navy-deep: "#041E33"
  accent-gold: "#BE974F"
  canvas: "#F8F6F2"
  surface: "#FFFFFF"
  ink: "#102333"
  muted: "#596B78"
  line: "#D9DEE1"
typography:
  display:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontSize: "clamp(3rem, 6vw, 5.75rem)"
    fontWeight: 650
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  body:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 450
    lineHeight: 1.65
rounded:
  control: "10px"
  surface: "16px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "24px"
  lg: "48px"
  xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary-navy}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "14px 20px"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "28px"
---

# Design System: JURO

## Overview

**Creative North Star: "The Clear Legal Desk"**

JURO should feel like a well-organised legal desk translated into a modern digital product: every fact has a place, every next step is visible, and the interface never dramatizes uncertainty. The system combines institutional trust with the warmth needed by people who may be dealing with a stressful problem.

**Key Characteristics:**

- Deep navy carries authority; gold is scarce and directional.
- Product demonstrations use real legal tasks and restrained status language.
- Large type creates clarity, while fine rules and spacing organise evidence.
- Jurobek supports orientation without turning the product into entertainment.

## Colors

The palette is a restrained warm-neutral system with one navy authority color and one gold directional accent.

**The Gold Is Guidance Rule.** Gold marks emphasis, progress, and a deliberate next action. It is not used as a decorative wash.

## Typography

**Display Font:** Geist Sans with the system sans-serif fallback
**Body Font:** Geist Sans with the system sans-serif fallback

**Character:** Contemporary, legible, and direct. Hierarchy comes from size, weight, spacing, and measure rather than decorative font switching.

- **Display:** Weight 650, tight leading, used for the hero and major section statements.
- **Headline:** Weight 620, balanced wrapping, used once per section.
- **Title:** Weight 650, used for tasks and product capabilities.
- **Body:** Weight 450, line height 1.65, capped near 68 characters.
- **Label:** Weight 650, sentence case by default.

## Layout

The desktop page uses a 12-column grid inside a 1440px maximum container. Sections alternate between editorial splits, process rails, structured comparison, and full-width product demonstrations. Below 768px, all asymmetric structures become a single readable column with 16px side padding. The hero uses `min-height` rather than fixed viewport height.

## Elevation & Depth

The system is flat by default. Tonal layering and fine rules organise most content. One diffuse, navy-tinted shadow may be used for the primary product demonstration and mobile navigation where elevation communicates a real layer.

**The One Elevated Object Rule.** A viewport should have no more than one object that visually floats above the page.

## Shapes

Controls use purposeful 10px corners. Major surfaces use 16px corners. Small status chips may be pill-shaped. Large pill cards and nested rounded containers are avoided.

## Components

### Buttons

- **Shape:** Compact 10px radius with a minimum 44px touch target.
- **Primary:** Deep navy with white text.
- **Hover / Focus:** Small color shift, visible gold-tinted focus ring, and subtle pressed scale.
- **Secondary:** Transparent or white with a clear structural rule.

### Cards / Containers

- **Corner Style:** 16px.
- **Background:** White or a light tonal surface.
- **Shadow Strategy:** Flat by default.
- **Border:** A single low-contrast cool rule when grouping needs an edge.
- **Internal Padding:** 24–32px.

### Navigation

The desktop navigation stays on one line in a 72px sticky header. Mobile navigation opens as a compact anchored panel, preserves language controls, and remains keyboard accessible.

### Status

Statuses use text plus shape, never color alone. Future capabilities use direct labels such as «Скоро» or «В разработке».

## Do's and Don'ts

### Do:

- **Do** demonstrate legal tasks through facts, risks, documents, and next steps.
- **Do** keep RU and UZ layouts equally intentional.
- **Do** reserve motion for explanation, feedback, and spatial continuity.
- **Do** label illustrative interface content and future functionality honestly.

### Don't:

- **Don't** fabricate testimonials, metrics, partners, certifications, or legal guarantees.
- **Don't** use generic AI gradients, neon, floating decoration, or stock legal imagery.
- **Don't** wrap every idea in a card.
- **Don't** let Jurobek compete with the main action.
