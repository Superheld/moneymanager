# `core/` — die reine Domäne

Hier wird gerechnet und entschieden, sonst nichts. **Kein IO, kein React, keine Uhr, kein
Zufall.** Eine Funktion, die `new Date()` oder `Math.random()` aufruft, ist hier falsch: sie
macht jeden Test von der Laufzeit abhängig. Zeitpunkte kommen als Parameter herein.

`core` importiert **nichts** nach außen — geprüft in `src/architektur.test.ts`.

## Gliederung

`basis/` hält die Primitive, die quer durch alles gehen: `geld`, `waehrung`, `datum`,
`zahlungsregel`, `muster`, `fehler`, `region`. Alles Fachliche liegt in seinem Bereich
(`buchung/`, `konten/`, `budgets/`, `vertraege/`, `kategorien/`, `inventar/`,
`stammdaten/`). In der Wurzel bleibt nur, was über Bereiche hinweg rechnet
(`monatsausblick.ts`) und die Fassade `index.ts`.

## Geld

**Integer Cent, nie Float.** Formatiert wird über `geldFormatieren` /
`geldFormatierenMitSymbol` — nie mit eigenem `toFixed` und nie an der Währungs- und
Locale-Schicht vorbei. Minus ist **U+2212** (−), nicht der Bindestrich.

`parseBetrag` liefert `null` bei unplausibler Eingabe (Müll, Exponent, jenseits des sicheren
Integer-Bereichs), statt still eine falsche Zahl zu erzeugen. Es erkennt nachgestelltes
Minus, U+2212 und Klammer-Notation. Wer das `null` nicht behandelt, hat den Fehlerfall nur
verschoben.

## Datum

`parseIso` **wirft** bei nicht existierenden Daten („2026-02-31", Tag oder Monat `00`). Das
ist Absicht und die Arbeitsteilung mit der Anwendungsschicht: dort prüfen Regex nur die
FORM, die Existenz prüft der Kern.

`toIso` polstert das Jahr vierstellig, weil die gesamte Datumsordnung über String-Vergleiche
läuft — ein dreistelliges Jahr sortiert sonst hinter alles andere.

## Charakter

`Aufwand | Ertrag | Umschichtung` — erfolgs- gegen liquiditätswirksam; Umschichtung ist
Aktivtausch, keine Ausgabe. Er wird **nicht gewählt**, sondern folgt
`kategorie.defaultCharakter`, bei Umbuchungen dem Transfer. Es gibt bewusst kein
Eingabefeld dafür.

Tragend ist er trotzdem: `budgetVerbrauch` zählt nur Aufwand, die Analyse gruppiert danach,
die Vertragserkennung schließt Umschichtungen aus, das Konto-Register färbt danach. Kein
totes Konzept, auch wenn keine Maske danach fragt.

## Kontostands-Anker

Ein Anker (`konten/kontostand.ts`) ist eine **Beobachtung, kein Rechenergebnis**: an DIESEM
Stichtag lag DIESER Betrag auf dem Konto — von der Bank gemeldet oder von Hand gezählt. Er
wird nie ungültig und nie neu berechnet, auch nicht, wenn jemand nachträglich eine Buchung
davor einfügt. Was sich ändert, ist die Differenz, und genau die will man sehen.

Anker werden **aufgehoben, nicht überschrieben** (ein Stichtag je Herkunft): erst mehrere
sagen, in welchem ZEITRAUM eine Lücke entstand. `abweichungsfenster` rechnet Anker gegen
Anker und kommt ohne den Anfangsbestand aus, weil der selbst nur geschätzt ist.
