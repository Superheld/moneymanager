# Übersicht — was sie rechnet

Gilt für die Übersicht. Die Grenze zur Analyse steht in der Wurzel-`CLAUDE.md` unter „Die App in zehn Bereichen“. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

**Die Übersicht rechnet über die LIQUIDEN Konten** — Monatskarten und Budgetliste aus
derselben gefilterten Sicht. Gefiltert werden die BUCHUNGEN und Zahlungsregeln, nicht die
Budgets: jedes Budget führt seine Zeile, auch wenn sein Geld auf einem Rücklagenkonto
liegt, und trägt, was aus den liquiden Konten dafür abging. Seine Rate plant es dort
nicht (`budgetsOhnePlan`) — sie kommt über eine Umbuchung an, und die steht schon in
„Sparen & Vorsorge". Was auf Rücklagen- und Vorsorgekonten passiert, ist zurückgelegt
und steht für den Monat nicht zur Verfügung. Der Preis ist eine Aussage, die man kennen
muss: **dasselbe Budget kann in der Übersicht einen kleineren Verbrauch zeigen als im
Bereich Budgets** — dort steht der ganze Rahmen, hier nur, was aus den verfügbaren
Mitteln davon gegangen ist. Der Untertitel der Übersicht sagt es mit.

**Budgets stehen getrennt nach Art** — monatlich (Rest verfällt) und aufbauend (Rest
bleibt), in der Übersicht wie im Bereich Budgets. Getrennt wird nach dem DACH eines
Budgetbaums, nicht je Zeile (`nachArtGetrennt`): ein aufbauendes Kind unter einem
monatlichen Dach wird aus diesem herausgerechnet und bleibt deshalb dort, mit Pille.

Zwei Karten hängen daran und beantworten je eine eigene Frage:

- **„Was da ist"** — die realen Stände je Kontoklasse, über ALLE Konten. Die Klasse ist
  die Rechenregel und jedes Konto hat genau eine, die Summen addieren sich also zum
  Ganzen. Jede Bündelung, in der dasselbe Konto mehrfach vorkommen darf, ergäbe hier „das
  Vermögen" grösser, als es ist — was man so ansehen will, gehört in die Analyse.
- **„Da ist etwas zu tun"** — Konten, die im Vorschaufenster ins Minus laufen. Sie steht
  ganz oben und ist die einzige Karte, die VERSCHWINDET, wenn nichts anliegt: eine
  dauerhafte Zeile „alles in Ordnung" wäre nach zwei Wochen unsichtbar, und dann fiele
  auch die Warnung nicht mehr auf.

**Die Rücklagen haben in den Monatskarten seit 2026-09-01 keine Zeile mehr.** Sie stand
dort als kalkulatorische Monatsrate, in Plan und Ist mit demselben Betrag. Seit sich
Rücklagen über einen **Umbuchungsvertrag planen** lassen, steht dasselbe Zurücklegen schon
als geplante Umschichtung in der Zeile „Sparen & Vorsorge" — beides nebeneinander zählte
es zweimal. Die Rechnung selbst gibt es weiter, im Bereich Rücklagen als *Bedarf* neben
Plan und Ist. Aus demselben Grund zählen Rücklagen nicht mehr zu `hatPlandaten`: was zu
keiner Zeile führt, darf nicht darüber entscheiden, ob die Karten überhaupt erscheinen.
