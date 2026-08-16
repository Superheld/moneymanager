# CLAUDE.md — Moneymanager

Lokale Haushalts-Finanz-App (Tauri 2 + React + TS, hexagonaler portabler TS-Kern, SQLite lokal).

## Stadium: Alpha
Die App ist **nicht veröffentlicht**. Es gibt genau einen Datenbestand — den lokalen —,
und der lässt sich per Import wiederherstellen. Sichtbar gemacht wird das in der
Seitenleiste (`APP_STADIUM` in `src/version.ts`); im Versionsstring steht es bewusst
nicht, weil der in die Tauri-Bundle-Metadaten durchschlägt.

Was daraus folgt: **Migrationen dürfen auch wegnehmen.** Tabellen und Spalten, die kein
Code mehr kennt, werden abgeräumt statt als Altlast mitgeschleppt (so geschehen mit v18:
Szenario-Tabellen, Ersatz-Topf-Spalten). Die Regeln darunter gelten unverändert weiter —
append-only, forward-only, jedes Statement wiederholbar (siehe *Invarianten*). Vor einem
Abräumen wird geprüft, dass die Ziele leer sind; ist Inhalt drin, gehört er benannt und
gesichert, nicht stillschweigend gelöscht. Mit dem ersten veröffentlichten Stand endet
diese Freiheit.

## Wo die Wahrheit liegt
Fachliche Doku (DDD-Modell, ADRs, Design-System) wird **außerhalb dieses Repos** geführt.
Im Repo steht der lauffähige Code; die UI-Begriffe folgen dem Glossar
(Rücklage → *Spartopf*, Rückstellung → *Puffer*, Liquidität → *Verfügbares Geld*).

## Branches
Jede Änderung — Feature, Bug, Doku — bekommt einen eigenen Branch und wird von dort
per `--no-ff` nach **`develop`** gemerged. `develop` ist der Sammelpunkt: dort parkt
alles, bis wir bewusst nach `main` durchreichen und pushen. Auf `main` wird nicht
direkt gearbeitet; `main` bleibt der Stand, der veröffentlicht ist.
Vor jedem Merge nach `develop`: `npm run typecheck` und `npm test` grün.

## Befehle
```bash
npm run tauri dev   # Desktop-Fenster
npm run dev         # nur Frontend (Webview ohne SQLite-Plugin)
npm test            # Vitest (Kern, Use-Cases, Repositories, UI — alles via sql.js/jsdom)
npm run coverage    # dito + Coverage über das GESAMTE Projekt (Ziel: 90 % global)
npm run typecheck
```
Die Shell-cwd driftet zwischen Calls — Pfade absolut halten.
`tsc --noEmit | tail` verschluckt den Exit-Code; lieber `tsc --noEmit; echo $?`.

**Node kommt über mise** (`mise.toml`: node 26). In einer nicht-interaktiven Shell ist
`mise` keine Funktion — dann `eval "$(/opt/homebrew/bin/mise env -s bash)"` voranstellen,
sonst greift das ältere Node aus dem PATH. Die CI pinnt dieselbe Hauptversion getrennt
in `.github/workflows/ci.yml`, weil Actions die mise.toml nicht liest.

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
- **Halbfertige Migration im laufenden `tauri dev`:** Läuft die App, während eine neue
  Migration entsteht, kann sie deren Version verbuchen, bevor alle Statements drinstehen —
  der Rest läuft dann NIE. Real passiert bei v23: die App hatte 23 gesetzt, als die
  Migration erst aus dem `ALTER TABLE` bestand; der Kategorie-Nachtrag kam Minuten später
  dazu und blieb liegen, alle 16 Verträge ohne Kategorie. Deshalb nach jeder Migration
  am echten Bestand nachsehen, ob sie gewirkt hat — und die Reparatur in eine NEUE Version
  legen (v25), niemals in die alte. Sicherer: die App während Schema-Arbeiten schließen.

## Schichten
`core` (reine Domäne, kein IO) ← `application` (Use-Cases + Ports) ← `adapters`
(`persistence/` SQLite via tauri-plugin-sql, `ui/` React). `core` importiert nichts nach
außen. Tests als `*.test.ts` neben dem Code.

## Tests schreiben
- **Kern/Use-Cases:** reine Funktionen, In-Memory-Fakes für Ports. Node-Umgebung, schnell.
- **Repositories und UI:** laufen gegen echte In-Memory-SQLite (sql.js) — `getDb` wird per
  `vi.mock("../persistence/db")` umgebogen, `src/test/harness.tsx` liefert `frischeDb()`,
  `pluginApi()` (übersetzt die tauri-plugin-sql-API mit `$1`-Platzhaltern) und `rendere()`
  (rendert im EinstellungenProvider). Bewusst KEINE Repo-Attrappen: ein falsches
  Spalten-Mapping soll im Test auffallen, nicht erst in der App.
- **UI-Tests** brauchen `/** @vitest-environment jsdom */` als erste Zeile — sonst laufen
  auch die Kern-Tests unnötig in jsdom.
- Nach **Daten** suchen, die der Test selbst angelegt hat, nicht nach Formulierungen —
  sonst wird die Suite beim nächsten Wording-Durchgang reihenweise rot.

