# CLAUDE.md — Moneymanager

Lokale Haushalts-Finanz-App (Tauri 2 + React + TS, hexagonaler portabler TS-Kern, SQLite lokal).

Diese Datei hält **Systemdesign**: was wir bauen, wo es liegt, nach welchen Regeln.
Harte Regeln, die sich praktisch nie ändern — erweitert wird sie, wenn ein neues Konzept
dazukommt. Was einmal passiert ist (Vorfälle, Datenstände, Migrationen im Einzelnen),
gehört nicht hierher, sondern in die Doku außerhalb des Repos.

## Stadium: Alpha
Die App ist **nicht veröffentlicht**. Es gibt genau einen Datenbestand — den lokalen —,
und der lässt sich per Import wiederherstellen. Sichtbar gemacht wird das über
`APP_STADIUM` in `src/version.ts`; im Versionsstring steht es bewusst nicht, weil der in
die Tauri-Bundle-Metadaten durchschlägt.

Daraus folgt genau eine Freiheit: **Migrationen dürfen auch wegnehmen.** Tabellen und
Spalten, die kein Code mehr kennt, werden abgeräumt statt als Altlast mitgeschleppt. Vor
dem Abräumen wird geprüft, dass die Ziele leer sind; ist Inhalt drin, gehört er benannt
und gesichert, nicht stillschweigend gelöscht. Alle übrigen Migrationsregeln gelten
unverändert (siehe *Invarianten*). Mit dem ersten veröffentlichten Stand endet die Freiheit.

## Wo die Wahrheit liegt
Fachliche Doku (DDD-Modell, ADRs, Design-System, Glossar) wird **außerhalb dieses Repos**
geführt. Im Repo steht der lauffähige Code. Die UI-Begriffe folgen dem Glossar, nicht der
Sprache des Modells — fachlich streng innen, alltagstauglich außen.

## Branches
Jede Änderung — Feature, Bug, Doku — bekommt einen eigenen Branch und wird von dort
per `--no-ff` nach **`develop`** gemerged. `develop` ist der Sammelpunkt: dort parkt
alles, bis wir bewusst nach `main` durchreichen und pushen. Auf `main` wird nicht
direkt gearbeitet; `main` bleibt der Stand, der veröffentlicht ist.
Vor jedem Merge nach `develop`: `npm run typecheck` und `npm test` grün.

## Umgebung & Befehle
```bash
npm run tauri dev   # Desktop-Fenster
npm run dev         # nur Frontend (Webview ohne SQLite-Plugin)
npm test            # Vitest (Kern, Use-Cases, Repositories, UI — alles via sql.js/jsdom)
npm run coverage    # dito + Coverage über das GESAMTE Projekt (Ziel: 90 % global)
npm run typecheck
```
- **Node kommt über mise** (`mise.toml`: node 26). In einer nicht-interaktiven Shell ist
  `mise` keine Funktion — dann `eval "$(/opt/homebrew/bin/mise env -s bash)"` voranstellen,
  sonst greift das ältere Node aus dem PATH. Die CI pinnt dieselbe Hauptversion getrennt
  in `.github/workflows/ci.yml`, weil Actions die mise.toml nicht liest.
- Die Shell-cwd driftet zwischen Calls — Pfade absolut halten.
- `tsc --noEmit | tail` verschluckt den Exit-Code; lieber `tsc --noEmit; echo $?`.
- **Echte DB:** `~/Library/Application Support/de.netmechanics.moneymanager/moneymanager.db`
  read-only via `sqlite3` inspizieren, statt Datenbugs zu raten. Neue Migrations-SQL vorher
  auf einer `cp`-Kopie durchspielen und das Ergebnis ansehen — Vorbelegungen greifen sonst
  plausibel daneben, und kein Test merkt es. Bei `sqlite3 -json` über viele Zeilen
  `maxBuffer` hochsetzen, sonst `ENOBUFS`.
- **Erscheinen Frontend-Änderungen nicht im Tauri-Fenster**, obwohl der Code stimmt: erst
  prüfen, ob Vite ausliefert (`curl -s localhost:1420/src/.../X.tsx`), dann Live-Banner-Test.
  Hängt der WebView-Cache (er überlebt den App-Neustart): App schließen,
  `~/Library/WebKit/moneymanager` + `~/Library/Caches/moneymanager` löschen, neu starten.
  Die DB bleibt unberührt. Nicht den Code verdächtigen, bevor das geprüft ist.

## Schichten
`core` (reine Domäne, kein IO) ← `application` (Use-Cases + Ports) ← `adapters`
(`persistence/` SQLite via tauri-plugin-sql, `ui/` React). `core` importiert nichts nach
außen. Tests als `*.test.ts` neben dem Code.

In `ui/`:
- `ds/` ist aus dem Design-System kopiert — dort nichts erfinden, eigene Bausteine nach `ui/`.
- `geldFarbe.ts` ist die EINE Farbregel für Beträge (Plus grün, Minus `--warn-deep`, Null
  neutral); `IconButton.tsx` die Zeilen-Aktionen als Icon, deren Text in `title`/`aria-label`
  wandert statt zu verschwinden.
