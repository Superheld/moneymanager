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
Gruppen), die
Zuordnung zur Komponente in `App.tsx`:

**Überblick** — was gilt und was war:

| Bereich | Komponente | worum es geht |
|---|---|---|
| Übersicht | `UebersichtScreen` | wie stehe ich gerade da — drei Monatskarten, Budgets des Monats |
| Konten | `KontenScreen` | Auszug je Konto: suchen, filtern, bearbeiten, paaren |
| Budgets | `BudgetsScreen` | monatlich (Rest verfällt) oder aufbauend (Rest bleibt), verschachtelbar |
| Analyse | `AnalyseScreen` | alles, was einen ZEITRAUM auswertet |
| Inventar | `InventarScreen` | Wiederbeschaffung ÷ Nutzungsdauer = monatliche Rücklage |
| Verträge | `VertraegeScreen` | Wiederkehrendes mit eigener Erkennungsregel |

**Verwaltung** — woher die Daten kommen und wie sie sortiert werden:

| Bereich | Komponente | worum es geht |
|---|---|---|
| Konten verwalten | `KontenVerwaltungScreen` | Konten anlegen, Bankzugänge (`BankzugaengeScreen`) |
| Import | `ImportScreen` | Dateiimport → Inbox (`ReviewScreen`) → verbuchen |
| Training | `TrainingBereich` | die Karten der Kategorie-Erkennung (`KategorisierungCards`) |
| Einstellungen | `EinstellungenScreen` | Stammdaten und Voreinstellungen |

Übersicht beantwortet „wie stehe ich **gerade** da", Analyse „wie war es über einen
**Zeitraum**" — diese Grenze ist beabsichtigt und entscheidet, wo Neues hingehört. Das
Depot ist das jüngste Beispiel: sein Stand steht in der Übersicht, sein Verlauf in der
Analyse, aus derselben Wertreihe.

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
damit ein Thema an drei Stellen gleich heißt:

```
core/         basis buchung konten budgets vertraege kategorien inventar depot
              stammdaten klassifikator          + index, monatsausblick
application/  buchung konten budgets vertraege kategorien inventar depot dubletten
              stammdaten import fints           + index, ports, bootstrap,
                                                  uebersicht, analysesichten, einstellungen
adapters/ui/  bausteine buchung konten budgets vertraege kategorien(training)
              inventar analyse uebersicht import einstellungen
```

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
(`uebersicht.ts`, `analysesichten.ts`, `core/monatsausblick.ts`) — sie rechnen über mehrere
Bereiche hinweg, und das ist ihre Aufgabe, kein Fehler. In `ui/` liegen aus demselben Grund
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

24 Tabellen, angelegt über `adapters/persistence/migrations.ts`. Welche heute leben, sagt
weder die Migrationskette (append-only, enthält auch Gedroppte) noch eine Übersicht — hier
ist sie:

- **Buchen:** `ist_buchung` · `ist_buchung_aufteilung` (Splits) · `umsatz` (Import-Kontext:
  Empfänger, Verwendungszweck — steht **nicht** an der Buchung) · `zahlungskonto` (mit Typ
  UND Klasse, siehe unten) ·
  `kontostand_anker` · `import_lauf` · `dubletten_freigabe`
- **Ordnen:** `kategorie` · `kategorie_festlegung` · `budget` · `vertrag` ·
  `vertrag_erkennung` · `vertrag_zuordnung` · `zahlungsregel` · `inventargegenstand`
- **Erkennen:** `klassifikator_modell` · `merkmal_ausschluss`
- **Bank:** `bankzugang` (samt Bankfähigkeitsprofil) · `bankkonto_zuordnung`
- **Besitzen:** `depot` · `depotwert` (Reihe der Stichtagswerte) · `depotposition` —
  Beobachtungen, keine Buchungen; siehe unten
- **Sonstiges:** `person` · `einstellung`

