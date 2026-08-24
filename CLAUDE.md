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
| Konten verwalten | `KontenVerwaltungScreen` | Konten anlegen, Abgleich, Bankzugänge (`BankzugaengeScreen`) |
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

26 Tabellen, angelegt über `adapters/persistence/migrations.ts`. Welche heute leben, sagt
weder die Migrationskette (append-only, enthält auch Gedroppte) noch eine Übersicht — hier
ist sie:

- **Buchen:** `ist_buchung` · `ist_buchung_aufteilung` (Splits) · `buchung_journal`
  (was mit einer Buchung geschah) · `umsatz_roh` +
  `umsatz_verarbeitung` (die Importzeile, siehe unten) · `zahlungskonto` (mit Typ
  UND Klasse, siehe unten) ·
  `kontostand_anker` · `import_lauf` · `dubletten_freigabe`
- **Ordnen:** `kategorie` · `kategorie_festlegung` · `budget` + `budget_betrag` (die
  Reihe seiner Beträge, siehe unten) · `vertrag` ·
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

#### Die Richtung kommt vom Beleg, der Charakter ordnet ein

Bei einer **von Hand** erfassten Buchung folgt das Vorzeichen dem Charakter: man tippt eine
Betragshöhe und sagt „Aufwand", daraus wird ein Abfluss. Es gibt keinen Beleg, der es
besser wüsste.

Bei einer **importierten** Buchung ist es umgekehrt. Die Bank hat gebucht, in welche
Richtung das Geld geflossen ist — das ist eine **Tatsache**. Der Charakter ist eine
**Einordnung**, und eine Einordnung darf eine Tatsache nicht umdrehen. `buchungBearbeiten`
behält deshalb bei `quelle === "import"` das Vorzeichen des Originals und übernimmt aus der
Eingabe nur die Höhe.

**Eine Erstattung ist damit ein Aufwand mit positivem Betrag**, und das ist kein
Widerspruch: „Aufwand" sagt, WOFÜR das Geld war, das Vorzeichen sagt, wohin es floss. Die
Budgetrechnung ist darauf ausgelegt — `Verbrauchsposten.betrag` ist ausdrücklich „POSITIV
(eine Erstattung ist entsprechend negativ)", und damit entlastet sie das Budget der
Kategorie, in der die Ausgabe stattgefunden hat.

**Ein Rückfluss gehört IMMER in die Kategorie der Ausgabe.** Es gibt darum keine Kategorie
für Erstattungen unter den Einnahmen, und es soll auch keine geben: dieselbe Zahlung stünde
sonst je nach Einsortierung für zwei verschiedene Aussagen — einmal entlastet sie das
Budget, in dem die Ausgabe stattfand, einmal bläht sie die Einnahmen auf und gleicht nie
etwas aus. Welche von beiden gilt, entschiede dann die Kategorie-Erkennung, und die nimmt
gern die falsche: das Wort steht oft genug im Verwendungszweck.

Das gilt auch, wenn die ursprüngliche Ausgabe gar nicht im Bestand steht — eine
Steuerrückerstattung gehört zu „Steuern", eine Kautionsrückzahlung zu „Wohnen". Eine
Verknüpfung zur erstatteten Buchung braucht es dafür nicht: solange beide im selben Monat
liegen, kommt die Verrechnung über die Kategorie auf dasselbe Ergebnis, und über
Monatsgrenzen hinweg würde eine solche Verknüpfung einen abgeschlossenen Monat rückwirkend
ändern — genau das, was der Budgetbetrag weiter unten aus gutem Grund nicht tut.

**Von Hand braucht die Richtung ein eigenes Wort.** Ohne Beleg leitet
`vorzeichenbehaftet()` sie aus dem Charakter ab, und das geht nur so lange gut, wie
Einordnung und Richtung dasselbe sagen. Beim Rückfluss tun sie es nicht. Die
Buchungseingabe trägt deshalb ein `gegenrichtung`-Feld, das die Ableitung umdreht; für
eine PLANGRÖSSE (Zahlungsregel, Vertragsrate) bleibt die Ableitung, denn eine geplante
Rate hat genau eine Richtung.

