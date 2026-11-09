# Training

Gilt für den Bereich Training und das Messen der Kategorie-Erkennung. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Das Training ist eine Werkbank, kein Bereich

Seit 2026-08-31 hinter `experiment.training` und deshalb ab Werk **nicht in der
Navigation**. Die Erkennung läuft trotzdem: ausgeliefert wird ein fertiges Modell, und
wer nur seine Zahlungen kategorisiert haben will, hat mit dem Bereich nichts zu tun. Wer
ihn einschaltet, greift in die Merkmale ein, trainiert neu und misst.

**Und „messen" heisst mehr als eine Trefferquote** — seit 2026-11-09 nach einem
festen Protokoll (`core/klassifikator/messung.ts`, im Use-Case `messen`):

| | sagt |
|---|---|
| Genauigkeit | wie oft das Modell richtig lag — an den JÜNGSTEN Buchungen |
| Blindes Raten | immer die häufigste Kategorie — die Untergrenze |
| **Nachschlagen** | „dieselbe Kategorie wie beim Empfänger üblich", ganz ohne Modell |
| **Vorsprung** | Abstand zur STÄRKEREN der beiden Linien |
| **Macro-F1** | jede Kategorie zählt gleich — die seltenen werden sichtbar |
| Je Kategorie | Precision, Recall, F1 |
| Kalibrierung | ob „90 % sicher" auch 90 % richtig heisst, und wie viel ab welcher Sicherheit abgedeckt ist |

Drei Entscheidungen darin, jede mit einem Grund, der sonst wieder verloren geht:

- **Zeitlich geteilt, nicht zufällig.** Trainiert wird auf dem Älteren, geprüft an den
  jüngsten Buchungen. Eine zufällige Aufteilung legt den März einer Monatszahlung ins
  Training und den April in die Prüfung — das misst Auswendiglernen. Beim Import muss das
  Modell die Zukunft einsortieren, also wird so gemessen. Die Zahl liegt dadurch
  niedriger als vorher; sie ist nicht schlechter geworden, sie war vorher zu hoch.
- **Geprüft an handverlesenen Labels**, sobald genug davon in der Prüfzeit liegen
  (`HANDVERLESEN_AB`). Eine automatische Kategorie kann vom Modell selbst stammen; daran
  zu messen hiesse, Übereinstimmung mit sich selbst zu messen. Reicht es nicht, wird an
  allen geprüft, und die Oberfläche sagt das. Trainiert wird weiter auf allem.
- **Die Nachschlagelinie neben dem blinden Raten.** Jedes Modell schlägt Raten. Ob es
  mehr kann als eine Tabelle „Empfänger → Kategorie", ist die Frage, die es rechtfertigt
  — deshalb zählt der Vorsprung gegen die stärkere Linie.

**Die Wirkungsmessung der Merkmalsquellen misst nach demselben Protokoll**, nur rollend:
drei Prüffenster zu je einem Zehntel, jedes trainiert auf allem davor („rolling origin").
Eine Wirkung, die anders gemessen wird als die Zahl daneben, vergliche zwei verschiedene
Dinge.

**Aus der Verwechslungsstatistik führt jetzt ein Weg in die einzelnen Zeilen.** Die Zahl
sagt, WO es klemmt; erst die Zeilen sagen, WARUM — steht dort ein Empfänger, der für
beide Kategorien vorkommt, fehlt ein Merkmal; steht dort nichts Unterscheidendes, sind
die Kategorien fachlich nicht zu trennen. Das sind zwei völlig verschiedene Antworten,
und die Statistik gibt keine davon her. Dafür trägt `Beispiel` eine optionale `id`, die
das Training nicht braucht und die Bewertung sehr wohl.

**Erklärt wird KONTRASTIV, seit 2026-11-09** (`core/klassifikator/erklaerung.ts`,
angezeigt über `ErklaerungsTafel`): nicht „was sprach für die Gewinnerin", sondern
„warum sie und nicht jene". Bei einem linearen Modell zerlegt sich der Abstand zweier
Kategorien exakt in einen Posten je Merkmal plus die Grundneigung (Bias) — keine
Näherung, die Posten addieren sich ohne Rest zum Abstand, und ein Test hält das fest.
Vorher standen die rohen Gewichte der Gewinnerin da; die sagen nicht, was den Ausschlag
gab, denn ein Wort, das für beide Kategorien stark spricht, stand oben und hatte nichts
entschieden. Und die Grundneigung kam gar nicht vor, obwohl sie bei ungleich grossen
Kategorien oft mitentscheidet.

Wogegen gerechnet wird, hängt am Ort: am **Fehlgriff** gegen die richtige Kategorie, an
der **Buchung** gegen die gebuchte (oder die Zweitbeste, wenn beide übereinstimmen), in
der **Review** gegen die Zweitbeste. Daneben steht, wo ein Wort im Bestand vorkommt —
liegt es dort selbst in beiden Kategorien, sind die Labels uneins und kein Merkmal hilft.

**Der BETRAG ist als Merkmal zuschaltbar** (`Merkmalsherkunft: "betrag"`), ab Werk aus.
Er liefert Richtung und **Grössenordnung**, nicht den Wert: ein genauer Betrag wäre ein
Token, das genau einmal vorkommt — das Modell lernt nichts daraus, und das Vokabular
wüchse um eine Zeile je Zahlung. Aus ist er, weil ein neues Merkmal, das sich selbst
einschaltet, jedes bestehende Modell ändert, ohne dass jemand es gemessen hat; mit der
Vergleichslinie daneben ist „bringt das etwas?" jetzt beantwortbar statt Geschmackssache.

**Die Wortwolken sind weg.** Sie zeigten je Kategorie ihre stärksten Merkmale als Bild —
hübsch und ohne Handlung: was man daraus ablas, stand daneben schon in der Wortliste, und
was man wissen wollte (welche Zeilen gehen schief) stand nirgends.
