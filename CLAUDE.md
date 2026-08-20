# CLAUDE.md — Moneymanager

Lokale Haushalts-Finanz-App (Tauri 2 + React + TS, hexagonaler portabler TS-Kern, SQLite lokal).

Diese Datei hält **Systemdesign**: was wir bauen, wo es liegt, nach welchen Regeln — und zu
jeder Regel den Grund, weil eine Regel ohne Grund am nächsten Randfall falsch angewendet
wird. Was einmal passiert ist (Vorfälle, Datenstände, einzelne Migrationen), gehört **nicht**
hierher, sondern in die Doku außerhalb des Repos. Maschinenspezifische Rezepte stehen in
`.claude/CLAUDE.md` (nicht versioniert).

## Orientierung

### Die App in acht Bereichen

Navigation in `adapters/ui/AppShell.tsx`, je Bereich ein `*Screen.tsx` daneben:

| Bereich | Screen | worum es geht |
|---|---|---|
| Übersicht | `UebersichtScreen` | wie stehe ich gerade da — drei Monatskarten, Budgets des Monats |
| Konten | `KontenScreen` | Auszug je Konto: suchen, filtern, bearbeiten, paaren |
| Budgets | `BudgetsScreen` | monatlich (Rest verfällt) oder aufbauend (Rest bleibt), verschachtelbar |
| Analyse | `AnalyseScreen` | alles, was einen ZEITRAUM auswertet |
| Inventar | `InventarScreen` | Wiederbeschaffung ÷ Nutzungsdauer = monatliche Rücklage |
| Verträge | `VertraegeScreen` | Wiederkehrendes mit eigener Erkennungsregel |
| Import | `ImportScreen` | Dateiimport → Inbox → verbuchen |
| Einstellungen | `EinstellungenScreen` | Stammdaten, Bankzugänge, Klassifikator-Karten |

Übersicht beantwortet „wie stehe ich **gerade** da", Analyse „wie war es über einen
**Zeitraum**" — diese Grenze ist beabsichtigt und entscheidet, wo Neues hingehört.

### Die Schichten

```
adapters ──▶ application ──▶ core
src/adapters/     src/application/     src/core/
persistence/ ui/  Use-Cases + Ports    reine Domäne
import/ fints/    orchestriert, keine  kein IO, kein React,
                  Geschäftslogik       keine Uhr
```

| Schicht | Verzeichnis | darf importieren |
|---|---|---|
| **core** | `src/core/` | **nichts** (kein React, kein IO, keine Uhr) |
| **application** | `src/application/` | nur `core` |
| **adapters** | `src/adapters/` | `application`; `persistence/` zusätzlich `core` |
| **shell** | `src-tauri/` | — (lädt die Web-App, kennt die TS-Schichten nicht) |

**Logisch getrennt, nicht physisch.** Die Hexagonal-Architektur trennt Backend und Frontend
im **Code**, nicht im Betrieb: es gibt keinen eigenen Backend-Prozess und keine API. `core`,
`application`, `adapters/persistence` und die React-UI laufen alle im **selben
Webview-Prozess**. „Kern" meint die Code-Mitte, kein separat laufendes Backend. Wer echte
Prozesstrennung will, braucht eine neue Entscheidung, keinen Refactor.

### Das Datenmodell

21 Tabellen, angelegt über `adapters/persistence/migrations.ts`. Welche heute leben, sagt
weder die Migrationskette (append-only, enthält auch Gedroppte) noch eine Übersicht — hier
ist sie:

- **Buchen:** `ist_buchung` · `ist_buchung_aufteilung` (Splits) · `umsatz` (Import-Kontext:
  Empfänger, Verwendungszweck — steht **nicht** an der Buchung) · `zahlungskonto` ·
  `kontostand_anker` · `import_lauf` · `dubletten_freigabe`
- **Ordnen:** `kategorie` · `kategorie_festlegung` · `budget` · `vertrag` ·
  `vertrag_erkennung` · `vertrag_zuordnung` · `zahlungsregel` · `inventargegenstand`
- **Erkennen:** `klassifikator_modell` · `merkmal_ausschluss`
- **Bank:** `bankzugang` · `bankkonto_zuordnung`
- **Sonstiges:** `person` · `einstellung`

Gedroppt und nicht wiederzubeleben: `topf`, `szenario`, `szenario_posten` — aufgegangen in
den Budgets bzw. im Monatsausblick.

