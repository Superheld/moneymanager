# Übersicht — was sie rechnet

Gilt für die Übersicht. Die Grenze zur Analyse steht in der Wurzel-`CLAUDE.md` unter „Die App in zehn Bereichen“. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

**Die Übersicht rechnet über die LIQUIDEN Konten** — Monatskarten und Budgetliste aus
derselben gefilterten Sicht. Gefiltert werden die BUCHUNGEN und Zahlungsregeln, nicht die
Budgets: jedes Budget führt seine Zeile, auch wenn sein Geld auf einem Rücklagenkonto
liegt, trägt, was aus den liquiden Konten dafür abging, und plant seine Rate. Bis
2026-11-09 plante es sie dort nicht (`budgetsOhnePlan`), weil sie als Umbuchung schon in
einer eigenen Zeile stand; seit die Umbuchungen herausfallen (unten), stünde sie sonst
nirgends. Der Preis ist eine Aussage, die man kennen
muss: **dasselbe Budget kann in der Übersicht einen kleineren Verbrauch zeigen als im
Bereich Budgets** — dort steht der ganze Rahmen, hier nur, was aus den verfügbaren
Mitteln davon gegangen ist. Der Untertitel der Übersicht sagt es mit.

**Budgets stehen getrennt nach Art** — monatlich (Rest verfällt) und aufbauend (Rest
bleibt), in der Übersicht wie im Bereich Budgets und in den Monatskarten als zwei Zeilen
„Budgets monatlich" und „Budgets aufbauend". Seit 2026-11-09 nach der Art JEDES Budgets,
nicht mehr nach dem Dach seines Baums: ein aufbauendes Kind unter einem monatlichen Dach
steht bei den aufbauenden. Doppelt zählt dabei nichts: ein Dach gilt für alles ausser
seinen Unterbudgets, Betrag wie Verbrauch sind getrennte Töpfe (`core/budgets/budget.ts`,
Kopf). Bis 2026-11-09 zog das Kind seinen Betrag vom Dach ab — ein aufbauendes Dach mit
grösserem Kind sank dadurch jeden Monat, ohne dass etwas ausgegeben wurde.

Daran hängt die Karte **„Was da ist"** — die realen Stände je Kontoklasse, über ALLE
Konten. Die Klasse ist die Rechenregel und jedes Konto hat genau eine, die Summen addieren
sich also zum Ganzen. Jede Bündelung, in der dasselbe Konto mehrfach vorkommen darf,
ergäbe hier „das Vermögen" grösser, als es ist — was man so ansehen will, gehört in die
Analyse.

**Die Karte „Da ist etwas zu tun" ist seit 2026-11-08 weg.** Sie stand ganz oben, rot
gerahmt, und meldete Konten, die im Vorschaufenster ins Minus laufen, dazu einen zu lange
zurückliegenden Abruf. Im Gebrauch war das zu laut für eine Seite, die sagen soll, wie man
dasteht. Die Rechnung dahinter (`liquiditaetsvorschau` in `core/konten/liquiditaet.ts`)
ist geblieben und getestet, hat aber keine Oberfläche mehr; ebenso `veraltet` am
Abrufstand. Wer sie wieder zeigt, sucht ihr einen leiseren Ort.

**Die Monatskarten rechnen Umbuchungen über ALLE erfassten Konten** (seit 2026-11-09,
`kreis` in `core/monatsausblick.ts`). Eine Umbuchung vom Giro aufs Tagesgeld, Spar- oder
Rücklagenkonto bewegt eigenes Geld — sie fällt aus Plan und Ist heraus, gleich welcher
Klasse das Ziel ist. Stehen bleibt nur, was die erfassten Konten verlässt, in der Zeile
**„Umbuchungen nach außen"**: eine Umschichtung ohne Gegenkonto, etwa ein Wertpapierkauf
auf ein Depot, das die App nicht als Konto führt. Am 2026-11-08 war der Kreis einen Tag
lang die liquiden Konten; dann stand die Überweisung aufs Sparkonto als „Sparen &
Vorsorge" in der Karte, und ob sie als Rücklage erschien, hing an der Klasse des Ziels.

**Die Zeile „Rücklagen" ist eine Rechnung, keine Überweisung**: je Rücklage der Zuwachs
ihres Solls im Monat, in Plan und Ist mit demselben Betrag. Gebunden ist die Rate, ob
überwiesen wurde oder nicht; ist das Ziel erreicht, bindet sie nichts mehr. So stand die
Zeile bis 2026-09-01 schon einmal da und flog heraus, weil dasselbe Zurücklegen daneben
als geplante Umbuchung stand und doppelt zählte — **wer Umbuchungen wieder in die Karte
holt, holt diese Doppelzählung mit.** Rücklagen zählen deshalb auch wieder zu
`hatPlandaten`.
