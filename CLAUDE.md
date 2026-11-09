# CLAUDE.md — Moneymanager

Lokale Haushalts-Finanz-App (Tauri 2 + React + TS, hexagonaler portabler TS-Kern, SQLite lokal).

Diese Datei hält **Systemdesign**: was wir bauen, wo es liegt, nach welchen Regeln — und zu
jeder Regel den Grund, weil eine Regel ohne Grund am nächsten Randfall falsch angewendet
wird. Was einmal passiert ist (Vorfälle, Datenstände, einzelne Migrationen), gehört **nicht**
hierher, sondern in die Doku außerhalb des Repos. Maschinenspezifische Rezepte stehen in
`CLAUDE.local.md` (nicht versioniert).

## Orientierung

### Die App in zehn Bereichen

Die Navigation steht in `adapters/ui/bausteine/AppShell.tsx` (Typ `ScreenId`, zwei
Gruppen: **Überblick** — was gilt und was war; **Verwaltung** — woher die Daten kommen und
wie sie sortiert werden), die Zuordnung zur Komponente in `App.tsx`. Der Überblick ist
nach Wichtigkeit sortiert (seit 2026-11-08); der Kontoauszug steht als **„Buchungen"** in
der Verwaltung — dorthin geht man, um zuzuordnen und abzuhaken, nicht um sich zu
informieren. Seine `ScreenId` heisst weiter `konten`: sie ist ein Schlüssel, kein Name.

Übersicht beantwortet „wie stehe ich **gerade** da", Analyse „wie war es über einen
**Zeitraum**" — diese Grenze ist beabsichtigt und entscheidet, wo Neues hingehört. Das
Depot ist das jüngste Beispiel: sein Stand steht in der Übersicht, sein Verlauf in der
Analyse, aus derselben Wertreihe. Was die Übersicht rechnet und zeigt, steht in
`src/adapters/ui/uebersicht/CLAUDE.md`.

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

### Wie die Schichten innen gegliedert sind

Die Schicht steht oben, der Fachbereich darunter — dieselben Namen über alle drei Schichten,
damit ein Thema an drei Stellen gleich heißt.

Drei Regeln, wohin eine neue Datei gehört:

- **In den Bereichsordner**, wenn genau ein Bereich sie braucht — auch wenn sie „allgemein"
  aussieht.
- **Nach `ui/bausteine/`**, wenn **zwei oder mehr** Bereiche sie benutzen. Das ist gemessen,
  nicht geschätzt: ein Baustein, den nur ein Screen benutzt, ist ein Teil dieses Screens.
- **Nach `core/basis/`**, wenn sie ein Domänen-Primitiv ist, das quer durch alles geht —
  Geld, Datum, Währung, Zahlungsregel, Muster, Fehler, Region. Fachliches gehört auch im
  Kern in seinen Bereich.

Was **keinem** Bereich gehört, bleibt in der Wurzel der Schicht: die Fassaden (`index.ts`,
`ports.ts`), der Start (`bootstrap.ts`) und die bewusst querliegenden Sichten
(`uebersicht.ts`, `analysesichten.ts`, `core/monatsausblick.ts`, `core/auswertung.ts`) —
sie rechnen über mehrere Bereiche hinweg, und das ist ihre Aufgabe, kein Fehler. In `ui/` liegen aus demselben Grund
die bereichsübergreifenden Tests oben (`screens`, `interaktion`, `formulare`).

Zwei Namen weichen ab, beide weil die OBERFLÄCHE der Navigation folgt und nicht der
Fachgliederung:

- Der UI-Ordner heißt `training/`, weil die Navigation den Bereich so nennt (`ScreenId`);
  fachlich ist es dieselbe Sache wie `kategorien/` in Kern und Anwendung.
- **`depot/` gibt es in `ui/` gar nicht.** Ein Depot ist kein Bereich, sondern etwas, das
  in zweien vorkommt: der Stand in der Übersicht (`ui/uebersicht/DepotKarte.tsx`), die
  Entwicklung in der Analyse (`ui/analyse/DepotAnsicht.tsx`). Kern und Anwendung haben
  ihren `depot/`-Ordner trotzdem — dort gliedert die Fachlichkeit, nicht das Menü.

### Das Datenmodell

28 Tabellen, angelegt über `adapters/persistence/migrations.ts`. Welche heute leben, sagt
weder die Migrationskette (append-only, enthält auch Gedroppte) noch eine Übersicht — hier
ist sie. Die ausführbare Gegenprobe steht in `migrations.test.ts`: `ERWARTETE_TABELLEN`
prüft die Menge auf GLEICHHEIT, eine Tabelle zu viel oder zu wenig macht den Test rot:

