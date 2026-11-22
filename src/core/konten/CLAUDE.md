# Konten — Belegung, Stilllegen, Vorschau

Gilt für alles, was den Stand eines Kontos verteilt, ein Konto aus dem Verkehr zieht oder vorausrechnet. Was überall gilt, steht in der `CLAUDE.md` des Projekts.

## Die Kontobelegung — wem das Geld auf einem Konto gehört

Die EINE Rechnung für „wie viel von diesem Stand ist für etwas bestimmt, und wie viel ist
frei" (`core/konten/kontobelegung.ts`, geladen über `application/kontobelegung.ts`).
Jede Anzeige, die danach fragt, liest sie — die Rücklagen-Deckung, die Spalte „frei" und
die Karte „Gebunden auf …" im Kontoauszug. Wer etwas Neues einführt, das Geld auf einem
Konto beansprucht, liefert es dort als `Anspruch` an und rechnet nirgends selbst.

Bis 2026-10-26 gab es das nicht, und das hatte eine konkrete Folge: die Rücklagen-Deckung
verteilte den GANZEN Kontostand auf die Rücklagen, obwohl ein aufbauendes Budget (heute
selbst eine Rücklage) auf demselben Konto denselben Euro beanspruchte. Die Deckung sah besser aus, als sie war.

| Anspruch | in Höhe von | warum |
|---|---|---|
| Rücklage mit Konto, beide Sorten | ihr Stand, wenn positiv: die Raten bis heute minus dem, was sie seit ihrem Fundfenster über die Kategorie gefunden hat (je Sorte gezählt wie in `../ruecklagen/CLAUDE.md`) | das soll beisammen sein — was sie schon getragen hat, ist vom Konto weg |
| monatliches Budget | **keiner** | sein Rest verfällt und bleibt einfach auf dem Konto, ohne Kommentar |

**Seit Migration 81 ist die Rücklage der einzige Anspruch.** Bis dahin war der Rest eines
aufbauenden Budgets der zweite (`Anspruchsart` `budget`); das Budget ist jetzt selbst eine
Rücklage, die weiterläuft, und `Anspruch` trägt keine Art mehr. Wer einen Anspruch einer
anderen Sache einführt, braucht sie wieder.

Dieselbe Belegung steht an weiteren Stellen, jede liest sie und rechnet nicht selbst:
in der Übersicht unter „Was da ist" je Kontoklasse (`bilanzJeKlasse`) und in der
Rücklagen-Deckung. Den Satz „auf dem Konto fehlen …" am aufbauenden Budget im Bereich
Budgets gibt es mit Migration 81 nicht mehr; was einer Rücklage fehlt, zeigt die Liste
der Rücklagen.

