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
  Kauf gilt, wie in der Ergebnisrechnung, als gedeckt. Gerechnet wird an EINER Stelle
  (`altabschlussUngedeckt` in `topf.ts`), die auch die Ergebnisrechnung fragt; bis
  Paket 3 stand die Regel dort ein zweites Mal inline.
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
| **Rücklage** | mit Kategorie: von selbst über sie, ab ihrem Fundfenster (`findet_ab`, seit Paket 3); ohne: von Hand, eine Buchung je Ausbuchen | ein Gegenstand, ein Kauf: das Gerät, das Auto |

### In der Oberfläche ist beides eine Rücklage (seit 2026-11-15)

Für den Nutzer sind beide dasselbe — Geld, das Monat für Monat für etwas Späteres
zurückgelegt wird —, und zwei Namen dafür in zwei Bereichen liessen ihn bei jeder neuen
Sache raten, wohin sie gehört. Deshalb, als erste Stufe und NUR in Oberfläche, Sichten
und Texten:

- **Der Bereich Rücklagen zeigt beide**, in zwei Karten: „Von Hand ausgebucht" (die
  Rücklage) und „Über die Kategorie" (das aufbauende Budget). Zwei Karten und nicht eine
  Liste, weil genau dieser Unterschied beim Benutzen zählt — wie die Ausgabe zu ihr
  findet. Die zweite Karte benutzt Tabelle, Dialog und Verlauf der Budgets
  (`ui/bausteine/BudgetTabelle`, `BudgetDialog`, `BudgetVerlauf`); nur die Sätze mit dem
  Wort „Budget" kommen aus `ruecklagen.kategorie.*` (`ui/bausteine/budgetTexte.ts`).
- **Die Ergebnisrechnung führt beide in EINER Zeile** (`abschreibungen`, angezeigt als
  „Rücklagen"). Zusammengelegt wird in `core/ergebnis.ts`, nicht in einer Sicht:
  Monatskarten, Kostensicht, Bericht, Reichweite und Kennzahlen lesen dieselbe Zeile.
  Jeder Posten rechnet weiter nach seiner Regel — die Rücklage den Zuwachs ihres Solls,
  das Budget `topfKosten` —, und jeder trägt weiter, woher er kommt (`ruecklageId` bzw.
  `budgetId`). Die Zeile `wagnisse` gibt es nicht mehr.
- **Das Wort „aufbauendes Budget" steht nirgends mehr in der Oberfläche.**

**Im Datenmodell bleibt die Trennung bewusst stehen**: zwei Tabellen (`ruecklage`,
`budget` mit `art = aufbauend`), zwei Use-Case-Wege, zwei Rechenregeln. Sie
zusammenzulegen hiesse, die Ausbuchung mit dem Zyklus und die Betragsreihe mit dem
Übertrag in eine Form zu bringen — das ist eine eigene Entscheidung und kein Umbenennen.

### Die Kennzahlen des Bereichs zählen beide Formen (seit 2026-11-16)

Bis dahin rechneten „Wo die Rücklagen stehen" und der Bedarf unter „Diesen Monat" nur
über die Rücklagen von Hand, obwohl die Überschrift beide meinte. Jetzt gilt je Kennzahl:

| Kennzahl | zählt | warum so |
|---|---|---|
| Ziele gesamt | nur Rücklagen von Hand MIT Ziel | die anderen haben keins; ein Rest ist kein Ziel |
| Soll heute | Soll von Hand + Rest über die Kategorie (über null) | der Rest ist, was heute dasein sollte — dieselbe Frage |
| Tatsächlich da | was die Kontobelegung beiden zuteilt | EINE Rechnung für gedeckt, `ruecklagenDeckung` liest sie |
| Deckungsgrad | Tatsächlich da ÷ Soll mit Konto | eine über die Kategorie hat immer ein Konto |
| Bedarf | Rate von Hand + `zufuehrungIm` des Monats über die Kategorie | `ruecklagenBedarf` |

Was das im Code heisst: `ruecklagenDeckung` zählt die Ansprüche der Art `budget` in ihre
Summen und gibt sie als `ueberKategorie` heraus; `posten` bleiben die Rücklagen von Hand,
weil nur sie die Liste mit Balken zeigt. Der Satz „nur Rechnung" hängt an `nurRechnung`
(alle von Hand ohne Konto UND keine über die Kategorie) und nicht mehr an
`sollMitKonto === 0` — ein Rest von null hätte ihn sonst neben einer Rücklage mit Konto
stehen lassen. **Die Ergebnisrechnung ist davon unberührt**: sie liest keine dieser
Funktionen.

**Die Kategorie einer Rücklage findet seit Paket 3 ihre Ausgaben** — bis dahin war sie
nur ein Vorschlag fürs Ausbuchen (`buchungswahlFuer` holt die Buchungen der Kategorie
weiter nach vorn). Ab dem Tag in `findet_ab` trägt die Rücklage jede Ausgabe ihrer
Kategorie samt Unterkategorien; davor gilt, was ohne sie gälte, und deshalb kostet kein
Monat vor der Umstellung anders. Drei Fälle, die man kennen muss:

- **Mehrere Rücklagen an derselben Kategorie: die Buchung wartet.** Sie zählt als
  ungeplant und trägt die Pille „wartet auf Zuordnung", bis jemand im Buchungsdialog
  wählt, welche Rücklage sie trägt — oder „keine Rücklage" (`ruecklageZuordnen`,
  Tabelle `ruecklage_zuordnung`, je Anteil über seine Kategorie benannt). Vorbelegt
  wird nichts. Der Dialog der Rücklage sagt vorher, wenn an der gewählten Kategorie
  schon eine hängt.