### Einstieg

1. Diese Datei — vor allem *Invarianten, die beißen*.
2. `src/application/index.ts` — was die UI überhaupt sehen darf.
3. `src/adapters/dienste.ts` — wo Use-Cases und SQLite zusammenkommen; von dort führt
   jeder Faden weiter.
4. `src/architektur.test.ts` — die Schichtgrenze als ausführbare Regel.

`src/CLAUDE.md` gilt zusätzlich für alles unter `src/` (Testdaten). In
`src/adapters/ui/ds/CLAUDE.md` stehen die Regeln für die kopierten Design-System-Bausteine.

## Stadium: Alpha

Die App ist **nicht veröffentlicht**. Es gibt genau einen Datenbestand — den lokalen —, und
der lässt sich per Import wiederherstellen. Sichtbar über `APP_STADIUM` in `src/version.ts`;
im Versionsstring steht es bewusst nicht, weil der in die Tauri-Bundle-Metadaten durchschlägt.

Daraus folgt genau eine Freiheit: **Migrationen dürfen auch wegnehmen.** Tabellen und
Spalten, die kein Code mehr kennt, werden abgeräumt statt als Altlast mitgeschleppt. Vor dem
Abräumen wird geprüft, dass die Ziele leer sind; ist Inhalt drin, gehört er benannt und
gesichert, nicht stillschweigend gelöscht. Alle übrigen Migrationsregeln gelten unverändert.
Mit dem ersten veröffentlichten Stand endet die Freiheit.

## Wo die Wahrheit liegt

Im Repo steht der lauffähige Code. Die fachliche Doku (DDD-Modell, ADRs, Design-System,
Glossar) wird **außerhalb** geführt und ist in einem Klon nicht vorhanden — Regeln hier
dürfen sich deshalb nicht auf sie stützen, sondern müssen für sich stehen.

## Branches

Jede Änderung — Feature, Bug, Doku — bekommt einen eigenen Branch und wird von dort per
`--no-ff` nach **`develop`** gemerged. `develop` ist der Sammelpunkt: dort parkt alles, bis
wir bewusst nach `main` durchreichen und pushen. Auf `main` wird nicht direkt gearbeitet;
`main` bleibt der Stand, der veröffentlicht ist.
Vor jedem Merge nach `develop`: `npm run typecheck` und `npm test` grün.

## Befehle

```bash
npm run tauri dev   # Desktop-Fenster
npm run dev         # nur Frontend (Webview ohne SQLite-Plugin — hat keine Daten)
npm test            # Vitest: Kern, Use-Cases, Repositories, UI, Schichtgrenzen
npm run coverage    # dito + Coverage über das GESAMTE Projekt (Ziel: 90 %)
npm run typecheck
npm run build       # tsc + vite build; die CI prüft dasselbe in zwei Schritten
```

Node kommt über **mise** (`mise.toml`: node 26); die CI pinnt dieselbe Hauptversion getrennt
in `.github/workflows/ci.yml`, weil Actions die `mise.toml` nicht liest. Wer sie hier hebt,
hebt sie dort mit. Die Kommandozeilen für diese Maschine stehen in `.claude/CLAUDE.md`.

## Die Schichtenregeln

**Die UI importiert weder `core/` noch `adapters/persistence/`.** Alles, was ein Screen
braucht, kommt aus `application/`:

- **Vokabular** reicht `application/index.ts` aus dem Kern durch: Domänentypen
  (`IstBuchung`, `Kategorie`, `Budget` …) und wertfreie Helfer (`geldFormatieren`,
  `KONTOTYPEN`). Ein Typ trifft keine Entscheidung — ihn zu kapseln wäre Zeremonie.
- **Entscheidungen** liegen hinter einem Use-Case: alles, was AUSWÄHLT oder RECHNET (welche
  Buchungen zählen zu einem Budget, was steht im Register, wie sieht der Monat aus) — **auch
  beim reinen Lesen.** Ein Screen bekommt fertige Sichten, keine Rohteile.

**Warum auch das Lesen.** Galt die Regel nur fürs Schreiben, hatten Leseregeln keine Heimat:
„welche Buchung zählt gegen ein Budget" wird dann an mehreren Stellen unabhängig erfunden und
an einer vergessen — und dieselbe Übersicht zeigt für dasselbe Budget zwei verschiedene
Werte. Eine Domänenregel, die die UI umgehen KANN, umgeht sie irgendwann. Die Grenze ist
deshalb nicht Geschmack, sondern die einzige Stelle, an der sich diese Fehlerklasse
abstellen lässt.

