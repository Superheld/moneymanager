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
`ruecklagen/`, `dubletten/`, `stammdaten/`) plus die eigenen Kontexte `import/` und `fints/`.

In der Wurzel bleibt, was keinem Bereich gehört: `index.ts` (Fassade zur UI), `ports.ts`
(die Interfaces, von 76 Stellen benutzt), `bootstrap.ts`, `einstellungen.ts` und die
querliegenden Sichten `uebersicht.ts` und `analysesichten.ts` — die rechnen absichtlich über
mehrere Bereiche.

## Ports

Ein Port ist ein Interface in `ports.ts`, seine Umsetzung liegt in
`adapters/persistence/`. Use-Cases nehmen Ports als Parameter — nie ein Repository direkt.
Zusammengebunden wird beides in `adapters/dienste.ts`, nicht hier: `application/` weiß
nichts von SQLite.
