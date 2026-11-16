# `core/` — die reine Domäne

Hier wird gerechnet und entschieden, sonst nichts. **Kein IO, kein React, keine Uhr, kein
Zufall.** Eine Funktion, die `new Date()` oder `Math.random()` aufruft, ist hier falsch: sie
macht jeden Test von der Laufzeit abhängig. Zeitpunkte kommen als Parameter herein.

`core` importiert **nichts** nach außen — geprüft in `src/architektur.test.ts`.

## Gliederung

`basis/` hält die Primitive, die quer durch alles gehen: `geld`, `waehrung`, `datum`,
`zahlungsregel`, `muster`, `fehler`, `region`. Alles Fachliche liegt in seinem Bereich
(`buchung/`, `konten/`, `budgets/`, `vertraege/`, `kategorien/`, `ruecklagen/`,
`vermoegen/`, `vorsorge/`, `stammdaten/`). In der Wurzel bleibt nur, was über Bereiche hinweg rechnet
(`monatsausblick.ts`, `einordnung.ts`, `ergebnis.ts`, `reichweite.ts`, `bericht.ts`, `einrichtung.ts`) und die Fassade `index.ts`.

## Geld

**Integer Cent, nie Float.** Formatiert wird über `geldFormatieren` /
`geldFormatierenMitSymbol` — nie mit eigenem `toFixed` und nie an der Währungs- und
Locale-Schicht vorbei. Minus ist **U+2212** (−), nicht der Bindestrich.

`parseBetrag` liefert `null` bei unplausibler Eingabe (Müll, Exponent, jenseits des sicheren
Integer-Bereichs), statt still eine falsche Zahl zu erzeugen. Es erkennt nachgestelltes
Minus, U+2212 und Klammer-Notation. Wer das `null` nicht behandelt, hat den Fehlerfall nur
verschoben.

## Datum

