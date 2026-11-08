# Import — der Beleg

Gilt für den Import und alles, was einen Beleg liest. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Der Beleg und was wir daraus gemacht haben

Eine Importzeile steht in **zwei** Tabellen, und die Grenze dazwischen ist der
**Lebenszyklus**, nicht die Kardinalität — 1:1 gehörte nach Lehrbuch in eine Tabelle:

- **`umsatz_roh`** — was die Quelle lieferte. Nach dem Anlegen unveränderlich.
- **`umsatz_verarbeitung`** — was wir daraus gemacht haben: Status, Kontozuordnung,
  Kategorievorschlag, erzeugte Buchung, Dublettenverdacht. Ändert sich bei jeder Durchsicht.

Nach oben ist es weiterhin EIN `Umsatz`; die Trennung sieht man nur an den Schreibwegen.
`anlegen` schreibt beides in einer Transaktion, `speichern` nur den Stand, und
`belegAnhaengen` legt einen weiteren Beleg daneben — **geändert wird ein Beleg nie**.

## Eine Zahlung hat mehrere Belege

Seit 2026-09-06 ist die Beziehung 1:n: `umsatz_roh.zahlung_id` sagt, zu welcher Zahlung ein
Beleg gehört, `umsatz_verarbeitung` hängt an der Zahlung. Der Grund war ein stiller
Datenverlust — wer erst aus einer Fremdsoftware importierte und danach dieselben Monate bei
der Bank abrief, verlor die Bankfassung: `ergaenzen` trug fehlende Felder in die vorhandene
Zeile nach und warf die eingehende weg. Ein Institut hält Umsätze nur begrenzt vor, also war
sie danach nicht wiederzubeschaffen.

**Der Vorrang ist damit vom Schreiben ins LESEN gewandert.** Niemand überschreibt mehr
etwas; welcher Beleg je Feld gilt, rechnet `application/import/belege.ts` bei jedem Lesen
neu. Die Rangfolge: Bankabruf CAMT, dann MT940, dann Fremdsoftware — die Bank ist die Quelle
einer Zahlung, eine Fremdsoftware erzählt sie nach. Bei Gleichrang gewinnt der jüngere Lauf.

Drei Regeln, mehr braucht es nicht:

- **Der erste Wert in der Rangfolge gewinnt.** Ob nur eine Quelle das Feld liefert
  (`zweckCode`) oder beide es verschieden vollständig tun (`gegenpartei`), ist dieselbe
  Operation. Eine LÄNGENREGEL für den Verwendungszweck gibt es bewusst nicht: sie ist die
  naheliegende und die falsche, weil eine Fremdsoftware ihren eigenen Block anhängt und
  damit oft die längste Fassung hat, ohne die genaueste zu sein.
- **Die Formatgruppe kommt geschlossen aus EINEM Beleg** — `umsatzart`,
  `buchungsschluessel`, `bankBuchungscode`. Sie sind nur mit dem Format ihres Laufs deutbar
  (siehe unten); feldweise gefüllt stünden in einer Zahlung mehrere Vokabulare
  nebeneinander, ohne dass man ihnen ansieht, welches.
- **Id, Lauf und Roh-Hash stellt der NAMENGEBENDE Beleg**, nicht der stärkste. Sie sagen,
  woher die Zahlung stammt, nicht was in ihr steht — wanderten sie mit dem Rang, änderte ein
  späterer Abruf rückwirkend die Herkunft.

**Gespeichert wird ein Beleg, wenn er etwas Neues trägt** — verglichen wird der INHALT gegen
die Belege derselben Quelle an dieser Zahlung. Ein Schlüsselvergleich reichte dafür nicht:
`rohHash` deckt fünf Felder ab und ändert sich nicht, wenn eine Quelle eine Spalte
NACHLIEFERT. Genau dieser Fall — Tabelle erweitern, Datei erneut einlesen — war der Grund,
aus dem es das Ergänzen einmal gab.

