# JURO design system

## Product character

JURO is a calm, evidence-led LegalTech product. Navy communicates institutional
trust, warm paper surfaces keep long legal work readable, and gold is a restrained
navigation/accent signal. Red is reserved for destructive or legally material
risk; green is reserved for a verified or completed state. Decorative styling
must never make a demo or unverified source appear operational.

## Foundations

The canonical tokens live in each application's global stylesheet and shared
theme runtime. Product components should consume semantic variables rather than
introduce page-specific brand values.

| Foundation | Semantic use |
| --- | --- |
| `--surface-canvas`, `--surface-raised`, `--surface-subtle` | Page, card, and secondary surfaces |
| `--text-primary`, `--text-secondary` | Reading hierarchy; never encode status by color alone |
| `--border-subtle` | Dividers and non-interactive boundaries |
| `--interactive-primary` | Primary controls and current navigation |
| `--brand-gold-text` | Accessible gold foreground/accent use |
| `--font-ui`, `--font-display` | Interface text and editorial display text |
| `--motion-*`, `--ease-*` | Short, interruptible state transitions |

Theme selection is shared across `juro.uz` and `app.juro.uz` through the
`juro_theme` cookie. The shared cookie is authoritative over stale per-domain
local storage. Both directions require conflict tests.

## Layout and typography

- Use `minmax(0, 1fr)` for flexible grid tracks and cap reading lines near
  60–75 characters.
- Product workspaces use a persistent desktop navigation rail and one compact
  mobile navigation path; avoid duplicate controls.
- Primary controls are at least 44 by 44 CSS pixels; dense legal metadata may be
  visually compact only when it remains readable at 200% zoom.
- Body copy targets at least 14 px in dense product contexts and 16 px for long
  legal reading. Text at 11 px or below is limited to non-essential labels and
  remains an audit candidate, not a default style.
- Use fluid `clamp()` type for editorial headings, not for controls or data tables.

## Components and states

Every interactive component defines default, hover (fine pointer only), focus,
active, disabled, loading, error, empty, and success states where applicable.
Focus remains visible independent of hover. Buttons describe actions; links
navigate. A disabled action explains the missing prerequisite.

Source cards distinguish official Lex.uz evidence, non-official private material,
unavailable evidence, and stale evidence in text as well as color. AI loading
must expose progress without implying the answer is already verified.

## Motion

Motion explains hierarchy or state. Prefer opacity/transform, 120–220 ms for
ordinary transitions, and interruptible interactions. `prefers-reduced-motion`
removes non-essential transforms, progress animation, and long transitions while
keeping all content and actions available. Touch input never depends on hover.

## Governance

New page-specific colors, shadows, radii, font sizes below 12 px, touch targets
below 44 px, or custom modal/menu primitives require review. Consolidation is
incremental: the current CSS is broad and mature, so mechanical rewrites without
visual regression evidence are prohibited.