**Und wo ein Wort neben der Zahl steht, muss es mitwandern.** Ein negativer Verbrauch unter
der Überschrift „verbraucht" liest sich als ausgegeben, auch wenn das Minus davorsteht und
der Rest im selben Bild wächst — ein Wort gewinnt gegen ein Vorzeichen. Die Anzeigen zum
Budgetverlauf wechseln deshalb das Wort und zeigen den Betrag ohne Vorzeichen, statt beides
zu vermischen.

#### Der Budgetbetrag ist eine Reihe, kein Wert

`budget_betrag` hält je Budget die Beträge mit dem **Monat, ab dem sie gelten**. Ein Budget
ohne Zeile dort ist keins — die letzte Version lässt sich nicht löschen, nur das ganze
Budget.

Der Grund ist derselbe wie beim Beleg: **eine Änderung darf die Vergangenheit nicht
umschreiben.** Vorher stand der Betrag als Spalte an `budget`, und wer im August von 400 auf
450 ging, sah rückwirkend jeden Monat mit 450 geplant — nicht mehr feststellbar, wogegen er
damals gemessen hatte. Bei einem aufbauenden Budget rechnete es zusätzlich den ganzen Sockel
neu, weil dessen Rahmen `Rate × Monate` war.

**MONAT und nicht Datum.** Ein Budget ist eine Monatsgrösse; ein Wechsel mitten im Monat
müsste anteilig gerechnet werden, und dafür gibt es keinen fachlichen Grund. Geändert wird
zum Ersten.

