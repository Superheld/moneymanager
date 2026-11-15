# `vermoegen/` — Bestände zum Stichtag

Was ein Haushalt besitzt und schuldet, auch dort, wo kein Konto es zeigt: eine Immobilie,
ein Fahrzeug, eine Versicherung mit Rückkaufswert, eine Beteiligung — und Kredite. Daraus
und aus Konten und Depots rechnet `vermoegen.ts` das **Nettovermögen** und seinen Verlauf.

## Beobachtung statt Buchung

Ein Vermögenswert hat keinen Saldo und keine Buchungen. Er hat einen Wert, den jemand ab
und zu nachsieht, und genau das wird gespeichert: an DIESEM Stichtag stand DIESER Betrag
da. Dasselbe Muster wie beim Depot (`../depot/depot.ts`) und beim Kontostands-Anker —
Stammsatz plus Reihe.

Drei Dinge folgen daraus:

- **Eine Beobachtung wird nie überschrieben.** Der Schlüssel ist Stammsatz plus Stichtag;
  ein zweiter Betrag zum selben Tag wird abgewiesen, nicht übernommen. Wer sich vertippt
  hat, entfernt den Eintrag und trägt neu ein. Das Depot überschreibt an derselben Stelle
  — dort meldet die Bank, und ihre spätere Meldung ist die genauere. Hier tippt ein
  Mensch ab, und eine Zahl, die sich still ändert, hätte niemand so gemeint.
- **Zwischen zwei Beobachtungen wird nicht interpoliert.** Es gilt die jüngste bis zum
  Stichtag (`beobachtungAm`). Eine Gerade zwischen zwei Jahresauszügen wäre eine Aussage
  über elf Monate, zu denen niemand etwas gesagt hat.
- **Vor der ersten Beobachtung gibt es keinen Wert** — auch keinen von null.
  `beobachtungAm` liefert `undefined`; erst die Summe macht daraus „trägt nichts bei".

## Warum kein Tilgungsplan

Eine Schuld ist ebenfalls eine Reihe von Beobachtungen: die Restschuld aus dem
Jahreskontoauszug. Ein Plan (Zinssatz, Rate, Laufzeit) wäre eine RECHNUNG, und sie stimmt
nach der ersten Sondertilgung, Zinsanpassung oder ausgesetzten Rate nicht mehr — dann
stünde eine gerechnete Zahl gegen die der Bank, und die App hätte unrecht.

`vertragId` und `gegenstandId` an der Verbindlichkeit sind **Verweise**: der Vertrag, über
den die Rate läuft, und der Vermögenswert, den die Schuld finanziert. `gegenstandId` liest
weiterhin nichts.

