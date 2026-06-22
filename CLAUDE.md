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
Die Shell-cwd driftet zwischen Calls — Pfade absolut halten oder mit `cd app &&` beginnen.
`tsc --noEmit | tail` verschluckt den Exit-Code; lieber `tsc --noEmit; echo $?`.

## Dev-Fallen
- **WebView-Cache (Tauri dev):** Erscheinen Frontend-Änderungen NICHT im Fenster trotz
  korrektem Code? Erst prüfen, ob Vite ausliefert (`curl -s localhost:1420/src/.../X.tsx`),
  dann Live-Banner-Test. Cache hängt (überlebt App-Neustart): App schließen,
  `~/Library/WebKit/moneymanager` + `~/Library/Caches/moneymanager` löschen, neu starten.
  DB bleibt unberührt. Nicht stundenlang den Code verdächtigen — erst das prüfen.
- **Echte DB für Diagnose:** `~/Library/Application Support/de.netmechanics.moneymanager/moneymanager.db`
  read-only via `sqlite3` inspizieren, statt Datenbugs zu raten.
- **Daten-Lade-Race:** Verwandte Repos in EINEM Effekt per `Promise.all` laden und zusammen
  setzen; gestaffelte `setState` lassen abgeleitete Werte kurz gegen leere Listen rechnen
  (z. B. Kategorie-Lookup → fälschlich „ohne Kategorie").

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
- **`IstBuchung` trägt KEINEN Empfänger/Verwendungszweck** — die stehen am `Umsatz`
  (Import-Kontext); Join über `Umsatz.istbuchungId` für Detail-/Reporting-Ansichten.
- **Tauri = nur Hülle:** Domänen-/Backend-Logik läuft als TS in der Webview, nicht in Rust
  (`src-tauri/` ist bewusst dünn). Logische Trennung (hexagonal), kein eigener Backend-Prozess.

## Sprache
Deutsch, Anrede „du", keine Emoji. Fachlich streng innen, alltagstauglich außen (Glossar).
