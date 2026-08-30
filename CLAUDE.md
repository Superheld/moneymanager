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
              stammdaten klassifikator          + index, monatsausblick, auswertung
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
ist sie:

- **Buchen:** `ist_buchung` · `ist_buchung_aufteilung` (Splits) · `buchung_journal`
  (was mit einer Buchung geschah) · `umsatz_roh` +
  `umsatz_verarbeitung` (die Importzeile, siehe unten) · `zahlungskonto` (mit Typ
  UND Klasse, siehe unten) ·
  `kontostand_anker` · `import_lauf` · `dubletten_freigabe` ·
  `kontogruppe` + `kontogruppe_konto` (frei benannte Gruppen, siehe unten)
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

#### Das Vorzeichen ist die Richtung, der Charakter ordnet ein

**Der Betrag einer Ist-Buchung trägt sein Vorzeichen selbst, überall.** Er kommt
vorzeichenbehaftet in `buchungErfassen` und `buchungBearbeiten` herein und wird unverändert
gebucht — beim Import ist das die **Tatsache** vom Beleg, von Hand das, was jemand eintippt.
Nichts leitet die Richtung mehr aus dem Charakter ab, und deshalb kann auch nichts sie
umdrehen. Geprüft wird nur noch, dass sie nicht 0 ist (`betrag.nichtNull`); **negative
Beträge sind auf jedem Konto und in jeder Kategorie erlaubt**, denn eine Retoure ist eine.

Der Charakter ist eine **Einordnung**: er sagt, WOFÜR das Geld war. Eine Einordnung darf
eine Tatsache nicht umdrehen — das gilt seit dem Wegfall der Ableitung nicht mehr nur für
importierte Zeilen, sondern immer.

**Die Maske trennt HÖHE und RICHTUNG in zwei Felder.** Das Betragsfeld nimmt die Höhe,
daneben steht die Richtung als Wahl mit zwei sichtbaren Möglichkeiten (Abfluss/Zufluss);
beim Öffnen wird der gespeicherte Betrag in beide zerlegt, beim Speichern wieder
zusammengesetzt. Ein mitgebrachtes Vorzeichen — getippt oder eingefügt — wandert in diese
Wahl, statt im Feld stehenzubleiben oder abgewiesen zu werden.

Die Wahl bleibt auch dort **sichtbar, wo sie gesperrt ist** (Online-Konto, Entwurf,
Umbuchungs-Bein): was die Bank gebucht hat, soll man ablesen können, ohne es ändern zu
dürfen. Ein Feld, das nur erscheint, wenn man es bedienen darf, lässt die Frage sonst
unbeantwortet — genau das war der Fehler des Kästchens davor.

Die Kategorie setzt die Richtung nur, **solange niemand sie selbst gewählt hat**. Danach
gilt die Wahl, und kein Kategoriewechsel nimmt sie wieder weg; eine bestehende Buchung
zählt von Anfang an als selbst gesetzt. Das ist nicht die alte Ableitung mit anderem
Namen: die lief unsichtbar hinter dem Feld, diese bewegt einen Schalter, den man vor sich
sieht und jederzeit zurückstellen kann.

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

**Für eine PLANGRÖSSE bleibt die Ableitung.** `vorzeichenbehaftet()` gibt es weiterhin,
aber nur noch für Zahlungsregel und Vertragsrate: eine geplante Rate hat genau eine
Richtung, sonst wäre sie keine Rate. Für eine IST-Buchung gilt sie nicht — dort fallen
Einordnung und Richtung beim Rückfluss auseinander, und dann gewinnt die Richtung.

Drei Versuche davor sind an derselben Stelle gescheitert und stehen hier, damit kein
vierter unternommen wird:

1. Eine Sonderregel in `buchungBearbeiten`, die bei `quelle === "import"` das Vorzeichen
   des Originals gegen die Ableitung verteidigte.
2. Ein Kästchen `gegenrichtung`, das die Ableitung umdrehte — es gab das Kästchen aber nur
   in der Hälfte der Fälle, bei importierten Zeilen also nie.
3. Das Vorzeichen im Betragsfeld selbst. Richtig gerechnet, und trotzdem zu wenig: es
   verlangt, dass man auf die Idee kommt, ein Minus zu tippen.

Die ersten beiden reparierten die FOLGEN der Ableitung, statt sie wegzunehmen — die Maske
zeigte weiter `Math.abs(betrag)`, und ein eingetipptes Minus flog mit
`betrag.groesserNull` raus. Der dritte nahm sie weg und liess die Richtung trotzdem etwas
sein, das man dem Feld ansehen muss. **Eine Wahl mit zwei sichtbaren Möglichkeiten
verlangt weder Wissen noch Vertrauen** — das ist der Unterschied, an dem die drei davor
gescheitert sind.

**Und wo ein Wort neben der Zahl steht, muss es mitwandern.** Ein negativer Verbrauch unter
der Überschrift „verbraucht" liest sich als ausgegeben, auch wenn das Minus davorsteht und
der Rest im selben Bild wächst — ein Wort gewinnt gegen ein Vorzeichen. Die Anzeigen zum
Budgetverlauf wechseln deshalb das Wort und zeigen den Betrag ohne Vorzeichen, statt beides
zu vermischen.

**Aber `Math.abs` auf einem Verbrauch ist fast immer ein Fehler.** Wo der Wert einen
Rückfluss tragen KANN, macht das Wegwerfen des Vorzeichens aus „es kam Geld zurück" ein
„es wurde genau so viel ausgegeben". Der Unterschied zum Absatz davor: dort steht ein Wort
daneben, das mitwandert; hier steht nur die Zahl. Ein Balken darf bei 0 anschlagen
(`Math.max(0, …)`), die Zahl daneben behält ihr Vorzeichen.

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

### Und seit 2026-08-28 ist es lesbar

Das Journal lief zwei Wochen mit, ohne dass es jemand zu sehen bekam. Es steht jetzt im
Buchungsdialog unter **Verlauf** — die Einträge, der Unterschied zum Stand bei der
Entstehung, und ein Weg zurück. Im Kontoauszug markiert eine Pille, zu welcher Zeile
überhaupt etwas protokolliert ist; die ist ausdrücklich **vorläufig** und dient dem
Nachsehen, solange das Journal jung ist.

| Stück | Datei |
|---|---|
| Form eines Eintrags, Unterschied, Urzustand | `src/core/buchung/journal.ts` |
| Historie laden, zurücksetzen | `src/application/buchung/buchungshistorie.ts` |
| Lesen | `src/adapters/persistence/sqliteJournalRepository.ts` |
| Anzeigen und zurücknehmen | `src/adapters/ui/buchung/JournalBlock.tsx` |

