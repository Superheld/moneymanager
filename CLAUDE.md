# CLAUDE.md — Moneymanager

Lokale Haushalts-Finanz-App (Tauri 2 + React + TS, hexagonaler portabler TS-Kern, SQLite lokal).

## Wo die Wahrheit liegt — vor dem Ändern lesen
- **Architektur & Schichten:** `ARCHITEKTUR.md` (Dependency Rule, Repo-Layout, Stolpersteine).
- **Fachwahrheit (DDD-Doku, ADRs):** `Moneymanager/` — Entscheidungen in `30-entscheidungen/`.
- **UI-Wording & Komponenten:** `design-system/` — Begriffe immer aus dem Glossar
  (Rücklage → *Spartopf*, Rückstellung → *Puffer*, Liquidität → *Verfügbares Geld*).

## Befehle — immer aus `app/`
```bash
cd app
npm run tauri dev   # Desktop-Fenster
npm run dev         # nur Frontend (Webview ohne SQLite-Plugin)
npm test            # Vitest (Core + Use-Cases + Migrationskette via sql.js)
npm run typecheck
```
⚠️ **Tooling NUR aus `app/`** ausführen (dort liegt `node_modules`). `npx`/`tsc`/`vitest`
aus dem Repo-Root ziehen falsche globale Versionen. Im Zweifel `app/node_modules/.bin/<tool>`.

## Schichten (Details in ARCHITEKTUR.md)
`core` (reine Domäne, kein IO) ← `application` (Use-Cases + Ports) ← `adapters`
(`persistence/` SQLite via tauri-plugin-sql, `ui/` React). `core` importiert nichts nach
außen. Tests als `*.test.ts` neben dem Code.

## Invarianten, die beißen
- **Geld = Integer Cent**, nie Float. Formatierung über `formatBetrag` (U+2212-Minus).
- **Charakter = `Aufwand | Ertrag | Umschichtung`** (erfolgs- vs. liquiditätswirksam;
  Umschichtung = Aktivtausch, keine Ausgabe).
- **Migrationen** in `adapters/persistence/migrations.ts`: versioniert, **forward-only,
  append-only** — bestehende Versionen nie editieren, neue Version anhängen.

## Sprache
Deutsch, Anrede „du", keine Emoji. Fachlich streng innen, alltagstauglich außen (Glossar).
