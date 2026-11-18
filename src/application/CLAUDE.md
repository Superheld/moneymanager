# `application/` — Use-Cases und Ports

Diese Schicht **orchestriert**: sie holt über Ports, ruft den Kern, schreibt zurück. Sie
enthält selbst **keine Geschäftslogik** — wer hier rechnet oder entscheidet, hat eine Regel
am Kern vorbeigebaut, und der nächste Aufrufer erfindet sie neu.

`application` kennt nur `core`, nie einen Adapter. Geprüft in `src/architektur.test.ts`.

## Was hierher gehört — auch beim Lesen

**Alles, was AUSWÄHLT oder RECHNET.** Welche Buchungen zu einem Budget zählen, was im
Register steht, wie der Monat aussieht: das sind Entscheidungen, und Entscheidungen liegen
hinter einem Use-Case. Auch beim reinen Lesen. Ein Screen bekommt **fertige Sichten, keine
Rohteile**.

Der Grund ist nicht Symmetrie: galt die Regel nur fürs Schreiben, hatten Leseregeln keine
Heimat — „welche Buchung zählt gegen ein Budget" wird dann an mehreren Stellen unabhängig
erfunden und an einer vergessen, und dieselbe Übersicht zeigt für dasselbe Budget zwei
verschiedene Werte.

`index.ts` ist die Import-Fläche der UI: **Vokabular** (Domänentypen, wertfreie Helfer wie
`geldFormatieren`, `KONTOTYPEN`) wird durchgereicht, **Entscheidungen** nur als Use-Case.
Ein Typ trifft keine Entscheidung — ihn zu kapseln wäre Zeremonie.

## Die Anwendungsgrenze prüft

Hier kommen fremde Werte an — aus Formularen, aus Dateien, von der Bank. Deshalb ist das
die Stelle, an der geprüft wird:

- **`istCent()`** bei jedem Betrag, den ein Use-Case annimmt. Das ist die Durchsetzung der
  Cent-Invariante; ohne sie sickert irgendwann ein Float durch.
- **Form per Regex, Existenz im Kern.** Ein Datums-Regex sagt „sieht aus wie ISO", nicht
  „diesen Tag gibt es" — `parseIso` wirft, und das soll es auch.

## Gliederung

Bereiche wie im Kern (`buchung/`, `konten/`, `budgets/`, `vertraege/`, `kategorien/`,
`klassifikator/`, `ruecklagen/`, `dubletten/`, `stammdaten/`) plus die eigenen Kontexte
`import/` und `fints/`. In `kategorien/` liegt nur der Baum (Standardkategorien,
`kategorieAnlegen`); was mit dem Erkennen zu tun hat — Training, Merkmale, Trainingsmaterial,
der Abgleich und die Kategorisierungskette (`vorschlag.ts`: Umbuchung → Vertrag → Quelle →
Modell) —, liegt in `klassifikator/`. Der Baum braucht nichts Fachliches, das Erkennen liest
Zahlungsspuren und Verträge; in einem Ordner stünde der Baum mit über der Buchung.

Direkt in `src/application/` bleibt, was keinem Bereich gehört: `index.ts` (Fassade zur UI), `ports.ts`
(die Interfaces, von 76 Stellen benutzt), `bootstrap.ts`, `einstellungen.ts` und die
querliegenden Sichten `uebersicht.ts` und `analysesichten.ts` — die rechnen absichtlich über
mehrere Bereiche. Dazu `ausgabenvorschlaege.ts`: es lädt die Vorschläge für Budgets UND
Rücklagen in einem Zug, damit beide Bereiche dieselbe Einstufung sehen; was je Bereich
verworfen ist, filtern `budgets/budgetvorschlaege.ts` und `ruecklagen/ruecklagenvorschlaege.ts`.
Und `abrufAusfuehren.ts`, die Klammer um einen Bankabruf: es holt über `fints/` und schickt
das Ergebnis durch Import, Buchung, Verträge und Depot. `fints/` steht in der Rangfolge
unter allen vieren und darf sie nicht kennen — die Orchestrierung über sie gehört deshalb
keinem von ihnen, sondern hierher. Ebenso `importUebernehmen.ts`, dasselbe für eine
Datei: es lädt die Quellen der Kategorisierungskette und reicht sie dem Import herein, der
sie selbst nicht kennen darf (`UebernahmeDeps.vorschlag`). Ebenso `stammdatensichten.ts`: es lädt Personen, Konten
und den Kategorienbaum in einem Zug und rechnet die Kontostände über den Buchungsbestand —
eine Sicht über vier Bereiche. Ebenso `buchungsdetail.ts` und `einordnungssicht.ts`: was
der Buchungsdialog und die Spalte „Einordnung" des Kontoauszugs zeigen, zieht Verträge,
Rücklagen und Budgets zusammen, die alle über der Buchung liegen — in `buchung/` kannte
ein Bereich seine höheren, gegen die Rangfolge. Ebenso die Sichten des Kontoauszugs:
`kontensichten.ts` (Konto, Belege, Bankverbindung, Dubletten, Buchungen, Depot, Verträge,
Rücklagen), `herkunftsicht.ts` (Konto, Belege und ob ihre Buchung noch steht — auch die
Bankzugänge zeigen sie, die unter der Buchung liegen) und `kontobelegung.ts` (Kontostand
gegen die Ansprüche der Rücklagen, mit Budgets und Verträgen). Im Bereich `konten/`
kannte das Konto, was über ihm liegt. Der Abgleich und der Kontostands-Anker
(`buchung/abgleichsicht.ts`, `buchung/kontostandAnker.ts`) rechnen dagegen nur über die
Buchungen eines Kontos und liegen bei der Buchung. Angelegt wird dagegen je Bereich (`kontoAnlegen` in
`konten/`, `kategorieAnlegen` in `kategorien/`, `personAnlegen` in `stammdaten/`).

## Ports

Ein Port ist ein Interface in `ports.ts`, seine Umsetzung liegt in
`adapters/persistence/`. Use-Cases nehmen Ports als Parameter — nie ein Repository direkt.
Zusammengebunden wird beides in `adapters/dienste.ts`, nicht hier: `application/` weiß
nichts von SQLite.