Geprüft wird das in `src/architektur.test.ts` (läuft in `npm test`, also in der CI). Seine
Ausnahmeliste `ALTLAST` ist **leer**. Sie bleibt stehen für den Fall, dass es je wieder einen
Ausnahmefall gibt; ein eigener Test schlägt fehl, sobald ein Eintrag darin nichts mehr
verletzt, damit sie nicht mit toten Namen verrottet. **Neuer Code kommt nicht auf die Liste.**

Die Verdrahtung von Use-Cases und SQLite steht in **`adapters/dienste.ts`** — EINE Datei
statt hundert Repository-Importen quer durch die Screens. Sie darf beide Seiten kennen, weil
sie selbst ein Adapter ist; `application/` weiß weiterhin nichts von SQLite. Ein Screen
importiert also aus genau zwei Richtungen: `../../application` (Vokabular und Use-Case-Typen)
und `../dienste` (die gebundenen Aufrufe).

In `ui/`:
- `ds/` ist aus dem Design-System kopiert — dort nichts erfinden, eigene Bausteine nach
  `ui/`. Details in `ds/CLAUDE.md`.
- `geldFarbe.ts` ist die EINE Farbregel für Beträge (Plus grün, Minus `--warn-deep`, Null
  neutral); `IconButton.tsx` die Zeilen-Aktionen als Icon, deren Text in `title`/`aria-label`
  wandert statt zu verschwinden.
- **Verwandte Repos in EINEM Effekt per `Promise.all` laden und zusammen setzen.**
  Gestaffelte `setState` lassen abgeleitete Werte kurz gegen leere Listen rechnen — ein
  Kategorie-Lookup meldet dann für einen Render „ohne Kategorie".

## Invarianten, die beißen

- **Geld = Integer Cent**, nie Float. Formatiert wird über `useGeld()` (UI) bzw.
  `geldFormatieren`/`geldFormatierenMitSymbol` (Kern) — nie mit eigenem `toFixed` und nie an
  der Währungs-/Locale-Schicht vorbei. Minus ist U+2212.
  Die Cent-Invariante wird an der Anwendungsgrenze mit `istCent()` durchgesetzt — jeder
  Use-Case, der Beträge annimmt, prüft damit. `parseBetrag` liefert `null` bei unplausibler
  Eingabe (Müll, Exponent, jenseits des sicheren Integer-Bereichs), statt still eine falsche
  Zahl zu erzeugen; es erkennt nachgestelltes Minus, U+2212 und Klammer-Notation.
- **Datumsangaben:** `parseIso` WIRFT bei nicht existierenden Daten („2026-02-31", Tag oder
  Monat `00`). Die Regex-Prüfungen der Use-Cases prüfen nur die FORM — die Existenz prüft der
  Kern. `toIso` polstert das Jahr vierstellig, weil die gesamte Datumsordnung über
  String-Vergleiche läuft.
- **Charakter = `Aufwand | Ertrag | Umschichtung`** (erfolgs- vs. liquiditätswirksam;
  Umschichtung = Aktivtausch, keine Ausgabe). Er wird nicht gewählt, sondern folgt
  `kategorie.defaultCharakter`, bei Umbuchungen dem Transfer — es gibt bewusst kein
  Eingabefeld dafür. Tragend ist er trotzdem: `budgetVerbrauch` zählt nur Aufwand, die
  Analyse gruppiert danach, die Vertragserkennung schließt Umschichtungen aus, das
  Konto-Register färbt danach. Kein totes Konzept, auch wenn keine Maske danach fragt.
- **Kontostands-Anker sind BEOBACHTUNGEN, keine Rechenergebnisse.** Ein Anker
  (`core/kontostand.ts`, Tabelle `kontostand_anker`) sagt: an DIESEM Stichtag lag DIESER
  Betrag auf dem Konto — von der Bank gemeldet oder von Hand gezählt. Er wird deshalb nie
  ungültig und nie neu berechnet, auch nicht, wenn jemand nachträglich eine Buchung davor
  einfügt; was sich ändert, ist die Differenz, und genau die will man sehen. Anker werden
  **aufgehoben, nicht überschrieben** (ein Stichtag je Herkunft): erst mehrere sagen, in
  welchem ZEITRAUM eine Lücke entstand — `abweichungsfenster` rechnet Anker gegen Anker und
  kommt ohne den Anfangsbestand aus, weil der selbst nur geschätzt ist.
  Der `saldo` am Konto ist der **Anfangsbestand** und überbrückt die Zeit vor dem ersten
  Import. Ihn auf einen Anker auszurichten (`anfangsbestandAbgleichen`) ist ein einmaliger
  Eingriff auf Zuruf — **niemals still beim Anzeigen**: danach ist jede neue Abweichung ein
  echter Fehler, und wer sie weiterhin wegrechnet, macht den Detektor kaputt.