Seit 2026-11-15 liest sie eine vierte: die Reichweite im Ausblick der Analyse
(`core/reichweite.ts`, „Wie lange reicht es ohne Einnahmen?"). Ihr Zähler ist Stand
minus Gebundenes der Klasse `liquide` aus `bilanzJeKlasse`. Ohne ein Konto im Minus ist
das dieselbe Zahl wie `frei` unter „Was da ist". **Mit einem überzogenen Konto ist sie
kleiner, und das ist Absicht:** `frei` ist je Konto bei null gedeckelt (was fehlt, steht
dort in Worten), die Reichweite rechnet das Minus mit — ein Dispo, der sie nicht kürzt,
verschwiege genau das, wonach die Karte fragt.

Seit 2026-11-16 liest sie eine fünfte: die Karte „Wo das Geld liegt" im Bereich Rücklagen
(`application/ruecklagen/geldJeKonto.ts`) — jedes Konto mit einem Anspruch auf einem
Blatt, mit derselben Tabelle wie „Gebunden auf …" (`ui/bausteine/BelegungTabelle`). Und
die Kennzahlen des Bereichs (Soll, Tatsächlich da, Deckung) zählen über
`ruecklagenDeckung` alle Rücklagen in EINER Liste — seit Migration 81 auch die früheren
aufbauenden Budgets.

**Seit Paket 3 des Umbaus (ADR-0006) sinkt der Anspruch einer Rücklage um ihre gefundenen
Entnahmen** (`anspruchAm`, `ruecklagenEntnahmenAus`). Vorher fand eine Rücklage von Hand
nichts über ihre Kategorie, und der Anspruch war schlicht das Soll; vor ihrem Fundfenster
(`findet_ab`) ist er das weiterhin. Gefunden wird mit derselben Zuständigkeit wie im
Verbrauch eines Budgets und in der Ergebnisrechnung — eine Rücklage im Minus beansprucht
nichts. Wer die Belegung aufruft, gibt deshalb die Budget-Sicht MIT den Rücklagen herein
(`zustaendigkeitssichtMit`, `anspruchsbestand` in `application/kontobelegung.ts`).

Reicht der Stand nicht, wird **anteilig** verteilt, über alle Ansprüche gleich, ohne
Reihenfolge. `budget.kontoId` heisst seither nur noch eines: hier liegt das Geld des
Budgets, bis es ausgegeben ist.

## Ein Konto stilllegen — und der einzige Weg, einen Beleg loszuwerden

Seit 2026-09-13 trägt `zahlungskonto` die Spalte `aktiv` (Vorgabe 1, im Typ optional mit
„fehlend heisst JA" — dieselbe Form wie `budgetrelevant`, aus demselben Grund).

Der Anlass war ein Fehler mit einer Meldung, die nichts sagte: **ein Konto, in das je
importiert wurde, war über die Oberfläche nie wieder löschbar.** Drei Fremdschlüssel auf
`zahlungskonto` stehen auf NO ACTION, und einer davon ist der, an den niemand denkt —
`umsatz_verarbeitung.zahlungskonto_id` hängt an JEDER importierten Zahlung, auch an den
verbuchten und den verworfenen. Die Buchungen zu löschen befreit das Konto nicht (der
Verweis darauf steht auf SET NULL), und einen Weg, eine Importzeile zu löschen, gab es im
ganzen Programm nicht. Was ankam, war „FOREIGN KEY constraint failed".

**Die Spalte ist eine SICHT auf die Gegenwart und keine Rechenregel**, und daran hängt
alles Weitere. Gefragt wird über `istAktiv`; was sie beantwortet, ist „kann man hier noch
etwas tun" — nie „zählt es mit". Die Regel, nach der jede Aufrufstelle entscheidet, ist
die Zeitrichtung:

| | stillgelegtes Konto |
|---|---|
| **Rückblick** — Monatskarten, Budgetstände, Analyse, Kontoauszug, Abgleich | zählt und zeigt **unverändert** |
| **Vorausschau** — Liquiditätsvorschau | **draußen**, und der Filter steht im KERN |
| **Auswahl und Handlung** — Buchungsmaske, Umbuchungsziel, Bankabruf, Bankkonto verknüpfen | **draußen** |
| „Was da ist" | zählt mit, unter seiner Klasse |
| Kontenverwaltung | sichtbar, markiert, mit dem Weg zurück |

Vier Dinge darin, die Entscheidungen sind und keine Rechenschritte:

- **Die Monatskarten behalten sie.** Sie zeigen drei Monate, davon zwei vergangene. Wer nach
  einem Bankwechsel sein altes Girokonto stilllegt, verlöre sonst rückwirkend den größten
  Teil seines Ist der letzten Monate — Plan bliebe stehen, Ist fiele auf fast null. Dasselbe
  gilt für `liquideMittelReal`, wo Saldo und Buchungen ohnehin mit derselben Liste filtern
  müssen.
- **`liquideMittel` filtert NICHT, `liquiditaetsvorschau` schon.** Der Unterschied ist wieder
  die Zeitrichtung: ein Bestand lässt sich sinnvoll mit und ohne stillgelegte Konten bilden
  („was ist da" gegen „was kann ich ausgeben"), eine Vorausschau nicht. Deshalb liegt der
  Filter dort im Kern und hier nicht.
- **„Was da ist" bleibt unberührt.** Eine eigene Zeile „stillgelegt" war geplant und ist
  verworfen: die Karte fragt „was existiert", und Restgeld auf einer aufgegebenen Kasse
  existiert. Es herauszurechnen liesse Vermögen verschwinden, ohne dass es irgendwo
  auftauchte.
- **`waehlbareKonten(konten, bereitsGewaehlt)` hat zwei Hälften**, und die zweite ist die
  wichtige: das schon Gewählte bleibt in der Liste. Sonst fände eine Buchung, die auf einem
  stillgelegten Konto liegt, ihr eigenes Konto in der Auswahl nicht mehr — das Feld stünde
  leer oder zeigte ein anderes, und beim nächsten Speichern wäre die Buchung umgezogen.

**Die Spalte hat einen EIGENEN Schreibweg** (`aktivSetzen`) und steht nicht in `speichern`.
`kontoAnlegen` dient auch dem Bearbeiten (mit `id`, über das ON CONFLICT) und baut ein Konto
ohne dieses Feld: mitgeschrieben holte jedes Umbenennen ein stillgelegtes Konto still zurück
in die Gegenwart.

### Ein Konto loswerden — EIN Symbol, ein Dialog

In der Zeile steht genau ein Symbol dafür („Auflösen"), und es steht dort in jedem Zustand.
`ui/kontenverwaltung/KontoAufloesenModal.tsx` bietet an, was gerade möglich ist:

| Zustand des Kontos | was der Dialog anbietet |
|---|---|
| geführt, etwas hängt dran | **Stilllegen** — und den Satz, dass danach auch „Endgültig löschen" hier steht |
| geführt, nichts hängt dran | Stilllegen **und Löschen** |
| stillgelegt | **Wieder aufnehmen** und **Endgültig löschen** |

**Bis 2026-09-13 waren es drei Symbole in der Zeile**, und die erste Fassung des Löschens
hatte drei Mängel, die erst beim Benutzen auffielen — sie stehen hier, weil jeder davon eine
Regel hinterlässt:

- **Der Mülleimer war ein Knopf, der fast immer Nein sagt.** Für jedes Konto mit Geschichte
  konnte er nur ablehnen. Seine Meldung war ehrlich, und das genügt nicht: eine ehrliche
  Absage ist immer noch eine Absage. **Ein Knopf, dessen Normalfall eine Absage ist, gehört
  nicht in die Liste** — was möglich ist, entscheidet der Dialog, bevor jemand klickt.
- **Der Icon-Satz wechselte** je Zustand, drei gegen vier Symbole, das vierte ein zweites
  rotes neben dem ersten. Was erscheint und verschwindet, lernt niemand; deshalb ist es jetzt
  dasselbe Symbol, und nur der Dialog dahinter ändert sich.
- **Der Zusammenhang stand nirgends.** Dass Stilllegen die milde Fassung ist und das
  endgültige Löschen erst danach auftaucht, musste man durch Ausprobieren finden. Genau das
  sagt der Dialog jetzt aus — es ist der eigentliche Zugewinn der Umarbeitung.

Die **Abfolge** bleibt und wird nur erklärt: das endgültige Löschen gibt es nur am
stillgelegten Konto. So ist Stilllegen die vorgegebene Antwort und das Zerstörende eine
zweite, eigene Handlung; stünden beide gleichberechtigt da, gewänne der kürzere Weg — auch
dann, wenn der andere gemeint war. Durchgesetzt an der Anwendungsgrenze UND in der
Oberfläche.

**Ein LEERES Konto darf direkt gehen**, und das ist die eine Ausnahme von der Abfolge: sie
ist dafür da, eine GESCHICHTE nicht versehentlich wegzuwerfen. Gibt es keine, schützt sie
nichts und kostet nur einen Umweg — und das ist der häufigste Fall, ein Konto, das aus
Versehen entstanden ist.

**Der Dialog IST die Rückfrage, es kommt keine zweite.** Er nennt jede Folge, bevor etwas
passiert, und die zerstörende Handlung trägt ihren Namen auf dem Knopf. Ein „Wirklich
löschen?" dahinter wäre genau das, wovor `Loeschfrage` in ihrem Kopf warnt: eine Verzögerung
ohne Information, die man nach dem zweiten Mal wegklickt — und es wäre der zweite Schritt,
der die Abfolge unübersichtlich gemacht hat. `useLoeschfrage` ist deshalb aus der
Kontenverwaltung verschwunden.

`kontoloeschung` zählt, was am Konto hängt, und trennt **Sperren** von **Folgen**: die drei
oben verhindern das Löschen, ein Budget oder eine Rücklage verliert nur einen Verweis. Beides
in einen Topf zu werfen liesse den Dialog behaupten, man müsse sie erst wegräumen — und wer
das tut, hat umsonst gearbeitet.

**Stilllegen steht zusätzlich im Bearbeiten-Dialog**, als Zeile „Zustand" neben der
Verbindung. Der Schalter dort schreibt SOFORT und nicht beim Speichern: `kontoAnlegen` fasst
`aktiv` nicht an, ein Feld, das erst beim Speichern wirkt, hätte also keinen Weg in den
Bestand.

Vier Dinge am Löschweg selbst (`adapters/persistence/sqliteKontoentfernen.ts`):

- **Erst lesen, dann schreiben.** `inTransaktion` nimmt eine fertige Liste; ein SELECT
  dazwischen gibt es nicht. Das ist hier ohnehin die bessere Form — ein
  `DELETE … WHERE id IN (SELECT … FROM umsatz_verarbeitung)` löscht per CASCADE aus genau der
  Tabelle, aus der die Unterabfrage liest.
- **Die Belege gehen über `COALESCE(zahlung_id, id)`**, damit ALLE Fassungen einer Zahlung
  mitkommen und nicht nur die namengebende — eine Zahlung ohne ihren ersten Beleg wäre eine,
  deren Herkunft niemand mehr feststellen kann.
- **Jede gelöschte Buchung bekommt ihren Journaleintrag**, denselben Weg wie
  `ledger.loeschen` (`standLesen` und `journalAnweisung` sind dafür exportiert statt
  nachgebaut — das Journal hat einen Schreibweg, und eine zweite Fassung driftet).
- **Das überlebende Gegenbein einer Umbuchung wird GELÖST, nicht mitgelöscht.** Es liegt auf
  einem Konto, das jemand weiterführt. Mit Journaleintrag, denn eine Buchung, die still ihre
  Paarung verliert, ist später nicht zu erklären; `transfer_id` trägt keinen Fremdschlüssel
  und bliebe sonst als Verweis auf ein Paar stehen, das es nicht mehr gibt.

## Die Liquiditätsvorschau zieht ZWEI Linien

`core/liquiditaet.ts` rechnet je Konto den Stand über die nächsten Tage vor — und
zwar zweimal, weil die beiden Linien Verschiedenes bedeuten:

| | enthält | heisst |
|---|---|---|
| **fest** | nur datierte Verpflichtungen (Vertragsraten, geplante Umbuchungen) | ein SICHERES Minus — daran ändert Sparsamkeit nichts |
| **erwartet** | dazu den Budgetrest, gleichmässig über die Tage verteilt | erst mit dem üblichen Verbrauch; hier hat man noch die Wahl |

Nur die feste warnte zu spät (die meisten Engpässe entstehen aus dem Alltagsverbrauch),
nur die erwartete zu oft — und eine Warnung, die jeden Monat einmal aufleuchtet und sich
von selbst erledigt, liest nach dem dritten Mal niemand mehr.

Drei Dinge, die dabei Entscheidungen sind und keine Rechenschritte:

- **Ein Budget ist keine Fälligkeit.** Es sagt „höchstens 400 im Monat", nicht „am 14.
  gehen 400 ab". Gleichmässig zu verteilen ist die neutrale Annahme — nicht die
  schlimmste (alles am Monatsanfang), nicht die beste (alles am Ende). Im laufenden Monat
  zählt nur der noch offene REST: was schon ausgegeben wurde, steht bereits im Kontostand.
- **Eine Rücklage, die weiterläuft, zählt nicht mit** (bis Migration 81 das aufbauende
  Budget). Ihre Rate wird nicht ausgegeben, sie bleibt
  liegen — sie mitzurechnen hiesse, Geld abfliessen zu lassen, das auf dem Konto bleibt.
- **Eine geplante Umbuchung wirkt auf BEIDEN Konten**, als Abfluss und als Zufluss. Nur
  die eine Seite zu rechnen liesse ausgerechnet das Rücklagenkonto nach Handlungsbedarf
  aussehen, auf das gerade eingezahlt wird.

Und die Grenze der Auskunft, die in der Karte danebensteht: **was nicht gemeldet wird, ist
nicht „geprüft und in Ordnung", sondern „läuft im gerechneten Fenster nicht ins Minus".**

Gezeigt wird die Vorschau seit 2026-11-15 im Register „Ausblick" der Analyse („Reicht das
Geld?", `analyseLiquiditaet`) — für die liquiden Konten, als Tabelle, die immer dasteht.
Warum dort und nicht mehr in der Übersicht, steht in `src/adapters/ui/uebersicht/CLAUDE.md`.

Eine kleine Verlaufslinie stand hier vom 31.08. bis zum 01.09. daneben — sie war wieder
weg: über den Tiefstand und den Tag hinaus, die schon in der Zeile stehen, verriet sie
nichts. **Seit 2026-11-22 gibt es den Tagesverlauf trotzdem**, und der Unterschied ist das,
was damals fehlte: die Kurve über der Tabelle (`analyse/LiquiditaetKurve.tsx`) zeigt die
SUMME der Konten der Tabelle als Treppe und zu jedem Tag die Posten, die an ihm fallen —
also nicht nur wie tief, sondern woran es liegt. Dafür trägt jede `Kontovorschau` ihre
Reihe (`tage`, mit dem Budgetanteil je Tag) und ihre datierten Posten (`posten`, je Regel
benannt); die beiden Befunde sind der niedrigste Punkt genau dieser Reihe.
`liquiditaetskurve` summiert über die Konten und lässt eine geplante Umbuchung zwischen
zwei von ihnen heraus — sie steht auf beiden mit derselben Regel und hebt sich auf; eine
auf ein Konto ausserhalb der Auswahl bleibt ein Abfluss.