- **Buchen:** `ist_buchung` · `ist_buchung_aufteilung` (Splits) · `buchung_journal`
  (was mit einer Buchung geschah) · `umsatz_roh` +
  `umsatz_verarbeitung` (die Importzeile, siehe `src/application/import/CLAUDE.md`) · `zahlungskonto` (mit Typ,
  Klasse UND `aktiv`, siehe `src/core/konten/CLAUDE.md`) ·
  `kontostand_anker` · `vormerkung` (was die Bank kennt und noch nicht gebucht hat,
  siehe `src/application/fints/CLAUDE.md`) · `import_lauf` · `dubletten_freigabe`
- **Ordnen:** `kategorie` · `budget` + `budget_betrag` (die
  Reihe seiner Beträge, siehe `src/core/budgets/CLAUDE.md`) · `vertrag` ·
  `vertrag_erkennung` · `zahlungsregel` · `ruecklage` + `ruecklage_ausbuchung` (siehe `src/core/ruecklagen/CLAUDE.md`)
- **Erkennen:** `klassifikator_modell` · `merkmal_ausschluss` · `trainingslauf` (jedes
  Training mit Konfiguration, Kennzahlen und Vorhersagen, siehe
  `src/adapters/ui/training/CLAUDE.md`)
- **Bank:** `bankzugang` (samt Bankfähigkeitsprofil) · `bankkonto_zuordnung`
- **Besitzen:** `depot` · `depotwert` (Reihe der Stichtagswerte) · `depotposition` —
  Beobachtungen, keine Buchungen; siehe unten
- **Sonstiges:** `person` · `einstellung`

Gedroppt und nicht wiederzubeleben: `topf`, `szenario`, `szenario_posten` — aufgegangen in
den Budgets bzw. im Monatsausblick. Ebenso `umsatz`, aufgeteilt in die beiden folgenden,
und `vertrag_zuordnung`, aufgegangen in zwei Spalten der Buchung (siehe `src/core/vertraege/CLAUDE.md`). Dazu
`kategorie_festlegung` (Migration 64): „immer bei diesem Empfänger" war kein Schutz — eine
Handkorrektur ist über `kategorie_herkunft` ohnehin sicher —, sondern eine
VERALLGEMEINERUNG, und die soll das Modell leisten, über alle Merkmale statt über den
Empfänger allein. Die Begründung samt dem, was beim Wiedereinbau zu bedenken wäre, steht
im Kopf von `application/import/vorschlag.ts`. Und seit Migration 74 `kontogruppe` +
`kontogruppe_konto` — aufgegangen in der Kontoklasse (siehe unten).

**Diese Liste stand bis zum 09.09.2026 selbst falsch da** — `kategorie_festlegung` war seit
Migration 64 gedroppt und wurde hier weiter als lebend geführt. Das ist genau die
Verwechslung, gegen die es die Liste gibt, und sie ist die teuerste Art, falsch zu sein:
die Migrationskette ist append-only und deshalb keine Auskunft, also gibt es keine zweite
Stelle, an der es auffiele. **Wer eine Tabelle droppt, streicht sie hier UND nennt sie
unten — und zieht die Zahl in der Zeile darüber mit.** Die stand am 22.09.2026 um drei
daneben: die Regel sprach bis dahin nur von den Namen, und eine falsche Zahl fällt
niemandem auf, solange die Liste darunter stimmt.

Was zu den einzelnen Tabellen gilt, steht beim Fachbereich — die Liste dazu unter *Die
Regeln je Schicht*.

### Einstieg

1. Diese Datei — vor allem *Invarianten, die beißen*.
2. `src/application/index.ts` — was die UI überhaupt sehen darf.
3. `src/adapters/dienste.ts` — wo Use-Cases und SQLite zusammenkommen; von dort führt
   jeder Faden weiter.
4. `src/architektur.test.ts` — die Schichtgrenze als ausführbare Regel.

Jede Schicht trägt ihre eigene `CLAUDE.md` — sie lädt, sobald man dort arbeitet. Die
Übersicht steht unten unter *Die Regeln je Schicht*.

## Was die App nach draussen spricht

Eine lokale Finanz-App, die still mit fremden Servern redet, ist keine lokale Finanz-App.
Es gibt deshalb genau **drei** Wege nach draussen, und zwei davon setzen ein Zutun voraus:

| Weg | wann | abschaltbar |
|---|---|---|
| Bankabruf | nur wenn jemand ihn auslöst | entfällt (er IST die Handlung) |
| Update-Prüfung | beim Start, still | ja (`aktualisierungPruefen`) |
| sonst | — | — |

Die dritte Zeile ist leer, und das wird von `src/absicherung.test.ts` durchgesetzt. Die CSP,
die das absichert, steht in `src-tauri/CLAUDE.md`.

**Ein Befund zum Abruf gehört in `ergebnis.warnungen`, nicht in `hinweise`.** Beide stehen
an `AbrufErgebnis`, aber `abrufAusfuehren` liest nur die erste (sie landet im
`AbrufBefund`); die zweite fällt dort ohne Meldung auf den Boden.

