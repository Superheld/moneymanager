# Testdaten — erfunden, anonym, je Testfall eigen

Diese Datei gilt für alles unter `src/`. Die Tests liegen als `*.test.ts` neben dem Code,
es gibt also keinen Testordner, den man gesondert regeln könnte — die Regel muss dort
stehen, wo man sie beim Schreiben liest.

**Das Repo ist öffentlich.** Was hier hineingerät, ist draußen, auch wenn es später
gelöscht wird: geklont, geforkt und indiziert ist es dann längst. Ein Rewrite der Historie
ist nie vollständig.

## Die drei Regeln

**1. Kein Wert aus dem echten Bestand.** Keine IBAN, kein Empfänger, kein Betrag, kein
Kontostand, keine Gläubiger-ID, keine Buchungszahl. Auch nicht in Kommentaren, auch nicht
in Commit-Texten. Beim Kalibrieren gegen echte Daten ist das Kopieren eines Werts der
naheliegendste Handgriff und fällt hinterher niemandem mehr auf.

**2. Erfundene Werte müssen ANONYMISIEREN, nicht nur tauschen.** Ein Fantasiename, dem man
die Branche ansieht, verrät dasselbe wie der echte — dass es so einen Vertrag gibt, und
die Kategorie daneben bestätigt es. Erfundene Anbieter sind deshalb sektorneutral
(„Kesselmann", „Vibora", „Ohlert"), und ihre Kategorie folgt nicht aus dem Namen. Aus
einer Fixture darf sich nichts über den Haushalt ableiten lassen — weder aus einem
einzelnen Wert noch aus der Kombination mehrerer.

**3. Namen gelten je TESTFALL, nicht projektweit.** Derselbe Fantasiename in
siebenundzwanzig Tests wird selbst zum Muster: er verbindet Fälle, die nichts miteinander
zu tun haben, und wenn einmal jemand herausfindet, wofür er stand, gilt das rückwirkend
für alle. Gebraucht wird Gleichheit nur innerhalb eines Falls — dort, wo zwei Zeilen
denselben Empfänger meinen müssen. Der Bestand wird nach und nach umgestellt.

## IBANs

Eine Test-IBAN trägt eine **Bankleitzahl, die es nicht gibt** — Bereich `999999xx`, dann
die Prüfziffer rechnen. Eine IBAN mit echter BLZ kann zu einem echten Konto gehören, und
ob die Kontonummer dahinter vergeben ist, weiss hier niemand. Beispiel-IBANs aus dem Netz
taugen nicht: von den vier, die hier als „bekanntes Beispiel" im Umlauf waren, trugen alle
vier die BLZ einer echten Bank.

## Was die Wächter können — und was nicht

`src/privatsphaere.test.ts` liest die Merkmale zur Laufzeit aus der echten Datenbank und
prüft den Arbeitsbaum dagegen; `.githooks/pre-push` prüft zusätzlich die ausgehenden
Commit-Texte. Beide finden nur den **Originalwert**. Ob ein Ersatz neutral ist und ob er
sich über Testfälle hinweg wiederholt, kann keiner von beiden sehen. Regel 2 und 3 sind
Handarbeit.

Der ausführliche Zusammenhang steht in `../CLAUDE.md` unter „Nichts aus dem echten Bestand
ins Repo".
