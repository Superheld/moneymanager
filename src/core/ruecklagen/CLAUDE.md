# Rücklagen

Gilt für Rücklagen in Kern, Anwendung und Oberfläche. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Eine Rücklage hat eine von zwei Formen — nie beide

Bis zum 31.08.2026 hiess das **Inventar** und meinte einen GEGENSTAND: Wiederbeschaffung ÷
Nutzungsdauer, beides Pflicht. Die Rechnung ist geblieben, die Behauptung ist weg, dass am
anderen Ende ein Ding steht — man legt auch für einen Urlaub zurück, und der hat keinen
Wiederbeschaffungswert.

| Form | Felder | Rate | Deckel | nach dem Ausbuchen |
|---|---|---|---|---|
| mit Ziel | `ziel` + `frist_monate` | Ziel ÷ Frist | das Ziel | **fängt von vorn an** |
| frei | `rate` | wie eingetragen | keiner | **erledigt** |

**Die Form entscheidet, was nach dem Ausbuchen passiert**, und deshalb gibt es kein Feld
`wiederkehrend`: es könnte der Form widersprechen, und dann entschiede die Reihenfolge im
Code. Was einmal ersetzt werden musste, muss es wieder — die Waschmaschine ist nicht die
letzte. Der Urlaub war einmal.

Durchgesetzt wird das an der Anwendungsgrenze (`ruecklagenPflege`), nicht im Schema: alle
drei Spalten sind nullable, weil SQLite ein „genau eines von beiden" nicht ausdrücken kann,
ohne dass die Migration zur Fingerübung wird.

**Das Ausbuchen ist eine AUFZEICHNUNG und kein Zustand.** Der Zustand steht an der Rücklage
selbst (`beginn`, bei der freien Form `beendet_am`);
`ruecklage_ausbuchung` hält fest, WOFÜR sie draufging — und seit Migration 76, wie der
Zyklus aussah, den sie beendet hat (`zyklus_beginn`, `zyklus_ziel`, `zyklus_frist`,
`zyklus_rate`; im Kern `Ruecklagenzyklus`). Daraus rechnet die Ergebnisrechnung zwei
Dinge, die vorher verloren waren: die Rate der Monate VOR dem Ausbuchen und ob der Kauf
vom Angesparten gedeckt war (`zyklusSoll`). Eine Ausbuchung von davor trägt NULL in den
vier Spalten; das heisst „Geschichte unbekannt" und rechnet wie früher — keine Rate
davor, der Kauf gilt als gedeckt.

**Eine freie Rücklage wird beendet, nicht gelöscht.** Bis Migration 76 verschwand sie
beim Ausbuchen, und weil `ruecklage_ausbuchung.ruecklage_id` auf `CASCADE` steht, ging
ihre Ausbuchung im selben Moment mit — die Aufzeichnung, um die es dem Absatz darüber
geht, gab es für die freie Form also gar nicht. `RuecklagenRepository.alle()` liefert
Beendete nicht aus: der Filter steht im Repository, damit kein Aufrufer ihn vergessen
kann. Wer von Hand LÖSCHT, nimmt die Geschichte weiterhin mit; das ist dann gewollt. Der Fremdschlüssel auf `ist_buchung`
steht deshalb auf `SET NULL` und nicht auf `CASCADE` — dieselbe Überlegung wie beim
`buchung_journal`, nur eine Nummer kleiner.

**Beendete Rücklagen stehen in der Geschichte, nirgends sonst** (seit 2026-11-15). Bis
dahin waren sie nach dem Ausbuchen in der Oberfläche unsichtbar, obwohl sie in der
Tabelle standen. Gelesen werden sie über einen EIGENEN Weg,
`RuecklagenRepository.beendete()`, und nicht über einen Schalter an `alle()`: jede
laufende Rechnung (Deckung, Rate, Fluss, Ergebnis) soll sie nicht sehen können, ohne es
ausdrücklich zu wollen.

Die Geschichte (`ruecklagenGeschichte` in `application/ruecklagen/ruecklagensichten.ts`,
in der Oberfläche `AusbuchungenKarte`) ist EINE Liste von Ausbuchungen — laufende und
beendete Rücklagen zusammen. Eine Ausbuchung ist dasselbe Ereignis, ob die Rücklage danach
neu beginnt oder endet, und die Fragen an sie sind dieselben: wann, wofür, wie viel war
angespart, was war ungedeckt. Die beendete Rücklage ist darin der Sonderfall: ihre
JÜNGSTE Ausbuchung trägt die Pille „beendet". Eine beendete Rücklage ohne Ausbuchung
(über die App nicht herzustellen) erscheint trotzdem, mit dem Tag aus `beendet_am`.

Drei Dinge daran sind Entscheidung:

