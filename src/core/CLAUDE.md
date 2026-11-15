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

## Auszahlung und Kosten — zwei Sichten auf dieselbe Buchung

Der Charakter oben sagt, OB eine Zahlung das Ergebnis berührt. Diese Unterscheidung sagt,
WANN. Sie ist die Grundlage der kaufmännischen Rechnung, auf die der Kern umgebaut wird
(beschlossen 2026-11-15), und sie steht hier, bevor der erste Code dazu entsteht, damit
jedes Paket dieselben Wörter benutzt.

| | Frage | Jahresbeitrag 600 € im Januar | Gerät für 960 €, alle 8 Jahre |
|---|---|---|---|
| **Auszahlung** | Wann geht Geld vom Konto? | Januar 600, sonst 0 | im Kaufmonat 960 |
| **Kosten** | Was kostet der Monat? | 50 je Monat | 10 je Monat |

**Jede Zahl gehört in genau eine der beiden Sichten.** Eine Summe, die Auszahlungen und
Kosten mischt, beantwortet keine Frage: sie geht weder gegen die Bank auf, noch sagt sie,
was das Leben kostet.

Daraus werden drei Rechnungen, und jede hat ihren Ort:

| Rechnung | rechnet | beantwortet |
|---|---|---|
| **Ergebnis** | Kosten je Monat | Was kostet mein Leben, was bleibt? |
| **Liquidität** | Auszahlungen an ihrem Tag | Reicht das Geld am Tag X? |
| **Vermögen** | Bestände zum Stichtag | Was ist da, und wem gehört es schon? |

Zwischen Ergebnis und Liquidität steht die **Überleitung**: sie erklärt Zeile für Zeile,
warum das Ergebnis eines Monats nicht die Änderung des Kontostands ist. Sie muss exakt
auf die Summe der Ist-Buchungen aufgehen — das ist die Probe, die „geht gegen die Bank
auf" ausführbar macht.

### Die Wörter

| Wort | meint | nicht verwechseln mit |
|---|---|---|
| **Topf** | Geld, das für etwas bestimmt ist: eine Rücklage, ein aufbauendes Budget, ein Vorsorgeziel | dem Konto — das sagt, WO Geld liegt, der Topf, WEM es gehört |
| **Rate** | was ein Topf den Monat kostet, ob überwiesen wurde oder nicht | der Überweisung auf das Konto des Topfs |
| **Zuführung** | die Rate, von der Geldseite gesehen: was in den Topf hineingeht | — |
| **Entnahme** | eine Ausgabe, die ein Topf trägt | Kosten — die waren die Raten davor |
| **ungedeckt** | der Teil einer Entnahme über dem Stand des Topfs | — |
| **periodisiert** | eine Zahlung, auf die Monate verteilt, für die sie gilt | geglättet — ein Budget hat keine Fälligkeit, die man verteilen könnte |

### Die Regeln

- **Ein Topf kostet seine Rate, nicht seine Auszahlung.** Für Rücklage, aufbauendes
  Budget und Vorsorge gleich. Sonst sieht der Monat der grossen Ausgabe schlecht aus und
  jeder davor zu gut.
- **Eine Entnahme ist kein zweites Mal Kosten — bis zur Höhe des Topfstands.** Was
  darüber hinausgeht, ist ungedeckt und zählt als Kosten des Monats. Ohne die Grenze
  machte ein leerer Topf jede Ausgabe folgenlos.
- **Verträge werden vorschüssig periodisiert:** die Zahlung gilt für die Monate AB ihrer
  Fälligkeit, verteilt nach dem Rhythmus der Zahlungsregel. Vorschüssig, weil es der
  Normalfall ist (Versicherung, Jahresabo) und der Kern die Abweichung davon nicht kennt.
- **Der Topf hängt an der KATEGORIE, nicht an der Buchung.** Ein zweites Feld an der
  Buchung („woraus bezahlt") ist geprüft und verworfen: wer es genauer will, legt
  Unterkategorien an. Es bleibt bei einem Kategoriebaum.
- **Vorsorge ist Kosten, keine Verwendung des Überschusses.** Als Verwendung sähe ein
  Monat, in dem nichts zurückgelegt wurde, BESSER aus. Gerechnet wird die Rate, die das
  Ziel verlangt; ob sie überwiesen wurde, zeigt die Überleitung.
- **Annahmen sind Eingaben.** Rendite und Inflation einer Vorsorgerechnung trägt der
  Nutzer ein, und sie stehen neben jedem Ergebnis, das von ihnen abhängt — nie als
  Konstante im Kern.

**Was davon heute schon gilt, und was nicht:** die Aufrechnung in `monatsausblick.ts`
rechnet noch gemischt — Rücklagen mit der Rate, aufbauende Budgets mit der Auszahlung,
Verträge zur Fälligkeit. Dieser Abschnitt beschreibt, wohin gebaut wird. Wer dort etwas
ändert, ändert es in diese Richtung und nicht in die andere.

## Kontostands-Anker

Ein Anker (`konten/kontostand.ts`) ist eine **Beobachtung, kein Rechenergebnis**: an DIESEM
Stichtag lag DIESER Betrag auf dem Konto — von der Bank gemeldet oder von Hand gezählt. Er
wird nie ungültig und nie neu berechnet, auch nicht, wenn jemand nachträglich eine Buchung
davor einfügt. Was sich ändert, ist die Differenz, und genau die will man sehen.

Anker werden **aufgehoben, nicht überschrieben** (ein Stichtag je Herkunft): erst mehrere
sagen, in welchem ZEITRAUM eine Lücke entstand. `abweichungsfenster` rechnet Anker gegen
Anker und kommt ohne den Anfangsbestand aus, weil der selbst nur geschätzt ist.