Wer den Betrag eines Monats braucht, fragt `betragImMonat` — **nie `betraege[0]` und nie den
letzten Eintrag.** Vor der ersten Version ist er 0, nicht der erste Betrag: da war nichts
geplant, und einen Rahmen rückwirkend anzunehmen hiesse, eine Planung zu erfinden, die es
nie gab. Aus demselben Grund summiert `budgetRahmen` beim Aufbauenden über die Monate,
statt zu multiplizieren.

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
npm run seed        # Spielstand für die Entwicklung neu schreiben (siehe unten)
npm run installieren # macOS: bauen und nach /Applications installieren
```

Node kommt über **mise** (`mise.toml`: node 26); die CI pinnt dieselbe Hauptversion getrennt
in `.github/workflows/ci.yml`, weil Actions die `mise.toml` nicht liest. Wer sie hier hebt,
hebt sie dort mit. Die Kommandozeilen für diese Maschine stehen in `CLAUDE.local.md`.

## Auslieferung: lokal gebaut, lokal installiert

Es gibt **keinen Release-Weg**. Die App wird auf der eigenen Maschine gebaut und von dort
nach `/Applications` installiert (`npm run installieren`, macOS). Kein GitHub-Release, kein
Updater, keine Signierung — und das ist eine Entscheidung, kein Rückstand: solange es genau
einen Nutzer auf genau einer Maschine gibt, kostet jede Stufe dazwischen Aufwand ohne
Gegenwert.

Drei Dinge, die dabei zusammengehören und von denen das dritte gern vergessen wird:

- **Die Produktregistrierungsnummer wird zur BAUZEIT eingebacken.** Vite ersetzt
  `import.meta.env.VITE_FINTS_PRODUKT_ID` beim Bündeln; fehlt die `.env` im Moment des
  Bauens, fehlt sie der fertigen App, und der Bankabruf meldet das erst beim ersten
  Versuch. `scripts/installieren.sh` warnt vorher.
- **Gatekeeper hält die App an.** Sie ist nicht mit einem Apple-Developer-Zertifikat
  signiert; macOS meldet sie deshalb als „beschädigt", was sie nicht ist. Das
  Quarantäne-Merkmal einmal abräumen (`xattr -dr com.apple.quarantine`) ist die ganze
  Sache, und das Skript tut es mit.
- **Der Datenbestand überlebt die Neuinstallation.** Er liegt im App-Datenverzeichnis, nicht
  im Bundle.

Was ein Release später bräuchte, ist damit nicht weg, sondern nur nicht gebaut:
`tauri-plugin-updater` (auf Linux ausschliesslich mit AppImage), ein Signaturschlüssel, ein
Workflow mit `VITE_FINTS_PRODUKT_ID` als Repository-Secret. Der Secret-Weg ist dabei nicht
Geheimniskrämerei, sondern die **Produktgrenze**: ein Fork ist laut DK-Bedingungen ein
anderes Produkt und hat das Secret nicht — sein Build läuft ohne Nummer und wird damit zur
eigenen Registrierung geschoben, statt still unter unserem Namen zu laufen.

### Der Update-Knopf

Die App prüft beim Start still nach. Ist nichts da, verändert sich nichts — kein Hinweis,
kein Haken, keine Meldung. Ist etwas da, erscheint **unten links in der Seitenleiste**,
neben Version und Stadium, ein Knopf; ein Klick lädt, installiert und startet neu.

Der Ort ist nicht beliebig: dort steht schon, welche Version läuft. „0.19.0" und „0.20.0
installieren" beantworten dieselbe Frage.

**Ein Fehlschlag beim PRÜFEN ist kein Fehler.** Kein Netz, Endpunkt weg, Antwort kaputt —
in allen Fällen lautet die Antwort „nichts Neues". Ein Haushalt, der Ausgaben eintragen
will, hat mit einer Updater-Fehlermeldung nichts zu tun; sie wäre Beunruhigung ohne
Handlungsmöglichkeit. Beim **Einspielen** dreht sich das um: dort hat jemand geklickt und
wartet, und ein Fehler gehört ihm gesagt.

**Die Prüfung ist der erste Netzzugriff, den die App von sich aus macht.** Bisher sprach
sie nur nach draussen, wenn jemand einen Bankabruf auslöste. Deshalb ist sie abschaltbar
(`aktualisierungPruefen` in `einstellung`); ohne Zutun ist sie an, denn ein Update, von
dem niemand erfährt, ist keines.

Wo was liegt:

| Stück | Datei |
|---|---|
| Use-Case und Port | `src/application/aktualisierung.ts` |
| Der Port auf das Tauri-Plugin | `src/adapters/aktualisierung.ts` |
| Der Knopf | `src/adapters/ui/bausteine/AktualisierungKnopf.tsx` |
| Schlüssel, Endpunkt, Artefakte | `src-tauri/tauri.conf.json` |

**Der private Signaturschlüssel liegt ausserhalb des Repos** (`~/.moneymanager-schluessel/`)
und ist **unersetzlich**: geht er verloren, kann keine installierte App je wieder ein
Update annehmen — sie prüft gegen den öffentlichen Schlüssel, der in ihrem Bundle steckt.
Er gehört gesichert. Solange nichts veröffentlicht ist, kostet ein Neuerzeugen nichts;
nach dem ersten Release kostet es jede Installation da draussen.

Zwei Dinge, die man dabei auseinanderhalten muss:

- **Die Updater-Signatur hat mit Apple nichts zu tun.** Sie ist minisign und verhindert,
  dass jemand anderes ein Update unterschiebt. Gatekeeper bleibt davon unberührt: eine
  unsignierte App aktualisiert sich klaglos, sobald sie einmal starten durfte.
- **Auf Linux kann der Updater ausschliesslich AppImages ersetzen.** Ein `.deb` kann sich
  nicht selbst austauschen. Das entscheidet also das Bundle-Format mit, nicht erst die
  Verteilung.

### Den Update-Weg durchspielen

Halb prüfen geht nicht: entweder eine installierte App findet ein signiertes Paket, lädt
es, ersetzt sich und startet neu — oder man weiss nichts. Dafür gibt es einen Endpunkt auf
`127.0.0.1`, der nur läuft, solange man ihn laufen lässt.

```bash
export TAURI_SIGNING_PRIVATE_KEY=~/.moneymanager-schluessel/updater.key
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=

