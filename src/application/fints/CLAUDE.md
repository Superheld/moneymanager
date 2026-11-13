# Bankabruf — Vormerkungen

Gilt für den Abruf und für alles, was Vormerkungen liest. Die Bibliothek dahinter beschreibt der Skill `lib-fints`. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Eine Vormerkung ist eine Beobachtung, keine Buchung

Seit 2026-09-05 liest der Abruf das ZWEITE Feld der Antwort mit: die Zahlungen, die die
Bank kennt und noch nicht gebucht hat. Sie kommen ohne eigenen Abruf, ohne TAN und ohne
Wartezeit — sie standen die ganze Zeit in derselben Antwort und wurden weggeworfen.

**Sie landen in `vormerkung` und nicht in `umsatz_roh`**, und das ist der ganze Punkt.
Eine Vormerkung wird in ein bis drei Tagen zu einer Buchung — mit möglicherweise anderem
Betrag — oder sie fällt weg. Im Ledger stünde dieselbe Zahlung danach zweimal, und der
Dublettenfinder hätte nichts, woran er sie erkennt: keine stabile Kennung, ein Betrag,
der sich noch ändern darf, und bei manchen Instituten **nicht einmal ein Datum**
(`datum` ist deshalb nullable). Sie gehört in dieselbe Kategorie wie `kontostand_anker`
und `depotwert`: eine Beobachtung zu einem Zeitpunkt.

**Der Bestand wird je Konto ERSETZT, nicht fortgeschrieben.** Was die Bank nicht mehr
meldet, gibt es nicht mehr — das ist die einzige Aussage, die diese Tabelle treffen kann,
und `VormerkungRepository` lässt bewusst keine andere zu: es gibt kein `speichern` für
eine einzelne. Auch eine LEERE Liste wird geschrieben; „nichts mehr offen" ist der Fall,
wegen dem man hinsieht. Nach einem gescheiterten Abruf passiert dagegen nichts: dann
wüsste niemand, ob die Bank keine meldet oder ob wir nicht gefragt haben.

Zwei Stellen rechnen und zeigen sie:

- **Die Liquiditätsvorschau** zieht sie vom Startwert ab, in BEIDEN Linien. Eine
  Vormerkung ist sicherer als jede Vertragsrate — sie ist bereits geschehen, nur noch
  nicht verbucht —, und `realerKontostand` sieht sie nicht. Dasselbe meint die Bank, wenn
  sie neben den Saldo einen „verfügbaren Betrag" stellt.
- **Der Kontoauszug** zeigt sie als abgesetzten Block ÜBER dem Gebuchten
  (`ui/konten/VormerkungsBlock.tsx`). Sie nur wirken zu lassen war der verworfene Weg:
  bei der ersten Abweichung stünde eine Zahl da, deren Herkunft niemand sieht, und in
  einer Finanz-App ist das schlimmer als eine fehlende Zahl.

**`INFO` zählt nicht mit.** Die Bank sagt damit, dass sie diese Zeile nicht buchen wird;
sie mitzurechnen zöge Geld ab, das nie abgeht. Angezeigt wird sie trotzdem — sie erklärt,
was man im Online-Banking sieht.
