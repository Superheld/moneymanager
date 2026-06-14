---
name: moneymanager-design
description: Use this skill to generate well-branded interfaces and assets for Moneymanager, the local household-finance app that treats a private household like a balance sheet + financial plan. Contains design guidelines, color/type/spacing tokens, fonts, the verbindliches Glossar (UI wording), reusable components, and a UI kit for prototyping.
user-invocable: true
---

Read `readme.md` in this skill first — it holds the brand context, the **Glossar**
(Fachbegriff → UI-Wording, which is binding), CONTENT FUNDAMENTALS, VISUAL FOUNDATIONS and
ICONOGRAPHY. Then explore:

- `styles.css` + `tokens/` — link `styles.css` to inherit all CSS custom properties.
- `components/core/` — `Pill`, `Card`, `KPIStat`, `CoverageTrack`, `NavItem` (React, props in `.d.ts`).
- `ui_kits/uebersicht/` — the full Übersicht screen to copy from.
- `guidelines/*.card.html` — foundation specimens.

When creating visual artifacts (mocks, throwaway prototypes, screens), copy assets out and
build static HTML that links `styles.css`. For production code, follow the tokens and the
Glossar wording exactly.

Non-negotiables for this brand:
- German, **„du"**, sachlich-freundlich, **keine Emoji**.
- Translate domain terms via the Glossar (Rücklage→Spartopf, Umschichtung→Sparen/Anlegen, …).
- **Plan = gestrichelt Teal, Ist = solide Ink.** One teal accent, warm-neutral base, **no gradients on surfaces**.
- Flat cards (hairline border, no shadow) by default; one big focus number per screen; tabular numerals for amounts; `−` (U+2212) for minus.

If invoked without guidance, ask what to build, ask a few focused questions, then act as an
expert designer producing HTML artifacts or production code.