`parseIso` **wirft** bei nicht existierenden Daten („2026-02-31", Tag oder Monat `00`). Das
ist Absicht und die Arbeitsteilung mit der Anwendungsschicht: dort prüfen Regex nur die
FORM, die Existenz prüft der Kern.

`toIso` polstert das Jahr vierstellig, weil die gesamte Datumsordnung über String-Vergleiche
läuft — ein dreistelliges Jahr sortiert sonst hinter alles andere.

## Charakter

`Aufwand | Ertrag | Umschichtung` — erfolgs- gegen liquiditätswirksam; Umschichtung ist
Aktivtausch, keine Ausgabe. Er wird **nicht gewählt**, sondern folgt
`kategorie.defaultCharakter`, bei Umbuchungen dem Transfer. Es gibt bewusst kein
Eingabefeld dafür.

Tragend ist er trotzdem: `budgetVerbrauch` zählt nur Aufwand, die Analyse gruppiert danach,
die Vertragserkennung schließt Umschichtungen aus, das Konto-Register färbt danach. Kein
totes Konzept, auch wenn keine Maske danach fragt.

### Der Rückfluss — der Fall, der hier mehrfach weh getan hat

Bei einer Erstattung fallen Einordnung und Richtung auseinander: sie gehört in die Kategorie
der Ausgabe (also **Aufwand**), aber das Geld kam **herein**. Sie steht deshalb als *Aufwand
mit positivem Betrag* da, und das ist kein Widerspruch — „Aufwand" sagt, WOFÜR das Geld war,
das Vorzeichen sagt, wohin es floss.

Der Fehler ist dabei nie „diese Funktion rechnet falsch", sondern immer derselbe Griff:
**jemand leitet das Vorzeichen aus dem Charakter ab** (oder aus dem `defaultCharakter` der
Kategorie), statt das vorhandene zu nehmen. Der Griff wandert dorthin, wo gerade kein Test
steht.

Zwei Dinge, an denen man ihn erkennt und die deshalb festgehalten sind:

- **Die Signatur.** Ein einmal zu viel gedrehtes Vorzeichen verschiebt immer um **2 × Betrag**,
  nie um den Betrag selbst. Am Kontenabgleich sieht das aus wie eine fehlende Buchung.
- **Was NICHT gilt.** Die Zusicherung „Σ Aufwände ≤ 0" darf nicht erzwungen werden. Wer sie
  mit `Math.min(0, …)` herstellt, verliert den Rückfluss aus der Rechnung, und der Saldo
  läuft von dem der Bank weg. Ebenso darf er nicht nach Vorzeichen zu den Einnahmen
  umsortiert werden — dort bläht er sie auf, statt die Ausgabe auszugleichen.

**Wer am Charakter arbeitet, beschiesst `buchung/erstattung.test.ts`.** Dort laufen alle
Rechenwege, die auf den Charakter verzweigen, gegen denselben Fall — ein Ort statt verstreuter
Einzelfälle, damit die nächste betroffene Stelle auffällt.

## Auszahlung und Kosten — zwei Sichten auf dieselbe Buchung

Der Charakter oben sagt, OB eine Zahlung das Ergebnis berührt. Diese Unterscheidung sagt,
WANN. Sie ist die Grundlage der kaufmännischen Rechnung, auf die der Kern umgebaut wird
(beschlossen 2026-11-15), und sie steht hier, bevor der erste Code dazu entsteht, damit
jedes Paket dieselben Wörter benutzt.

| | Frage | Jahresbeitrag 600 € im Januar | Gerät für 960 €, alle 8 Jahre |
|---|---|---|---|
| **Auszahlung** | Wann geht Geld vom Konto? | Januar 600, sonst 0 | im Kaufmonat 960 |
| **Kosten** | Was kostet der Monat? | 50 je Monat | 10 je Monat |

**Jede Zahl gehört in genau eine der beiden Sichten.** Eine Summe, die Auszahlungen und
Kosten mischt, beantwortet keine Frage: sie geht weder gegen die Bank auf, noch sagt sie,
was das Leben kostet.

Daraus werden drei Rechnungen, und jede hat ihren Ort:

| Rechnung | rechnet | beantwortet |
|---|---|---|
| **Ergebnis** | Kosten je Monat | Was kostet mein Leben, was bleibt? |
| **Liquidität** | Auszahlungen an ihrem Tag | Reicht das Geld am Tag X? |
| **Vermögen** | Bestände zum Stichtag | Was ist da, und wem gehört es schon? |

Zwischen Ergebnis und Liquidität steht die **Überleitung**: sie erklärt Zeile für Zeile,
warum das Ergebnis eines Monats nicht die Änderung des Kontostands ist. Sie muss exakt
auf die Summe der Ist-Buchungen aufgehen — das ist die Probe, die „geht gegen die Bank
auf" ausführbar macht.

### Die Wörter

| Wort | meint | nicht verwechseln mit |
|---|---|---|
| **Topf** | Geld, das für etwas bestimmt ist: eine Rücklage, ein aufbauendes Budget, ein Vorsorgeziel | dem Konto — das sagt, WO Geld liegt, der Topf, WEM es gehört |
| **Rate** | was ein Topf den Monat kostet, ob überwiesen wurde oder nicht | der Überweisung auf das Konto des Topfs |
| **Zuführung** | die Rate, von der Geldseite gesehen: was in den Topf hineingeht | — |
| **Entnahme** | eine Ausgabe, die ein Topf trägt | Kosten — die waren die Raten davor |
| **ungedeckt** | der Teil einer Entnahme über dem Stand des Topfs | — |
| **periodisiert** | eine Zahlung, auf die Monate verteilt, für die sie gilt | geglättet — ein Budget hat keine Fälligkeit, die man verteilen könnte |

### Die Regeln

- **Ein Topf kostet seine Rate, nicht seine Auszahlung.** Für Rücklage, aufbauendes
  Budget und Vorsorge gleich. Sonst sieht der Monat der grossen Ausgabe schlecht aus und
  jeder davor zu gut.
- **Eine Entnahme ist kein zweites Mal Kosten — bis zur Höhe des Topfstands.** Was
  darüber hinausgeht, ist ungedeckt und zählt als Kosten des Monats. Ohne die Grenze
  machte ein leerer Topf jede Ausgabe folgenlos.
- **Verträge werden vorschüssig periodisiert:** die Zahlung gilt für die Monate AB ihrer
  Fälligkeit, verteilt nach dem Rhythmus der Zahlungsregel. Vorschüssig, weil es der
  Normalfall ist (Versicherung, Jahresabo) und der Kern die Abweichung davon nicht kennt.
- **Der Topf hängt an der KATEGORIE — die Zuordnung klärt nur, wo sie mehrdeutig ist.**
  Eine Rücklage findet ihre Ausgaben über ihre Kategorie samt Unterkategorien, ab ihrem
  Fundfenster (`findet_ab`); das ist der Normalweg, und eine Buchung trägt dafür nichts.
  Hängen MEHRERE Rücklagen an derselben Kategorie, wartet die Buchung, bis jemand sagt,
  welche es war (`ruecklage_zuordnung`, je Anteil über seine Kategorie benannt; seit
  Paket 3 des Umbaus, ADR-0006 Entscheidung 5). Bis dahin stand hier, ein Feld an der
  Buchung („woraus bezahlt") sei geprüft und verworfen; verworfen bleibt ein solches Feld
  als Normalweg — die Zuordnung ist keine zweite Kategorie, sondern die Antwort auf genau
  eine Frage, die die Kategorie allein nicht beantwortet. Verworfen ist auch, je Rücklage
  eine eigene Unterkategorie zu verlangen (viele kleine Kategorien, nur um der Rechnung
  willen). Ein monatliches Budget und eine Rücklage an derselben Kategorie lässt die App
  nicht neu anlegen; im Altfall gewinnt das Budget.
- **Vorsorge ist Kosten, keine Verwendung des Überschusses.** Als Verwendung sähe ein
  Monat, in dem nichts zurückgelegt wurde, BESSER aus. Gerechnet wird die Rate, die das
  Ziel verlangt; ob sie überwiesen wurde, zeigt die Überleitung.
- **Annahmen sind Eingaben.** Rendite und Inflation einer Vorsorgerechnung trägt der
  Nutzer ein, und sie stehen neben jedem Ergebnis, das von ihnen abhängt — nie als
  Konstante im Kern.

### Wo es steht

| Datei | beantwortet |
|---|---|
| `einordnung.ts` | Was IST diese Buchung — Einnahme, Fixkosten, laufende Kosten, Entnahme aus einer Rücklage, Vorsorge, Umbuchung, ungeplant (auch: wartet auf Zuordnung)? Die eine Stelle dafür; wer auswertet, fragt hier und sortiert nicht selbst. Wer einen Anteil trägt, beantwortet sie über `ruecklagen/zustaendigkeit.ts` — dieselbe Funktion, die der Verbrauch eines Budgets fragt. |
| `ergebnis.ts` | Was kostet der Monat? Baut auf der Einordnung und fügt die Zeit hinzu (Periodisierung, Topfkosten), dazu die Überleitung. |
| `reichweite.ts` | Wie viele Monate das freie Geld die Kosten trägt. Liest die Zeilen von `ergebnis.ts` nur und steht deshalb daneben, nicht darin. |
| `bericht.ts` | Ein abgeschlossener Monat oder ein Jahr auf einem Blatt: summiert Monatsergebnisse und ihre Überleitung, stellt den Zeitraum davor daneben, vergleicht das Nettovermögen an zwei Stichtagen. Rechnet nichts Eigenes — ein Jahr ist die Summe seiner Monate, und deshalb geht auch seine Überleitung exakt auf. |
| `monatsausblick.ts` | Die Aufrechnung nach AUSZAHLUNG: was gebucht ist und was fällig wird. Sie trägt den Saldo-Ausblick der Analyse und ordnet noch über Betragsnähe zu. |

Beide neuen Dateien liegen in der Wurzel, aus demselben Grund wie `monatsausblick.ts`: sie
rechnen über alle Bereiche.

**Die Einordnung ist abgeleitet, nicht gespeichert.** Sie folgt aus Kategorie, Vertrag,
Budget, `budgetrelevant` und der Klasse des Gegenkontos. Ein gespeicherter Wert könnte
jedem davon widersprechen.

**Was die Ergebnisrechnung noch nicht kann**, steht in ihrem Kopf und hier, damit niemand
es für fertig hält: Einnahmen werden nicht periodisiert.

**Die Vorsorge kostet die Rate des Ziels** (seit 2026-11-15, `vorsorgerateIm`), sobald
eines angelegt ist. Die tatsächliche Überweisung ist dann die Zuführung: sie steht am
Posten und in der Überleitung (`zufuehrung`), nicht in den Kosten. Drei Dinge daran:

- **Gerechnet zum Monatsanfang** — mit der Annahme, die in dem Monat galt, und dem
  Vorsorgevermögen am Vortag. Die Rate eines vergangenen Monats ändert sich nicht, weil
  heute mehr da ist, und eine Überweisung am Ersten senkt nicht die Rate desselben Monats.
- **Ohne Rate zählt wieder die Überweisung**: vor der ersten Annahme, ab dem Zielmonat und
  wenn das Ziel nicht mehr erreichbar ist (`sparrate === null`, das fällt mit dem
  Zielmonat zusammen). Null als Rate machte dort jede Überweisung kostenlos. Eine Rate
  von null dagegen ist eine Aussage — das Ziel ist gedeckt —, und dann kostet die
  Vorsorge nichts.
- **Die Rate ersetzt die ganze Zeile**, auch einen Dauerauftrag auf ein Vorsorgekonto.
  Beide nebeneinander stünden zweimal für dasselbe Geld da.

**Eine Kreditrate wird in Zinsen und Tilgung geteilt** (seit 2026-11-15,
`tilgungAbspalten`), sobald eine Schuld auf ihren Vertrag verweist und mindestens zwei
Restschulden hat. Kaufmännisch sind nur die Zinsen Kosten; die Tilgung baut Vermögen auf,
weil die Schuld sinkt. Vier Dinge daran:

- **Die Tilgung kommt aus der Reihe der Restschulden**, nicht aus einem Plan
  (`vermoegen/tilgung.ts`, die Fälle in `vermoegen/CLAUDE.md`).
- **Sie steht in der dritten Stufe**, als eigene Zeile „Tilgung" neben Rücklagen und
  Vorsorge, und unter „Verträge" bleiben die Zinsen. Dieselbe Überlegung wie bei der
  Vorsorge: als blosse Verwendung des Überschusses sähe ein Monat, in dem nichts getilgt
  wurde, besser aus. „Bleibt wirklich frei" ändert sich dadurch NICHT; ehrlicher werden
  die beiden Zwischensummen davor.
- **Nie mehr als der Vertrag im Monat kostet** — der Plan gegen den Plan, das Ist gegen
  das Ist, bei einem Jahreszahler gegen das Zwölftel. Eine Sondertilgung senkt die
  Restschuld, läuft aber nicht über die Rate. Die Überleitung bleibt unberührt: die
  Tilgung ging mit der Rate vom Konto.
- **Die Einordnung der Buchung ändert sich nicht.** Die Zahlung bleibt eine
  Vertragszahlung, auch in der Pille im Kontoauszug (`einordnung.ts`): die Teilung ist eine Rechnung über den
  Monat, keine Eigenschaft der einzelnen Abbuchung — sie trägt nicht in sich, welcher
  Teil Zins war.

**Der Kauf aus einer Rücklage wird gegen ihren Stand geprüft** (seit Migration 76): die
Ausbuchung hält den beendeten Zyklus fest, und was der Kauf über das Angesparte hinaus
kostet, zählt im Kaufmonat (`altabschlussKosten` in `ruecklagen/topf.ts`). Jeder andere
Zyklus — der laufende, ein aufbauendes Budget, eine Rücklage, die über ihre Kategorie
findet — rechnet nach der max-Regel (`zyklusKosten`); beides trifft nie im selben Zyklus
zusammen. **Eine nicht budgetrelevante Ausgabe ist nur Entnahme, wofür eine Rücklage
ausgebucht wurde** — oder wenn jemand sie ausdrücklich einer Rücklage zugeordnet hat.
`budgetrelevant === false` allein genügt nicht: eine Ausgabe, die jemand nur von Hand aus
den Budgets nimmt, kostet ihren Monat (ungeplant) — sonst hätte sie nie etwas gekostet.

**Und sie ist nach HINTEN nur für Ausbuchungen ab Migration 76 vollständig.** Eine
Rücklage kennt nur ihren laufenden Zyklus (`sollRuecklage` ab `beginn`); das Ausbuchen
setzt ihn zurück oder beendet sie. Die Rate der Monate davor kommt aus dem Zyklus, den
die Ausbuchung festhält. Ältere Ausbuchungen haben keinen: für die Monate vor ihnen
liefert `monatsErgebnis` keine Rate, obwohl damals zurückgelegt wurde — ihre Kosten
stehen zu niedrig da. Die Übersicht merkt davon
nichts, weil sie nur nach vorn rechnet; die Kostensicht der Analyse rechnet zurück und
fragt deshalb `ruecklagenrateFehlt`, um die betroffenen Monate zu benennen. Wer über
vergangene Monate auswertet (`ergebnisKennzahlen`), reicht die Grenze mit durch.

## Kontostands-Anker

Ein Anker (`konten/kontostand.ts`) ist eine **Beobachtung, kein Rechenergebnis**: an DIESEM
Stichtag lag DIESER Betrag auf dem Konto — von der Bank gemeldet oder von Hand gezählt. Er
wird nie ungültig und nie neu berechnet, auch nicht, wenn jemand nachträglich eine Buchung
davor einfügt. Was sich ändert, ist die Differenz, und genau die will man sehen.

Anker werden **aufgehoben, nicht überschrieben** (ein Stichtag je Herkunft): erst mehrere
sagen, in welchem ZEITRAUM eine Lücke entstand. `abweichungsfenster` rechnet Anker gegen
Anker und kommt ohne den Anfangsbestand aus, weil der selbst nur geschätzt ist.