**Bis 2026-08-25 stimmte das nicht.** Die Schrift kam über ein `@import` von einem
Schriften-Dienst — ein Netzzugriff bei jedem Start, bei dem der Betreiber IP und Zeitpunkt
sieht. Die Behauptung im Skill `ausliefern`, die Update-Prüfung sei der erste ungefragte
Netzzugriff, war damit falsch. Sie ist es erst, seit die Schrift im Bündel liegt
(`@fontsource-variable/hanken-grotesk`).

## Stadium: Alpha

Die App ist **nicht veröffentlicht**. Es gibt genau einen Datenbestand — den lokalen —, und
der lässt sich per Import wiederherstellen. Sichtbar über `APP_STADIUM` in `src/version.ts`;
im Versionsstring steht es bewusst nicht, weil der in die Tauri-Bundle-Metadaten durchschlägt.
Läuft eine Beta, zeigt das Abzeichen den Kanal statt des Stadiums (`abzeichenFuer`) — das
Stadium gilt dann trotzdem weiter.

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

**Zwei Hooks setzen das durch** (siehe unten, „Die Hooks"): `pre-commit` weist einen
direkten Commit auf `develop` oder `main` ab, `prepare-commit-msg` lässt nach `main` nur
einen Merge aus `develop` zu. Merges per `--no-ff` laufen normal durch — Git ruft für sie
einen anderen Hook. Im Notfall: `--no-verify`.

**Ausser bei einem Merge mit Konflikten**, und das ist die Stelle, an der man es nicht
erwartet: der lässt sich nicht automatisch abschliessen, jemand tippt danach `git commit` —
und den ruft Git über `pre-commit`. Der Branch-Wächter sieht einen Commit auf `develop` und
weist ab, obwohl `MERGE_HEAD` daneben liegt. Der Weg ist `--no-verify`, nicht ein Umbau des
Merges: der Muster-Guard ist über dieselben vorgemerkten Änderungen bereits gelaufen, und
was er meldet, meldet er vor dieser Sperre.

**Beide Hooks sitzen auf dieser Maschine, und darin liegt ihre Grenze.** Ein Merge, der auf
GitHub passiert, fragt keinen von ihnen — der Wachposten fällt lautlos genau dort aus, wo
niemand ihn vermisst. Deshalb zielt auch **Dependabot auf `develop`** (`target-branch` in
`.github/dependabot.yml`, geprüft von `src/lieferkette.test.ts`): ohne diese Angabe legt es
seine Vorschläge gegen den Standardbranch an, und die liessen sich mit einem Klick nach
`main` zusammenführen. Es war einmal so, und man sieht es einem grünen Vorschlag nicht an.

## Die Hooks

Aktiv wird alles über **`git config core.hooksPath .githooks`** — einmal je Klon, sonst
greift keiner davon. Sie liegen im Repo, damit sie mitkommen und überprüfbar sind.

| Hook | prüft |
|---|---|
| `pre-commit` | Muster-Guard über das Vorgemerkte · kein direkter Commit auf `develop`/`main` |
| `commit-msg` | Muster-Guard über die Nachricht |
| `prepare-commit-msg` | nach `main` nur aus `develop` |
| `pre-push` | Wächter-Tests · Muster-Guard über Diff und Commit-Texte |

Der Branch-Wächter sitzt in `prepare-commit-msg` und **nicht** in `pre-merge-commit`, wo
man ihn zuerst sucht: dort gibt es `MERGE_HEAD` noch nicht, Git legt die Datei erst danach
an. Ein Hook, der dort nach der Merge-Quelle sucht, findet nichts und winkt durch — das ist
gemessen, nicht vermutet.

Jeder Hook lässt sich mit `--no-verify` umgehen. Das ist Absicht: ein Wächter, der keinen
Ausweg lässt, wird abgeschaltet statt umgangen, und dann ist er ganz weg.

## Befehle

```bash
npm run tauri dev   # Desktop-Fenster
npm run dev         # nur Frontend (ohne Tauri-Naht: weisse Seite, siehe `vorschau`)
npm run vorschau    # dasselbe MIT Attrappe und Spielstand, im Netz — fuer den Blick aufs Handy
npm test            # Vitest: Kern, Use-Cases, Repositories, UI, Schichtgrenzen
npm run test:rust   # die wenigen Rust-Tests der Shell (Dateirechte) — laufen NICHT in `npm test`
npm run coverage    # dito + Coverage über das GESAMTE Projekt (Ziel: 90 %)
npm run typecheck
npm run build       # tsc + vite build; die CI prüft dasselbe in zwei Schritten
npm run seed        # Spielstand neu schreiben (siehe src/testwerkzeug/CLAUDE.md)
npm run installieren # macOS: bauen und nach /Applications installieren
npm run test:watch  # Vitest im Wachmodus — derselbe Bestand, laeuft nur nicht einmal durch
npm run bankenliste # die DK-Bankenliste neu erzeugen (Capabilities und Muster-Guard haengen dran)
npm run preview     # NICHT `vorschau`: liefert den fertigen BUILD aus, ohne Attrappe und
                    # ohne Spielstand. Wer die App ansehen will, nimmt `vorschau`.
```

Zwei Dinge, die ein grüner Lauf verschweigt:

- **`cargo test --lib` verdeckt `dead_code`-Warnungen**, die der App-Build zeigt: was nur
  Tests benutzen, gilt dort als benutzt. Vor dem Commit einmal `cargo build --lib`.
- **Und `--lib` uebersieht `src/bin/`.** Dort liegt `bestandslesen`, und es benutzt
  dieselbe Datenbank-Naht wie die App. Beim Sprung auf sqlx 0.9 blieb es deshalb kaputt
  liegen, waehrend Bibliothek, Tests und Frontend gruen meldeten — gefunden erst, als
  jemand das Werkzeug wieder brauchte. Wer an der Naht arbeitet, baut
  **`cargo build --bins --lib`**.
- **`src/doku.test.ts` liest `git ls-files`.** Eine neue Datei, die in einer `CLAUDE.md`
  steht, muss **vor** dem Testlauf `git add`-ed sein — sonst meldet der Wächter einen
  toten Verweis auf etwas, das längst dasteht.

Node kommt über **mise** (`mise.toml`: node 26); die CI pinnt dieselbe Hauptversion getrennt
in `.github/workflows/ci.yml`, weil Actions die `mise.toml` nicht liest. Wer sie hier hebt,
hebt sie dort mit. Die Kommandozeilen für diese Maschine stehen in `CLAUDE.local.md`.

### In einem Worktree dauert der erste Start sonst Minuten

`src-tauri/target/` ist gitignoriert und existiert in einem frischen Worktree deshalb
**nicht** — `npm run tauri dev` baut dort alle Rust-Abhängigkeiten von null, obwohl der
fertige Cache im Hauptcheckout liegt. Wer ihn mitbenutzt, ist in Sekunden statt Minuten
oben:

```bash
CARGO_TARGET_DIR=<hauptcheckout>/src-tauri/target npm run tauri dev
```

Zwei Dinge dazu, die man wissen sollte: Cargo sperrt das Verzeichnis, ein paralleler Build
im Hauptcheckout **wartet** also (er scheitert nicht). Und weil beide Stände dieselben
Artefakte schreiben, kostet der Wechsel zwischen ihnen eine Neuübersetzung der geänderten
Kisten — immer noch ein Bruchteil eines Vollbaus.

**Die `.env` fehlt im Worktree ebenfalls** (gitignoriert). Die App startet ohne sie, der
Bankabruf ist dann gesperrt — dieselbe Falle wie beim Ausliefern, nur früher.

## Auslieferung: GitHub-Release, Update in der App

Ausgeliefert wird über ein GitHub-Release: ein Tag `v*` löst `.github/workflows/release.yml`
aus, die laufende App spielt das Update über ihren Updater ein. Wie das im Einzelnen geht —
Version heben, Changelog, Tag, Beta-Kanal, Signierung, die drei Plattformen —, steht im
Skill `ausliefern` (`.claude/skills/ausliefern/SKILL.md`). Drei Dinge gelten auch ohne ihn:

- **Der private Signaturschlüssel liegt ausserhalb des Repos** (`~/.moneymanager-schluessel/`)
  und ist **unersetzlich**: geht er verloren, kann keine installierte App je wieder ein
  Update annehmen — sie prüft gegen den öffentlichen Schlüssel, der in ihrem Bundle steckt.
- **Der Tag einer Beta liegt auf `develop`**, der einer fertigen Fassung auf `main`: `main`
  bleibt der Stand, den alle haben.
- **Verschlüsselung und Sicherungen des Bestands** stehen in `src-tauri/CLAUDE.md`.

### Zwei Datenbestände, eine Zeile Unterschied

Die installierte App verwaltet echtes Geld; die Entwicklung soll frei rumprobieren können.
Beides auf derselben Datei geht nicht gut aus — im Alpha-Stadium dürfen Migrationen
ausdrücklich **wegnehmen**, und ein Versuch, der schiefgeht, träfe dann den einzigen
Bestand, den es gibt. Die Trennung ist deshalb keine Bequemlichkeit, sondern die Grenze
zwischen „kaputt" und „weg".

| | Datei | wer sie öffnet |
|---|---|---|
| echt | `moneymanager.db` | die installierte App (`tauri build`) |
| Spielstand | `moneymanager-dev.db` | `npm run tauri dev` |

Entschieden wird das an genau einer Stelle:
`src/adapters/persistence/datenbankdatei.ts`. **Der Dateiname trennt, nicht der
Identifier** — der bestimmt zwar das Datenverzeichnis, aber auch die Identität der
installierten App: wer ihn anfasst, schickt sie in ein neues, leeres Verzeichnis, und der
echte Bestand sieht aus wie verschwunden. Beide Dateien liegen deshalb nebeneinander, und
die Rezepte aus `CLAUDE.local.md` finden auch die Spielkopie.

## Abläufe

Der Weg, der am häufigsten vorkommt, und der Punkt, an dem man sonst das Falsche tut.
Ausliefern steht im Skill `ausliefern`, das Neuschreiben des Spielstands in
`src/testwerkzeug/CLAUDE.md`.

### Eine Änderung machen

```
Branch von develop  →  npm run tauri dev  →  npm test && npm run typecheck  →  merge --no-ff
```

1. **Branch von `develop`.** Steht das Paket schon, gleich anlegen; ist das Bild noch
   unklar, erst arbeiten und den Branch nachziehen. Der `pre-commit`-Hook weist einen
   direkten Commit auf `develop` ohnehin ab.
2. **`npm run tauri dev`** — läuft auf dem **Spielstand**, nicht auf dem echten Bestand.
   Kaputtspielen ist hier folgenlos, und genau dafür ist er da.
3. **`npm test` und `npm run typecheck` grün**, bevor gemerged wird. Beides muss ohnehin,
   der Testlauf dauert Sekunden.
4. **`--no-ff` nach `develop`.** Dort parkt alles, bis bewusst nach `main` durchgereicht
   wird.

**Ein laufender Prozess beweist nichts.** Die App kommt auch hoch, wenn die Datenbank
nicht aufgeht — sie zeigt dann leere Screens, und im Log steht nichts. Der billige Beweis
ist die Tagessicherung: die von heute löschen, App starten, und wenn sie neu entsteht, ist
die Datenbank geöffnet und die Migrationen sind gelaufen. Dasselbe gilt für `pgrep` — dass
ein Prozess da ist, sagt über den Zustand dahinter nichts.

**Echte Daten kommen in der Entwicklung nicht vor, auch nicht als Probe** (seit
2026-09-30). Persönliche Daten sind schon einmal im öffentlichen Netz gelandet, und das zu
verhindern ist aufwendig: jeder Ablauf, der den echten Bestand in die Entwicklung holt, ist
ein weiterer Weg ins Repo. Eine einzelne Ausnahme (etwa `bestandslesen` für einen
konkreten Datenbug) gibt es nur benannt und im Einzelfall, **nie als Regel oder Rezept**.
Hier stand bis dahin das Gegenteil — wer am Schema arbeitet, prüfe gegen eine Lesekopie
des echten Bestands —, und seit der Verschlüsselung war es ohnehin nicht mehr ausführbar.

**Was das kostet, gehört dazugesagt:** Eine Migration kann an einem Widerspruch scheitern,
den nur der echte Bestand hat (verwaiste Verweise, über Monate angesammelt). Der
Spielstand ist frisch erzeugt und widerspruchsfrei, und ein grüner Testlauf gegen sql.js
hat so etwas schon einmal verschwiegen, weil dort die Fremdschlüssel aus sind. Vorbeugen
geht damit nicht mehr, zurück schon: die **Tagessicherung vor den Migrationen** ist das
Netz, `fremdschluesselPruefen` nach der Kette meldet den Widerspruch laut, und Migrationen
werden so geschrieben, dass sie ihn selbst aufräumen.

## Mitgelieferte Skills

`.claude/skills/` — Wissen, das zum Projekt gehört, aber in keine Quelldatei passt. Es
lädt automatisch, sobald das Thema aufkommt.

| Skill | worum es geht |
|---|---|
| `lib-fints` | die Bibliothek hinter dem Bankabruf: Ablauf, Datenformen, Bankparameter und die Fallen, die sonst Stunden kosten |
| `ausliefern` | Version, Changelog, Tag, Release-Workflow, Beta-Kanal, Updater, Signierung, Plattformen |
| `exporte` | die beiden Exporte, ihre Zusicherungen, der Konfigurationsimport |
| `abhaengigkeiten` | die Lieferkette: Advisories, Install-Skripte, Dependabot, Pins |

Der `lib-fints`-Skill lag bis 2026-08-21 nur im Benutzerverzeichnis und stand damit
niemandem sonst zur Verfügung. Er beschreibt beide Stände — den npm-Release und den Fork,
auf den `package.json` zeigt —, weil zwei der dort beschriebenen Fallen nur im ersten
gelten. Beim Verschieben ins öffentliche Repo wurden seine Beispielwerte anonymisiert;
sie stammten aus einem echten Mitschnitt, und **kein Wächter hätte das gefunden** — eine
Kontonummer aus dem Protokoll steht in dieser Form in keiner Tabelle.

## Die Regeln je Schicht

Sie stehen dort, wo man sie beim Schreiben liest — diese Datei zeigt nur, was es gibt:

| Datei | worum es geht |
|---|---|
| `src/CLAUDE.md` | gilt für allen Code: deutsche Bezeichner, kein Linter, Testdaten |
| `src/core/CLAUDE.md` | Geld als Integer Cent, Datum, Charakter, Kontostands-Anker |
| `src/application/CLAUDE.md` | Use-Cases orchestrieren, `istCent()` an der Grenze, Ports |
| `src/adapters/persistence/CLAUDE.md` | Migrationen (forward-only, ohne Transaktionen) |
| `src/adapters/ui/CLAUDE.md` | `useGeld`, `Promise.all`, i18n, Screen-Tests, Base UI, die einklappbare Seitenleiste |
| `src/adapters/ui/bausteine/CLAUDE.md` | was geteilt wird und was nicht |
| `src/core/buchung/CLAUDE.md` | Vorzeichen und Charakter, Umbuchungen erkennen |
| `src/core/konten/CLAUDE.md` | Kontobelegung, Stilllegen und Löschen, Liquiditätsvorschau |
| `src/core/budgets/CLAUDE.md` | `budgetrelevant`, die Reihe der Budgetbeträge |
| `src/core/ruecklagen/CLAUDE.md` | die zwei Formen einer Rücklage, der Rücklagenfluss |
| `src/core/vertraege/CLAUDE.md` | Zuordnung und Herkunft, Merkmale und Fälligkeitsfenster, Umbuchungsverträge |
| `src/application/import/CLAUDE.md` | Beleg und Verarbeitung, mehrere Belege je Zahlung |
| `src/application/fints/CLAUDE.md` | Vormerkungen |
| `src/application/buchung/CLAUDE.md` | wie weit die App den GoBD folgt, das Journal |
| `src/adapters/ui/uebersicht/CLAUDE.md` | was die Übersicht rechnet und zeigt |
| `src/adapters/ui/training/CLAUDE.md` | das Training als Werkbank |
| `src-tauri/CLAUDE.md` | CSP, Verschlüsselung, Sicherungen |
| `scripts/CLAUDE.md` | der Muster-Guard und was er nicht kann |
| `src/testwerkzeug/CLAUDE.md` | wann der Spielstand neu geschrieben wird |

Vier Dinge gelten überall und stehen deshalb hier:

- **Geld ist Integer Cent, nie Float** — formatiert über `useGeld()` (UI) bzw.
  `geldFormatieren` (Kern), nie mit eigenem `toFixed`. Minus ist U+2212.
- **Die UI kennt nur `application/`** — weder `core/` noch die Persistenz. Was AUSWÄHLT oder
  RECHNET, liegt hinter einem Use-Case, auch beim reinen Lesen.
- **Der Datenbankzugang läuft über eigene Kommandos**, nicht über `tauri-plugin-sql`
  (abgelöst 2026-08-26). Der Grund ist `PRAGMA key`: es gilt pro Verbindung, und über den
  Pool des Plugins erwischte es eine beliebige — gemessen in `src-tauri/src/krypto.rs`.
  Der eigene Pool (`src-tauri/src/datenbank.rs`) setzt den Schlüssel in den
  Verbindungsoptionen, damit bekommt ihn jede Verbindung, die je entsteht. **Nach oben
  ist die Naht dieselbe geblieben** (`select`, `execute`); kein Repository musste dafür
  angefasst werden. Nebengewinn: `sql:allow-execute` ist aus den Capabilities gefallen.
- **Migrationen sind forward-only und append-only** und klammern nichts in Transaktionen;
  jedes Statement muss für sich wiederholbar sein.
- **Kein Wert aus dem echten Bestand ins Repo** (unten ausführlich).
- **Ein abgerufenes Depot ist kein Konto.** Ein `zahlungskonto` hat einen Anfangsbestand
  und Buchungen, aus denen sich sein Stand ergibt; ändert sich der Stand, ist etwas
  geflossen. Ein von der Bank gemeldetes Depot hat nur Beobachtungen zu Stichtagen — sein
  Wert ändert sich täglich, ohne dass etwas passiert wäre. Es liegt deshalb in eigenen
  Tabellen (`depot`, `depotwert`, `depotposition`), hat keinen Saldo und taucht in keiner
  Kontenliste auf.

- **Typ und Klasse eines Kontos beantworten verschiedene Fragen.** Der `Kontotyp` sagt, WAS
  ein Konto ist (Giro, Tagesgeld, Depot) — ein Etikett ohne Wirkung auf die Rechnung. Die
  `Kontoklasse` sagt, WOFÜR es da ist (`liquide`, `ruecklage`, `vorsorge`), und daran hängt
  genau eine Rechnung: nur `liquide` zählt zu den liquiden Mitteln. Beides deckt sich nicht,
  und deshalb sind es zwei Felder — dasselbe Tagesgeldkonto kann Alltagsreserve oder
  zweckgebundene Rücklage sein, ohne dass sich sein Typ ändert.

  Wer die Klassen erweitert (`KONTOKLASSEN` in `core/konten/konto.ts`), muss für jeden neuen
  Wert entscheiden, ob er verfügbar ist — und ob er als Rücklage zählt (unten).

  **`aktiv` ist die dritte Frage und wieder eine andere:** ob das Konto noch GEFÜHRT wird.
  Typ und Klasse beschreiben, was es ist und wofür — `aktiv` nur, ob man damit noch etwas
  tun kann. Es entscheidet deshalb keine einzige Summe über die Vergangenheit; siehe
  „Ein Konto stilllegen" in `src/core/konten/CLAUDE.md`.

- **Die Klasse ist das EINE Feld für „wofür ist dieses Konto da".** Bis 2026-09-22 stand
  daneben eine frei benannte `Kontogruppe` — eine Sicht, die nichts entschied, während die
  Klasse über die liquiden Mittel entscheidet. Zwei Felder auf dieselbe Frage, und nur
  eines galt: gepflegt wurden beide, und beim ersten Widerspruch hätte niemand sagen
  können, welches gemeint war. Die Gruppen sind deshalb weg (Migration 74), die Klasse
  trägt dafür fünf Werte statt drei — `liquide`, `ruecklage`, `vorsorge`, `sparen`,
  `investment`, benannt in `i18n.ts` unter `einstellungen.konto.klasse`.

  **Was dabei nicht mehr geht, gehört benannt:** ein Konto lag in beliebig vielen Gruppen
  und liegt in genau einer Klasse. Ein Bargeldbestand, der zu „Lebenshaltung" UND zum
  „Urlaubstopf" gehörte, ist so nicht mehr abzubilden. Wer Konten wieder frei bündeln
  will, baut dafür etwas Neues — und es darf dann, wie die Gruppe, **nichts** entscheiden;
  sonst stehen wieder zwei Felder da, die dasselbe verschieden sagen.

  **Gerechnet wird über ZWEI Grenzen, seit 2026-11-08.** `istLiquide` fragt
  `=== "liquide"` und entscheidet über die liquiden Mittel. `istRuecklagenkonto` fragt
  `=== "ruecklage"` und entscheidet, welche Konten der Bereich Rücklagen als
  Rücklagenkonten zählt (Eingänge, Tacho) — zusammen mit den Konten, denen eine Rücklage
  zugeordnet ist (`ruecklagenKonten`), denn die Zuordnung ist die genauere Aussage.
  Vorsorge, Sparen und Investment sind für jede Rechnung weiterhin dasselbe. Die
  Monatskarten hingen einen Tag lang auch an dieser Grenze und tun es seit 2026-11-09
  nicht mehr: dort fällt jede Umbuchung zwischen erfassten Konten heraus. Wer eine dritte
  Grenze zieht, ändert wieder die Bedeutung des Feldes und schreibt es hierher.

  Was für jede Auswahl von Konten gilt: **Saldo und Buchungen filtern mit derselben
  Liste.** Sonst zeigt ein Verlauf einen Stand, den es nie gab.

  **Saldo und Buchungen gehören dabei zusammen.** `istMonatsverlauf` bildet seinen Sockel aus
  `liquideMittel` und lässt Buchungen darüberlaufen. Nimmt man den Saldo eines Kontos heraus
  und seine Buchungen nicht, zeigt der Verlauf einen Stand, den es nie gab — beide Seiten
  filtern deshalb mit derselben Regel (`istLiquide`). Festgehalten in
  `core/konten/konto.test.ts` und `core/buchung/historie.test.ts`.

Ausführbar geprüft wird das in `src/architektur.test.ts` (Schichtgrenzen),
`src/doku.test.ts` (Verweise) und `src/privatsphaere.test.ts` (IBANs echter Banken).

## Nichts aus dem echten Bestand ins Repo

Das Repo ist **öffentlich**. Kein Wert aus der echten Datenbank gehört hinein — keine IBAN,
kein Empfänger, kein Betrag, kein Kontostand, keine Buchungszahl. Und zwar nicht nur in
Tests: auch nicht in Kommentaren, in dieser Datei, im Changelog und **nicht in
Commit-Texten**. „Am echten Bestand gemessen" ist die überzeugendste Begründung, und die Zahl
dazu wirkt am überzeugendsten — genau deshalb rutscht sie mit. Die Aussage trägt auch ohne
den Beleg: „ein überschrittener Rahmen" statt des Betrags.

Die ausführlichen Regeln für Testdaten (anonymisieren statt ersetzen, Namen je Testfall,
IBANs mit nicht existierender BLZ) stehen in **`src/CLAUDE.md`**, weil man sie dort liest, wo
man sie braucht.

### Keine Zahlen aus dem Bestand in Prosa — auch keine harmlosen

In **Kommentaren, Markdown-Dateien und Commit-Nachrichten** steht keine Zahl, die am echten
Bestand gemessen wurde. Nicht nur die offensichtlich privaten (Beträge, Kontostände),
sondern auch die scheinbar harmlosen: Buchungszahlen, Trefferquoten, „93 von 738 geprüften
Zahlungen", „1060-mal vorgekommen", Laufzeiten mit Beispielzahl.

Zwei Gründe, und der zweite wiegt schwerer als erwartet:

**Sie verraten etwas.** Wie viele Buchungen jemand hat, über wie viele Jahre, wie oft er
irgendwo einkauft — daraus lässt sich ableiten, auch ohne einen Betrag. Und eine Zahl ist
das, was am ehesten mitrutscht: „am echten Bestand gemessen" ist die überzeugendste
Begründung, und der Beleg dazu wirkt am überzeugendsten.

**Sie werden zu Lügen.** Ein Kommentar mit „137 ms über 3689 Beispiele" ist beim nächsten
Import falsch und bleibt es. Wer ihn dann liest, glaubt einer Messung, die nie wieder
stimmt. Eine Aussage ohne Zahl altert nicht: „in Millisekunden neu gerechnet" gilt weiter.

**Was bleibt:** Rechenbeispiele und Kapazitätsabschätzungen, die keine Messung sind — „bei
2000 Merkmalen × 50 Kategorien wären das 100.000 Zeilen" beschreibt eine Konstruktion, kein
Konto. Sie altern auch nicht.

**Was an ihre Stelle tritt:** die Aussage selbst. „Keine einzige Buchung traf ihre
Budget-Kategorie direkt" ist stärker als „0 von 5207". „Ein nennenswerter Teil der Zeilen"
reicht, wo es auf die Größenordnung ankommt. Wo die genaue Zahl wirklich zählt, gehört sie
in die Doku außerhalb des Repos.

Der Muster-Guard (`scripts/CLAUDE.md`) findet davon nur die Beträge. Der Rest ist Handarbeit — dieselbe Art wie
bei Regel 2 und 3 der Testdaten.

## Sprache

Deutsch, Anrede „du", keine Emoji. Fachlich streng innen, alltagstauglich außen: das
Datenmodell nutzt die präzisen Rechnungswesen-Begriffe, die Oberfläche erklärt sie.

Texte liegen in `src/i18n/i18n.ts` (de und en); die Fallstricke beim Ändern stehen in
`src/adapters/ui/CLAUDE.md`.

Verbindlich ist der Bestand in `src/i18n/i18n.ts`. Ein älteres Glossar aus dem
Design-System schreibt UI-Wörter vor („Spartopf", „Puffer", „Ansparrate"), die aus der
Töpfe-Zeit stammen und heute nirgends mehr vorkommen — es beschreibt einen überholten Stand
und ist keine Quelle mehr. Was an seine Stelle tritt, ist offen.

## Build-Stolpersteine

- **Nach dem Verschieben des Repos baut `tauri dev` nicht mehr.** Die Build-Skripte von
  Tauri und seinen Plugins schreiben ABSOLUTE Pfade in ihre Ausgabe unter
  `src-tauri/target/debug/build/`, und Cargo führt sie nicht neu aus, nur weil das
  Verzeichnis woanders liegt. Die Meldung zeigt auf den alten Ort und klingt nach einer
  fehlenden Datei: „failed to read plugin permissions: failed to read file '…/app_hide.toml'".
  Abhilfe: die betroffenen Kisten gezielt abräumen statt alles —
  `grep -rl <alter-pfad> src-tauri/target/debug/build/*/output` nennt sie, dann je
  `cargo clean -p <kiste>`. Auf macOS fällt ein Umzug, der nur die Gross-/Kleinschreibung
  ändert, nicht auf; einer, der eine Ebene einzieht, schon.
- **Ein Patch in `node_modules/<paket>/dist` erreicht die laufende App NICHT.** Vite
  serviert `node_modules/.vite/deps/<paket>.js` mit `immutable`-Caching und bündelt nur
  neu, wenn sich Lockfile oder Config ändern — nicht bei geändertem Paketinhalt. Wer eine
  Abhängigkeit zur Diagnose markiert: `rm -rf node_modules/.vite`, dann neu starten.
  Gemessen an `lib-fints`; der WebView nimmt sonst wortlos seine alte Kopie.
- **Der erste Rust-Build nach einem frischen Klon dauert länger als früher.** Seit
  SQLCipher im Baum ist (`libsqlite3-sys` mit `bundled-sqlcipher-vendored-openssl`), wird
  OpenSSL mitgebaut. Danach liegt es im Cache und die Sache ist erledigt. `-vendored-`
  ist Absicht: sonst müsste OpenSSL aus dem System kommen, und dort ist es auf einem
  frischen Rechner und in einem CI-Läufer nicht.
- **cargo-deny vor `cargo update`:** ein gezieltes `cargo update -p <kiste>` ist der Weg,
  eine Meldung zu beheben — blind über den ganzen Baum ist es der Weg, den brotli-Pin
  unten zu verlieren. Danach `npm run test:rust`.
- **brotli / rustc:** Tauri zieht `brotli 8.0.3`, das via `alloc-stdlib 0.2.3`
  `alloc-no-stdlib 3.0.0` einbindet, selbst aber `alloc-no-stdlib 2.0.4` nutzt →
  Trait-Konflikt (`StandardAlloc` implementiert `Allocator` nicht). In `Cargo.lock` gepinnt:
  `alloc-stdlib = 0.2.2`. Lockfile committen, nicht blind `cargo update` laufen lassen.
