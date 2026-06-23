---
name: super-store docs
description: A reactive store, quietly backed by a CRDT — docs site visual system.
colors:
  signal-violet: "#6d28d9"
  signal-violet-hover: "#7c3aed"
  signal-violet-dark: "#a78bfa"
  gradient-from: "#7c3aed"
  gradient-to: "#2563eb"
  ink: "#3c3c43"
  ink-muted: "#67676c"
  surface: "#ffffff"
  surface-alt: "#f6f6f7"
  border: "#c2c2c4"
  divider: "#e2e2e3"
  ink-dark: "#dfdfd6"
  ink-muted-dark: "#98989f"
  surface-dark: "#1b1b1f"
  surface-alt-dark: "#161618"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 8vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  code:
    fontFamily: "ui-monospace, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.875em"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  pill: "20px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "48px"
components:
  button-brand:
    backgroundColor: "{colors.signal-violet}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "40px"
  button-brand-hover:
    backgroundColor: "{colors.signal-violet-hover}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
  button-alt:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "40px"
  feature-card:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  code-block:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
---

# Design System: super-store docs

## 1. Overview

**Creative North Star: "The Quiet Instrument"**

The super-store docs read like a precise tool that hides its effort. The library's whole pitch is that
a `StoreValue` looks like plain in-memory state until you bind a document — and the design honors that
exact restraint. The surface is calm, near-monochrome, and code-forward; the one violet accent does the
signalling and nothing else carries decoration. Power is felt in the legibility of a snippet and the
exactness of a guarantee, never announced with gradients, glows, or motion spectacle.

This is a brand surface — it is the public face of an open-source library, and a skeptical engineer
decides in seconds whether to trust it. So the design's job is trust through precision: generous
whitespace, a strict type hierarchy, and code that reads as the hero of every page. The system
deliberately rejects the things that would undercut that trust — it is **not** a stock VitePress site
with a swapped accent, **not** crypto/web3 maximalism (neon, heavy glass, dark-only spectacle), and
**not** a cluttered surface of badges, side-stripes, and competing accents.

It builds on VitePress's default theme as a neutral, well-tested scaffold and earns its identity through
a single committed brand color and a doctrine of restraint, rather than through added ornament.

**Key Characteristics:**
- Code is the hero; chrome recedes.
- One violet accent, used sparingly and deliberately.
- Near-monochrome neutral surface, AA-legible in both light and dark.
- Flat by default; depth appears only as a response to interaction.
- Quiet, exact, engineer-to-engineer voice.

## 2. Colors

A near-monochrome neutral field with one saturated violet that carries every signal.

### Primary
- **Signal Violet** (light `#6d28d9` / dark `#a78bfa`): The single brand voice — links, the brand mark,
  primary CTAs, active nav. On hover it lifts to `#7c3aed`. It clears AA against its background in both
  themes (violet-700 on white, violet-400 on near-black). Nothing decorative is ever this color.
- **Violet→Blue Gradient** (`#7c3aed` → `#2563eb`, 120°): Reserved exclusively for the home hero name
  and its blurred backdrop glow. It is the one expressive flourish in the system and appears nowhere else.

### Neutral
- **Ink** (light `#3c3c43` / dark `#dfdfd6`): Primary body and heading text.
- **Ink Muted** (light `#67676c` / dark `#98989f`): Secondary text, captions, inactive nav. Still holds
  AA for its sizes; never lighten muted text further "for elegance."
- **Surface** (light `#ffffff` / dark `#1b1b1f`): Page background.
- **Surface Alt** (light `#f6f6f7` / dark `#161618`): Feature cards, code blocks, sidebar, soft panels.
- **Border / Divider** (light `#c2c2c4` / `#e2e2e3`, dark `#3c3f44` / `#2e2e32`): Hairlines and section
  separators. Always 1px.

### Named Rules
**The One Voice Rule.** Signal Violet appears on ≤10% of any screen — links, one CTA, the active nav
item. Its rarity is what makes it read as *signal*. The moment a second accent hue appears, the brand is
diluted.

**The Gradient-Is-Sacred Rule.** The violet→blue gradient exists only on the hero name. It is forbidden
on buttons, cards, icons, dividers, or text elsewhere. Gradient text anywhere but the hero is prohibited.

## 3. Typography

**Display / Body Font:** Inter (with `ui-sans-serif, system-ui, sans-serif` fallback)
**Code Font:** ui-monospace (with `Menlo, Monaco, Consolas` fallback)

**Character:** One humanist-grotesque family across the whole UI, differentiated by weight and size
rather than by a second face. Monospace is the system's second voice — and it carries the most important
content, the code. The pairing is sans for prose, mono for proof.

