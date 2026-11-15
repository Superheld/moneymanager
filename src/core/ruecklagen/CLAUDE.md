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
selbst (`beginn`) beziehungsweise darin, dass es sie nicht mehr gibt;
`ruecklage_ausbuchung` hält fest, WOFÜR sie draufging. Der Fremdschlüssel auf `ist_buchung`
steht deshalb auf `SET NULL` und nicht auf `CASCADE` — dieselbe Überlegung wie beim
`buchung_journal`, nur eine Nummer kleiner.

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