**Es gibt ZWEI Wege zurück, und sie bedeuten Verschiedenes.** Gebaut ist bislang der erste:

| | Quelle | reicht zurück bis | liefert |
|---|---|---|---|
| Stand bei Entstehung | Journal | 23.08.2026 | die Buchung, wie sie **damals** war |
| Stand des Belegs | `umsatz_roh` | den ganzen Bestand | die Buchung, wie sie **heute** entstünde |

Der zweite liefert den heutigen Kategorievorschlag, nicht den von damals — meist besser,
aber eben eine andere Aussage. Beide unter einen Knopf zu legen und je nach Verfügbarkeit
den einen oder anderen zu nehmen, ergäbe einen Knopf, der zwei Dinge tut, ohne dass man
sieht welches. Wer den zweiten baut, baut ihn daneben.

**Das Journal bleibt dabei eine Aufzeichnung und wird kein Speicher.** Der Unterschied ist
nicht akademisch, er entscheidet über das Risiko: als **Angebot** darf sich ein Rückweg
darauf stützen — fehlt der Eintrag, entfällt das Angebot, und verloren ist nichts, was
nicht ohnehin verloren wäre. Als **Pflichtweg** dürfte er es nicht: dann wäre eine Lücke im
Protokoll Datenverlust statt einer Lücke in der Nachvollziehbarkeit, es liesse sich nie
mehr aufräumen, und „nicht fälschungssicher" (siehe unten) wäre keine hingenommene Grenze
mehr, sondern ein Loch. Ein Ablauf, der einen Eintrag VORAUSSETZT, gehört nicht ans
Journal.

**Ein Umbuchungs-Bein lässt sich nicht zurücksetzen.** Ein Bein allein liefe auf einen von
zwei Zuständen hinaus, die es nicht geben darf: entweder fällt die `transferId` weg und das
Gegenbein zeigt auf ein Paar, das es nicht mehr gibt, oder sie kommt zurück und zeigt auf
ein Bein, das inzwischen einen anderen Betrag trägt. Dafür gibt es „Paarung lösen" — einen
Weg, der beide Seiten anfasst.

**Zwei Felder kommen nicht mit:** `vertrag_id` und `vertrag_herkunft` stehen zwar im
protokollierten Stand, gehören aber der Vertragszuordnung und nicht dem Ledger. Eine
Vertragszuordnung überlebt das Zurücksetzen.

Was damit möglich, aber noch nicht gebaut ist: eine **gelöschte** Buchung wieder anlegen.
Der Stand dafür steht im Journal (`letzterStand`), und es wäre der halbe Weg zum Storno
weiter unten.

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

## Konfiguration exportieren (Experiment)

Seit 2026-08-30, hinter `experiment.export`. Exportiert wird, **wie der Haushalt ORDNET,
nicht was in ihm passiert ist**: heute die Kategorien mit Baum und Charakter, später
Budgets, Verträge, Kontogruppen, Erkennungsregeln. Keine Buchungen, keine Salden, keine
Kontonummern.

Diese Grenze ist der ganze Grund, warum die Datei weitergegeben werden darf — eine Ordnung
lässt sich teilen, ein Kontoauszug nicht. `konfiguration.test.ts` hält sie als Zusicherung
fest und nicht nur als Kommentar.

| Stück | Datei |
|---|---|
| Form, Sortierung, Use-Case | `src/application/konfiguration.ts` |
| Der Port auf das Kommando | `src/adapters/persistence/export.ts` |
| Das Kommando | `src-tauri/src/export.rs` |
| Die Karte | `src/adapters/ui/einstellungen/ExportCard.tsx` |

Vier Entscheidungen, die man kennen muss:

- **Ein eigenes Kommando, kein `<a download>`.** Im WKWebView landet ein Blob-Download je
  nach Fassung nirgends oder wortlos im Papierkorb-Verzeichnis des Webviews. Ein Export,
  von dem man nicht weiss, wo er liegt, ist keiner. Dieselbe Überlegung wie beim
  Datenbankzugang.
- **Das Ziel bestimmt NICHT der Aufrufer.** Immer `<App-Datenverzeichnis>/export/`, und der
  Name muss ein einfacher Dateiname sein — derselbe Filter wie bei der Datenbankdatei. Ein
  Webview, der irgendwohin schreiben darf, ist einer, der überall hinschreiben kann.
- **Der Pfad wird angezeigt.** Ins App-Datenverzeichnis findet niemand von selbst; ein
  „fertig" ohne Ort schickt den Nutzer suchen.
- **Der Dateiname trägt den Bestand** (`konfiguration-moneymanager-dev-<tag>.json`). Echter
  Bestand und Spielstand liegen in zwei Dateien, aber im SELBEN Datenverzeichnis — der
  Identifier trennt sie nicht. Ohne die Kennung überschriebe ein Export aus der
  installierten App den des Spielstands wortlos, und von aussen sähen beide gleich aus.
- **Eltern stehen vor ihren Kindern.** Wer die Liste von oben nach unten einliest, findet
  jede Elternkategorie bereits angelegt vor. Nach Namen sortiert müsste ein Importeur
  zweimal laufen.

**Einen Import gibt es nicht**, und das ist der Grund für den Experimente-Schalter: die
schwierige Hälfte ist das Einlesen — eingelesene Kategorien treffen auf vorhandene, IDs
kollidieren, Bäume müssen zusammengeführt werden. Bis das entschieden ist, sichert die
Datei nur `fassung` zu.

## Was die App nach draussen spricht

Eine lokale Finanz-App, die still mit fremden Servern redet, ist keine lokale Finanz-App.
Es gibt deshalb genau **drei** Wege nach draussen, und zwei davon setzen ein Zutun voraus:

| Weg | wann | abschaltbar |
|---|---|---|
| Bankabruf | nur wenn jemand ihn auslöst | entfällt (er IST die Handlung) |
| Update-Prüfung | beim Start, still | ja (`aktualisierungPruefen`) |
| sonst | — | — |

Die dritte Zeile ist leer, und das wird von `src/absicherung.test.ts` durchgesetzt.

**Bis 2026-08-25 stimmte das nicht.** Die Schrift kam über ein `@import` von einem
Schriften-Dienst — ein Netzzugriff bei jedem Start, bei dem der Betreiber IP und Zeitpunkt
sieht. Die Behauptung weiter unten, die Update-Prüfung sei der erste ungefragte
Netzzugriff, war damit falsch. Sie ist es erst, seit die Schrift im Bündel liegt
(`@fontsource-variable/hanken-grotesk`).

### Die CSP ist die Sperre, nicht die Absicht