**Die Kontogrenze gilt auch für die native Id.** Bis zum 07.09.2026 wurde sie
kontoübergreifend nachgeschlagen, mit einer Begründung, die für sich stimmte: die Quelle
hat ihre eigene Zeile benannt, also bleibt dieselbe Zeile dieselbe, auch wenn jemand die
Kontozuordnung geändert hat.

Sie hielt der anderen Lesart nicht stand, und die ist die häufigere. Wer dieselbe Datei
absichtlich auf ein ANDERES Konto einliest, bekam nichts: jede Zeile fand sich über ihre
Buchungs-ID auf dem alten Konto wieder, der Beleg trug nichts Neues, und der Lauf meldete
„0 neu, alles Dubletten" — auf einem Konto, das gerade erst angelegt und leer war.

Beide Fälle sehen beim Import gleich aus (Kandidat auf Konto X, gefundene Zahlung auf
Konto Y), aus den Daten sind sie nicht zu trennen. Zu wählen war also nur, **welcher
Fehler passieren darf** — und die Kontogrenze hat die bessere Fehlerform: ohne sie
passiert still nichts, mit ihr entsteht eine zweite Zahlung, die man sieht.

Sichtbar macht sie die **dritte Frage** in `application/dubletten/dublettensicht.ts`
(`fremdkontoZwilling`): dieselbe Quellzeile auf zwei Konten. Sie ist die einzige der drei,
die über die Kontogrenze sieht, und sie darf es, weil sie **nicht rechnet** — die anderen
beiden vergleichen mit Unschärfe, und für eine Schätzung ist die Kontogrenze eine
Vorbedingung. Damit gilt hier dieselbe Arbeitsteilung wie überall: **anlegen tut der
Import, urteilen tut das Hinsehen.**

Zwei Zuordnungen, die man auf der falschen Seite sucht:

- **`zahlungskonto_id` steht beim STAND**, nicht beim Beleg. Die Quelle liefert eine IBAN —
  das ist Beleg. Welches unserer Konten gemeint ist, ist unsere Zuordnung, und der
  Verbuchen-Dialog lässt sie ändern. Was der Mensch korrigieren darf, ist kein Beleg.
- **`lauf_id` steht beim BELEG.** Aus welchem Abruf eine Zeile kam, ändert sich nie.

Die Probe auf die Trennung: „auf den Stand der Quelle zurücksetzen" ist ein `DELETE` auf
`umsatz_verarbeitung`, und der Beleg merkt nichts davon.

**Zwei Felder liefert nur CAMT**, und beide sind Einordnungen, die die Bank schon
vorgenommen hat: `zweck_code` (SEPA-Verwendungszweckcode — `SALA`, `RENT`, `LOAN`) und
`endempfaenger` (wer die Zahlung wirklich bekommt, wenn ein Zahlungsdienstleister
dazwischensteht). Bei MT940 bleiben sie leer — eine ehrliche Lücke und kein Grund, etwas
aus dem Verwendungszweck zu raten, das dann aussähe wie eine Angabe der Bank.

Der `endempfaenger` steht **neben** `gegenpartei`, nicht statt dessen: dort bleibt der
Dienstleister, und über wen gezahlt wurde, ist eine eigene Information. Für die
Kategorie-Erkennung ist der Unterschied erheblich — der Dienstleister ist bei jedem Händler
derselbe.

**Zwei Felder des Belegs sind formatabhängig** und tragen je nach Abrufweg Verschiedenes:
`umsatzart` (MT940 ein kurzes Etikett, CAMT ein Freitext) und `buchungsschluessel` (MT940
numerisch, CAMT alphabetisch). Sie stehen trotzdem in einer Spalte — deutbar, weil das
Format am **Lauf** steht und jede Zeile zu genau einem gehört. Wer sie auswertet, allen
voran die Kategorie-Erkennung, muss über `lauf_id` danach unterscheiden. Eine Abbildung
zwischen den beiden Vokabularen gibt es nicht; sie liesse sich nur aus der
DK-Spezifikation gewinnen, und eine geratene wäre schlimmer als keine.