### Hierarchy
- **Display** (700, `clamp(2.5rem, 8vw, 4rem)`, line-height 1.1, tracking -0.02em): Home hero name only.
  Capped well under the 6rem shouting ceiling; tracking stays above the -0.04em floor.
- **Headline** (600, 1.5rem, line-height 1.25, tracking -0.01em): Page `<h1>` and major section heads.
  Use `text-wrap: balance`.
- **Title** (600, 1.125rem, line-height 1.4): Subsection `<h2>`/`<h3>`, feature-card titles.
- **Body** (400, 16px, line-height 1.7): Prose. Hold the measure at 65–75ch; VitePress's content column
  already lands here. Use `text-wrap: pretty` on long paragraphs.
- **Code** (400, 0.875em, mono, line-height 1.7): Inline code and code blocks — the hero content. Never
  shrink below 0.85em; legibility of the snippet outranks density.
- **Label** (500, 0.8125rem): Nav items, badges, button text.

### Named Rules
**The Single-Family Rule.** One sans (Inter) plus one mono. No second display face, no decorative
pairing. Contrast comes from weight and scale, never from a third font.

## 4. Elevation

Flat by default. The system conveys depth through tonal layering — Surface Alt panels on a Surface
field, 1px borders, and generous spacing — not through resting shadows. Shadows are a response to state,
not a decoration at rest. This matches "The Quiet Instrument": a tool's surfaces are calm until touched.

### Shadow Vocabulary
- **Ambient hairline** (`box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)`): Sticky
  nav separation only.
- **Hover lift** (`box-shadow: 0 3px 12px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.07)`): Feature cards
  and dropdowns on hover/open.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow appears only as feedback to hover,
focus, or elevation (an open menu). If a card has a drop shadow while idle, it is too heavy — remove it.

## 5. Components

### Buttons
- **Shape:** Pill (`20px` radius), 40px tall, label-weight text (500).
- **Brand:** Signal Violet background, white text. The single primary action per view ("Get started").
- **Alt:** Surface Alt background, Ink text, no border. Secondary actions ("Why super-store", "GitHub").
- **Hover / Focus:** Brand lifts to `#7c3aed`; alt darkens its surface one step. Focus shows a visible
  Signal Violet ring (`:focus-visible`), never removed. Transitions are color-only, ~0.2s ease-out.

### Cards / Containers
- **Corner Style:** `12px` radius (`lg`).
- **Background:** Surface Alt on the Surface field; no nested cards, ever.
- **Shadow Strategy:** Flat at rest; hover lift only (see Elevation).
- **Border:** None, or a single 1px divider. No colored side-stripe borders.
- **Internal Padding:** 24px (`md`).

### Code Blocks
- **Style:** Surface Alt background, `8px` radius, 16–24px padding, mono at 0.875em, line-height 1.7.
- **Treatment:** The most important component on the site. Syntax highlighting carries meaning; the block
  itself stays quiet so the code reads. Copy button on hover, hairline border in the divider color.

### Navigation
- **Style:** Top nav with Label-weight items in Ink Muted; the active item is Signal Violet.
- **States:** Hover → Ink; active → Signal Violet. Sticky, separated by the ambient hairline only.
- **Mobile:** Collapses to VitePress's hamburger sidebar; full keyboard navigability preserved.

## 6. Do's and Don'ts

### Do:
- **Do** make code the hero — give snippets room, strong syntax legibility, and never let chrome compete.
- **Do** keep Signal Violet to ≤10% of any screen (links, one CTA, active nav). Restraint is the brand.
- **Do** keep surfaces flat at rest; reveal a shadow only on hover/focus/open.
- **Do** hold body text at 65–75ch and ≥4.5:1 contrast in both themes; muted text still clears AA.
- **Do** honor `prefers-reduced-motion: reduce` with a crossfade or instant fallback on every transition.

### Don't:
- **Don't** ship a generic VitePress default — a swapped accent over the stock theme is not an identity.
  If it could be any VitePress site, push the typography, spacing, and code presentation further.
- **Don't** drift into crypto/web3 maximalism: no neon glows, heavy glassmorphism, animated noise, or
  dark-only spectacle. Glass and glow are not part of this palette.
- **Don't** clutter — no badge soup, no competing accents, no side-stripe borders (`border-left` >1px as
  a colored accent is forbidden), no decorative noise drowning the content.
- **Don't** use gradient text anywhere but the home hero name. The violet→blue gradient is sacred to it.
- **Don't** introduce a second accent hue or a third font. One violet, one sans, one mono.
- **Don't** nest cards or add a resting drop shadow to a card — both read as 2014-era app chrome.
