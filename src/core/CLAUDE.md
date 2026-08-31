# `core/` — die reine Domäne

Hier wird gerechnet und entschieden, sonst nichts. **Kein IO, kein React, keine Uhr, kein
Zufall.** Eine Funktion, die `new Date()` oder `Math.random()` aufruft, ist hier falsch: sie
macht jeden Test von der Laufzeit abhängig. Zeitpunkte kommen als Parameter herein.

`core` importiert **nichts** nach außen — geprüft in `src/architektur.test.ts`.

## Gliederung

`basis/` hält die Primitive, die quer durch alles gehen: `geld`, `waehrung`, `datum`,
`zahlungsregel`, `muster`, `fehler`, `region`. Alles Fachliche liegt in seinem Bereich
(`buchung/`, `konten/`, `budgets/`, `vertraege/`, `kategorien/`, `ruecklagen/`,
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

### Der Rückfluss — der Fall, der hier mehrfach weh getan hat

Bei einer Erstattung fallen Einordnung und Richtung auseinander: sie gehört in die Kategorie
der Ausgabe (also **Aufwand**), aber das Geld kam **herein**. Sie steht deshalb als *Aufwand
mit positivem Betrag* da, und das ist kein Widerspruch — „Aufwand" sagt, WOFÜR das Geld war,
das Vorzeichen sagt, wohin es floss.

Der Fehler ist dabei nie „diese Funktion rechnet falsch", sondern immer derselbe Griff:
**jemand leitet das Vorzeichen aus dem Charakter ab** (oder aus dem `defaultCharakter` der
Kategorie), statt das vorhandene zu nehmen. Der Griff wandert dorthin, wo gerade kein Test
steht.

Zwei Dinge, an denen man ihn erkennt und die deshalb festgehalten sind:

- **Die Signatur.** Ein einmal zu viel gedrehtes Vorzeichen verschiebt immer um **2 × Betrag**,
  nie um den Betrag selbst. Am Kontenabgleich sieht das aus wie eine fehlende Buchung.
- **Was NICHT gilt.** Die Zusicherung „Σ Aufwände ≤ 0" darf nicht erzwungen werden. Wer sie
  mit `Math.min(0, …)` herstellt, verliert den Rückfluss aus der Rechnung, und der Saldo
  läuft von dem der Bank weg. Ebenso darf er nicht nach Vorzeichen zu den Einnahmen
  umsortiert werden — dort bläht er sie auf, statt die Ausgabe auszugleichen.

**Wer am Charakter arbeitet, beschiesst `buchung/erstattung.test.ts`.** Dort laufen alle
Rechenwege, die auf den Charakter verzweigen, gegen denselben Fall — ein Ort statt verstreuter
Einzelfälle, damit die nächste betroffene Stelle auffällt.

## Kontostands-Anker

Ein Anker (`konten/kontostand.ts`) ist eine **Beobachtung, kein Rechenergebnis**: an DIESEM
Stichtag lag DIESER Betrag auf dem Konto — von der Bank gemeldet oder von Hand gezählt. Er
wird nie ungültig und nie neu berechnet, auch nicht, wenn jemand nachträglich eine Buchung
davor einfügt. Was sich ändert, ist die Differenz, und genau die will man sehen.

Anker werden **aufgehoben, nicht überschrieben** (ein Stichtag je Herkunft): erst mehrere
sagen, in welchem ZEITRAUM eine Lücke entstand. `abweichungsfenster` rechnet Anker gegen
Anker und kommt ohne den Anfangsbestand aus, weil der selbst nur geschätzt ist.
