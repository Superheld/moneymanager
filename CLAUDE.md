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

25 Tabellen, angelegt über `adapters/persistence/migrations.ts`. Welche heute leben, sagt
weder die Migrationskette (append-only, enthält auch Gedroppte) noch eine Übersicht — hier
ist sie:

- **Buchen:** `ist_buchung` · `ist_buchung_aufteilung` (Splits) · `buchung_journal`
  (was mit einer Buchung geschah) · `umsatz_roh` +
  `umsatz_verarbeitung` (die Importzeile, siehe unten) · `zahlungskonto` (mit Typ
  UND Klasse, siehe unten) ·
  `kontostand_anker` · `import_lauf` · `dubletten_freigabe`
- **Ordnen:** `kategorie` · `kategorie_festlegung` · `budget` · `vertrag` ·
  `vertrag_erkennung` · `zahlungsregel` · `inventargegenstand`
- **Erkennen:** `klassifikator_modell` · `merkmal_ausschluss`
- **Bank:** `bankzugang` (samt Bankfähigkeitsprofil) · `bankkonto_zuordnung`
- **Besitzen:** `depot` · `depotwert` (Reihe der Stichtagswerte) · `depotposition` —
  Beobachtungen, keine Buchungen; siehe unten
- **Sonstiges:** `person` · `einstellung`

Gedroppt und nicht wiederzubeleben: `topf`, `szenario`, `szenario_posten` — aufgegangen in
den Budgets bzw. im Monatsausblick. Ebenso `umsatz`, aufgeteilt in die beiden folgenden,
und `vertrag_zuordnung`, aufgegangen in zwei Spalten der Buchung (siehe unten).

#### Der Beleg und was wir daraus gemacht haben

Eine Importzeile steht in **zwei** Tabellen, und die Grenze dazwischen ist der
**Lebenszyklus**, nicht die Kardinalität — 1:1 gehörte nach Lehrbuch in eine Tabelle:

- **`umsatz_roh`** — was die Quelle lieferte. Nach dem Anlegen unveränderlich.
- **`umsatz_verarbeitung`** — was wir daraus gemacht haben: Status, Kontozuordnung,
  Kategorievorschlag, erzeugte Buchung, Dublettenverdacht. Ändert sich bei jeder Durchsicht.

Nach oben ist es weiterhin EIN `Umsatz`; die Trennung sieht man nur an den Schreibwegen.
`anlegen` schreibt beides in einer Transaktion, `speichern` nur den Stand, und `ergaenzen`
ist die einzige Stelle, die Rohdaten überhaupt noch anfasst — und auch dort nur, was fehlt
(`COALESCE`), nie was schon dasteht.

Zwei Zuordnungen, die man auf der falschen Seite sucht:

- **`zahlungskonto_id` steht beim STAND**, nicht beim Beleg. Die Quelle liefert eine IBAN —
  das ist Beleg. Welches unserer Konten gemeint ist, ist unsere Zuordnung, und der
  Verbuchen-Dialog lässt sie ändern. Was der Mensch korrigieren darf, ist kein Beleg.
- **`lauf_id` steht beim BELEG.** Aus welchem Abruf eine Zeile kam, ändert sich nie.

Die Probe auf die Trennung: „auf den Stand der Quelle zurücksetzen" ist ein `DELETE` auf
`umsatz_verarbeitung`, und der Beleg merkt nichts davon.

**Zwei Felder liefert nur CAMT**, und beide sind Einordnungen, die die Bank schon
vorgenommen hat: `zweck_code` (SEPA-Verwendungszweckcode — `SALA`, `RENT`, `LOAN`) und
`endempfaenger` (wer die Zahlung wirklich bekommt, wenn ein Zahlungsdienstleister
dazwischensteht). Bei MT940 bleiben sie leer — eine ehrliche Lücke und kein Grund, etwas
aus dem Verwendungszweck zu raten, das dann aussähe wie eine Angabe der Bank.

Der `endempfaenger` steht **neben** `gegenpartei`, nicht statt dessen: dort bleibt der
Dienstleister, und über wen gezahlt wurde, ist eine eigene Information. Für die
Kategorie-Erkennung ist der Unterschied erheblich — der Dienstleister ist bei jedem Händler
derselbe.

**Zwei Felder des Belegs sind formatabhängig** und tragen je nach Abrufweg Verschiedenes:
`umsatzart` (MT940 ein kurzes Etikett, CAMT ein Freitext) und `buchungsschluessel` (MT940
numerisch, CAMT alphabetisch). Sie stehen trotzdem in einer Spalte — deutbar, weil das
Format am **Lauf** steht und jede Zeile zu genau einem gehört. Wer sie auswertet, allen
voran die Kategorie-Erkennung, muss über `lauf_id` danach unterscheiden. Eine Abbildung
zwischen den beiden Vokabularen gibt es nicht; sie liesse sich nur aus der
DK-Spezifikation gewinnen, und eine geratene wäre schlimmer als keine.

