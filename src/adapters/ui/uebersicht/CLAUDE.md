# Übersicht — was sie rechnet

Gilt für die Übersicht. Die Grenze zur Analyse steht in der Wurzel-`CLAUDE.md` unter „Die App in zehn Bereichen“. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

**Ganz oben steht „Damit die Zahlen stimmen"** (`EinrichtungKarte.tsx` auf
`core/einrichtung.ts`), und nur, solange etwas fehlt. Die Karten darunter rechnen auch
ohne Verträge und Budgets, zeigen dann aber alles unter „Ungeplant" — richtig gerechnet
und beim ersten Öffnen nicht zu deuten. Drei Dinge daran:

- **Fragen statt Fachwörter.** Der Schritt heisst „Was kommt und geht jeden Monat
  fest?", das Fachwort steht erst im Knopf, der in den Bereich führt.
- **Sie merkt sich nichts.** Erledigt ist, was im Bestand da ist. Ein gespeicherter
  Haken bliebe stehen, wenn jemand das einzige Budget wieder löscht.
- **Rücklagen sind freiwillig** und halten die Karte nicht offen; ohne ein Feld zum
  Wegklicken stünde sie sonst für jeden da, der keine führt. Die fehlenden Kategorien
  zählen nur über die letzten Monate, damit ein importierter Altbestand niemanden
  zwingt, ihn ganz durchzusortieren.

Sie kommt deshalb wieder, wenn nach einem Import Zahlungen ohne Kategorie dastehen. Das
ist gewollt: genau diese Zahlungen machen die Karten darunter ungenau.

**Die Monatskarten sind eine Ergebnisrechnung** (seit 2026-11-15, `ErgebnisKarten.tsx`
auf `core/ergebnis.ts`): sie zeigen, was der Monat KOSTET, nicht was in ihm vom Konto
ging. Die Begriffe dazu stehen in `src/core/CLAUDE.md` unter „Auszahlung und Kosten".

Drei Stufen, jede mit ihrer Zwischensumme, weil jede eine eigene Frage beantwortet:

| Stufe | Zeilen | beantwortet |
|---|---|---|
| nach den Pflichten | Einnahmen − Fixkosten | was bleibt, bevor ich etwas entscheide |
| was der Alltag übrig lässt | − laufende Kosten − Ungeplantes | wie ich diesen Monat gewirtschaftet habe |
| bleibt wirklich frei | − Rücklagen − aufbauende Budgets − Vorsorge | was ich ausgeben kann, ohne mir etwas vorzumachen |

**Eine Zwischensumme steht nur da, wenn danach noch etwas abgeht.** Ohne Rücklagen und
Vorsorge wäre die zweite dieselbe Zahl wie das Ergebnis darunter.

**Rücklagen und aufbauende Budgets stehen mit ihrer RATE da**, in „bisher" wie in
„geplant". Was aus ihnen bezahlt wurde, ist eine Entnahme: sie steht am Posten daneben
und in der Überleitung, nicht in den Kosten. Reicht ein aufbauendes Budget nicht, zählt
das Ungedeckte als Kosten des Monats (`topfKosten`).

**Fixkosten sind, was einem Vertrag ZUGEORDNET ist.** Die alte Karte fand die Zahlung zu
einem Plan-Posten über Betragsnähe; jetzt entscheidet die Vertragszuordnung der Buchung,
dieselbe, nach der die Budgetliste rechnet. Eine Vertragszahlung ohne Zuordnung steht
unter „Ungeplant" (oder in ihrem Budget), und der Vertrag daneben als „offen" — das ist
kein Fehler der Karte, sondern der Hinweis, dass die Zuordnung fehlt.

**Der laufende Monat nennt, womit er voraussichtlich endet** (`hochrechnung` im Kern):
offene Verträge mit ihrem Plan, gebuchte mit ihrem Ist, monatliche Budgets als
ausgegeben. Eine Zeile unter dem Ergebnis, keine dritte Spalte — je Zeile wäre die
Erwartung fast immer eine der beiden Zahlen, die schon dastehen. Ungeplantes wird nicht
dazugeschätzt; das steht im Satz darunter, weil die Zahl sonst wie eine Vorhersage läse.

