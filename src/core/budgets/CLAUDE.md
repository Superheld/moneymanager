# Budgets

Gilt für Budgets in Kern, Anwendung und Oberfläche. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Ein Budget ist monatlich (seit Migration 81)

Ein Budget ist ein Rahmen für EINEN Monat; was übrig bleibt, verfällt zum Ersten. Bis
Migration 81 gab es eine zweite Art, `aufbauend`, deren Rest liegen blieb — für den Nutzer
dieselbe Sache wie eine Rücklage, und seit 2026-11-15 stand sie in der Oberfläche schon
dort. Mit Migration 81 ist sie auch im Modell eine Rücklage, die weiterläuft
(`../ruecklagen/CLAUDE.md`), mit derselben Id, ihrer Betragsreihe als Ratenreihe und dem
Namen ihrer Kategorie. Die Spalte `budget.art` bleibt im Schema; `BudgetRepository.alle()`
liest nur `monatlich` und meldet ein stehengebliebenes aufbauendes laut, statt es still
mitzurechnen.

Drei Folgen, die man kennen muss:

- **`budgetAnlegen` legt nur noch monatliche an**, der Dialog hat kein Feld „Art", und
  der Bereich schlägt nur Budgets vor (unten, „Vorschläge"). An einer Kategorie, an der
  schon ein Budget oder eine Rücklage hängt, schlägt er nichts vor — und `budgetAnlegen` weist ein NEUES Budget an der Kategorie einer
  Rücklage ab (`budget.kategorieHatRuecklage`, seit Paket 5 des Umbaus), wie umgekehrt
  `ruecklage.kategorieHatBudget`. Dort gewönne das Budget, und die Rücklage fände still
  nichts mehr. Ein Altfall bleibt stehen.
- **Die Verschachtelung gilt weiter** (unten) — auch gegen eine Rücklage: hängt eine
  unter einem Budget, nimmt sie ihm ihre Buchungen ab (`zustaendigkeit`). Sie steht nicht
  in derselben Liste wie das Budget, und dessen Verbrauch wäre kleiner als die Ausgaben
  seiner Kategorie, ohne dass man sähe warum; die Zeile des Budgets nennt sie deshalb
  („ohne Rücklage Urlaub", `abgezogen` am `Budgetstand`, aus `herausgerechnet`).
- **Der Einrichtungsschritt „Budgets" zählt die Budgets**, der Schritt „Rücklagen" die
  Rücklagen — die früheren aufbauenden eingeschlossen (`core/einrichtung.ts`).

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
(`budgetBuchungen`) und im Vorschlag (`ausgabenvorschlaege`). Nur im Verbrauch hiesse, einen
Rahmen vorzuschlagen, gegen den die Buchung anschliessend nicht zählt.

## Vorschläge: Budgets hier, Rücklagen dort, EINE Einstufung

Aus den bisherigen Ausgaben stuft `core/ausgabenvorschlaege.ts` jede Hauptkategorie ein:
Ausgaben in genug Monaten → ein **Budget** (Median), nur selten, dann viel → eine
**Rücklage**, die weiterläuft (Durchschnitt über alle beobachteten Monate). Heraus kommen
zwei Listen mit eigenen Typen (`Budgetvorschlag`, `Ruecklagenvorschlag`); der Bereich
Budgets zeigt nur die erste, der Bereich Rücklagen nur die zweite.

Bis 2026-11-16 war es EINE Liste mit einem Feld `art`, und sie stand ganz im Bereich
Budgets: ein Vorschlag „Rücklage" öffnete dort den Dialog einer Rücklage, und wer ein
Budget erwartete, fand das Ergebnis in einem anderen Bereich. Drei Dinge daran sind
Entscheidung:

- **Die Einstufung bleibt eine Rechnung** und liegt deshalb in der Wurzel von Kern und
  Anwendung (`application/ausgabenvorschlaege.ts` lädt für beide Bereiche). Zwei
  Funktionen mit je einer Hälfte der Schwelle könnten auseinanderlaufen, und eine
  Kategorie stünde in beiden Karten oder in keiner.
- **Die Zahlen sind dieselben wie vorher**: dieselbe Kategorie bekommt denselben Betrag,
  nur im richtigen Bereich (`ausgabenvorschlaege.test.ts`).
- **Der Merkzettel ist je Bereich getrennt** — mit einer Ausnahme: der Bereich Rücklagen
  liest den alten Schlüssel `budgetvorschlag.ignoriert` mit, weil darin auch Rücklagen
  stehen können, die vor der Trennung über „kein Budget" verworfen wurden. Geschrieben
  wird dort nur `ruecklagenvorschlag.ignoriert`. Eine Migration braucht es nicht.

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
nie gab. Aus demselben Grund summiert die Ratenreihe einer Rücklage über die Monate,
statt zu multiplizieren (`ratenBis` in `../ruecklagen/topf.ts`).

**Wann die erste Version anfängt, sagt beim Anlegen der Nutzer.** Der Dialog zeigt seit
2026-09-13 ein Feld „Gilt ab", vorbelegt mit dem laufenden Monat. Vorher stand es nur
beim Aufbauenden (dort als Sammelanker `start`), und ein monatliches Budget
begann zwangsläufig im laufenden Monat — wer eines für etwas anlegte, das seit dem Frühjahr
läuft, sah jeden Monat davor mit Rahmen 0 und in der Auswertung lauter Überziehungen, die
nie welche waren.

Das widerspricht der 0 oben nicht, sondern schärft sie: **eine Angabe ist keine Annahme.**
Rückwirkend von selbst zu füllen — etwa ab der ersten Buchung — bliebe verboten; der Monat
kommt von jemandem, der ihn hinschreibt.

Beim BEARBEITEN steht das Feld nicht da: ab wann ein GEÄNDERTER Betrag gilt, sagt die
Betragsreihe darüber. Dieselbe Form hat seit Paket 4 die Ratenreihe einer Rücklage im
Dialog der Rücklage.

## Ein Dach gilt für alles ausser seinen Unterbudgets

Seit 2026-11-09, und das ist die Bedeutung, die gemeint war: „Mobilität" mit 50 €,
darunter „Tanken" mit 100 € heisst 50 € für alles in Mobilität ausser Tanken, und 100 €
fürs Tanken. Zwei Rahmen, zusammen 150 € im Monat. Das Unterbudget nimmt dem Dach
seine Kategorien weg (`budgetKategorien`, nur für den Verbrauch) und sonst nichts.

Vorher zog es zusätzlich seinen BETRAG vom Dach ab (`effektiverMonatsbetrag`, gelöscht),
als wäre das Dach ein Rahmen, der sich auf seine Teile verteilt. Bekam das Kind mehr als
das Dach, lief dessen Rate ins Minus, und ein aufbauendes Dach (damals gab es das) sank
Monat für Monat ohne eine einzige Ausgabe. Wer eine Aufteilung EINES Rahmens braucht, baut sie als eigene
Funktion — nicht als stille Verrechnung in der Rate.