#### Zuordnungen stehen an der Buchung

`kategorie_id` und `vertrag_id` sind **Spalten von `ist_buchung`**, nicht eigene Tabellen.
Beide Beziehungen sind N:1 (viele Buchungen, eine Kategorie bzw. ein Vertrag), und dafür
ist eine Fremdschlüsselspalte die Form. Der Lebenszyklus-Grund von oben greift hier nicht:
keine der beiden ist ein Beleg, und beide ändern sich gleich oft.

Zu jeder gehört eine **Herkunft** (`kategorie_herkunft`, `vertrag_herkunft`), und die
leistet mehr, als ihr Name sagt. Sie unterscheidet nicht nur Automatik von Handarbeit,
sondern trägt beim Vertrag auch, was vorher die blosse Existenz einer Zeile trug:

| `vertrag_id` | `vertrag_herkunft` | heisst |
|---|---|---|
| leer | leer | noch nie entschieden — die Automatik darf ran |
| leer | gesetzt | **gehört ausdrücklich zu keinem Vertrag** — Hand, bleibt |
| gesetzt | — | zugeordnet |

Die mittlere Zeile ist der Grund, warum es die Spalte gibt: ohne sie käme ein von Hand
korrigierter Fehlgriff der Automatik beim nächsten Abgleich zurück. Wer `vertrag_id`
zurücksetzt, muss `vertrag_herkunft` mit zurücksetzen — sonst bleibt die Buchung für die
Automatik gesperrt.

### Einstieg

1. Diese Datei — vor allem *Invarianten, die beißen*.
2. `src/application/index.ts` — was die UI überhaupt sehen darf.
3. `src/adapters/dienste.ts` — wo Use-Cases und SQLite zusammenkommen; von dort führt
   jeder Faden weiter.
4. `src/architektur.test.ts` — die Schichtgrenze als ausführbare Regel.

Jede Schicht trägt ihre eigene `CLAUDE.md` — sie lädt, sobald man dort arbeitet. Die
Übersicht steht unten unter *Die Regeln je Schicht*.

## Wie weit die App den GoBD folgt

Die GoBD gelten für **Buchführungspflichtige**. Diese App führt einen privaten Haushalt und
ist ihnen **nicht unterworfen** — ihre Grundsätze sind hier trotzdem das richtige Maß, weil
sie beschreiben, was eine Aufzeichnung glaubwürdig macht. Der Abschnitt steht hier, damit
niemand später raten muss, was bewusst erfüllt ist und was bewusst nicht.

| Grundsatz | Stand |
|---|---|
| **Nachvollziehbarkeit** | Beleg und Buchung sind verbunden (`umsatz_verarbeitung.istbuchung_id`), Änderungen an Buchungen stehen im `buchung_journal` |
| **Vollständigkeit** | Der Import legt jede Zeile an, auch Verworfenes bleibt sichtbar |
| **Richtigkeit** | Geld ist Integer Cent, Fremdschlüssel halten das Schema zusammen |
| **Ordnung** | Ein Ort je Sachverhalt, keine verwaisten Verweise mehr |
| **Unveränderbarkeit** | **teilweise** — siehe unten |
| **Aufbewahrung** | lokal, nichts verfällt von selbst |
| **Verfahrensdokumentation** | diese Datei und die Doku ausserhalb des Repos |

### Was die Unveränderbarkeit heute leistet

**Der Beleg ist geschützt.** `umsatz_roh` wird nach dem Anlegen nicht mehr beschrieben; die
einzige Ausnahme ist `ergaenzen`, und die trägt nur FEHLENDE Felder nach (`COALESCE`), nie
vorhandene. Was die Bank geliefert hat, steht unverändert da.

**Änderungen an Buchungen sind protokolliert.** Jedes Anlegen, Ändern und Löschen schreibt
einen Eintrag ins `buchung_journal` — mit dem ganzen Zustand vorher und nachher, nicht mit
Unterschieden. Der ursprüngliche Inhalt bleibt damit feststellbar, auch nachdem die Buchung
gelöscht wurde. Deshalb trägt die Tabelle bewusst **keinen** Fremdschlüssel auf
`ist_buchung`: sie muss die Löschung überleben.

### Was offen ist, und warum

- **Storno statt Löschen.** Eine gelöschte Buchung verschwindet weiterhin aus dem Ledger;
  nur ihr letzter Stand bleibt im Journal. Streng genommen verlangen die GoBD, dass sie
  sichtbar bleibt und durch eine Gegenbuchung aufgehoben wird. Das ist eine
  Bedienentscheidung, keine technische — und sie ändert, wie sich die App anfühlt.
- **Wer etwas geändert hat**, wird nicht festgehalten. Bei einem Einzelnutzer ohne Anmeldung
  gibt es nichts zu unterscheiden; sobald es mehrere Nutzer gibt, fehlt es.