- **Verwandte Repos in EINEM Effekt per `Promise.all` laden und zusammen setzen.**
  Gestaffelte `setState` lassen abgeleitete Werte kurz gegen leere Listen rechnen — ein
  Kategorie-Lookup meldet dann für einen Render „ohne Kategorie".

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
  Umschichtung = Aktivtausch, keine Ausgabe). Er wird nicht gewählt, sondern folgt
  `kategorie.defaultCharakter`, bei Umbuchungen dem Transfer — es gibt bewusst kein
  Eingabefeld dafür. Tragend ist er trotzdem: `budgetVerbrauch` zählt nur Aufwand, die
  Analyse gruppiert danach, die Vertragserkennung schließt Umschichtungen aus, das
  Konto-Register färbt danach. Kein totes Konzept, auch wenn keine Maske danach fragt.
- **`IstBuchung` trägt KEINEN Empfänger/Verwendungszweck** — die stehen am `Umsatz`
  (Import-Kontext); Join über `Umsatz.istbuchungId` für Detail-/Reporting-Ansichten.
- **Tauri = nur Hülle:** Domänen-/Backend-Logik läuft als TS in der Webview, nicht in Rust
  (`src-tauri/` ist bewusst dünn). Logische Trennung (hexagonal), kein eigener Backend-Prozess.

### Migrationen
`adapters/persistence/migrations.ts`, versioniert, **forward-only und append-only** —
bestehende Versionen nie editieren, immer eine neue anhängen. Auch eine Reparatur an einer
misslungenen Migration ist eine NEUE Version.

- **Keine Transaktionen — jedes Statement muss WIEDERHOLBAR sein.** tauri-plugin-sql führt
  jedes `execute` über `pool.execute()` aus und holt pro Aufruf eine Verbindung aus dem
  Pool. Ein `BEGIN` öffnete die Transaktion also auf einer Verbindung, die danach mit
  offener Transaktion zurückginge, während die folgenden Statements auf anderen laufen und
  einzeln committen. Deshalb klammert `migrate()` nichts, sondern macht jedes Statement für
  sich wiederholbar: `CREATE …` trägt `IF NOT EXISTS`, `DROP …` trägt `IF EXISTS`, und
  `ADD`/`DROP COLUMN` überspringt `migrate()` per `PRAGMA table_info`. Ein Datenumbau
  (UPDATE/DELETE) braucht eine eigene wiederholbare Formulierung — `WHERE spalte IS NULL`
  statt einer Scheintransaktion.
- **Lesen und Abräumen gehören in GETRENNTE Versionen.** Eine Version, die eine Spalte
  liest, und eine, die sie droppt, dürfen nicht dieselbe sein: bricht der Lauf dazwischen
  ab, läuft die lesende Version beim nächsten Start gegen die fehlende Spalte, und die App
  kommt nicht mehr hoch. SQLite prüft Spaltennamen beim Parsen — ein `WHERE … IS NULL`
  rettet daran nichts.
- **Während Schema-Arbeiten die App schließen.** Läuft `tauri dev`, während eine Migration
  entsteht, kann die App deren Version verbuchen, bevor alle Statements drinstehen — der
  Rest läuft dann nie. Nach jeder Migration am echten Bestand nachsehen, ob sie gewirkt hat.

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
- **Über `aria-label` greifen, nicht über die Rolle allein:** `getByRole("checkbox")` bricht,
  sobald irgendwo ein zweites Kästchen dazukommt. Derselbe Text steht oft mehrfach im DOM
  (Liste und Kopfzeile desselben Screens) — dann `findAllByText`.

### Kein E2E — und was stattdessen trägt
`tauri-driver` gibt es für Linux und Windows, **nicht für macOS** (WKWebView bietet keinen
WebDriver). Playwright gegen `npm run dev` bringt nichts: die Webview allein hat kein
SQLite-Plugin und damit keine Daten. Es tragen zwei Ersatzwege: die jsdom-Tests laufen von
der Oberfläche bis ins Schema (echte In-Memory-SQLite), und gegen den **echten** Bestand
lassen sich App-Code-Pfade headless fahren — `cp` der DB nach `/tmp`, dann
`npx vite-node <skript.ts>` mit Import aus `src/`.

## Sprache
Deutsch, Anrede „du", keine Emoji.
`i18n.ts` hält de und en als zwei Blöcke, und Schlüsselnamen wiederholen sich über die
Namensräume vielfach (`titel`, `suche`, `bearbeiten` …) — beim Ändern am NAMENSRAUM ankern,
nie am blossen Schlüsseltext, sonst trifft es den falschen Bereich. `npm test` prüft
de/en-Parität, Platzhalter und dass kein `t("…")` im Code ins Leere zeigt — nicht aber, ob
ein Schlüssel im richtigen Namensraum gelandet ist.
