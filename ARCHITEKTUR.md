# Architektur — Repo-Layout & Schichten-Mapping

> Zweck: Beim Einstieg (auch für eine neue Coding-Session) **sofort verstehen**, wo was
> liegt — ohne Raten. Bezüge: `Moneymanager/30-entscheidungen/ADR-0001-plattform.md`,
> `Moneymanager/50-lieferung/BAUPLAN-MVP.md`.

## Repo-Verzeichnisse

```
moneymanager/
  Moneymanager/     ← DDD-Dokumentation (Strategie → Lieferung). Quelle der Fachwahrheit.
  design-system/    ← Design-System (Tokens, Komponenten, Glossar, SKILL.md). Quelle der UI-Wahrheit.
  app/              ← die eigentliche Anwendung (Tauri + React + TS, hexagonal).
  ARCHITEKTUR.md    ← dieses Dokument.
```

## Stack-Entscheidung (konkretisiert ADR-0001)

ADR-0001 legt Tauri 2 + React/TS + hexagonaler, portabler TS-Domänenkern fest. Offen war
„Kern in TS **oder** Rust". **Entschieden: TS-Kern (Variante A).** Begründung: datenlastige,
sich wandelnde Domäne → native Typteilung mit der React-UI wiegt schwerer als ein Rust-
„Backend"; weniger Reibung pro Feature. Rust bleibt die **dünne Hülle** (Fenster, Plugins).
Die Verpackung ist identisch — alles kompiliert in **ein** Binary, keine Zusatzinstallation
beim Nutzer. Ein späterer Wechsel zu Rust-Kern bliebe ein bewusster ADR-Schritt.

## Hexagonales Mapping (im `app/`)

Der BAUPLAN nennt die Schichten `core / app / adapters / shell`. So liegen sie konkret:

| BAUPLAN-Schicht | Verzeichnis | Inhalt | Abhängigkeiten |
|---|---|---|---|
| **core** | `app/src/core/` | reine Domäne: Value Objects, Aggregate, Domain Services (Projektion). Pure TS. | **keine** (kein React, kein IO, keine Uhr) |
| **app** (Anwendung) | `app/src/application/` | Use-Cases/Commands + **Ports** (Interfaces). Orchestriert, ohne Geschäftslogik. | nur `core` |
| **adapters** | `app/src/adapters/` | `persistence/` (SQLite über `tauri-plugin-sql`), `ui/` (React + Design-System) | `core`, `application` |
| **shell** | `app/src-tauri/` | Tauri/Rust: Fenster, Plugin-Registrierung. Bewusst dünn. | — |

> Namensklarheit: die Anwendungsschicht heißt `application/` (nicht `app/`), weil das
> Wurzelverzeichnis bereits `app/` ist. „shell" = `src-tauri/`.

### Abhängigkeitsrichtung (Dependency Rule)

```
adapters ─▶ application ─▶ core
src-tauri (shell) ─▶ (lädt die Web-App, kennt die TS-Schichten nicht direkt)
```

`core` importiert nichts nach außen → trivial unit-testbar (`*.test.ts` neben dem Code,
Vitest). Persistenz/UI sind austauschbar, weil sie nur **Ports** aus `application/` erfüllen.

## Design-System-Anbindung

`design-system/` ist die Quelle der Wahrheit (aus claude.ai/design exportiert). Die App
**vendored nur die benötigten Komponenten** verbatim nach `app/src/adapters/ui/ds/` und die
Tokens nach `app/src/styles/` — siehe `app/src/adapters/ui/ds/README.md` für die Sync-Regel.
Wording immer aus dem Glossar (`design-system/readme.md`): Spartopf, Puffer, Verfügbares Geld …

## Befehle (im `app/`)

| Zweck | Befehl |
|---|---|
| Dev (Desktop-Fenster) | `npm run tauri dev` |
| Frontend-Dev (nur Browser) | `npm run dev` |
| Unit-Tests (Core) | `npm test` |
| Typecheck | `npm run typecheck` |
| Produktion bauen | `npm run tauri build` |

## Bekannte Build-Stolpersteine

- **brotli / rustc 1.94:** Tauri zieht `brotli 8.0.3`, das via `alloc-stdlib 0.2.3`
  `alloc-no-stdlib 3.0.0` einbindet, selbst aber `alloc-no-stdlib 2.0.4` nutzt →
  Trait-Konflikt (`StandardAlloc` implementiert `Allocator` nicht). Fix in `Cargo.lock`
  gepinnt: `alloc-stdlib = 0.2.2` (nutzt `alloc-no-stdlib 2.x`). Lockfile committen, nicht
  blind `cargo update` laufen lassen.

## Persistenz

SQLite im App-Datenverzeichnis (`sqlite:moneymanager.db`) hinter dem Repository-Port
(`application/ports.ts`), umgesetzt in `adapters/persistence/`. Schema in P0 via
`CREATE TABLE IF NOT EXISTS`; echte Migrationen ab Phase 1 (BAUPLAN).
