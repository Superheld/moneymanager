# Training

Gilt für den Bereich Training und das Messen der Kategorie-Erkennung. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Das Training ist eine Werkbank, kein Bereich

Seit 2026-08-31 hinter `experiment.training` und deshalb ab Werk **nicht in der
Navigation**. Die Erkennung läuft trotzdem: ausgeliefert wird ein fertiges Modell, und
wer nur seine Zahlungen kategorisiert haben will, hat mit dem Bereich nichts zu tun. Wer
ihn einschaltet, greift in die Merkmale ein, trainiert neu und misst.

**Und „messen" heisst seither drei Dinge**, nicht mehr nur eine Trefferquote:

| | sagt |
|---|---|
| Genauigkeit | wie oft das Modell richtig lag |
| **Vergleichslinie** | wie oft blindes Raten richtig läge — immer die häufigste Kategorie |
| **Vorsprung** | der Abstand, und damit das Einzige, woran sich eine Änderung messen lässt |

Die Vergleichslinie ist der wichtigste Zusatz, und der Grund ist nicht Ordnungsliebe: eine
Trefferquote sagt für sich genommen nichts. In einem Haushalt, in dem eine Kategorie ein
Viertel aller Zahlungen ausmacht, trifft blindes Raten schon ein Viertel; bei
gleichmässiger Verteilung fast nichts. Ohne den Abstand liesse sich nicht sagen, ob eine
Variante besser ist als die davor — und genau daran hing, dass „verschiedene Varianten
ausprobieren" bis dahin nicht weiterführte.

**Aus der Verwechslungsstatistik führt jetzt ein Weg in die einzelnen Zeilen.** Die Zahl
sagt, WO es klemmt; erst die Zeilen sagen, WARUM — steht dort ein Empfänger, der für
beide Kategorien vorkommt, fehlt ein Merkmal; steht dort nichts Unterscheidendes, sind
die Kategorien fachlich nicht zu trennen. Das sind zwei völlig verschiedene Antworten,
und die Statistik gibt keine davon her. Dafür trägt `Beispiel` eine optionale `id`, die
das Training nicht braucht und die Bewertung sehr wohl.

**Der BETRAG ist als Merkmal zuschaltbar** (`Merkmalsherkunft: "betrag"`), ab Werk aus.
Er liefert Richtung und **Grössenordnung**, nicht den Wert: ein genauer Betrag wäre ein
Token, das genau einmal vorkommt — das Modell lernt nichts daraus, und das Vokabular
wüchse um eine Zeile je Zahlung. Aus ist er, weil ein neues Merkmal, das sich selbst
einschaltet, jedes bestehende Modell ändert, ohne dass jemand es gemessen hat; mit der
Vergleichslinie daneben ist „bringt das etwas?" jetzt beantwortbar statt Geschmackssache.

**Die Wortwolken sind weg.** Sie zeigten je Kategorie ihre stärksten Merkmale als Bild —
hübsch und ohne Handlung: was man daraus ablas, stand daneben schon in der Wortliste, und
was man wissen wollte (welche Zeilen gehen schief) stand nirgends.