# 1. Die ALTE Fassung bauen und installieren — mit dem Probe-Endpunkt.
npm run tauri build -- --config src-tauri/tauri.updater-probe.conf.json
rm -rf /Applications/Moneymanager.app
cp -R src-tauri/target/release/bundle/macos/Moneymanager.app /Applications/
xattr -dr com.apple.quarantine /Applications/Moneymanager.app

# 2. Die NEUE Fassung bauen. Die höhere Version steht in der Config, nicht in
#    package.json — eine Probe soll die Versionsangabe des Projekts nicht anfassen.
npm run tauri build -- --config src-tauri/tauri.updater-probe-neu.conf.json

# 3. Endpunkt starten. Er nimmt, was im Bundle-Verzeichnis liegt, und bietet es unter
#    der mitgegebenen Version an.
npm run updater-probe -- 0.20.0

# 4. Die INSTALLIERTE App starten. Der Knopf muss unten links erscheinen.
```

Drei Fallen, alle drei gemessen und nicht vermutet:

- **Die Variable heisst `TAURI_SIGNING_PRIVATE_KEY`**, nicht `…_PATH` — sie nimmt den Pfad
  genauso wie den Schlüssel selbst. Mit der `_PATH`-Variante läuft der Build durch und
  bricht ganz am Ende beim Signieren ab („A public key has been found, but no private
  key"); das Archiv liegt dann unsigniert da.
- **Ein `http`-Endpunkt lässt die App gar nicht erst starten.** Tauri prüft das Schema beim
  INITIALISIEREN des Plugins, nicht beim Abruf, und wirft: *„The configured updater
  endpoint must use a secure protocol like `https`"* — die gebaute App panict beim Start.
  Für die Probe hebt `dangerousInsecureTransportProtocol` das auf; der Schalter steht
  ausschliesslich in den Probe-Overlays, und `src/auslieferung.test.ts` hält ihn aus
  `tauri.conf.json` heraus.
- **Der Plattformschlüssel im Manifest muss exakt passen** (`darwin-aarch64` auf Apple
  Silicon). Steht dort etwas anderes, meldet der Updater „nichts Neues" statt eines
  Fehlers — und man sucht lange an der falschen Stelle.

**Der Endpunkt steckt im Bundle, nicht in der laufenden App.** Eine App, die ohne
`--config` gebaut wurde, fragt GitHub und findet nichts — sie lässt sich nachträglich nicht
auf den Probe-Endpunkt umbiegen. Wer den Knopf nicht sieht, prüft das zuerst.

**Den Endpunkt nicht laufen lassen, während gebaut wird.** Er liefert die Dateien aus dem
Bundle-Verzeichnis aus, und ein Build schreibt genau dort. Wer dazwischen klickt, lädt ein
Archiv, das nicht mehr zu der Signatur im Manifest passt — der Updater weist es dann ab
(richtig so), und man sucht den Fehler beim Schlüssel. Erst bauen, dann den Endpunkt
starten; er erzeugt das Manifest beim Start neu.

**Und die Seitenleiste zeigt beim Probelauf weiter die ALTE Nummer.** `version.ts` liest
`package.json`, die höhere Version steht aber nur im Config-Overlay. Ob das Update
ankam, sagt deshalb nicht die Anzeige, sondern das Bundle:

```bash
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  /Applications/Moneymanager.app/Contents/Info.plist
```

Bei einem echten Release gibt es diese Lücke nicht — dort wird `package.json` gehoben, und
`tauri.conf.json` liest die Version von dort. Beide Zahlen haben dann dieselbe Quelle.

### Was am Update-Weg noch fehlt

Mechanismus und Release-Workflow stehen. Offen ist:

- **Die Repository-Secrets.** Ohne `TAURI_SIGNING_PRIVATE_KEY` bricht der Workflow ab
  (richtig so — ein unsigniertes Update nimmt keine App an). Ohne `FINTS_PRODUKT_ID` läuft
  er durch, und die veröffentlichte App hat einen gesperrten Bankabruf.
- **Das erste Release.** Bis es eines gibt, liefert der Endpunkt eine 404, die Prüfung
  schlägt fehl und schweigt — wie vorgesehen.
- **Linux.** Braucht AppImage als Bundle-Ziel und einen zweiten Bauplatz; macOS lässt sich
  nicht auf Linux bauen und umgekehrt. Und der Updater kann dort ausschliesslich AppImages
  ersetzen.
- **Kein Schalter in den Einstellungen.** Die Abschaltbarkeit ist gebaut und geprüft
  (`pruefungSchalten`, `dienste.aktualisierungspruefungSetzen`), hat aber noch keine
  Oberfläche — abschalten geht derzeit nur über die Einstellungstabelle.

**Was in einem veröffentlichten Archiv steckt** und was nicht, weil die Frage naheliegt:
keine Zugangsdaten, keine Kontodaten, kein Datenbestand — die Datenbank liegt im
App-Datenverzeichnis, nicht im Bundle. Aber die **DK-Produktregistrierungsnummer** ist
darin, zur Bauzeit eingebacken. Sie ist kein Geheimnis (sie geht bei jeder
Dialoginitialisierung im Klartext an die Bank), aber sie identifiziert dieses Produkt
gegenüber allen Banken, und wer ein Release herunterlädt, spricht mit seiner Bank unter
unserer Registrierung. Das ist der normale Zustand eines Softwareherstellers — aber es ist
eine Entscheidung, einer zu sein.

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

Den Spielstand schreibt `npm run seed` — vollständig migriert, mit erfundenen Daten in
jedem Bereich. Zwei Dinge daran sind Absicht:

- **Er weist `moneymanager.db` am Dateinamen ab.** Das Skript überschreibt sein Ziel
  vollständig; ein vertippter Pfad wäre nicht ein Fehler, sondern der Verlust der Daten,
  um deren Trennung es geht.
- **Sein Zufall ist gesät.** Derselbe Aufruf erzeugt denselben Bestand — ein Screenshot von
  gestern zeigt dieselben Zahlen wie einer von heute.

Die Daten selbst stehen in `src/testwerkzeug/seedDaten.ts`, nicht im Skript. Der Grund ist
derselbe wie bei allen Wächtern hier: ein Seed **verrottet still**, wenn die Kette wandert
und seine INSERTs stehenbleiben, und der Fehler zeigt sich erst, wenn man eigentlich etwas
anderes vorhatte. `src/seed.test.ts` fährt ihn deshalb bei jedem `npm test` gegen die
aktuelle Migrationskette.

## Abläufe

Drei Wege, die oft genug vorkommen, dass sie festliegen sollten — und je einen Punkt, an
dem man sonst das Falsche tut.

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

**Der Punkt, an dem man sonst das Falsche tut:** Wer am **Schema** arbeitet, prüft nicht
gegen den Spielstand, sondern gegen eine **Lesekopie des echten Bestands**
(`scripts/migrationsprobe.mjs`, Rezept in `CLAUDE.local.md`). Der Spielstand ist
widerspruchsfrei — er wurde gerade erst erzeugt. Der echte Bestand ist es nicht, und genau
dort scheitern Migrationen. Ein grüner Testlauf gegen sql.js hat das schon einmal
verschwiegen, weil dort die Fremdschlüssel aus sind.

### Eine Version ausliefern

1. `develop` ist grün und enthält alles, was mit soll.
2. Version in `package.json` heben — **eine** Stelle, `tauri.conf.json` und `version.ts`
   lesen von dort.
3. `CHANGELOG.md` schreiben. Keine Zahl aus dem echten Bestand hinein.
4. Nach `main` mergen (nur aus `develop`, der Hook lässt nichts anderes zu).
5. Tag setzen und pushen — **das löst `.github/workflows/release.yml` aus**: bauen,
   signieren, Release anlegen, Archiv, DMG und Manifest anhängen.
6. **Die installierte App einmal starten.** Das ist kein Ritual: der Build kann
   durchlaufen und die App trotzdem nicht hochkommen — an einer Migration, an einer
   fehlenden Capability, an Gatekeeper.

Für den eigenen Rechner geht es auch ohne Release: `npm run installieren` baut und
installiert lokal. Beide Wege erzeugen dasselbe Bundle; der Unterschied ist nur, ob es
jemand anders erreichen kann.

**Zwei Schalter im Release-Workflow dürfen nicht auf „vorsichtig" stehen**, und beide sind
verlockend:

- **`releaseDraft: false`** — die Assets eines Entwurfs sind ohne Anmeldung nicht
  abrufbar. Ein Entwurf wäre bequem zum Nachsehen und macht den Updater blind.
- **`prerelease: false`** — `releases/latest/` **überspringt Vorabversionen**. Bei einer
  App im Alpha-Stadium ist „prerelease" die naheliegende Wahl, und der Endpunkt liefert
  dann eine 404, die für den Updater aussieht wie „kein Update da".

**Der Punkt, an dem man sonst das Falsche tut:** vor dem Bauen prüfen, dass die `.env`
steht. Sie ist gitignoriert, in einem frischen Klon oder Worktree also nicht da, und die
Produktregistrierungsnummer wird zur **Bauzeit** eingebacken. Fehlt sie, ist die App
fertig und der Bankabruf tot — und das merkt man erst beim ersten Abruf.
`scripts/installieren.sh` warnt, aber es bricht nicht ab.

**Zwei Dinge müssen ausserhalb des Repos bereitliegen**, und beide fehlen in einem frischen
Klon:

| | wo | wenn es fehlt |
|---|---|---|
| Produkt-ID | `.env` | App läuft, Bankabruf gesperrt |
| Signaturschlüssel | `~/.moneymanager-schluessel/updater.key` | **Build bricht ab** |

Der Schlüssel wird seit `createUpdaterArtifacts` bei **jedem** Build gebraucht, auch bei
einem, der mit Updates nichts vorhat. Tauri baut dabei erst alles fertig und bricht im
letzten Schritt ab — `installieren.sh` prüft deshalb vorher, statt den ganzen Build für
eine Fehlermeldung abzuwarten.

### Wann der Spielstand neu geschrieben wird

`npm run seed` überschreibt ihn vollständig. Das ist billig und folgenlos — er ist
**Wegwerfware**, im Gegensatz zum echten Bestand.

Neu schreiben, wenn:

- ein **neuer Fall** dazugehört, den er noch nicht enthält (dann erst
  `src/testwerkzeug/seedDaten.ts` ergänzen, mit einer Zusicherung in `src/seed.test.ts`);
- man ihn **kaputtgespielt** hat und einen sauberen Stand will;
- `src/seed.test.ts` **rot** ist — dann passt er nicht mehr zum Schema, und das Ergänzen
  ist die eigentliche Arbeit, nicht das Neuschreiben.

**Der Punkt, an dem man sonst das Falsche tut — und er ist der wichtigste hier:** *nicht*
reflexhaft nach jeder Migration neu seeden. Eine Migration über einen **bestehenden**
Spielstand laufen zu lassen ist die einzige Gelegenheit, sie überhaupt beim Wandern
zuzusehen; ein frisch geschriebener Seed entsteht direkt im Zielschema und hat nie
migriert. Wer sofort neu seedet, tauscht den Test gegen sein Ergebnis. Also: erst die App
starten und die Migration über den alten Spielstand fahren lassen, **dann** neu seeden,
wenn man einen sauberen Stand braucht.

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