- **Die Ausgabe ist die verknüpfte Buchung, wenn es sie gibt**, sonst der eingetragene
  Betrag. Dieselbe Wahl trifft die Ergebnisrechnung, wenn sie das Ungedeckte prüft; zwei
  Beträge für denselben Kauf liefen sonst auseinander.
- **Ungedeckt** ist die Ausgabe über dem Zyklus-Soll am Tag des Ausbuchens
  (`zyklusUngedeckt`). Ohne festgehaltenen Zyklus steht „unbekannt" da, nicht 0 — und der
  Kauf gilt, wie in der Ergebnisrechnung, als gedeckt. In `ergebnis.ts` steht dieselbe
  Regel noch inline; wer eine ändert, ändert beide.
- **Die Zeile öffnet die Buchung nur, wenn eine dranhängt** (`DataTable` mit
  `istKlickbar`). Wiederaufnehmen oder Löschen einer beendeten Rücklage gibt es dort nicht.

**Gebucht wird beim Ausbuchen nichts.** Der Kauf ist eine ganz normale Ausgabe vom Konto,
und weil die Deckung gegen den REALEN Kontostand rechnet, fällt sie durch die Abbuchung von
selbst. Eine zweite, kalkulatorische Buchung zeigte dieselbe Bewegung doppelt.

## Rücklage oder aufbauendes Budget — und was die Kategorie einer Rücklage tut

Beide legen Monat für Monat etwas zurück, und in der Ergebnisrechnung kosten beide ihre
Rate (`src/core/CLAUDE.md`, „Auszahlung und Kosten"). Sie unterscheiden sich darin, WIE
eine Ausgabe zu ihnen findet:

| | findet seine Ausgaben | passt für |
|---|---|---|
| **aufbauendes Budget** | von selbst, über die Kategorie samt Unterkategorien | viele Ausgaben über die Zeit: Urlaub, Reparaturen |
| **Rücklage** | von Hand, eine Buchung je Ausbuchen | ein Gegenstand, ein Kauf: das Gerät, das Auto |

Die Spalte `kategorie_id` der Rücklage war bis 2026-11-15 gespeichert und nirgends
benutzt; ein Feld dafür gab es in keiner Maske. Seitdem trägt der Dialog sie, und sie
tut genau eines: **beim Ausbuchen stehen die Buchungen dieser Kategorie zuerst**
(`buchungswahlFuer` in `application/ruecklagen/ruecklagensichten.ts`). Sie ist ein
Vorschlag und keine Regel. Zählte sie von selbst wie beim Budget, wüsste die Rücklage
mit Ziel nach der ersten kleinen Ausgabe nicht, ob ihr Zyklus neu beginnt — und zwei
Töpfe auf derselben Kategorie stritten um dieselbe Buchung.

## Der Rücklagenfluss ist DREI Zahlen, nicht eine

`core/ruecklagen/fluss.ts` beantwortet „was wird zurückgelegt" mit drei Werten, und keiner
davon ersetzt einen anderen:

| | woher | sagt |
|---|---|---|
| **Bedarf** | Σ Monatsraten der Rücklagen | was die Rechnung verlangt |
| **Plan** | Σ Umbuchungsregeln auf Rücklagenkonten | was du eingerichtet hast |
| **Eingegangen** (`ist`) | jede Einzahlung auf ein Rücklagenkonto im Fenster, Zinsen eingeschlossen; Umbuchungen nur, wenn sie nicht von einem anderen Rücklagenkonto kommen | was tatsächlich angekommen ist — bis 2026-11-08 „geflossen" und nur das abgehende Bein vom liquiden Konto |

Bedarf über Plan heisst: du legst zu wenig zurück, die Deckung wird schlechter, ohne dass
irgendwo etwas schiefgeht. Plan über Ist heisst: die Überweisung ist ausgefallen. Eine
Zahl allein könnte keine dieser Aussagen treffen.

**Wohin gerechnet wird, entscheidet `ruecklagenKonten`:** zurückgelegt ist, was von einem
liquiden Konto auf ein Konto der Klasse **Rücklage** geht — oder auf eines, dem eine
Rücklage zugeordnet ist, gleich welcher Klasse. Die Zuordnung kam am 2026-11-09 dazu:
allein über die Klasse sah, wer seine Rücklagen auf einem Konto der Klasse „Sparen"
führte, keinen Eingang und einen Tacho auf null, obwohl die Zuordnung an jeder Rücklage
dastand. Dieselbe Menge misst der Tacho (`ruecklagenStand`): den Kontostand, nicht die
Deckung — die Faustformel fragt nach dem Notgroschen, nicht danach, wem er schon gehört.

Bedarf und Plan sind **Monatsgrössen** und hängen nicht am Fenster; nur `ist` summiert über den
Zeitraum. Wer sie über mehrere Monate vergleicht, muss die ersten beiden hochrechnen — das
im Kern zu tun hiesse zu raten, wie viele Monate gemeint sind.