- **Das Journal ist nicht fälschungssicher.** Wer die Datei öffnet, kann es ändern. Dagegen
  hülfe nur eine Signaturkette, und die wäre für eine lokale Haushalts-App ein Aufwand ohne
  Gegenwert — der Angreifer wäre der Nutzer selbst.
- **Kein Änderungsprotokoll für Stammdaten** (Konten, Kategorien, Verträge, Budgets). Sie
  beschreiben keine Zahlung; ihre Historie wäre Aufwand ohne Zweck.
- **`kontostand_anker` und `depotwert` werden nicht protokolliert.** Sie sind Beobachtungen
  zu einem Stichtag und werden nur ergänzt, nicht geändert.

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

**Zwei Hooks setzen das durch** (siehe unten, „Die Hooks"): `pre-commit` weist einen
direkten Commit auf `develop` oder `main` ab, `prepare-commit-msg` lässt nach `main` nur
einen Merge aus `develop` zu. Merges per `--no-ff` laufen normal durch — Git ruft für sie
einen anderen Hook. Im Notfall: `--no-verify`.

## Die Hooks

Aktiv wird alles über **`git config core.hooksPath .githooks`** — einmal je Klon, sonst
greift keiner davon. Sie liegen im Repo, damit sie mitkommen und überprüfbar sind.

| Hook | prüft |
|---|---|
| `pre-commit` | Muster-Guard über das Vorgemerkte · kein direkter Commit auf `develop`/`main` |
| `commit-msg` | Muster-Guard über die Nachricht |
| `prepare-commit-msg` | nach `main` nur aus `develop` |
| `pre-push` | Wächter-Tests · Muster-Guard über Diff und Commit-Texte · Wert-Abgleich gegen die echte Datenbank |

Der Branch-Wächter sitzt in `prepare-commit-msg` und **nicht** in `pre-merge-commit`, wo
man ihn zuerst sucht: dort gibt es `MERGE_HEAD` noch nicht, Git legt die Datei erst danach
an. Ein Hook, der dort nach der Merge-Quelle sucht, findet nichts und winkt durch — das ist
gemessen, nicht vermutet.

Jeder Hook lässt sich mit `--no-verify` umgehen. Das ist Absicht: ein Wächter, der keinen
Ausweg lässt, wird abgeschaltet statt umgangen, und dann ist er ganz weg.

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

Der Muster-Guard findet davon nur die Beträge. Der Rest ist Handarbeit — dieselbe Art wie
bei Regel 2 und 3 der Testdaten.

### Zwei Wächter, die verschiedene Fehler finden

**Der Wert-Abgleich** (`src/privatsphaere.test.ts`, dazu der `pre-push`-Hook) kennt die
Daten nicht, sondern liest sie zur Laufzeit aus der echten Datenbank und prüft den
Arbeitsbaum und die ausgehenden Commit-Texte dagegen. Er findet **deine** Werte, auch in
anderer Schreibweise — und nur die.

**Der Muster-Guard** (`scripts/privacy-guard.mjs`) kennt die Formen: IBAN, SEPA-Gläubiger-ID,
Token, E-Mail, Produkt-ID, Beträge in Prosa, verbotene Dateitypen. Er findet auch, was
**nicht aus deiner Datenbank stammt** — genau die Lücke, durch die einmal eine Kontonummer
aus einem FinTS-Mitschnitt gerutscht ist (siehe „Mitgelieferte Skills"). Er läuft in
`npm test` und an allen drei Hook-Zeitpunkten.

Keiner ersetzt den anderen. Der eine kennt die Werte, der andere die Formen.

Zwei Entscheidungen im Muster-Guard, die man kennen muss:

- **IBANs werden gegen die DK-Bankenliste im Repo geprüft**, nicht gegen den 9999er-Präfix
  aus `src/CLAUDE.md`. Der Präfix war immer nur eine Faustregel für die eigentliche
  Anforderung: die IBAN darf zu keinem echten Konto gehören können. Eine erfundene BLZ
  ausserhalb des 9999er-Bereichs geht deshalb durch.
- **Beträge prüft er nur in PROSA** (Markdown, Commit-Nachrichten), nicht im Code. In einer
  Finanz-App steht in jedem zweiten Test ein Betrag, und ein Muster kann den abgelesenen
  nicht vom erfundenen trennen; dafür ist der Wert-Abgleich da. In Prosa dreht sich das um:
  dort steht ein Betrag fast nie als Beispiel, sondern als Beleg.

Einzelfall freigeben: `privacy-ok` in dieselbe Zeile. Namen und Begriffe, die keinem Muster
folgen, kommen in `.privacy-terms` (git-ignoriert, Vorlage: `.privacy-terms.example`).

### Was keiner von beiden kann

- Beide finden nur den **Originalwert**. Ob ein Ersatz neutral ist, sieht keiner von beiden.
- Beide brechen ab, wenn sie nicht arbeiten können — fehlende Datenbank, kaputter Guard.
  Ein Wächter, der nichts sieht, ist schlimmer als keiner: er beruhigt.
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