## Invarianten, die beißen
- **Geld = Integer Cent**, nie Float. Formatierung über `formatBetrag` (U+2212-Minus).
  Durchgesetzt wird das an der Anwendungsgrenze mit `istCent()` — jeder Use-Case, der
  Beträge annimmt, prüft damit. `parseBetrag` liefert `null` bei unplausibler Eingabe
  (Müll, Exponent, jenseits des sicheren Integer-Bereichs), statt still eine falsche Zahl
  zu erzeugen; es erkennt nachgestelltes Minus, U+2212 und Klammer-Notation.
- **Datumsangaben:** `parseIso` WIRFT bei nicht existierenden Daten („2026-02-31", Tag oder
  Monat `00`). Die Regex-Prüfungen der Use-Cases prüfen nur die FORM — die Existenz prüft
  der Kern. `toIso` polstert das Jahr vierstellig, weil die gesamte Datumsordnung über
  String-Vergleiche läuft.
- **Charakter = `Aufwand | Ertrag | Umschichtung`** (erfolgs- vs. liquiditätswirksam;
  Umschichtung = Aktivtausch, keine Ausgabe).
- **Migrationen** in `adapters/persistence/migrations.ts`: versioniert, **forward-only,
  append-only** — bestehende Versionen nie editieren, neue Version anhängen. Eine neue
  Version darf in der Alpha auch abräumen (`DROP TABLE IF EXISTS`, `DROP COLUMN`), siehe
  *Stadium*; `migrate()` überspringt einen `DROP COLUMN`, dessen Spalte schon fehlt.
  **Keine Transaktionen — jedes Statement muss WIEDERHOLBAR sein.** Geprüft 2026-08-16:
  tauri-plugin-sql führt jedes `execute` über `pool.execute()` aus, und `Executor for
  &Pool` holt pro Aufruf eine Verbindung aus einem Pool der sqlx-Standardgröße 10.
  Ein `BEGIN` öffnet die Transaktion also auf einer Verbindung, die danach mit offener
  Transaktion in den Pool zurückgeht — die Statements laufen auf anderen und committen
  einzeln. `migrate()` klammert deshalb nichts mehr, sondern überspringt bereits
  vorhandene Spalten per `PRAGMA table_info` (`CREATE …` trägt ohnehin `IF NOT EXISTS`).
  Neue Migrationen müssen sich in diese Regel fügen; ein Datenumbau (UPDATE/DELETE)
  braucht eine eigene Lösung, keine Scheintransaktion.
- **`IstBuchung` trägt KEINEN Empfänger/Verwendungszweck** — die stehen am `Umsatz`
  (Import-Kontext); Join über `Umsatz.istbuchungId` für Detail-/Reporting-Ansichten.
- **Tauri = nur Hülle:** Domänen-/Backend-Logik läuft als TS in der Webview, nicht in Rust
  (`src-tauri/` ist bewusst dünn). Logische Trennung (hexagonal), kein eigener Backend-Prozess.

## Datenstand
Die lokale DB wurde am **2026-08-16 zurückgesetzt** (Datei gelöscht, Schema frisch bis
v15 aufgebaut, Standardkategorien über den Bootstrap). Zahlungskonten müssen von Hand neu
angelegt werden, alles andere kommt über den Import.

Damit ist die frühere Schuld am `rohHash` **erledigt**: der Dedup-Schlüssel enthält seit
2026-08-15 die Gegenpartei, und Bestandsdaten mit dem alten Schlüssel gibt es nicht mehr.
Ein Backfill vor der ersten ID-losen Quelle (Bank-CSV, FinTS) ist nicht mehr nötig.
Sicherungen des alten Stands liegen als `moneymanager.db.vor-reset-*` neben der DB.

Der Bestand (5279 Umsätze, 5206 verbucht) stammt aus **einem** Import derselben xlsx.
Die Gläubiger-ID (Migration 16) wurde am 2026-08-16 über die `Buchungs-ID` nachgetragen
statt neu zu importieren — 418 Zeilen, ohne die 4426 kategorisierten Ist-Buchungen zu
verlieren. Sicherung: `moneymanager.db.vor-glaeubiger-backfill-*`.

## Kein E2E — und was stattdessen trägt
`tauri-driver` gibt es für Linux und Windows, **nicht für macOS** (WKWebView bietet
keinen WebDriver). Playwright gegen `npm run dev` bringt nichts: die Webview allein hat
kein SQLite-Plugin und damit keine Daten.
Ersatz, der wirklich trägt: die jsdom-Tests laufen von der Oberfläche bis ins Schema
(echte In-Memory-SQLite), und gegen den **echten** Bestand lassen sich App-Code-Pfade
headless fahren — `cp` der DB nach `/tmp`, dann `npx vite-node <skript.ts>` mit Import
aus `src/`. So wurden Vertrags- und Budgeterkennung kalibriert. Bei `sqlite3 -json` über
viele Zeilen `maxBuffer` hochsetzen, sonst `ENOBUFS`.

## Sprache
Deutsch, Anrede „du", keine Emoji. Fachlich streng innen, alltagstauglich außen (Glossar).