`app.security.csp` in `tauri.conf.json` erlaubt nur `'self'` und den Tauri-IPC. Das
schützt nicht gegen einen Angreifer am Schreibtisch, sondern gegen den realistischen Fall:
eine **Abhängigkeit**, die eines Tages etwas mitbringt, das niemand bestellt hat. Der
Webview hat über `sql:allow-execute` Vollzugriff auf den Bestand — lesen kann fremder Code
also alles. Was die CSP nimmt, ist der Rückweg: **fortschaffen kann er nichts.**

Drei Dinge, die man dabei wissen muss:

- **Der Bankabruf ist davon unberührt.** Er läuft über `tauri-plugin-http` durch Rust
  (`adapters/fints/transport.ts` legt einen Umleiter über `globalThis.fetch`), also am
  Webview vorbei. Die CSP sieht ihn nie; begrenzt wird er von den Capabilities.
- **`devCsp` ist getrennt und lockerer.** Vite und React-Refresh spritzen ihre Skripte
  inline ein; ohne `'unsafe-inline'` startet der Dev-Modus nicht. Die ausgelieferte
  Fassung hat es ausdrücklich nicht, und der Wächter hält das auseinander.
- **Eine Schrift aus dem Netz würde die CSP entwerten**, nicht nur ergänzen. Wer einen
  fremden Host in `font-src` und `style-src` erlauben muss, hat einen Kanal, über den sich
  Daten in einer URL hinaustragen lassen. Deshalb prüft der Wächter beides zusammen: die
  CSP und dass keine CSS-Datei etwas nachlädt. Eine CSP mit diesem Loch beruhigt, ohne zu
  wirken — und ein Wächter, der nichts sieht, ist schlimmer als keiner.

### Was die CSP NICHT leistet

Sie hindert fremden Code nicht am **Lesen**, und sie greift nicht gegen jemanden, der als
du auf dieser Maschine läuft. Dagegen hülfe nur eine verschlüsselte Datenbank mit
Passphrase — die lohnt sich, sobald ein Bestand die Maschine verlässt (Cloud, Sync), und
solange er das nicht tut, deckt FileVault dasselbe Szenario ab.

Gegen einen **anderen Account** auf derselben Maschine greift dagegen etwas Billigeres,
und das ist seit 2026-08-26 eingebaut: die App setzt beim Start ihre `umask` auf 0077 und
zieht vorhandene Datenbankdateien auf 0600 (`src-tauri/src/dateirechte.rs`). Vorher
entstand der Bestand mit `-rw-r--r--` und war für jeden Nutzer des Rechners lesbar. Die
`umask` ist dabei die eigentliche Massnahme, nicht das `chmod`: SQLite legt `-wal` und
`-shm` bei jedem Öffnen neu an, und sie entstünden sonst wieder offen. Auf Windows greift
weder das eine noch das andere — dort deckt die Rechteverwaltung des Nutzerprofils den
Fall ab.

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
npm run dev         # nur Frontend (Webview ohne SQLite-Plugin — hat keine Daten)
npm test            # Vitest: Kern, Use-Cases, Repositories, UI, Schichtgrenzen
npm run test:rust   # die wenigen Rust-Tests der Shell (Dateirechte) — laufen NICHT in `npm test`
npm run coverage    # dito + Coverage über das GESAMTE Projekt (Ziel: 90 %)
npm run typecheck
npm run build       # tsc + vite build; die CI prüft dasselbe in zwei Schritten
npm run seed        # Spielstand für die Entwicklung neu schreiben (siehe unten)
npm run installieren # macOS: bauen und nach /Applications installieren
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

**Ausgeliefert wird über ein GitHub-Release, eingespielt über den Updater in der App.** Ein
Tag `v*` löst `.github/workflows/release.yml` aus; der Workflow baut, signiert für den
Updater, legt das Release an und hängt Archiv, DMG und das Update-Manifest daran. Die laufende
App fragt beim Start die Datei latest.json unter releases/latest/download ab und bietet
den Knopf an.

