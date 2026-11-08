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

**Wohin gerechnet wird, entscheidet die KONTOKLASSE:** zurückgelegt ist, was von einem
liquiden Konto auf ein Konto der Klasse **Rücklage** geht (`istRuecklagenkonto`). Bis
2026-11-08 zählte jedes nicht liquide Ziel; seit die Monatskarten Rücklagen und „Sparen
& Vorsorge" trennen, zieht der Fluss dieselbe Grenze — sonst stünde dieselbe Überweisung
hier als Rücklage und dort als Sparen. Bedarf
und Plan sind **Monatsgrössen** und hängen nicht am Fenster; nur `ist` summiert über den
Zeitraum. Wer sie über mehrere Monate vergleicht, muss die ersten beiden hochrechnen — das
im Kern zu tun hiesse zu raten, wie viele Monate gemeint sind.