- **`IstBuchung` trägt KEINEN Empfänger/Verwendungszweck** — die stehen am `Umsatz`
  (Import-Kontext); Join über `Umsatz.istbuchungId` für Detail-/Reporting-Ansichten.
- **Tauri = nur Hülle:** Domänen-/Backend-Logik läuft als TS in der Webview, nicht in Rust
  (`src-tauri/` ist bewusst dünn).

### Migrationen

`adapters/persistence/migrations.ts`, versioniert, **forward-only und append-only** —
bestehende Versionen nie editieren, immer eine neue anhängen. Auch eine Reparatur an einer
misslungenen Migration ist eine NEUE Version.

- **Keine Transaktionen — jedes Statement muss WIEDERHOLBAR sein.** tauri-plugin-sql führt
  jedes `execute` über `pool.execute()` aus und holt pro Aufruf eine Verbindung aus dem Pool.
  Ein `BEGIN` öffnete die Transaktion also auf einer Verbindung, die danach mit offener
  Transaktion zurückginge, während die folgenden Statements auf anderen laufen und einzeln
  committen. Deshalb klammert `migrate()` nichts, sondern macht jedes Statement für sich
  wiederholbar: `CREATE …` trägt `IF NOT EXISTS`, `DROP …` trägt `IF EXISTS`, und
  `ADD`/`DROP COLUMN` überspringt `migrate()` per `PRAGMA table_info`. Ein Datenumbau
  (UPDATE/DELETE) braucht eine eigene wiederholbare Formulierung — `WHERE spalte IS NULL`
  statt einer Scheintransaktion.
- **Lesen und Abräumen gehören in GETRENNTE Versionen.** Eine Version, die eine Spalte liest,
  und eine, die sie droppt, dürfen nicht dieselbe sein: bricht der Lauf dazwischen ab, läuft
  die lesende Version beim nächsten Start gegen die fehlende Spalte, und die App kommt nicht
  mehr hoch. SQLite prüft Spaltennamen beim Parsen — ein `WHERE … IS NULL` rettet daran nichts.
- **Während Schema-Arbeiten die App schließen.** Läuft `tauri dev`, kann die App die Version
  einer Migration verbuchen, bevor alle Statements drinstehen — der Rest läuft dann nie.
  Danach am echten Bestand nachsehen, ob sie gewirkt hat.
- **Neue Migrations-SQL vorher auf einer Kopie durchspielen** und das Ergebnis ansehen.
  Vorbelegungen greifen sonst plausibel daneben, und kein Test merkt es. Wie man eine
  belastbare Kopie zieht (nicht mit `cp` — WAL), steht in `.claude/CLAUDE.md`.

## Tests schreiben

- **Kern/Use-Cases:** reine Funktionen, In-Memory-Fakes für Ports. Node-Umgebung, schnell.
- **Repositories und UI:** laufen gegen echte In-Memory-SQLite (sql.js) — `getDb` wird per
  `vi.mock("../persistence/db")` umgebogen, `src/test/harness.tsx` liefert `frischeDb()`,
  `pluginApi()` (übersetzt die tauri-plugin-sql-API mit `$1`-Platzhaltern) und `rendere()`
  (rendert im EinstellungenProvider). Bewusst KEINE Repo-Attrappen: ein falsches
  Spalten-Mapping soll im Test auffallen, nicht erst in der App.
- **UI-Tests** brauchen `/** @vitest-environment jsdom */` als erste Zeile — sonst laufen auch
  die Kern-Tests unnötig in jsdom.
- Nach **Daten** suchen, die der Test selbst angelegt hat, nicht nach Formulierungen — sonst
  wird die Suite beim nächsten Wording-Durchgang reihenweise rot.