Gedroppt und nicht wiederzubeleben: `topf`, `szenario`, `szenario_posten` — aufgegangen in
den Budgets bzw. im Monatsausblick.

### Einstieg

1. Diese Datei — vor allem *Invarianten, die beißen*.
2. `src/application/index.ts` — was die UI überhaupt sehen darf.
3. `src/adapters/dienste.ts` — wo Use-Cases und SQLite zusammenkommen; von dort führt
   jeder Faden weiter.
4. `src/architektur.test.ts` — die Schichtgrenze als ausführbare Regel.

Jede Schicht trägt ihre eigene `CLAUDE.md` — sie lädt, sobald man dort arbeitet. Die
Übersicht steht unten unter *Die Regeln je Schicht*.

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
hebt sie dort mit. Die Kommandozeilen für diese Maschine stehen in `CLAUDE.local.md`.

## Mitgelieferte Skills

`.claude/skills/` — Wissen, das zum Projekt gehört, aber in keine Quelldatei passt. Es
lädt automatisch, sobald das Thema aufkommt.

| Skill | worum es geht |
|---|---|
| `lib-fints` | die Bibliothek hinter dem Bankabruf: Ablauf, Datenformen, Bankparameter und die Fallen, die sonst Stunden kosten |

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
| `src/adapters/ui/CLAUDE.md` | `useGeld`, `Promise.all`, i18n, Screen-Tests |
| `src/adapters/ui/bausteine/CLAUDE.md` | was geteilt wird und was nicht |

Vier Dinge gelten überall und stehen deshalb hier:

- **Geld ist Integer Cent, nie Float** — formatiert über `useGeld()` (UI) bzw.
  `geldFormatieren` (Kern), nie mit eigenem `toFixed`. Minus ist U+2212.
- **Die UI kennt nur `application/`** — weder `core/` noch die Persistenz. Was AUSWÄHLT oder
  RECHNET, liegt hinter einem Use-Case, auch beim reinen Lesen.
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
  Wert entscheiden, ob er verfügbar ist. Bislang trennt die Klasse **nur** das; was Rücklage
  und Vorsorge sonst unterscheiden soll, ist offen.

  **Saldo und Buchungen gehören dabei zusammen.** `istMonatsverlauf` bildet seinen Sockel aus
  `liquideMittel` und lässt Buchungen darüberlaufen. Nimmt man den Saldo eines Kontos heraus
  und seine Buchungen nicht, zeigt der Verlauf einen Stand, den es nie gab — beide Seiten
  filtern deshalb mit derselben Regel (`istLiquide`). Festgehalten in
  `core/konten/konto.test.ts` und `core/buchung/historie.test.ts`.

Ausführbar geprüft wird das in `src/architektur.test.ts` (Schichtgrenzen),
`src/doku.test.ts` (Verweise) und `src/privatsphaere.test.ts` (echte Daten).

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

Texte liegen in `src/i18n/i18n.ts` (de und en); die Fallstricke beim Ändern stehen in
`src/adapters/ui/CLAUDE.md`.

Verbindlich ist der Bestand in `src/i18n/i18n.ts`. Ein älteres Glossar aus dem
Design-System schreibt UI-Wörter vor („Spartopf", „Puffer", „Ansparrate"), die aus der
Töpfe-Zeit stammen und heute nirgends mehr vorkommen — es beschreibt einen überholten Stand
und ist keine Quelle mehr. Was an seine Stelle tritt, ist offen.

## Build-Stolpersteine

- **brotli / rustc:** Tauri zieht `brotli 8.0.3`, das via `alloc-stdlib 0.2.3`
  `alloc-no-stdlib 3.0.0` einbindet, selbst aber `alloc-no-stdlib 2.0.4` nutzt →
  Trait-Konflikt (`StandardAlloc` implementiert `Allocator` nicht). In `Cargo.lock` gepinnt:
  `alloc-stdlib = 0.2.2`. Lockfile committen, nicht blind `cargo update` laufen lassen.