Bis zum 28.08.2026 stand hier das Gegenteil („es gibt keinen Release-Weg"), und das war seit
`v0.16.0` schlicht überholt — die Doku beschrieb eine Welt, die es nicht mehr gab, und der
Abschnitt weiter unten beschrieb daneben die richtige. Wer beide las, konnte sich aussuchen,
was gilt.

**Lokal gebaut wird nicht mehr.** `npm run installieren` gibt es weiterhin und es
funktioniert; als Auslieferungsweg ist es abgelöst. Das ist keine Kleinigkeit, sondern die
Voraussetzung dafür, dass der Weg überhaupt geprüft wird: ein Release, das nur im Notfall
benutzt wird, ist beim nächsten Notfall kaputt. Und es hat eine Folge, die weiter unten
zuschlägt — ein Wächter, der das Release blockiert, blockiert damit alles.

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

Der Weg selbst steht: `tauri-plugin-updater` (auf Linux ausschliesslich mit AppImage), der
Signaturschlüssel, der Workflow mit `VITE_FINTS_PRODUKT_ID` als Repository-Secret. Der
Secret-Weg ist dabei nicht
Geheimniskrämerei, sondern die **Produktgrenze**: ein Fork ist laut DK-Bedingungen ein
anderes Produkt und hat das Secret nicht — sein Build läuft ohne Nummer und wird damit zur
eigenen Registrierung geschoben, statt still unter unserem Namen zu laufen.

### Der Update-Knopf

Die App prüft beim Start still nach. Ist nichts da, verändert sich nichts — kein Hinweis,
kein Haken, keine Meldung. Ist etwas da, erscheint **unten links in der Seitenleiste**,
neben Version und Stadium, ein Knopf; ein Klick lädt, installiert und startet neu.

Der Ort ist nicht beliebig: dort steht schon, welche Version läuft. „0.19.0" und „0.20.0
installieren" beantworten dieselbe Frage.

**Bei schmalem Fenster steht er allein.** Die Seitenleiste klappt unter 1100 px auf ihre
Icons zusammen, und Version und Stadium fallen dabei weg — das Nebeneinander, das den Ort
begründet, also auch. Der Knopf bleibt trotzdem, als Icon mit `title`. Er ist das einzige
Stück der Fusszeile, das schmal überlebt, und daran hängt eine Regel, die über diesen Fall
hinausgeht: **Auskunft darf weichen, eine Handlung nicht.** Ein Update, von dem niemand
erfährt, ist keines.

**Ein Fehlschlag beim PRÜFEN ist kein Fehler.** Kein Netz, Endpunkt weg, Antwort kaputt —
in allen Fällen lautet die Antwort „nichts Neues". Ein Haushalt, der Ausgaben eintragen
will, hat mit einer Updater-Fehlermeldung nichts zu tun; sie wäre Beunruhigung ohne
Handlungsmöglichkeit. Beim **Einspielen** dreht sich das um: dort hat jemand geklickt und
wartet, und ein Fehler gehört ihm gesagt.

**Die Prüfung ist der erste Netzzugriff, den die App von sich aus macht.** Bisher sprach
sie nur nach draussen, wenn jemand einen Bankabruf auslöste. Deshalb ist sie abschaltbar
(`aktualisierungPruefen` in `einstellung`); ohne Zutun ist sie an, denn ein Update, von
dem niemand erfährt, ist keines.

Der Schalter dafür steht seit 2026-08-25 unter **Einstellungen → Aktualisierung**, in
einem eigenen Register und nicht bei den Experimenten: die Prüfung ist keins, sie ist an,
und der Grund für den Schalter — der einzige ungefragte Netzzugriff — gehört
daneben geschrieben statt in eine Fussnote. Ein fehlender Schlüssel heisst dabei „nie
entschieden" und nicht „abgelehnt", weshalb das Kästchen ohne Zeile in der Tabelle
angehakt ist.

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

Mechanismus, Workflow und Releases stehen. Offen ist:

- **Das Apple-Zertifikat** und die sechs Secrets dazu. Ohne sie wird unsigniert
  ausgeliefert, und das Release sagt es (siehe unten). Die drei anderen Secrets liegen:
  `TAURI_SIGNING_PRIVATE_KEY`, dessen Passwort und `FINTS_PRODUKT_ID`.
- **Ob Linux und Windows wirklich bauen.** Der Workflow baut sie seit dem 28.08.2026, aber
  es hat vorher nie jemand versucht — die CI baut Rust absichtlich nicht. Der wahrscheinlichste
  Stolperstein ist Windows: SQLCipher zieht OpenSSL mit
  (`bundled-sqlcipher-vendored-openssl`), und dessen Bauweg braucht dort Perl und NASM.

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

### Der Bestand liegt verschlüsselt

Seit 2026-08-27. **Die Einrichtung ist nicht abzulehnen** — beim ersten Start, egal ob
neuer Nutzer oder vorhandener Bestand. Es gibt kein „später" und kein „ohne
Verschlüsselung": wer beim ersten Start unter Zeitdruck steht, klickt genau das weg und
legt dann für immer offen ab, ohne es je wieder zu bemerken.

**Die Passphrase ist nicht der Schlüssel, sie wickelt ihn ein.** Ein gewürfelter
Datenschlüssel verschlüsselt die Datenbank; er selbst liegt, mit einem aus der Passphrase
abgeleiteten Schlüssel verschlüsselt, in `<name>.schluessel.json` daneben. Der Umweg
kostet eine Datei und leistet zweierlei, was direkt nicht ginge: die Passphrase zu
wechseln dauert Sekunden statt einer Neuverschlüsselung des Bestands, und ein
**Wiederherstellungscode** ist überhaupt erst möglich — er IST der Datenschlüssel in
lesbarer Form.

| Stück | Datei |
|---|---|
| Schlüssel, Hülle, Wiederherstellungscode | `src-tauri/src/schluessel.rs` |
| Einrichten, Entsperren, Überführen | `src-tauri/src/zugang.rs` |
| Der Pool mit `PRAGMA key` | `src-tauri/src/datenbank.rs` |
| Nachweis, dass wirklich verschlüsselt wird | `src-tauri/src/krypto.rs` |
| Das Tor | `src/adapters/ui/zugang/` |

Fünf Dinge, die man wissen muss:

- **`PRAGMA key` gilt pro Verbindung**, und es muss als ERSTES kommen. Deshalb steht es in
  den Verbindungsoptionen und nicht in `after_connect`: dieser Haken läuft nach sqlx'
  eigenen Pragmas, und `journal_mode` liest den Dateikopf. Bei einer verschlüsselten
  Datenbank scheitert das mit „file is not a database" — einer Meldung, die nach kaputtem
  Bestand aussieht statt nach fehlendem Schlüssel.
- **Ein Pool lässt sich auch mit falschem Schlüssel anlegen.** Erst die erste echte
  Abfrage fällt um. `datenbank_oeffnen` prüft deshalb mit einem Zugriff, statt einen
  Erfolg zu melden und die App mit leeren Screens dastehen zu lassen.
- **Die Überführung ist so gelegt, dass es keinen Moment gibt, in dem beide Fassungen
  unbrauchbar sind:** sichern, daneben schreiben, nachweisen dass es heil ist, erst dann
  die alte wegwerfen. Bricht es vorher ab, steht der Altbestand unberührt da.
- **Die Sicherungen aus der Klartext-Zeit werden dabei weggeworfen** — geprüft am
  Dateikopf, nicht am Namen. Sie liegen zu lassen hiesse, den ganzen Aufwand durch die
  Hintertür wieder aufzugeben.
- **Aber nur die im Ordner `sicherungen/`.** `alte_sicherungen_wegwerfen` schaut genau
  dort; was von Hand daneben ins Datenverzeichnis gelegt wurde (`.bak-…`, `.vor-…`), sieht
  die Überführung nie und bleibt im Klartext liegen. Das ist die unangenehmere Hälfte:
  solche Kopien entstehen aus Sorgfalt vor einem riskanten Schritt, und danach denkt
  niemand mehr an sie.
- **Eine vergessene Passphrase nimmt auch das Jahresarchiv mit.** `VACUUM INTO` schreibt
  mit dem Schlüssel der offenen Verbindung; alle Sicherungen sind damit verschlüsselt.
  Deshalb ist der Wiederherstellungscode Pflicht und nicht Komfort.

**Was es NICHT leistet:** gegen Schadcode, der als der Nutzer läuft, während die App
offen ist, wirkt es nicht — der Schlüssel liegt dann im selben Speicher. Das ist Fall D
aus dem Bedrohungsmodell und bleibt Sache von CSP und Capabilities.

Die **Zeitsperre** (Einstellungen → Verschlüsselung, Vorgabe 15 Minuten, abschaltbar)
deckt den Fall ab, den weder Dateirechte noch Verschlüsselung erreichen: jemand setzt
sich an den entsperrten Rechner. Aus demselben Grund ist der Wiederherstellungscode dort
nur gegen die Passphrase einzusehen — läge er offen, wäre die Sperre umsonst.

### Die App sichert sich selbst, gestaffelt

Beim Start legt die App eine Sicherung des Tages an — **vor den Migrationen**, und das ist
der ganze Punkt: der Fall, für den es Sicherungen gibt, ist eine Schemaänderung, die
schiefgeht. Danach zu sichern hiesse, den kaputten Stand zu sichern.

| | |
|---|---|
| wo | `<App-Datenverzeichnis>/sicherungen/<name>-<YYYY-MM-DD>.db` |
| wie | `VACUUM INTO` — **nicht kopieren** |
| wann | beim Start, höchstens eine je Kalendertag |
| wie viele | 7 täglich · 4 wöchentlich · 3 monatlich · 2 quartalsweise · 2 halbjährlich · **jährlich ohne Ende** |

Vier Dinge, die man wissen muss:

- **`VACUUM INTO` statt Kopieren, weil eine Kopie das WAL nicht mitnimmt.** Die jüngsten
  Schreibvorgänge stehen dort und nicht in der Hauptdatei; die Kopie sähe vollständig aus
  und wäre es nicht — das merkt man erst beim Wiederherstellen.
- **Eine vorhandene Sicherung wird nicht überschrieben.** Wer die App am selben Tag zum
  dritten Mal startet, behält den Stand von heute früh: der ist der, in dem eine inzwischen
  kaputtgegangene Änderung noch nicht steckt.
- **Eine Stufe zählt vorhandene Stände, keine Kalendereinheiten.** „Vier wöchentlich"
  heisst: die vier jüngsten Sieben-Tage-Blöcke, in denen es eine Sicherung GIBT. Sonst
  bliebe von einem, der die App wochenlang nicht startet, gar nichts übrig — und genau der
  braucht seine alten Stände am dringendsten.
- **Ein Fehlschlag hält den Start nicht auf.** Wer die App öffnet, will seine Ausgaben
  sehen; dieselbe Abwägung wie bei der Update-Prüfung.
- **Die Zahlen folgen einer Regel, nicht dem Geschmack:** jede Stufe reicht genau so weit,
  wie die nächstgröbere ihre Schrittweite hat — sieben Tage bis zur Woche, vier Wochen bis
  zum Monat, drei Monate bis zum Quartal, zwei Quartale bis zum Halbjahr, zwei Halbjahre
  bis zum Jahr. Quartal und Halbjahr sind dabei kein Zierrat: ohne sie müsste die
  Monatsstufe das ganze Jahr überbrücken (zwölf Stände statt drei).

**Die Jahresstufe läuft nie aus, und das ist der wichtigste Teil.** Eine Sicherung enthält
immer den GANZEN Bestand — alte Stände tragen also keine Buchung, die der neueste nicht
auch hätte. Was sie tragen, ist der Stand, BEVOR etwas verschwand: eine versehentliche
Löschung, eine Migration, die wegnimmt (im Alpha-Stadium ausdrücklich erlaubt), ein Fehler,
den niemand bemerkt hat.

Solange die Bank die Umsätze noch führt, ist so etwas ärgerlich und behebbar — man ruft sie
neu ab. Genau das hört aber auf: Institute halten Umsätze eine begrenzte Zeit vor, danach
ist dieser Bestand die einzige Stelle, an der die Jahre davor noch stehen. Ab dann wäre
eine weggeworfene Jahressicherung nicht ein verlorener Wiederherstellungspunkt, sondern ein
verlorenes Jahr. Der Preis ist eine Datei pro Jahr — gemessen daran der billigste Posten in
diesem Projekt.

Wo was liegt: die Staffelung in `src/core/sicherung/rotation.ts` (rein, ohne Uhr), der
Use-Case in `src/application/sicherung.ts`, das Dateisystem in
`src-tauri/src/sicherung.rs`.

**Wenn der Bestand einmal verschlüsselt ist, sind es die Sicherungen mit** — `VACUUM INTO`
schreibt mit dem Schlüssel der offenen Verbindung. Das ist bequem und hat eine Kehrseite,
die in das Recovery-Konzept gehört: eine vergessene Passphrase nimmt die Sicherungen mit.

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

**Ein laufender Prozess beweist nichts.** Die App kommt auch hoch, wenn die Datenbank
nicht aufgeht — sie zeigt dann leere Screens, und im Log steht nichts. Der billige Beweis
ist die Tagessicherung: die von heute löschen, App starten, und wenn sie neu entsteht, ist
die Datenbank geöffnet und die Migrationen sind gelaufen. Dasselbe gilt für `pgrep` — dass
ein Prozess da ist, sagt über den Zustand dahinter nichts.

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

### Signierung: zwei Signaturen, die nichts miteinander zu tun haben

Sie werden regelmässig verwechselt, und die Verwechslung führt zu falschen Schlüssen:

| | wofür | Stand |
|---|---|---|
| **minisign** (Updater) | verhindert, dass jemand ein Update unterschiebt | liegt, Secret hinterlegt |
| **Apple** (Gatekeeper) | erlaubt, einen **frischen Download** zu starten | fehlt |

**Eine bereits laufende App aktualisiert sich auch ohne Apple-Signatur** — Gatekeeper prüft
eine App, die einmal starten durfte, nicht erneut. Die Apple-Signatur zählt für den, der auf
der Releases-Seite landet und zum ersten Mal herunterlädt. Ohne die minisign-Signatur
dagegen bricht schon der Build ab, und das setzt Tauri selbst durch.

Der Release-Workflow reicht **sechs Apple-Secrets** durch (`APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`,
`APPLE_TEAM_ID`). Sobald sie hinterlegt sind, signiert und notarisiert `tauri-action` von
selbst — es braucht keine Änderung am Workflow mehr. **Signierung allein genügt nicht:**
Gatekeeper verlangt bei einem geladenen Bundle auch die Notarisierung, dafür sind die
letzten drei da. `APPLE_PASSWORD` ist ein app-spezifisches Kennwort, nie das echte.

#### Der Türsteher, und warum er eine Weiche geworden ist

Vom 26. bis zum 28.08.2026 **brach der Workflow ab**, wenn die Apple-Secrets fehlten —
bevor irgendetwas gebaut wurde. Der Gedanke war richtig und ist es weiterhin: `tauri-action`
baut sonst klaglos ein unsigniertes Bundle und hängt es an ein öffentliches Release, und ein
Zertifikat kann man nachreichen, ein Release nicht zurückholen.

Seine Begründung stand im Workflow und nannte die Tür, die offen bleibt: *„Der LOKALE Weg
ist davon unberührt — wer auf der eigenen Maschine baut und dort installiert, weiss, was er
tut."* **Genau diese Tür ist zu**, seit lokal nicht mehr gebaut wird (siehe oben). Damit
blockierte er nicht mehr das Riskante, sondern das Einzige — und ein Wächter, der jede
Auslieferung verhindert, wird abgeschaltet statt umgangen. Das ist dieselbe Überlegung, aus
der jeder Hook hier ein `--no-verify` hat.

**Was von ihm bleibt, ist der wertvollere Teil: der Release-Text sagt die Wahrheit über den
Signierungsstand.** Der Schritt prüft weiterhin die vier Secrets, bricht aber nicht mehr ab,
sondern baut daraus den Text:

| Secrets da | Release-Text |
|---|---|
| ja | „Signiert und notarisiert." |
| nein | was macOS melden wird, die `xattr`-Zeile, und dass ein installierter Moneymanager sie nicht braucht |

Der Schaden, um den es wirklich geht, ist nicht das unsignierte Bundle — es ist ein
unsigniertes Bundle unter der Zeile „Signiert und notarisiert". Ein Release, dem man
ansieht, dass es unsigniert ist, ist ehrlich; ein Literal im Workflow wäre genau dann
falsch, wenn es darauf ankommt. Deshalb ist `releaseBody` kein fester Text mehr, sondern
die Ausgabe des Schritts.

**Die `xattr`-Anleitung ist damit zurück, aber nur im unsignierten Zweig.** Sie wegzulassen
macht das Bundle nicht sicherer; es macht den Fehlschlag unerklärlich — macOS meldet
„beschädigt", und wer die App nicht selbst gebaut hat, hat keine Handhabe. Sobald das
Zertifikat da ist, verschwindet sie von selbst, ohne dass jemand daran denken muss.

### Drei Plattformen aus einem Workflow

Seit dem 28.08.2026 baut der Release-Workflow eine **Matrix** statt eines Jobs. Cross-Compile
gibt es bei Tauri nicht — jede Plattform braucht ihren eigenen Läufer:

| | Läufer | Bundle | signiert |
|---|---|---|---|
| macOS | `macos-latest` (arm64) | `app`, `dmg` | sobald das Zertifikat da ist |
| Linux | `ubuntu-22.04` | `appimage` | braucht es nicht |
| Windows | `windows-latest` | `nsis` | nein — SmartScreen meldet einen unbekannten Herausgeber |

Vier Entscheidungen darin, die man nicht anfassen sollte, ohne den Grund zu kennen:

- **`max-parallel: 1`, und das ist Pflicht, keine Vorsicht.** Die Datei latest.json trägt
  alle Plattformen zusammen, und tauri-action baut sie als READ-MODIFY-WRITE: es lädt die
  vorhandene vom Release, übernimmt ihre `platforms` und schreibt die eigene dazu
  (nachgesehen im Quelltext von tauri-action, Datei upload-version-json.ts, beim
  gepinnten SHA — auch nach dem Sprung auf 1.0.0 noch). Zwei Jobs, die
  gleichzeitig lesen, sehen denselben Stand — der zweite überschreibt den Eintrag des
  ersten. Der Fehlschlag ist **still**: die verlorene Plattform bekommt vom Updater
  „nichts Neues" statt eines Fehlers.
- **Der Release-Text kommt vom ersten Job — und seit tauri-action 1.0.0 auch von jedem
  weiteren.** Bis v0 setzte die Action Titel und Text nur beim ANLEGEN des Releases und
  liess ein vorgefundenes unberührt; jetzt schreibt jeder Job beides neu. Am Ergebnis
  ändert das nichts, weil alle drei Läufer denselben Text ausrechnen. Es ändert die
  **Fehlerform**: scherte früher ein Läufer aus, gewann trotzdem der erste Job, heute
  gewinnt der letzte. Deshalb steht macOS weiterhin oben, und deshalb ist `shell: bash`
  am Textschritt wichtiger geworden als vorher.
- **`shell: bash` am Textschritt.** Ohne ihn nimmt GitHub auf Windows PowerShell, und das
  Skript stirbt an der ersten Zeile. Ein Schritt, der auf zwei von drei Läufern
  funktioniert, fällt erst im Release auf.
- **Linux liefert NUR ein AppImage.** Ein `.deb` kann sich nicht selbst austauschen, der
  Updater könnte es nie ersetzen — es läge im Release und sähe aus wie ein Weg, der keiner
  ist. Und `ubuntu-22.04` statt `latest`, weil ein AppImage nur auf Systemen mit
  mindestens seiner Bau-glibc läuft: die älteste unterstützte Umgebung ist hier die
  richtige, nicht die neueste.

`bundle.targets` in `tauri.conf.json` bleibt auf `"all"` — das ist die Vorgabe für einen
Bau von Hand. Eingegrenzt wird im Workflow über `--bundles`.

#### Ein leeres Secret ist nicht dasselbe wie kein Secret

Die Falle, die den ersten Lauf von 0.23.0 gekostet hat, und sie kostet sechseinhalb
Minuten, bevor sie sich zeigt: **ein fehlendes Secret wird in einem `env:`-Block zum leeren
String, und GitHub setzt die Variable trotzdem.** Tauri prüft „ist gesetzt", nicht „hat
Inhalt", versucht ein `security import` mit nichts und bricht beim Bündeln ab —
`SecKeychainItemImport: One or more parameters ... not valid`. Der Build davor läuft
vollständig durch.

Die sechs `APPLE_*`-Variablen entstehen deshalb über `GITHUB_ENV` und nur im signierten
Zweig. Im `env:`-Block gibt es keine Möglichkeit, einen Schlüssel WEGZULASSEN — nur, ihn
leer zu setzen, und genau das ist der Fehler.

**Zwei Tage lang war das unsichtbar**, weil der Türsteher davor abbrach: die eine Änderung
hat den Fehler der anderen verdeckt. Beide kamen im selben Schritt herein. Das ist der
allgemeine Teil daran — ein Wächter, der einen Weg sperrt, prüft den Weg dahinter nicht
mehr, und was dort verrottet, merkt niemand.

`src/auslieferung.test.ts` hält drei Dinge fest: dass der Text BERECHNET wird und nicht
behauptet, dass beide Zweige dastehen, und dass keine `APPLE_*`-Variable wieder direkt aus
ihrem Secret gesetzt wird.

**Was das Zertifikat kostet und einbringt:** Apple Developer Program, jährlich. Danach
laufen beide Wege — der Updater wie bisher, und zusätzlich kann jemand die App frisch
herunterladen und starten. Der Weg dorthin ist ein `gh run rerun` auf den bestehenden Tag,
keine Tag-Chirurgie.

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

**Der frische Spielstand ist unverschlüsselt, und sein Zugang wird mit abgeräumt.** Der
Seed schreibt über sql.js, kennt also kein SQLCipher; verschlüsselt wird die Datei erst,
wenn die App sie beim nächsten Start vorfindet und durch die Einrichtung führt. Die
Passphrase ist dabei frei wählbar (es ist der Spielstand), der Wiederherstellungscode
wird gewürfelt und einmal angezeigt.

Damit das überhaupt passiert, löscht das Skript die Schlüsselhülle `<name>.schluessel.json`
mit — und die Sicherungen dieses Spielstands, die mit dem alten Datenschlüssel geschrieben
sind und danach niemand mehr aufbekäme. **Ohne dieses Abräumen wäre der frische Spielstand
nicht zu öffnen:** `zugang_stand` meldet „eingerichtet", sobald eine Hülle daliegt, die App
verlangt dann eine Passphrase, packt den ALTEN Schlüssel aus und setzt ihn per `PRAGMA key`
auf eine Klartext-Datei. Die Meldung lautet „file is not a database" und sieht nach
kaputtem Bestand aus statt nach falschem Schlüssel.

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
| `src/adapters/ui/CLAUDE.md` | `useGeld`, `Promise.all`, i18n, Screen-Tests, Base UI, die einklappbare Seitenleiste |
| `src/adapters/ui/bausteine/CLAUDE.md` | was geteilt wird und was nicht |

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
  Wert entscheiden, ob er verfügbar ist. Bislang trennt die Klasse **nur** das; was Rücklage
  und Vorsorge sonst unterscheiden soll, ist offen.

- **Eine Kontogruppe ist eine SICHT, die Klasse eine RECHENREGEL.** Das ist der Unterschied,
  an dem sonst eine zweite Wahrheit entsteht. Die Klasse entscheidet mit — nur `liquide`
  zählt zu den liquiden Mitteln — und ein Konto hat genau eine. Eine Gruppe
  (`core/konten/gruppe.ts`, Tabellen `kontogruppe` + `kontogruppe_konto`) heißt, wie der
  Nutzer sie nennt, bündelt beliebig viele Konten und entscheidet **nichts**; dasselbe Konto
  darf in mehreren liegen, und genau dafür gibt es sie neben der Klasse. Wer eine Gruppe je
  eine Rechnung tragen lässt („Gruppe X zählt als liquide"), hat zwei Felder, die dasselbe
  verschieden sagen — und der Widerspruch fällt erst auf, wenn eine Summe nicht mehr aufgeht.

  Was für eine Gruppe trotzdem gilt, weil es für jede Auswahl von Konten gilt: **Saldo und
  Buchungen filtern mit derselben Liste.** Sonst zeigt ein Verlauf einen Stand, den es nie
  gab.

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

Der Muster-Guard findet davon nur die Beträge. Der Rest ist Handarbeit — dieselbe Art wie
bei Regel 2 und 3 der Testdaten.

### Der Wert-Abgleich ist weg, und was das kostet

Bis zum 30.08.2026 gab es einen zweiten Wächter: er las den **echten Bestand** zur Laufzeit
und suchte dessen Werte im Arbeitsbaum und in den ausgehenden Commit-Texten. Er hat
gefunden, wofür er gebaut war — eine IBAN in zwei Import-Tests, Kontostände in Kommentaren,
eine mit der eigenen Miete begründete Toleranz im Monatsausblick.

**Er ist ausgebaut, und der Grund ist nicht Bequemlichkeit.** Seit der Bestand verschlüsselt
ist, kam er nur noch über den **Datenschlüssel** an seine Werte — als Wiederherstellungscode
im Klartext neben der Datenbank. Ein Wächter, der einen Generalschlüssel verlangt, nimmt der
Verschlüsselung genau das, wofür sie gebaut wurde. Und fehlte die Datei, war `npm test` rot
und **jeder** Push blockiert; das traf nicht nur den frischen Klon, sondern auch den
Rechner, auf dem die Verschlüsselung eingeführt wurde, dort in dem Moment, in dem sie
griff — und still, denn ein Push, der nicht stattfindet, sieht aus wie ein Tag ohne Push.

Dazu ist seine Voraussetzung entfallen: es liegen **keine Echtdaten im Rohformat** mehr in
der Entwicklung, und der Spielstand (`npm run seed`) ist eine eigene Umgebung mit
erfundenen Daten.

**Was damit ungeprüft bleibt, und das ist der ehrliche Teil:** alles, was keiner Form folgt
— ein Empfängername, ein Verwendungszweck, eine Buchungszahl, ein Kontostand in Prosa. Der
Muster-Guard kennt Formen, nicht Werte. Wer so etwas benennen kann, trägt es in
`.privacy-terms` ein (git-ignoriert, Vorlage `.privacy-terms.example`); dort greift der
Muster-Guard es wieder auf. Der Rest ist Handarbeit — dieselbe Art wie bei der
Anonymisierung, die ohnehin nie ein Wächter leisten konnte.

**Das Werkzeug `bestandslesen` bleibt** (`src-tauri/src/bin/bestandslesen.rs`). Es ist der
einzige Weg, den verschlüsselten Bestand von der Kommandozeile zu lesen, und dafür gibt es
gute Gründe — einen Datenbug nachsehen statt raten. Der Unterschied zu vorher ist
entscheidend: `~/.moneymanager-schluessel/entwicklung.code` ist jetzt **optional**. Wer sie
anlegt, tut es bewusst und für eine Sitzung; kein Testlauf und kein Push verlangt sie mehr.

```bash
cargo build --manifest-path src-tauri/Cargo.toml --bin bestandslesen
./src-tauri/target/debug/bestandslesen "$DB" "SELECT …"
```

### Was der Muster-Guard findet

**Der Muster-Guard** (`scripts/privacy-guard.mjs`) kennt die Formen: IBAN, SEPA-Gläubiger-ID,
Token, E-Mail, Produkt-ID, Beträge in Prosa, verbotene Dateitypen. Er findet auch, was
**nicht aus deiner Datenbank stammt** — genau die Lücke, durch die einmal eine Kontonummer
aus einem FinTS-Mitschnitt gerutscht ist (siehe „Mitgelieferte Skills"). Er läuft in
`npm test` und an allen drei Hook-Zeitpunkten.

Daneben steht in `src/privatsphaere.test.ts` noch **ein** Testfall, und er ist der einzige
dort, der ohne Datenbank auskommt: keine IBAN im Repo darf die Bankleitzahl einer echten
Bank tragen, geprüft gegen die DK-Liste. Er braucht kein Urteil und keinen Schlüssel —
deshalb hat er den Ausbau überlebt.

Zwei Entscheidungen im Muster-Guard, die man kennen muss:

- **IBANs werden gegen die DK-Bankenliste im Repo geprüft**, nicht gegen den 9999er-Präfix
  aus `src/CLAUDE.md`. Der Präfix war immer nur eine Faustregel für die eigentliche
  Anforderung: die IBAN darf zu keinem echten Konto gehören können. Eine erfundene BLZ
  ausserhalb des 9999er-Bereichs geht deshalb durch.
- **Beträge prüft er nur in PROSA** (Markdown, Commit-Nachrichten), nicht im Code. In einer
  Finanz-App steht in jedem zweiten Test ein Betrag, und ein Muster kann den abgelesenen
  nicht vom erfundenen trennen. Dafür war der Wert-Abgleich da; seit er weg ist, ist ein
  abgelesener Betrag im CODE ungeprüft — das ist die grösste Lücke, die sein Ausbau
  hinterlässt, und sie fällt in die Handarbeit. In Prosa dreht sich das um: dort steht ein
  Betrag fast nie als Beispiel, sondern als Beleg.

Einzelfall freigeben: `privacy-ok` in dieselbe Zeile. Namen und Begriffe, die keinem Muster
folgen, kommen in `.privacy-terms` (git-ignoriert, Vorlage: `.privacy-terms.example`).

### Was er nicht kann

- Er findet nur den **Originalwert**. Ob ein Ersatz neutral ist, sieht er nicht.
- Er findet nur, was einer **Form** folgt. Namen, Verwendungszwecke und Buchungszahlen
  gehören in `.privacy-terms`, sonst sieht sie niemand.
- Er bricht ab, wenn er nicht arbeiten kann — kaputter Guard, fehlende Bankenliste. Ein
  Wächter, der nichts sieht, ist schlimmer als keiner: er beruhigt.
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

## Die Lieferkette

Vier Wächter in der CI (`.github/workflows/ci.yml`), und sie finden verschiedene Dinge:

| | prüft | wo konfiguriert |
|---|---|---|
| `npm audit --omit=dev --audit-level=high` | **bekannte Lücken**, npm-Seite | Flags im Workflow |
| `cargo-deny check advisories sources` | **bekannte Lücken**, Rust-Seite | `deny.toml` |
| `npm audit signatures` | **Herkunft**: kam das Paket wirklich von der Registry | — |
| `scripts/install-skripte-pruefen.mjs` | **Ausführung beim Installieren** | `allowScripts` in `package.json` |

Die dritte und vierte Zeile fangen etwas anderes als die ersten beiden: nicht „bekannte
Lücke", sondern „untergeschoben" bzw. „läuft ungefragt". **Der vierte ist der wichtigste**
— ein `postinstall` läuft mit den Rechten dessen, der `npm ci` tippt, vor jedem Test und
in jeder CI. Eine Lücke IM Code muss erst erreicht werden; ein Install-Skript läuft von
selbst.

**Warum dort eine Allowlist steht und kein `ignore-scripts=true`:** gemessen, nicht
vermutet — ein globales Verbot bricht den Build. `lib-fints` kommt aus einem
Git-Repository und wird beim Installieren über sein `prepare`-Skript gebaut; ohne das
fehlt sein `dist/`, und Vite bricht mit „failed to resolve import" ab. Ein Verbot, das
den Build kostet, wird abgeschaltet. Freigeben mit `npm install-scripts approve <paket>`,
und der Moment der Freigabe ist die Gelegenheit hinzusehen.

**Der Wochenlauf ist kein Beiwerk.** Beide Advisory-Datenbanken ändern sich ohne unser
Zutun: eine Schwachstelle wird gemeldet, während hier niemand etwas tippt. Ein Lauf, der
nur bei Push startet, findet sie erst beim nächsten Commit — bei einem Solo-Projekt
können das Wochen sein.

**Die Actions hängen an Commit-SHAs**, nicht an Tags. Ein Tag ist beweglich; wer ihn
kontrolliert, führt Code in unserer CI aus, und die hat das Signaturgeheimnis. Der Preis:
SHAs altern stumm — deshalb steht `github-actions` in `.github/dependabot.yml`, das sie
hebt und den Tag als Kommentar dahinterschreibt.

Der Rust-Wächter läuft als **eigener Job, der nichts baut** — `cargo-deny` liest nur
`Cargo.lock` und die RustSec-Datenbank. Damit bleibt die Entscheidung bestehen, den
schweren Tauri-Build aus der CI herauszuhalten.

**Und weil dieser Job nichts baut, sagt er über einen Rust-Vorschlag weniger, als sein
grüner Haken vermuten lässt.** `app` baut ausschliesslich das Frontend, `lieferkette` liest
nur den Lockfile — ein Dependabot-PR auf eine Rust-Kiste ist also grün, ohne dass je ein
Compiler auf ihn gesehen hat. Genau daran ist ein Vorschlag schon aufgelaufen: die
Versionszeile stimmte, der Aufruf im Code war seit dem Major weg. **Eine Rust-Abhängigkeit
wird deshalb lokal gebaut, bevor sie hereinkommt** — `cargo build --bins --lib` dauert im warmen
Cache Sekunden. Das ist keine Nachlässigkeit der CI, sondern der Preis der Entscheidung,
den schweren Build draussen zu lassen; er ist es weiterhin wert, aber er wird hier bezahlt.

Der Wächter über die Vorschläge selbst ist `src/lieferkette.test.ts`: er hält fest, dass es
alle drei Ökosysteme gibt und dass **jedes** auf `develop` zielt. Der Fehler entsteht nicht
beim Ändern der Datei, sondern beim Ergänzen eines vierten Eintrags.

Drei Dinge, die man beim Kalibrieren wissen muss, weil sie sonst zu Dauerrot führen —
und ein Wächter, der bei jedem Lauf dasselbe meldet, wird abgeschaltet statt gelesen:

- **`unmaintained` gilt nur für den Workspace.** Sonst fällt bei jedem Lauf halb Tauri
  an: die GTK3-Bindings, `proc-macro-error`, die `unic-*`-Reihe. Alle transitiv, keine
  von hier aus wechselbar. **Schwachstellen zählen weiterhin überall im Baum** — nur die
  Wartungslage nicht.
- **Lizenzen werden nicht geprüft.** Eigene Frage, eigene Kriterien; eine halb gepflegte
  Allowlist nähme die Schwachstellenprüfung mit in den Abgrund.
- **Jede Einzelfreigabe trägt ihren Grund in `deny.toml`.** Ohne ihn steht dort in einem
  Jahr eine Kennung, die niemand mehr einordnen kann — und die deshalb bleibt.

`lib-fints` hängt an einem **Commit-SHA**, nicht mehr an einem Branch. Ein beweglicher
Ref bedeutet, dass ein `npm update` stillschweigend fremden Code einzieht; der Lockfile
allein schützt nur, solange niemand ihn erneuert.

## Build-Stolpersteine

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