- **Über `aria-label` greifen, nicht über die Rolle allein:** `getByRole("checkbox")` bricht,
  sobald irgendwo ein zweites Kästchen dazukommt. Derselbe Text steht oft mehrfach im DOM
  (Liste und Kopfzeile desselben Screens) — dann `findAllByText`.

### Kein E2E — und was stattdessen trägt

`tauri-driver` gibt es für Linux und Windows, **nicht für macOS** (WKWebView bietet keinen
WebDriver). Playwright gegen `npm run dev` bringt nichts: die Webview allein hat kein
SQLite-Plugin und damit keine Daten. Es tragen zwei Ersatzwege: die jsdom-Tests laufen von
der Oberfläche bis ins Schema (echte In-Memory-SQLite), und App-Code-Pfade lassen sich
headless gegen eine Lesekopie der echten Datenbank fahren (Rezept in `.claude/CLAUDE.md`).

## Nichts aus dem echten Bestand ins Repo

Das Repo ist **öffentlich**. Kein Wert aus der echten Datenbank gehört hinein — keine IBAN,
kein Empfänger, kein Betrag, kein Kontostand, keine Buchungszahl. Und zwar nicht nur in
Tests: auch nicht in Kommentaren, in dieser Datei, im Changelog und **nicht in
Commit-Texten**. „Am echten Bestand gemessen" ist die überzeugendste Begründung, und die Zahl
dazu wirkt am überzeugendsten — genau deshalb rutscht sie mit. Die Aussage trägt auch ohne
den Beleg: „ein überschrittener Rahmen" statt des Betrags.

Die ausführlichen Regeln für Testdaten (anonymisieren statt ersetzen, Namen je Testfall,
IBANs mit nicht existierender BLZ) stehen in **`src/CLAUDE.md`**, weil man sie dort liest, wo
man sie braucht. Die Wächter:

- **`src/privatsphaere.test.ts`** kennt die Daten nicht, sondern liest sie zur Laufzeit aus
  der echten Datenbank und prüft den Arbeitsbaum dagegen. Er läuft in `npm test`.
- **Die Commit-TEXTE sieht nur der pre-push-Hook** (`.githooks/pre-push`). Aktiv über
  `git config core.hooksPath .githooks` — einmal je Klon, sonst greift er nicht.
- Beide brechen ab, wenn die Datenbank da ist, sich aber nicht lesen lässt oder kein Merkmal
  liefert. Ein Wächter, der nichts sieht, ist schlimmer als keiner: er beruhigt.
- Beide finden nur den **Originalwert**. Ob ein Ersatz neutral ist, sieht keiner von beiden.
- Ein Rewrite ist **nie vollständig** — Forks und alte Commit-SHAs bleiben bei GitHub
  abrufbar. Es zählt nur, dass es gar nicht erst hineingerät.

## Sprache

Deutsch, Anrede „du", keine Emoji. Fachlich streng innen, alltagstauglich außen: das
Datenmodell nutzt die präzisen Rechnungswesen-Begriffe, die Oberfläche erklärt sie.

`i18n.ts` hält de und en als zwei Blöcke, und Schlüsselnamen wiederholen sich über die
Namensräume vielfach (`titel`, `suche`, `bearbeiten` …) — beim Ändern am NAMENSRAUM ankern,
nie am blossen Schlüsseltext, sonst trifft es den falschen Bereich. `npm test` prüft
de/en-Parität, Platzhalter und dass kein `t("…")` im Code ins Leere zeigt — nicht aber, ob
ein Schlüssel im richtigen Namensraum gelandet ist.

Verbindlich ist der Bestand in `src/i18n/i18n.ts`. Ein älteres Glossar aus dem
Design-System schreibt UI-Wörter vor („Spartopf", „Puffer", „Ansparrate"), die aus der
Töpfe-Zeit stammen und heute nirgends mehr vorkommen — es beschreibt einen überholten Stand
und ist keine Quelle mehr. Was an seine Stelle tritt, ist offen.

## Build-Stolpersteine

- **brotli / rustc:** Tauri zieht `brotli 8.0.3`, das via `alloc-stdlib 0.2.3`
  `alloc-no-stdlib 3.0.0` einbindet, selbst aber `alloc-no-stdlib 2.0.4` nutzt →
  Trait-Konflikt (`StandardAlloc` implementiert `Allocator` nicht). In `Cargo.lock` gepinnt:
  `alloc-stdlib = 0.2.2`. Lockfile committen, nicht blind `cargo update` laufen lassen.
