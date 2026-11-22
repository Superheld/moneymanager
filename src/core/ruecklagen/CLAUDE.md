# Rücklagen

Gilt für Rücklagen in Kern, Anwendung und Oberfläche. Was überall gilt, steht in der `CLAUDE.md` des Projekts.

**Rücklagen kennen keine Budgets** (seit 2026-11-16, `src/architektur.test.ts`,
„Modulgrenzen"): nichts unter `ruecklagen/` bezieht etwas aus `budgets/` — kein Import,
kein Name über die Fassade, kein Use-Case über `dienste`, kein Schlüssel `budgets.…` in
der Oberfläche, auch nicht in einem Baustein, den der Bereich benutzt. Eine Rücklage
braucht für ihren Stand kein Budget. Wo das Budget doch mitspricht — am selben Knoten
gewinnt es, darunter nimmt es ihr Buchungen ab —, ist das eine Abwägung zwischen beiden
und steht bereichsübergreifend in `core/zustaendigkeit.ts`; dort holt die Rücklage ihre Entnahmen
(`ruecklagenEntnahmenAus`). Gleich lautende Texte bekommen eigene Schlüssel unter
`ruecklagen.…`.

## Eine Rücklage: Sorte, Form, Kategorie (ADR-0006)

Seit Migration 81 gibt es EINE Sache, die Geld Monat für Monat für etwas Späteres
zurücklegt, und sie heisst Rücklage. Bis dahin waren es zwei — die Rücklage von Hand und
das aufbauende Budget —, und wer etwas zurücklegen wollte, musste zuerst raten, in welchen
der beiden Bereiche es gehört. Eine Rücklage beantwortet drei Fragen, jede mit ihrem Feld:

| Frage | Feld | Werte |
|---|---|---|
| Beginnt sie je wieder bei null? | **Sorte** (`art`) | `fortlaufend` — „läuft weiter", nie; `abschliessend` — „wird abgeschlossen", wenn du sie abschliesst |
| Woraus ergibt sich die Rate? | **Form** | mit Ziel (`ziel` + `frist_monate`, Rate = Ziel ÷ Frist, gedeckelt aufs Ziel) oder frei (Reihe `ruecklage_rate`) |
| Was trägt sie? | **Kategorie** (`kategorie_id`) | die Ausgaben dieser Kategorie samt Unterkategorien, ab ihrem Fundfenster (`findet_ab`) |

**Sorte und Form sind zwei Felder**, weil die Entscheidung genau diese beiden Fragen
trennt: ein Urlaub kann ein Ziel haben und abgeschlossen werden, Reparaturen eine freie
Rate und weiterlaufen. Bis Paket 4 entschied die Form allein, was nach dem Ausbuchen
geschah (mit Ziel neu beginnen, frei beenden). Seit Paket 5 wählt beim Abschliessen der
Nutzer, ob sie neu beginnt oder endet (unten); nur das Ausbuchen des Altbestands ohne
Kategorie folgt weiter der Form.

**Die Sorte steht mit dem Anlegen fest** (`ruecklagenPflege`, im Dialog beim Bearbeiten nur
angezeigt). Sie entscheidet, was ein leeres `findet_ab` heisst und wie der Stand eines
Monats zählt (unten); ein Wechsel änderte vergangene Monate.

**Die Kategorie ist Pflicht** — beim Anlegen und bei jedem Speichern. Eine Rücklage ohne
Kategorie aus der Zeit davor bleibt gültig und rechnet wie vorher: sie findet nur über
ihre Ausbuchung, steht nie zur Wahl, und erst wer sie bearbeitet, muss eine eintragen
(dann findet sie ab dem Tag des Speicherns). Erfunden wird keine.

**Die freie Rate ist eine Reihe mit „gilt ab"**, wie der Budgetbetrag
(`../budgets/CLAUDE.md`): eine geänderte Rate gilt ab dem gewählten Monat, die Monate
davor behalten ihre; die letzte Version lässt sich nicht entfernen
(`ruecklageRateLoeschen`).

Ziel oder Rate, nie beides, und die Kategorie: durchgesetzt an der Anwendungsgrenze
(`ruecklagenPflege`), nicht im Schema — die Spalten sind nullable, weil SQLite ein „genau
eines von beiden" nicht ausdrücken kann, ohne dass die Migration zur Fingerübung wird.

Bis zum 31.08.2026 hiess das **Inventar** und meinte einen GEGENSTAND: Wiederbeschaffung ÷
Nutzungsdauer. Die Rechnung ist geblieben, die Behauptung ist weg, dass am anderen Ende ein
Ding steht — man legt auch für einen Urlaub zurück.

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

**Das Abschliessen schreibt dieselbe Aufzeichnung** (seit Paket 5): eine Zeile in
`ruecklage_ausbuchung` mit dem festgehaltenen Zyklus, aber ohne Buchung und mit Betrag 0.
Eine eigene Tabelle hätte eine Migration gekostet und zwei Stellen für dasselbe Ereignis
geschaffen; `zyklen()` sieht den Zyklus so ohne Zutun als abgeschlossen. Die Geschichte
erkennt ein Abschliessen an genau dem, was ihm fehlt (keine Buchung, kein Betrag, aber eine
Kategorie und ein Zyklus) und zeigt dafür statt des Eingetragenen, was die Rücklage im
Zyklus über ihre Kategorie trug, und was frei geworden ist (`abschlussstaende` in
`topf.ts`, Spalte „Frei geworden"). Ein Minus steht unter „Ungedeckt".

**Gebucht wird beim Ausbuchen nichts.** Der Kauf ist eine ganz normale Ausgabe vom Konto,
und weil die Deckung gegen den REALEN Kontostand rechnet, fällt sie durch die Abbuchung von
selbst. Eine zweite, kalkulatorische Buchung zeigte dieselbe Bewegung doppelt.

## Abschliessen — und Ausbuchen nur noch im Altbestand

**Eine Rücklage, die weiterläuft, wird weder abgeschlossen noch ausgebucht**
(`ruecklage.laeuftWeiterAbschluss`, `ruecklage.laeuftWeiter`; in der Liste steht an ihr
kein Knopf). Sie trägt ihre Ausgaben über die Kategorie und beginnt nie neu — so rechnete
auch das aufbauende Budget, aus dem sie mit Migration 81 wurde.

**Eine, die abgeschlossen wird, wird ABGESCHLOSSEN, sobald sie eine Kategorie hat**
(`application/ruecklagen/ruecklageAbschliessen.ts`, Dialog `ui/ruecklagen/AbschlussDialog`,
seit Paket 5). „Mit dem Kauf" und „am Ende des Urlaubs" sind derselbe Handgriff, und es
gibt keine Buchungswahl: die Ausgaben hat sie über die Kategorie oder die Zuordnung schon
gefunden. Der Dialog zeigt den Stand am gewählten Tag (`abschlussvorschau`) und lässt
wählen: **neu beginnen** (ab dem Abschlusstag bei null, mit Ziel auf Wunsch mit neuem Ziel)
oder **beenden**. Vorbelegt ist, was das Ausbuchen bis Paket 4 von selbst tat — mit Ziel
neu, frei beenden. Vorgeschlagen wird das Abschliessen nie von selbst.

Was beim Abschliessen gilt, ist entschieden und keine Mechanik:

- **Was übrig ist, wird frei — nur auf dem Konto.** Der Anspruch fällt auf den neuen Zyklus
  bzw. weg; die Ergebnisrechnung bekommt KEINEN Posten dafür, die Raten bleiben Kosten
  ihrer Monate (ADR-0006, „Konservativ gelöst"). Ein Minus hat seinen Monat schon gekostet.
- **Die Rate des Abschlussmonats gehört dem neuen Zyklus** (die bestehende Regel in
  `zyklen`). Beginnt sie neu, kostet der Monat dieselbe Rate wie ohne Abschluss; wird sie
  beendet, entfällt sie — wie jede danach. Im Minus und neu begonnen kostet der Monat das
  Ungedeckte des alten Zyklus und die erste Rate des neuen. Kein Monat VOR dem
  Abschlussmonat ändert sich; `abschluss.test.ts` prüft jede Zeile und die Überleitung.
- **Der Tag liegt im laufenden Monat, nicht nach heute und nicht vor dem Beginn des
  laufenden Zyklus** (`ruecklage.abschlussVormonat`, `…Zukunft`, `…VorBeginn`). Ein
  früherer Tag schöbe die Rate jenes Monats und die Ausgaben danach in den neuen Zyklus —
  ein abgeschlossener Monat kostete dann anders. Der Preis: wer den Monatswechsel
  verpasst, schliesst mit einem Tag im neuen Monat ab.

**Ausgebucht wird nur noch eine Rücklage OHNE Kategorie**, der Altbestand von vor der
Umstellung: wie vorher mit Buchungswahl (`buchungswahlFuer`), `budgetrelevant = false` an
der verknüpften Buchung und der alten Kostenregel. Eine mit Kategorie weist
`ruecklageAusbuchen` ab (`ruecklage.abschliessenStattAusbuchen`): eine verknüpfte Buchung
ihrer Kategorie zählte sonst nach der alten Regel UND über die Kategorie.

## Was die Kategorie einer Rücklage tut

**Sie findet ihre Ausgaben**, ab dem Tag in `findet_ab`: die Rücklage trägt jede Ausgabe
ihrer Kategorie samt Unterkategorien; davor gilt, was ohne sie gälte, und deshalb kostet
kein Monat vor der Umstellung anders. Was ein LEERES `findet_ab` heisst, hängt an der
Sorte:

| | `findet_ab` leer heisst | wer so dasteht |
|---|---|---|
| `fortlaufend` | **ohne Anfang** — die Kategorie gehört ihr zu jedem Datum | die früheren aufbauenden Budgets (Migration 81), so wie die Einordnung sie immer behandelt hat |
| `abschliessend` | **findet nichts** über die Kategorie | eine Rücklage von Hand vor Migration 80, eine beendete |

Eine neu angelegte Rücklage findet ab ihrem Beginn — beide Sorten; eine nachgetragene
Kategorie ab dem Tag des Speicherns (`ruecklageAktualisieren`), sonst änderte das
Nachtragen vergangene Monate. Der Anspruch auf dem Konto sinkt um das Gefundene
(`anspruchAm` in `ruecklage.ts`): er ist der Stand über null, und eine Rücklage im Minus
beansprucht nichts.

Drei Fälle, die man kennen muss:

- **Mehrere Rücklagen an derselben Kategorie: die Buchung wartet** — aber nur an Tagen, an
  denen mehr als eine findet. Sie zählt dann als ungeplant und trägt die Pille „wartet auf
  Zuordnung", bis jemand im Buchungsdialog oder auf der Karte „Wartet auf Zuordnung" im
  Bereich wählt, welche Rücklage sie trägt — oder „keine Rücklage" (`ruecklageZuordnen`,
  Tabelle `ruecklage_zuordnung`, je Anteil über seine Kategorie benannt). Vorbelegt wird
  nichts. Was auf der Karte steht, kommt aus derselben Einordnung wie die Pille
  (`application/ruecklagen/wartendeZuordnungen.ts`); ist nichts offen, steht sie nicht
  da. Der Dialog der Rücklage sagt vorher, wenn an der gewählten Kategorie schon eine
  hängt. **Hängt ein früheres aufbauendes Budget mit
  anderen an einer Kategorie**, gehört ihm vor DEREN `findet_ab` jede Buchung weiter
  allein; erst danach wartet sie (`fundfenster.test.ts`, „Paket 4").
- **Eine Ausgabe darf auch einer Rücklage AUSSERHALB ihrer Kategorie gehören** (seit
  2026-11-22, Nachtrag zu ADR-0006). Der Fall: Fernseher und Rechner stehen beide unter
  „Elektronik", der Fernseher soll aber die Rücklage „Fernseher" belasten. Zur Wahl steht
  dafür jede laufende Rücklage, die **abgeschlossen wird**, eine Kategorie hat und deren
  laufender Zyklus am Tag der Buchung schon begonnen hat (`fremdeRuecklagen` in
  `zuordnung.ts`); geprüft in `ruecklageZuordnen`, dazu nur bei einer Ausgabe ohne
  Gegenbein (`ruecklage.nurAusgaben`). Gespeichert wird dieselbe Zeile in
  `ruecklage_zuordnung` wie beim Warten, und weil die Zuordnung in `zustaendigkeit` vor
  allem anderen kommt, trägt danach die Rücklage den Anteil — was an seiner Kategorie
  hängt, sieht ihn nicht mehr. Drei Grenzen, alle konservativ: eine, die **weiterläuft**,
  bleibt an ihrer Kategorie (sie trägt eine Art von Ausgaben auf Dauer; einzelne Käufe von
  woanders machten ihren Stand zu einer Sammlung von Ausnahmen); **nicht vor ihrem
  Beginn** (eine solche Entnahme zählt in keinem Zyklus und kostete nirgends); eine
  Buchung mit **Vertrag** bekommt keine Wahl (sie bleibt Fixkosten, die Zuordnung änderte
  nichts). Dass Budgetverbrauch, Ergebnis und Anspruch dieselbe Buchung gleich behandeln
  — auch bei `budgetrelevant = false` —, prüft `fundfenster.test.ts` („Wirkung 4").
  Im Dialog steht die Wahl dafür hinter „Aus einer Rücklage bezahlt?", wenn an der
  Kategorie nichts zu entscheiden ist (`noetig` an der Wahl).
- **Ein monatliches Budget am selben Knoten gewinnt immer.** Eine NEUE Rücklage an dessen
  Kategorie weist die Anwendung ab (`ruecklage.kategorieHatBudget`, Hinweis auf eine
  Unterkategorie), seit Paket 5 ebenso ein neues Budget an der Kategorie einer Rücklage
  (`budget.kategorieHatRuecklage` in `budgetAnlegen`); ein Altfall bleibt stehen, und die
  Rücklage findet dort nur ausdrücklich Zugeordnetes. Bis Paket 4 ging auch ein aufbauendes Budget am selben
  Knoten jeder Rücklage vor; mit Migration 81 ist es selbst eine.
- **Ohne Kategorie rechnet eine Rücklage wie vorher** (oben).

Eine Rücklage auf einer Unterkategorie nimmt dem monatlichen Budget darüber ihre Buchungen
ab, wie ein Unterbudget; das Budget sagt es an seiner Zeile („ohne Rücklage …",
`herausgerechnet` in `zustaendigkeit.ts`, nur für Rücklagen, deren Fenster den Tag enthält).

## Der Wertverlust neben dem Stand — nur Anzeige

Seit Migration 82 kann eine Rücklage, die **abgeschlossen wird**, sagen, was sie einmal
ersetzen soll: Kaufdatum, Kaufpreis, Nutzungsdauer in Monaten (`Ruecklage.kauf`, Spalten
`kauf_datum`, `kauf_preis`, `nutzungsdauer_monate`; alle drei oder keins, geprüft in
`ruecklagenPflege`). Der Fall: ein Fernseher, vor zwei Jahren gekauft, hält fünf Jahre —
die Rücklage dafür beginnt erst später bei null, und ihr Stand allein sagt nicht, dass der
Fernseher schon zwei Fünftel seines Werts verloren hat.

- **Gerechnet wird damit nichts.** Stand, Raten, Kosten, Ergebnis und Kontobelegung lesen
  `kauf` nicht; die Umstellungsprobe bleibt unverändert grün. Die Zahl ist eine Auskunft
  neben dem Stand, keine zweite Rechnung.
- **Linear auf null, in vollen Monaten** (`wertverlustAm` in `wertverlust.ts`): Kaufpreis ×
  volle Monate seit dem Kauf ÷ Nutzungsdauer, gedeckelt auf den Kaufpreis. Kein Restwert,
  keine andere Kurve — das wären Annahmen, die niemand getroffen hat.
- **Die Liste zeigt ihn klein neben dem Stand** („Wertverlust bis heute … · fehlt …", das
  Fehlende nur, wenn der Stand darunter liegt); die grosse Zahl bleibt der Stand. Schmal
  eine kleine Zeile unter dem Balken.
- **Der Verlauf zeichnet ihn als zweite, gestrichelte Linie** (`ruecklagenWertverlust`,
  `zweiteLinie` an `VerlaufChart`), ab dem Kauf — liegt der vor dem Beginn der Rücklage,
  stehen davor leere Monate nur mit dieser Linie.
- **Nur bei einer, die abgeschlossen wird** (`ruecklage.kaufNurAbschliessend`): sie steht
  für EINEN Gegenstand. Eine, die weiterläuft, trägt eine Art von Ausgaben auf Dauer; ein
  Kaufdatum hätte dort keinen Gegenstand.
- **Beim Abschliessen bleibt die Angabe stehen**; wer den neuen Gegenstand einträgt, ändert
  sie im Dialog. Von selbst wird nichts umgeschrieben.

## Zwei Kostenregeln, und wo jede gilt

| Regel | gilt für | rechnet |
|---|---|---|
| **max-Regel** (`zyklusKosten`) | jeden Zyklus ausser dem unten: den laufenden, jede fortlaufende, jeden neuen Abschluss | Kosten bis M = max(Raten bis M, Entnahmen bis Ende M) |
| **alte Regel** (`altabschlussKosten`) | einen Zyklus, den VOR der Umstellung eine Ausbuchung mit verknüpfter Buchung abgeschlossen hat | jeder Monat seine Rate, im Kaufmonat dazu, was der Kauf über dem Angesparten am Abschlusstag lag |

Beides trifft nie im selben Zyklus zusammen. Die alte Regel bleibt, weil die max-Regel
das Ungedeckte in andere Monate verschöbe, sobald Kaufdatum und Abschlussmonat
auseinanderliegen. **Die Ergebnisrechnung führt alle in EINER Zeile** (`abschreibungen`,
angezeigt als „Rücklagen"), zusammengelegt in `core/ergebnis.ts`: Monatskarten,
Kostensicht, Bericht, Reichweite und Kennzahlen lesen dieselbe Zeile.

## Was je Sorte konservativ wie vorher rechnet

Teil B des Entwurfs zu ADR-0006, Abschnitt 5: wo die beiden Vorgänger verschieden
rechneten, rechnet die Sorte, die aus ihnen wurde, weiter wie ihr Vorgänger.

| | `fortlaufend` (wie das aufbauende Budget) | `abschliessend` (wie die Rücklage von Hand) |
|---|---|---|
| Stand am Tag X (`ruecklagenstand`, Soll und Anspruch) | die Rate des laufenden Monats zählt mit, Entnahmen bis Monatsende | Raten erst ab dem Folgemonat, Entnahmen bis X |
| Bedarf im Fluss (`ruecklagenBedarf`) | die Rate des laufenden Zyklus in diesem Monat, 0 vor dem Beginn | Ziel ÷ Frist bzw. die Rate — auch am Ziel |
| Rücklagenkonto (`ruecklagenKonten`, Tacho, Eingänge) | ihr Konto nur, wenn es NICHT liquide ist | ihr Konto, gleich welcher Klasse |
| Monatsausblick (`monatsausblick.ts`) | in der Zeile `budgetsAufbauend`, mit der Rate der Reihe | nicht darin |
| Posten der Ergebnisrechnung | die Entnahme ist alles, was sie im Monat trug | die Entnahme im Fenster des Zyklus |

Die Ergebnisrechnung berührt das nicht: beide belasten den Monat mit ihrer Rate.

**Warum beim Konto der fortlaufenden nur die nicht liquiden:** ein Budget MUSSTE ein Konto
nennen, und meist war es das Girokonto, von dem auch bezahlt wird. Zählte das mit, wäre
jedes Gehalt dort ein „Eingang" in die Rücklagen und der Tacho mässe das Girokonto. Eine
abschliessende nennt ihr Konto dagegen freiwillig und eigens dafür.

## Die Kennzahlen des Bereichs

| Kennzahl | zählt | warum so |
|---|---|---|
| Ziele gesamt | nur Rücklagen MIT Ziel | die anderen haben keins |
| Soll heute | der Stand jeder Rücklage über null | was heute dasein sollte |
| Tatsächlich da | was die Kontobelegung ihnen zuteilt | EINE Rechnung für gedeckt, `ruecklagenDeckung` liest sie |
| Deckungsgrad | Tatsächlich da ÷ Soll mit Konto | ein Soll ohne Konto hat kein Gegenstück |
| Bedarf | `ruecklagenBedarf` (oben) | was die Rechnung diesen Monat verlangt |

`ruecklagenDeckung` hat seit Migration 81 EINE Liste (`posten`, je Rücklage eine). Bis
dahin standen die aufbauenden Budgets als `ueberKategorie` daneben; in den Summen zählten
sie schon seit 2026-11-16, an den Summen ändert sich deshalb nichts. Der Satz „nur
Rechnung" steht, wenn keine Rücklage ein Konto nennt.

## Der Rücklagenfluss ist DREI Zahlen, nicht eine

`core/ruecklagen/fluss.ts` beantwortet „was wird zurückgelegt" mit drei Werten, und keiner
davon ersetzt einen anderen:

| | woher | sagt |
|---|---|---|
| **Bedarf** | Σ Monatsraten beider Sorten (`ruecklagenBedarf`, je Sorte wie oben; der Monat, in dem das Fenster beginnt) | was die Rechnung verlangt |
| **Plan** | Σ Umbuchungsregeln auf Rücklagenkonten | was du eingerichtet hast |
| **Eingegangen** (`ist`) | jede Einzahlung auf ein Rücklagenkonto im Fenster, Zinsen eingeschlossen; Umbuchungen nur, wenn sie nicht von einem anderen Rücklagenkonto kommen | was tatsächlich angekommen ist — bis 2026-11-08 „geflossen" und nur das abgehende Bein vom liquiden Konto |

Bedarf über Plan heisst: du legst zu wenig zurück, die Deckung wird schlechter, ohne dass
irgendwo etwas schiefgeht. Plan über Ist heisst: die Überweisung ist ausgefallen. Eine
Zahl allein könnte keine dieser Aussagen treffen.

**Wohin gerechnet wird, entscheidet `ruecklagenKonten`:** zurückgelegt ist, was von einem
liquiden Konto auf ein Konto der Klasse **Rücklage** geht — oder auf eines, dem eine
Rücklage zugeordnet ist (eine fortlaufende nur mit einem nicht liquiden, oben). Die
Zuordnung kam am 2026-11-09 dazu: allein über die Klasse sah, wer seine Rücklagen auf
einem Konto der Klasse „Sparen" führte, keinen Eingang und einen Tacho auf null. Dieselbe
Menge misst der Tacho (`ruecklagenStand`): den Kontostand, nicht die Deckung — die
Faustformel fragt nach dem Notgroschen, nicht danach, wem er schon gehört.

Bedarf und Plan sind **Monatsgrössen** und hängen nicht am Fenster; nur `ist` summiert über den
Zeitraum. Wer sie über mehrere Monate vergleicht, muss die ersten beiden hochrechnen — das
im Kern zu tun hiesse zu raten, wie viele Monate gemeint sind.

## Wo das Geld liegt — alle Konten auf einem Blatt

Die Karte im Bereich (seit 2026-11-16, `ui/ruecklagen/GeldJeKontoKarte`) zeigt je Konto,
das einen Anspruch trägt, dieselbe Belegung wie die Karte „Gebunden auf …" im
Kontoauszug — beide über `ui/bausteine/BelegungTabelle`. Die Sicht kommt aus
`application/ruecklagen/geldJeKonto.ts`, die Zahlen aus der Kontobelegung; ausgewählt wird
dort nur, welche Konten etwas tragen und welche Rücklage auf keinem liegt.

Drei Entscheidungen:

- **Sie steht nach der Liste** (und nach „Wartet auf Zuordnung"), vor der Geschichte. In
  der Liste wird gearbeitet (anlegen, abschliessen); hier wird nachgesehen.
- **„Ohne Konto" ist ein eigener Abschnitt am Ende**: eine Rücklage ohne Konto oder mit
  einem gelöschten. Die Spalte „Sorte" sagt, ob sie weiterläuft; die Zeile öffnet den
  Dialog, in dem man das Konto einträgt.
- **Ein stillgelegtes Konto steht da, solange etwas darauf beansprucht wird** — das Geld
  liegt dort, ob das Konto noch geführt wird oder nicht.

## Der Verlauf im Monat eines Abschlusses

`ruecklagenFortschreibung` rechnet im Abschlussmonat BEIDE Zyklen: der alte bringt seinen
Übertrag und was er bis zum Abschlusstag trug, der neue, was er danach trug, und was der
alte am Abschlusstag noch hatte, steht als `abgeschlossen` am Monat (positiv frei geworden,
negativ das Minus). So geht der Monat auf: Übertrag + Zuführung − Verbrauch − abgeschlossen
= Rest, und der Rest ist der Stand des neuen Zyklus. Bis Paket 5 fing die Reihe dort bei
null an, und der Monat zeigte Buchungen, die in keiner Zahl darüber vorkamen. Die Zeile
im Verlauf sagt dazu „abgeschlossen, frei geworden …" bzw. „im Minus abgeschlossen".

## Vorschläge aus den Ausgaben

Seit 2026-11-16 schlägt der Bereich Rücklagen selbst vor (`ui/ruecklagen/VorschlaegeKarte`,
unter der Liste): für jede Hauptkategorie, in der nur selten etwas anfällt, dann viel,
eine Rücklage, die weiterläuft — vorbelegt mit Kategorie, Name und Rate. Bis dahin stand
dieser Vorschlag als Art „Rücklage" im Bereich Budgets. Eingestuft wird für beide Bereiche
an einer Stelle; Regeln, Zahlen und der Merkzettel (der hier den alten Schlüssel der
Budgets mitliest) stehen in `../budgets/CLAUDE.md` unter „Vorschläge".

## Wie der Umbau hierher kam (ADR-0006)

Fünf Pakete, die Migrationen 79 bis 81; Paket 5 kam ohne Migration aus. Was davon noch wirkt:

- **Migration 79** legte das Schema an (Sorte, `findet_ab`, `ruecklage_rate`,
  `ruecklage_zuordnung`), **80** überführte die freie Rate in die Reihe und liess jede
  laufende Rücklage von Hand mit Kategorie ab dem Tag der Umstellung finden, **81** machte
  aus jedem aufbauenden Budget eine Rücklage der Sorte `fortlaufend` mit derselben Id,
  ohne Fundanfang, mit der Betragsreihe als Ratenreihe und dem Namen der Kategorie.
  Abgeräumt wurde nur, was je Zeile geprüft überführt ist; ein Budget, dessen Id schon
  eine Rücklage trug, bleibt stehen, und `BudgetRepository.alle()` meldet es laut.
- **Die Probe** `src/umstellungsprobe.test.ts` rechnet drei Bestände (den Spielstand und
  zwei harte) in jedem Zustand — vor 80, nach 80, nach 81, beim Spielstand mit der echten
  SQL — gegen EINE Erwartung, die mit dem Code VOR der Umstellung erzeugt ist: jede Zeile
  der Ergebnisrechnung, die Einordnung jedes Anteils, Belegung, Deckung, Budgetstände,
  Monatsausblick. Seit 81 bringt sie das Ergebnis in die Form von damals (`inAlterForm`),
  rechnet aber nichts selbst.
- **Zwei Befunde werden nachgebildet und nicht behoben**, beide mit Test in
  `fundfenster.test.ts`: eine Kategoriebuchung VOR dem Beginn einer früheren aufbauenden
  ist eine Entnahme und kostet nichts; ein Kauf, den zwei Ausbuchungen nennen, zählt in
  beiden als ungedeckt. **Eine Abweichung** ist benannt (`topf.test.ts`): ein aufbauendes
  Budget ohne `start` (nur in einer von Hand geänderten Datei) zählt seine Ausgaben jetzt
  ab dem ersten Betragsmonat; vorher kosteten sie nie etwas.

- **Paket 5** brachte das Abschliessen (oben) und die Karte „Wartet auf Zuordnung" — ohne
  Migration: der Abschluss ist eine Zeile in `ruecklage_ausbuchung` ohne Buchung.

Noch offen ist nur, was der Entwurf als Paket 6 führt: die Spalte `ruecklage.rate`
abräumen, sobald sie nachweislich leer ist.