- **Ein Budget am selben Knoten gewinnt.** Ein monatliches immer — eine NEUE Rücklage an
  dessen Kategorie weist die Anwendung ab (`ruecklage.kategorieHatBudget`, Hinweis auf
  eine Unterkategorie); ein Altfall bleibt stehen, und die Rücklage findet dort nur
  ausdrücklich Zugeordnetes. Ein aufbauendes ebenfalls, aber nur bis Paket 4: es steht
  noch in der Tabelle `budget`, eine Zuordnung darauf liesse sich nicht speichern
  (`ruecklage_zuordnung` verweist auf `ruecklage`), und mit ihm in der Wahl wartete jede
  Buchung dort auf etwas, das niemand wählen kann.
- **Ohne Kategorie rechnet eine Rücklage wie vorher**: sie findet nur über ihre
  Ausbuchung und steht nie zur Wahl.

Eine neu angelegte Rücklage mit Kategorie findet ab ihrem Beginn; eine nachgetragene
Kategorie ab dem Tag des Speicherns (`ruecklageAktualisieren`), sonst änderte das
Nachtragen vergangene Monate. Der Anspruch auf dem Konto sinkt um das Gefundene
(`anspruchAm` in `ruecklage.ts`): er ist der Stand über null, und eine Rücklage im Minus
beansprucht nichts.

## Der Rücklagenfluss ist DREI Zahlen, nicht eine

`core/ruecklagen/fluss.ts` beantwortet „was wird zurückgelegt" mit drei Werten, und keiner
davon ersetzt einen anderen:

| | woher | sagt |
|---|---|---|
| **Bedarf** | Σ Monatsraten beider Formen (`ruecklagenBedarf`; über die Kategorie die Zuführung des Monats, in dem das Fenster beginnt) | was die Rechnung verlangt |
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

**Seit 2026-11-16 gehört auch das Konto einer Rücklage über die Kategorie dazu — aber nur,
wenn es NICHT liquide ist.** Ein Budget muss ein Konto nennen, und meist ist es das
Girokonto, von dem bezahlt wird; zählte es mit, wäre jedes Gehalt ein Eingang in die
Rücklagen und der Tacho mässe das Girokonto. Eine Rücklage von Hand nennt ihr Konto
dagegen freiwillig und eigens dafür, sie bleibt bei „gleich welcher Klasse".

## Wo das Geld liegt — alle Konten auf einem Blatt

Die Karte im Bereich (seit 2026-11-16, `ui/ruecklagen/GeldJeKontoKarte`) zeigt je Konto,
das einen Anspruch trägt, dieselbe Belegung wie die Karte „Gebunden auf …" im
Kontoauszug — beide über `ui/bausteine/BelegungTabelle`. Die Sicht kommt aus
`application/ruecklagen/geldJeKonto.ts`, die Zahlen aus der Kontobelegung; ausgewählt wird
dort nur, welche Konten etwas tragen und welche Rücklage auf keinem liegt.

Drei Entscheidungen:

- **Sie steht nach den beiden Listen**, vor der Geschichte. In den Listen wird gearbeitet
  (anlegen, ausbuchen); hier wird nachgesehen. Davor schöbe ein Abschnitt je Konto die
  Handlungen aus dem ersten Blick.
- **„Ohne Konto" ist ein eigener Abschnitt am Ende**, beide Formen: von Hand ohne oder mit
  einem gelöschten Konto, über die Kategorie mit einem gelöschten Konto. Die Zeile öffnet
  den Dialog, in dem man das Konto einträgt.
