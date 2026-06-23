# Product

## Register

brand

> Scope: the **super-store docs site** (`docs/`, VitePress). This is the public face of an
> open-source library — its job is to convince and equip developers, so design is part of the
> product. The `examples/synced-canvas` app is a separate product-register surface, not covered here.

## Users

Working software engineers — TypeScript/React developers building real-time, collaborative, offline,
or undo-capable features. They arrive skeptical and evaluative: comparing super-store against raw Yjs,
Zustand/Jotai, or rolling their own. Their context is a code editor in the other window and a problem
they already understand. They want to know, fast: what is the API, is it correct, what does it cost me,
and can I trust it in production. They read code before prose and bounce on marketing fluff.

## Product Purpose

super-store is a reactive `StoreValue<T>` primitive — a plain in-memory store until you bind a Yjs
document, after which the *same handle* is a CRDT: synchronous reads, method-call writes, per-field
merge, opt-in collaboration/persistence/undo, all behind one API with Yjs hidden.

The docs site exists to make a serious engineer believe that claim and reach `pnpm add` quickly. Success
is a reader who understands the two-modes model on the landing page, finds the exact API guarantee they
need without friction, and leaves trusting the library's correctness — not one who was dazzled.

## Brand Personality

Quietly authoritative; precise; engineer-to-engineer. Three words: **understated, rigorous, exact.**
The voice (already set by the README) states strong guarantees plainly and lets the code carry the weight
— "reads stay synchronous, writes stay a method call." No hype, no exclamation, no selling. The emotional
goal is earned trust and the small relief of "oh, this is just state — until it isn't." Confidence shown
through precision and restraint, never through volume.

## Anti-references

- **Generic VitePress default.** The stock theme with a swapped accent color and nothing else. The site
  must have a real, deliberate identity, not framework-out-of-the-box.
- **Crypto/web3 maximalism.** Neon glows, heavy glassmorphism, animated noise, dark-only spectacle, loud
  for loudness' sake. The opposite of "quiet power."
- **Cluttered / over-decorated.** Badge soup, competing accents, side-stripe callouts, decorative noise
  drowning the content. Restraint is the brand.
- **Enterprise SaaS gloss.** Sales gradients, stock illustrations, the hero-metric template, marketing
  copy over substance.

Reference bar (the right direction): **Yjs / tldraw docs** (substance-first, code-forward, no gloss) and
**Zustand / Jotai docs** (minimal, confident, developer-to-developer, light on chrome).

## Design Principles

- **Code is the hero, not the chrome.** The strongest argument is a snippet that reads like plain state.
  Typography, spacing, and syntax legibility serve the code first; decoration never competes with it.
- **Show the guarantee, don't sell it.** State claims plainly and back each with a runnable example or a
  precise sentence. Earn trust through specificity, not adjectives.
- **Quiet power.** The CRDT magic hides behind a familiar API; the design should hide its effort the same
  way. Polish that's felt, not announced.
- **Restraint is identity.** One violet brand, used deliberately and sparingly, beats a palette. What we
  leave out is the brand as much as what we put in.
- **Respect the evaluator's time.** Fast to scan, fast to load, fast to the API. Every section answers a
  real question a skeptical engineer is already asking.

## Accessibility & Inclusion

WCAG AA throughout — body text ≥4.5:1, large text ≥3:1, in both light and dark themes (the existing
`brand.css` already targets AA for its violet tokens; hold that line for any new color). Honor
`prefers-reduced-motion: reduce` on every animation with a crossfade or instant fallback. Don't rely on
color alone to convey meaning; keep full keyboard navigability and visible focus states.
