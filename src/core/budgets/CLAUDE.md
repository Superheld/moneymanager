# Budgets

Gilt für Budgets in Kern, Anwendung und Oberfläche. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## `budgetrelevant` — die eine Ausgabe, die kein Budget messen soll

Eine Spalte an `ist_buchung`, Vorgabe 1. Sie beschreibt — wie `zu_pruefen` — keine Tatsache
über die Zahlung, sondern eine Entscheidung darüber, wie sie ausgewertet wird; niemand
leitet sie aus den Daten ab.

Der Fall ist die teure Anschaffung, für die jahrelang zurückgelegt wurde. Sie ist eine echte
Ausgabe, aber keine, an der sich ein Monatsrahmen messen lassen müsste: sie spränge jeden,
und der überzogene Rahmen sagte danach nichts mehr über das Verhalten aus, das er steuern
soll. Gesetzt wird sie beim **Ausbuchen einer Rücklage** (die Verknüpfung leistet beides)
oder von Hand.

**Positiv benannt und mit Vorgabe 1**, beides mit Grund: ein `nicht_budgetrelevant` wäre
beim Lesen eine doppelte Verneinung und fiele in einem `WHERE` irgendwann falsch aus; und
ein fehlender Wert muss JA heissen, sonst fiele mit der Einführung der Spalte der ganze
Altbestand aus jedem Budget und die Rahmen sähen über Nacht grosszügig aus.

Wer sie auswertet, muss sie an **beiden** Stellen auswerten: im Verbrauch
(`budgetBuchungen`) und im Vorschlag (`budgetvorschlaege`). Nur im Verbrauch hiesse, einen
Rahmen vorzuschlagen, gegen den die Buchung anschliessend nicht zählt.

## Der Budgetbetrag ist eine Reihe, kein Wert

`budget_betrag` hält je Budget die Beträge mit dem **Monat, ab dem sie gelten**. Ein Budget
ohne Zeile dort ist keins — die letzte Version lässt sich nicht löschen, nur das ganze
Budget.

Der Grund ist derselbe wie beim Beleg: **eine Änderung darf die Vergangenheit nicht
umschreiben.** Vorher stand der Betrag als Spalte an `budget`, und wer im August von 400 auf
450 ging, sah rückwirkend jeden Monat mit 450 geplant — nicht mehr feststellbar, wogegen er
damals gemessen hatte. Bei einem aufbauenden Budget rechnete es zusätzlich den ganzen Sockel
neu, weil dessen Rahmen `Rate × Monate` war.

**MONAT und nicht Datum.** Ein Budget ist eine Monatsgrösse; ein Wechsel mitten im Monat
müsste anteilig gerechnet werden, und dafür gibt es keinen fachlichen Grund. Geändert wird
zum Ersten.

Wer den Betrag eines Monats braucht, fragt `betragImMonat` — **nie `betraege[0]` und nie den
letzten Eintrag.** Vor der ersten Version ist er 0, nicht der erste Betrag: da war nichts
geplant, und einen Rahmen rückwirkend anzunehmen hiesse, eine Planung zu erfinden, die es
nie gab. Aus demselben Grund summiert `budgetRahmen` beim Aufbauenden über die Monate,
statt zu multiplizieren.

**Wann die erste Version anfängt, sagt beim Anlegen der Nutzer.** Der Dialog zeigt seit
2026-09-13 für BEIDE Arten ein Feld „Gilt ab", vorbelegt mit dem laufenden Monat. Vorher
stand es nur beim Aufbauenden (dort als Sammelanker `start`), und ein monatliches Budget
begann zwangsläufig im laufenden Monat — wer eines für etwas anlegte, das seit dem Frühjahr
läuft, sah jeden Monat davor mit Rahmen 0 und in der Auswertung lauter Überziehungen, die
nie welche waren.

Das widerspricht der 0 oben nicht, sondern schärft sie: **eine Angabe ist keine Annahme.**
Rückwirkend von selbst zu füllen — etwa ab der ersten Buchung — bliebe verboten; der Monat
kommt von jemandem, der ihn hinschreibt.

**Ein Feld für beide Arten, nicht zwei.** Beim Aufbauenden setzt derselbe Monat zugleich
`start`. Zwei Felder für einen Zeitpunkt wären zwei Wahrheiten, und ihre erste Abweichung
fiele niemandem auf. Beim BEARBEITEN bleibt es der Anker und damit nur beim Aufbauenden
sichtbar: ab wann ein GEÄNDERTER Betrag gilt, sagt dort die Betragsreihe darüber.
