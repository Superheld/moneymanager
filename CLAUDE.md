# CLAUDE.md — Moneymanager

Lokale Haushalts-Finanz-App (Tauri 2 + React + TS, hexagonaler portabler TS-Kern, SQLite lokal).

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
  append-only** — bestehende Versionen nie editieren, neue Version anhängen.
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

## Sprache
Deutsch, Anrede „du", keine Emoji. Fachlich streng innen, alltagstauglich außen (Glossar).