**`vertragId` wird seit 2026-11-15 gelesen** — von der Ergebnisrechnung, die die Rate
dieses Vertrags in Zinsen und Tilgung teilt (`../ergebnis.ts`, `tilgungAbspalten`). Die
Tilgung wird dafür nicht eingegeben und nicht geplant, sondern aus der Reihe der
Restschulden ABGELEITET (`tilgung.ts`, `tilgungIm`): der Rückgang zwischen zwei
Stichtagen, gleichmässig auf die Monate dazwischen. Damit bleibt alles oben richtig — es
gibt keine Zahl, die gegen die der Bank stehen könnte, nur eine Verteilung dessen, was die
Bank gemeldet hat. Und es ist keine Interpolation der Restschuld (oben, „Beobachtung statt
Buchung"): das Nettovermögen bleibt zwischen zwei Stichtagen bei der jüngsten
Beobachtung; verteilt wird nur, welcher Teil der Rate eines Monats Vermögen aufgebaut
hat. Die Fälle:

| Lage | Tilgung im Monat |
|---|---|
| weniger als zwei Restschulden, oder bis zum Monat der ersten | keine — die Rate bleibt ganz Kosten |
| zwischen zwei Restschulden | der Rückgang ÷ Monate dazwischen, der Rest der Teilung im ersten |
| die Restschuld stieg (Aufstockung, ausgesetzte Rate) | 0 für den Zeitraum |
| nach der jüngsten Restschuld | die zuletzt bekannte Monatstilgung, bis die Restschuld aufgebraucht wäre |
| nach der jüngsten Restschuld, Schuld stillgelegt | 0 |

**Die Fortschreibung nach der jüngsten Restschuld ist kein Plan.** Sie sagt nur „es geht
so weiter wie zuletzt gesehen" und wird durch die nächste Beobachtung ersetzt. Ohne sie
fiele jeder Monat seit dem letzten Jahresauszug — also gerade der laufende — auf „die
ganze Rate ist Kosten" zurück, jedes Jahr elf Monate lang. Bei einer Annuität liegt sie
leicht zu niedrig, weil der Tilgungsanteil von Monat zu Monat wächst; dazugeschätzt wird
das nicht.

**Begrenzt wird erst in der Ergebnisrechnung**, gegen das, was der Vertrag im Monat
kostet: eine Sondertilgung senkt die Restschuld, läuft aber nicht über die Rate. Die
leise Angabe an der Schuld im Bereich Vermögen („Tilgung im Monat") ist deshalb die
abgeleitete Zahl vor dieser Grenze — und steht nur an einer Schuld mit Vertrag.

**Die Restschuld ist positiv gespeichert.** Das Vorzeichen setzt `nettovermoegen`, an
genau einer Stelle. Eine Schuld, die mal positiv und mal negativ dasteht, wird irgendwo
einmal zu oft gedreht.

## Was das Nettovermögen zählt

```
Nettovermögen = Konten + Depots + Vermögenswerte − Schulden      (alles zum Stichtag)
```

| Teil | woher | Regel |
|---|---|---|
| Konten | Anfangsbestand plus Buchungen bis zum Stichtag (`istSummeBis`) | **alle** Kontoklassen — die Klasse sagt, wofür Geld da ist, hier zählt nur, dass es da ist |
| Depots | `depotwert` | je Depot der jüngste Wert bis zum Stichtag |
| Vermögenswerte | `vermoegenswert` | je Eintrag die jüngste Beobachtung |
| Schulden | `verbindlichkeit_stand` | je Eintrag die jüngste Restschuld, abgezogen |

Die Kontensumme ist KEINE zweite Saldenrechnung: sie ist `konto.saldo + istSummeBis`,
dieselbe Summe, die der Abgleich gegen den Kontostands-Anker benutzt.

`nettovermoegenVerlauf` ruft für jedes Monatsende `nettovermoegen` auf — der Verlauf kann
von der Zahl darüber nicht weglaufen. Sein letzter Punkt liegt auf dem Bis-Tag selbst,
wenn der Monat dort noch nicht zu Ende ist.

**Welche Konten hereinkommen, entscheidet der Aufrufer.** Die Sicht
(`application/vermoegen/vermoegensichten.ts`) lässt ein Konto weg, an dem ein abgerufenes
Depot hängt: es zeigt im Kontenbereich den Depotwert statt seines Stands und stünde sonst
zweimal in der Summe.

## Was `aktiv` hier heisst

Wie am Konto: **wird noch geführt** — nicht „zählt". Ein verkauftes Fahrzeug, ein
abgezahlter Kredit. Gefragt wird über `wirdGefuehrt`, fehlend heisst ja.

Anders als am Konto entscheidet es hier eine Summe, und die Grenze ist genau gezogen: ein
stillgelegter Eintrag zählt **nach seiner letzten Beobachtung** nicht mehr, bis
einschliesslich ihres Stichtags aber schon. Er fällt damit aus dem heutigen Nettovermögen
und bleibt im Verlauf stehen, wo er war. Eine zweite Angabe („stillgelegt am") braucht es
dafür nicht — die letzte Beobachtung IST das Ende der Geschichte. Wer genau sein will,
trägt am Tag des Verkaufs noch einen Wert ein und legt dann still.

Löschen nimmt die Reihe mit und schreibt damit den Verlauf rückwirkend um. Dafür ist es
da — für den Eintrag, den es nie hätte geben sollen —, und deshalb sagt die Rückfrage in
der Oberfläche, dass Stilllegen der Weg für „verkauft" ist.

## Das Vorsorgeziel rechnet über denselben Bestand

`../vorsorge/vorsorge.ts` beantwortet „wie viel muss am Tag X da sein, und was muss ich
dafür jeden Monat zurücklegen". Es wohnt in der Oberfläche in diesem Bereich und rechnet
gegen eine engere Auswahl desselben Bestands:

- **`vorsorgevermoegen` IST `nettovermoegen`**, über Konten der Klassen Vorsorge und
  Investment (`istVorsorgekonto`), alle Depots und die Vermögenswerte, die dem Ziel
  zugeordnet sind (`vorsorgezielId`). Keine zweite Summe, die von der ersten weglaufen
  könnte. Schulden werden nicht abgezogen.
- **Die Annahmen sind eine Reihe mit „gilt ab"** (`vorsorgeziel_annahme`, `annahmeIm`).
  Wer heute die Rendite senkt, hat nichts über das letzte Jahr gesagt. Im selben Monat
  wird überschrieben — eine Annahme ist ein Vorsatz, keine Messung.
- **Für den Anfang gibt es EIN Ziel je Haushalt.** Das Schema trägt mehrere; mit mehreren
  bräuchte jedes Konto und jedes Depot eine Zuordnung. Die Use-Cases
  (`application/vorsorge/vorsorge.ts`) nehmen deshalb keine Id.
- **Keine Vorgabe für die Rendite**, auch nicht im Dialog. Sie ist die Annahme des
  Nutzers und steht im Untertitel der Karte neben jedem Ergebnis.

**Die Zeile „Vorsorge und Anlage" der Ergebnisrechnung kostet die Sparrate des Ziels**
(seit 2026-11-15, `vorsorgerateIm` in `../ergebnis.ts`) — über dieselbe Kette und
denselben Bestand wie die Karte hier, aber zum Anfang JEDES Monats gerechnet statt zu
heute. Die Karte und die Übersicht zeigen deshalb im laufenden Monat nicht zwingend
dieselbe Rate: die Karte rechnet mit dem, was heute da ist, die Übersicht mit dem, was
am Monatsanfang da war, damit sich die Kosten eines Monats nicht im Lauf des Monats
verschieben. Was tatsächlich überwiesen wurde, steht in der Überleitung.

## Die Wörter

Im Code heisst es wie im Schema: `Vermoegensgegenstand`, `Verbindlichkeit`,
`Verbindlichkeitsstand`. In der Oberfläche heisst es **Vermögenswert**, **Schuld**,
**Wert** bzw. **Restschuld** mit **Stichtag**, die Summe **Nettovermögen**, der Bereich
**Vermögen** — und nichts davon hat ein Synonym. Verbindlich ist `src/i18n/i18n.ts`,
Namensraum `vermoegen`.