- **Ein stillgelegtes Konto steht da, solange etwas darauf beansprucht wird** — das Geld
  liegt dort, ob das Konto noch geführt wird oder nicht.

Bedarf und Plan sind **Monatsgrössen** und hängen nicht am Fenster; nur `ist` summiert über den
Zeitraum. Wer sie über mehrere Monate vergleicht, muss die ersten beiden hochrechnen — das
im Kern zu tun hiesse zu raten, wie viele Monate gemeint sind.

## Im Umbau: eine Rücklage (seit 2026-11-16)

Rücklage und aufbauendes Budget werden eine Sache: jede Rücklage hängt an einer
Kategorie, läuft wie ein Budget (auch ins Minus) und ist entweder `fortlaufend` oder
`abschliessend`.

**Paket 3 ist gebaut: die Rechnung ist umgestellt.** Was es dafür gibt:

- **Das Schema (Migration 79)** und **die Überführung (Migration 80)**: die freie Rate
  steht in der Reihe `ruecklage_rate` (ab dem Monat des Beginns, `rate` ist dort leer,
  wo sie überführt ist), und jede laufende Rücklage von Hand mit Kategorie findet ab dem
  Tag der Umstellung (`findet_ab`).
- **Die Rechenbausteine** in `topf.ts` und `zustaendigkeit.ts` rechnen: Einordnung,
  Ergebnisrechnung, Verbrauch eines Budgets, Belegung, Deckung und Budgetvorschläge fragen
  dieselbe Zuständigkeit. Die aufbauenden Budgets werden übergangsweise als Rücklage
  gelesen (`alsRuecklage`); ihre Tabelle bleibt bis Migration 81.
- **Die Probe** `src/umstellungsprobe.test.ts`: jede Zeile der Ergebnisrechnung, die
  Einordnung jedes Anteils, Belegung und Deckung an mehreren Stichtagen, Budgetstände und
  Monatsausblick — für den Spielstand und zwei harte Bestände, vor und nach Migration 80,
  gegen eine Erwartung, die mit dem Code VOR der Umstellung erzeugt ist.

**Zwei Kostenregeln, und wo jede gilt:**

| Regel | gilt für | rechnet |
|---|---|---|
| **max-Regel** (`zyklusKosten`) | jeden Zyklus ausser dem unten: den laufenden, jedes aufbauende Budget, jeden neuen Abschluss | Kosten bis M = max(Raten bis M, Entnahmen bis Ende M) |
| **alte Regel** (`altabschlussKosten`) | einen Zyklus, den VOR der Umstellung eine Ausbuchung mit verknüpfter Buchung abgeschlossen hat | jeder Monat seine Rate, im Kaufmonat dazu, was der Kauf über dem Angesparten am Abschlusstag lag |

Beides trifft nie im selben Zyklus zusammen. Die alte Regel bleibt, weil die max-Regel
das Ungedeckte in andere Monate verschöbe, sobald Kaufdatum und Abschlussmonat
auseinanderliegen.

**Was konservativ unverändert rechnet** (Teil B des Entwurfs, Abschnitt 5): der Stand je
Sorte (`fortlaufend` mit der Rate des laufenden Monats, `abschliessend` erst ab dem
Folgemonat), der Bedarf im Fluss, der Tacho und `ruecklagenKonten`, der Monatsausblick
(er bekommt keine Rücklagen in seine Budget-Sicht).

**Zwei Befunde werden nachgebildet und nicht behoben**, beide mit Test in
`fundfenster.test.ts`: eine Kategoriebuchung VOR dem Start eines aufbauenden Budgets ist
eine Entnahme und kostet nichts; ein Kauf, den zwei Ausbuchungen nennen, zählt in beiden
als ungedeckt. **Eine Abweichung** ist benannt (`topf.test.ts`): ein aufbauendes Budget
ohne `start` (nur in einer von Hand geänderten Datei) zählt seine Ausgaben jetzt ab dem
ersten Betragsmonat; vorher kosteten sie nie etwas.

**`findet_ab` leer heisst je Sorte etwas anderes:** bei `abschliessend` findet die
Kategorie nichts von selbst, bei `fortlaufend` gilt sie ohne Anfang — wie ein
aufbauendes Budget.

Noch offen: Paket 4 (Migration 81, die aufbauenden Budgets werden Rücklagen; eine Liste,
ein Dialog mit Kategorie als Pflicht) und Paket 5 (Abschliessen statt Ausbuchen). Wenn
beides steht, gehört dieser Abschnitt in die Abschnitte oben, und die Sätze dort, die die
Trennung beschreiben, fallen weg.
