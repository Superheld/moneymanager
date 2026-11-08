# Übersicht — was sie rechnet

Gilt für die Übersicht. Die Grenze zur Analyse steht in der Wurzel-`CLAUDE.md` unter „Die App in zehn Bereichen“. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

**Die Übersicht rechnet über die LIQUIDEN Konten** — Monatskarten und Budgetliste aus
derselben gefilterten Sicht. Gefiltert werden die BUCHUNGEN und Zahlungsregeln, nicht die
Budgets: jedes Budget führt seine Zeile, auch wenn sein Geld auf einem Rücklagenkonto
liegt, und trägt, was aus den liquiden Konten dafür abging. Seine Rate plant es dort
nicht (`budgetsOhnePlan`) — sie kommt über eine Umbuchung an, und die steht schon in
„Rücklagen" bzw. „Sparen & Vorsorge". Was auf Rücklagen- und Vorsorgekonten passiert, ist zurückgelegt
und steht für den Monat nicht zur Verfügung. Der Preis ist eine Aussage, die man kennen
muss: **dasselbe Budget kann in der Übersicht einen kleineren Verbrauch zeigen als im
Bereich Budgets** — dort steht der ganze Rahmen, hier nur, was aus den verfügbaren
Mitteln davon gegangen ist. Der Untertitel der Übersicht sagt es mit.

**Budgets stehen getrennt nach Art** — monatlich (Rest verfällt) und aufbauend (Rest
bleibt), in der Übersicht wie im Bereich Budgets — seit 2026-11-08 auch in den
Monatskarten, als zwei Zeilen „Budgets monatlich" und „Budgets aufbauend". Getrennt wird nach dem DACH eines
Budgetbaums, nicht je Zeile (`nachArtGetrennt`): ein aufbauendes Kind unter einem
monatlichen Dach wird aus diesem herausgerechnet und bleibt deshalb dort, mit Pille.

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

**Umbuchungen hängen in den Monatskarten am Kreis der liquiden Konten** (seit 2026-11-08,
`kreis` in `core/monatsausblick.ts`). Liegt das Zielkonto im Kreis, ist es eine interne
Verschiebung und fällt aus Plan und Ist heraus. Verlässt sie ihn, ist sie ein Abfluss:
auf ein Konto der Klasse Rücklage in der Zeile **„Rücklagen"**, sonst in **„Sparen &
Vorsorge"** — dort stehen auch Umschichtungen ganz ohne Gegenkonto, etwa ein Wertpapierkauf.
Gepaart werden Plan und Ist einer Umbuchung über Quell- und Zielkonto, nicht über die
Kategorie, die sie meist nicht trägt. Vorher fiel JEDE gepaarte Umbuchung aus dem Ist,
auch die aufs Rücklagenkonto: der Plan stand da, das Ist blieb leer.

**Die Zeile „Rücklagen" ist nicht die von früher.** Bis 2026-09-01 stand dort die
kalkulatorische Monatsrate aus dem Bedarf, in Plan und Ist mit demselben Betrag — neben
dem Umbuchungsvertrag zählte das dasselbe Zurücklegen zweimal. Die heutige Zeile ist die
Umbuchung selbst; den *Bedarf* gibt es weiter nur im Bereich Rücklagen. Deshalb zählen
Rücklagen auch nicht zu `hatPlandaten`: der Bedarf führt zu keiner Zeile.