**Unter der Karte steht der Weg zum Konto** („Und auf dem Konto?", die Überleitung). Er
ist aufklappbar und erscheint nur, wenn Ergebnis und Kontostandsänderung sich
unterscheiden. Er ist der Beleg, dass die Rechnung darüber gegen die Bank aufgeht, und
gehört deshalb zur Karte und nicht in einen anderen Bereich.

**Die ganze Übersicht rechnet über ALLE Konten.** Kosten hängen nicht daran, von welchem
Konto bezahlt wurde. Bis 2026-11-15 rechneten die Karten über die liquiden Konten und die
Budgetliste über alle; dasselbe Budget zeigte in Karte und Liste verschiedene Zahlen, und
der Untertitel der Seite musste es erklären. Der Satz ist weg, weil der Unterschied weg
ist.

**Budgets stehen in der Liste getrennt nach Art** — monatlich (Rest verfällt) und
aufbauend (Rest bleibt), nach der Art JEDES Budgets, nicht nach dem Dach seines Baums.
In den Karten sind es zwei Zeilen in zwei Stufen: die monatlichen sind laufende Kosten,
die aufbauenden stehen bei den Rücklagen.

Darunter steht die Karte **„Was da ist"** — die realen Stände je Kontoklasse, über ALLE
Konten. Die Klasse ist die Rechenregel und jedes Konto hat genau eine, die Summen addieren
sich also zum Ganzen. Jede Bündelung, in der dasselbe Konto mehrfach vorkommen darf,
ergäbe hier „das Vermögen" grösser, als es ist — was man so ansehen will, gehört in die
Analyse.

**Sie zeigt seit 2026-11-15 auch, was GEBUNDEN ist**: unter jeder Klasse die Rücklagen
und aufbauenden Budgets, die ihr Geld dort haben, und was frei bleibt (`bilanzJeKlasse`
auf der Kontobelegung). Ein Stand ohne diese Aufteilung liest sich als verfügbar, auch
wenn er zur Hälfte einer Rücklage gehört. Die Rechnung gab es schon; zu sehen war sie
nur im Kontoauszug, je Konto. Drei Dinge daran:

- **Je Konto gerechnet, dann addiert.** Ein Überschuss auf dem einen Konto deckt die
  Lücke auf dem anderen nicht, solange niemand umbucht. Über die Summe der Klasse
  gerechnet verschwände genau die Unterdeckung, die man sehen soll.
- **Was fehlt, steht in Worten da**, nicht als negatives „frei". Es ist eine
  Einschränkung der Zahlen darüber.
- **Wo nichts gebunden ist, wird nichts aufgeteilt.** „Gebunden 0, frei alles" sagte
  nur, was die Zeile schon sagt.

**Die Karte „Da ist etwas zu tun" ist seit 2026-11-08 weg.** Sie stand ganz oben, rot
gerahmt, und meldete Konten, die im Vorschaufenster ins Minus laufen, dazu einen zu lange
zurückliegenden Abruf. Im Gebrauch war das zu laut für eine Seite, die sagen soll, wie man
dasteht. Die Rechnung dahinter (`liquiditaetsvorschau` in `core/konten/liquiditaet.ts`)
hat **seit 2026-11-15 ihren leiseren Ort**: das Register „Ausblick" der Analyse, als
Tabelle „Reicht das Geld?" (`../analyse/LiquiditaetKarte.tsx`). Sie gehört dorthin und
nicht zurück in die Übersicht — „reicht es in den nächsten Wochen" ist eine Frage nach
vorn über einen Zeitraum, und eine Warnung, die nur erscheint, wenn etwas brennt, war
genau das, was hier zu laut war. `veraltet` am Abrufstand hat weiterhin keine Oberfläche;
dass die Vorschau nur den letzten Abruf kennt, steht dort als Satz unter der Tabelle.

**Umbuchungen zwischen erfassten Konten stehen in keiner Zeile** — sie bewegen eigenes
Geld. Zwei Ausnahmen, und beide sind Vorsorge: die Umbuchung auf ein Konto der Klasse
Vorsorge oder Investment (`istVorsorgekonto`) und die Umschichtung ohne Gegenbein, etwa
ein Wertpapierkauf auf ein Depot, das die App nicht als Konto führt. Eine Umbuchung aufs
Sparkonto zählt nicht: Geld ohne Zweck beiseitezulegen ist Überschuss.

**Was die Karten noch nicht können**, steht im Kopf von `core/ergebnis.ts`: Einnahmen
werden nicht periodisiert, die Vorsorge zählt mit der tatsächlichen Umbuchung statt mit
der Rate eines Ziels, und der Kauf aus einer Rücklage wird nicht gegen ihren Stand
geprüft.
