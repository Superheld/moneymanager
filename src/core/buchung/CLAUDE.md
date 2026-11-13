# Buchung — Richtung, Einordnung, Umbuchungen

Gilt für alles, was an einer Ist-Buchung Richtung, Charakter oder Paarung berührt — auch in der Maske. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Das Vorzeichen ist die Richtung, der Charakter ordnet ein

**Der Betrag einer Ist-Buchung trägt sein Vorzeichen selbst, überall.** Er kommt
vorzeichenbehaftet in `buchungErfassen` und `buchungBearbeiten` herein und wird unverändert
gebucht — beim Import ist das die **Tatsache** vom Beleg, von Hand das, was jemand eintippt.
Nichts leitet die Richtung mehr aus dem Charakter ab, und deshalb kann auch nichts sie
umdrehen. Geprüft wird nur noch, dass sie nicht 0 ist (`betrag.nichtNull`); **negative
Beträge sind auf jedem Konto und in jeder Kategorie erlaubt**, denn eine Retoure ist eine.

Der Charakter ist eine **Einordnung**: er sagt, WOFÜR das Geld war. Eine Einordnung darf
eine Tatsache nicht umdrehen — das gilt seit dem Wegfall der Ableitung nicht mehr nur für
importierte Zeilen, sondern immer.

**Die Maske trennt HÖHE und RICHTUNG in zwei Felder.** Das Betragsfeld nimmt die Höhe,
daneben steht die Richtung als Wahl mit zwei sichtbaren Möglichkeiten (Abfluss/Zufluss);
beim Öffnen wird der gespeicherte Betrag in beide zerlegt, beim Speichern wieder
zusammengesetzt. Ein mitgebrachtes Vorzeichen — getippt oder eingefügt — wandert in diese
Wahl, statt im Feld stehenzubleiben oder abgewiesen zu werden.

Die Wahl bleibt auch dort **sichtbar, wo sie gesperrt ist** (Online-Konto, Entwurf,
Umbuchungs-Bein): was die Bank gebucht hat, soll man ablesen können, ohne es ändern zu
dürfen. Ein Feld, das nur erscheint, wenn man es bedienen darf, lässt die Frage sonst
unbeantwortet — genau das war der Fehler des Kästchens davor.

Die Kategorie setzt die Richtung nur, **solange niemand sie selbst gewählt hat**. Danach
gilt die Wahl, und kein Kategoriewechsel nimmt sie wieder weg; eine bestehende Buchung
zählt von Anfang an als selbst gesetzt. Das ist nicht die alte Ableitung mit anderem
Namen: die lief unsichtbar hinter dem Feld, diese bewegt einen Schalter, den man vor sich
sieht und jederzeit zurückstellen kann.

**Eine Erstattung ist damit ein Aufwand mit positivem Betrag**, und das ist kein
Widerspruch: „Aufwand" sagt, WOFÜR das Geld war, das Vorzeichen sagt, wohin es floss. Die
Budgetrechnung ist darauf ausgelegt — `Verbrauchsposten.betrag` ist ausdrücklich „POSITIV
(eine Erstattung ist entsprechend negativ)", und damit entlastet sie das Budget der
Kategorie, in der die Ausgabe stattgefunden hat.

**Ein Rückfluss gehört IMMER in die Kategorie der Ausgabe.** Es gibt darum keine Kategorie
für Erstattungen unter den Einnahmen, und es soll auch keine geben: dieselbe Zahlung stünde
sonst je nach Einsortierung für zwei verschiedene Aussagen — einmal entlastet sie das
Budget, in dem die Ausgabe stattfand, einmal bläht sie die Einnahmen auf und gleicht nie
etwas aus. Welche von beiden gilt, entschiede dann die Kategorie-Erkennung, und die nimmt
gern die falsche: das Wort steht oft genug im Verwendungszweck.

Das gilt auch, wenn die ursprüngliche Ausgabe gar nicht im Bestand steht — eine
Steuerrückerstattung gehört zu „Steuern", eine Kautionsrückzahlung zu „Wohnen". Eine
Verknüpfung zur erstatteten Buchung braucht es dafür nicht: solange beide im selben Monat
liegen, kommt die Verrechnung über die Kategorie auf dasselbe Ergebnis, und über
Monatsgrenzen hinweg würde eine solche Verknüpfung einen abgeschlossenen Monat rückwirkend
ändern — genau das, was der Budgetbetrag (`src/core/budgets/CLAUDE.md`) aus gutem Grund nicht tut.

**Für eine PLANGRÖSSE bleibt die Ableitung.** `vorzeichenbehaftet()` gibt es weiterhin,
aber nur noch für Zahlungsregel und Vertragsrate: eine geplante Rate hat genau eine
Richtung, sonst wäre sie keine Rate. Für eine IST-Buchung gilt sie nicht — dort fallen
Einordnung und Richtung beim Rückfluss auseinander, und dann gewinnt die Richtung.

Drei Versuche davor sind an derselben Stelle gescheitert und stehen hier, damit kein
vierter unternommen wird:

1. Eine Sonderregel in `buchungBearbeiten`, die bei `quelle === "import"` das Vorzeichen
   des Originals gegen die Ableitung verteidigte.
2. Ein Kästchen `gegenrichtung`, das die Ableitung umdrehte — es gab das Kästchen aber nur
   in der Hälfte der Fälle, bei importierten Zeilen also nie.
3. Das Vorzeichen im Betragsfeld selbst. Richtig gerechnet, und trotzdem zu wenig: es
   verlangt, dass man auf die Idee kommt, ein Minus zu tippen.

Die ersten beiden reparierten die FOLGEN der Ableitung, statt sie wegzunehmen — die Maske
zeigte weiter `Math.abs(betrag)`, und ein eingetipptes Minus flog mit
`betrag.groesserNull` raus. Der dritte nahm sie weg und liess die Richtung trotzdem etwas
sein, das man dem Feld ansehen muss. **Eine Wahl mit zwei sichtbaren Möglichkeiten
verlangt weder Wissen noch Vertrauen** — das ist der Unterschied, an dem die drei davor
gescheitert sind.

**Und wo ein Wort neben der Zahl steht, muss es mitwandern.** Ein negativer Verbrauch unter
der Überschrift „verbraucht" liest sich als ausgegeben, auch wenn das Minus davorsteht und
der Rest im selben Bild wächst — ein Wort gewinnt gegen ein Vorzeichen. Die Anzeigen zum
Budgetverlauf wechseln deshalb das Wort und zeigen den Betrag ohne Vorzeichen, statt beides
zu vermischen.

**Aber `Math.abs` auf einem Verbrauch ist fast immer ein Fehler.** Wo der Wert einen
Rückfluss tragen KANN, macht das Wegwerfen des Vorzeichens aus „es kam Geld zurück" ein
„es wurde genau so viel ausgegeben". Der Unterschied zum Absatz davor: dort steht ein Wort
daneben, das mitwandert; hier steht nur die Zahl. Ein Balken darf bei 0 anschlagen
(`Math.max(0, …)`), die Zahl daneben behält ihr Vorzeichen.

## Was man von Hand paaren kann, erkennt die App selbst

Seit 2026-11-07 verbindet die App zwei Buchungen von selbst zu einer Umbuchung — dasselbe
wie „paaren" von Hand (`buchungenPaaren`). Die Regel steht in
`core/buchung/exakteUmbuchung.ts`, der Ablauf in
`application/buchung/umbuchungenErkennen.ts`.

**Die Grundlage ist die Liste beim Paaren von Hand** (`paarungsKandidaten`): exakter
Gegenbetrag, zwei verschiedene Konten, höchstens `MAX_VORSCHLAG_TAGE` auseinander, beide
noch frei. Absender und Ziel sind die beiden eigenen Konten. Was die Automatik darüber
hinaus prüft, ersetzt den Blick, den ein Mensch vor der Liste auf die Zeile wirft:

| | genügt |
|---|---|
| **eine Handbuchung ist dabei** | die Grundlage — sie hat keinen Beleg, der mehr sagen könnte |
| **zwei Bankzeilen** | die Grundlage UND mindestens eine nennt per Gegen-IBAN das andere Konto |
| **ein Beleg nennt eine andere Gegenseite** | nie |

Die letzte Zeile schliesst die meisten Fehlgriffe aus: eine Erstattung vom Händler trägt
dessen IBAN. Die mittlere verhindert, dass eine Kartenzahlung ohne IBAN und eine Gutschrift
gleicher Höhe nur am Betrag zusammenfinden. Eine fremd wirkende IBAN widerspricht einem
Konto ohne hinterlegte IBAN nicht; ob sie seine ist, lässt sich dann nicht sagen.

Fünf Entscheidungen darin:

- **Ein Bein allein bleibt, was es ist.** Vorgemerkt wird nichts. Die erste Seite steht als
  Ausgabe oder Einnahme im Bestand, bis die zweite da ist; das entspricht „eine Umbuchung
  ohne Gegenbuchung gibt es nicht" (`umsatzVerbuchen`).
- **Es läuft nach dem Verbuchen und über den Bestand**, nicht in `paareUmbuchungen`. Ein
  Abruf gilt einem Konto, die Stapelpaarung sieht die beiden Beine also nie zusammen.
  Dieselbe Prüfung läuft nach dem Erfassen von Hand (`dienste.buchungErfassen`).
- **Das Zeitfenster ist weiter als die drei Tage der Stapelpaarung** und dasselbe wie beim
  Paaren von Hand: eine Überweisung zwischen zwei Banken darf dauern.
- **Die Suche geht nur von NEUEN Zeilen aus.** Der Bestand wird nicht bei jedem Abruf neu
  aufgerollt. Das Nachholen für alte Zeilen wäre ein eigener Schritt mit Liste zum
  Bestätigen; auch das Bearbeiten löst nichts aus.
- **Unklar heisst: nichts tun.** Gepaart wird nur gegenseitig Nächstes; bei Gleichstand
  bleibt die Buchung stehen. Eine fehlende Paarung lässt sich von Hand nachholen und fällt
  auf, eine falsche sieht richtig aus.

**Was jemand entschieden hat, bleibt** (`frei` in der Regel): keine von Hand einsortierte
BANKZEILE, nichts Aufgeteiltes, und **keine Umschichtung ohne Kategorie**. So sieht ein
Bein nach „Paarung lösen" aus, denn `alsBein` nimmt die Kategorie und `paarungLoesen` lässt
den Charakter stehen. Das ist ein Nein von Hand; ohne den Ausschluss käme die gelöste
Paarung zurück. Eine Handbuchung MIT Kategorie nimmt dagegen teil: die Kategorie gehört dort
zum Erfassen und ist keine Antwort auf eine Frage. Sie geht beim Paaren weg wie von Hand
auch und steht im Journal.

**Die Gegen-IBAN hat bei jedem Protokoll dieselbe Form**, und dafür sorgt allein der
FinTS-Adapter (`gegenparteiIbanAus` in `adapters/fints/uebersetzung.ts`). MT940 nennt die
Gegenseite je nach Bank in `?38`, als IBAN in `?31` oder gar nicht als IBAN, sondern als
Kontonummer in `?31` mit Bankleitzahl in `?30`; den letzten Fall rechnet der Adapter um
(`deutscheIban`). Hinter ihm gibt es nur noch eine Form, und eine neue Spielart einer Bank
bleibt in dieser Datei. Passt die Form nicht, etwa weil `?30` eine BIC trägt, bleibt das
Feld leer: die Umbuchung wird dann nicht erkannt, und falsch verbunden wird nichts.

Eine berechnete IBAN ist **keine Angabe der Bank**. Deshalb stehen `remoteBankId` und
`remoteAccountNumber` dort im Original in `bankfelder` — aber NUR, wo die Bank keine IBAN
genannt hat. Mitgeschrieben bei jeder Zeile bekäme über `traegtNeues` jede schon
gespeicherte Zeile beim nächsten Abruf einen zweiten Beleg ohne neuen Inhalt. Bei Zeilen
ohne IBAN ist genau das erwünscht: die Überlappung des Abrufs liefert die Angabe nach.
Der `rohHash` hängt nicht daran, er nimmt die Gegen-IBAN nicht auf.

**Beide Beine werden `zuPruefen` markiert**, auch das schon gesehene: an ihm hat sich
etwas geändert, ohne dass jemand dabei war. „Paarung lösen" ist der Weg zurück.

**Im Dialog einer einzelnen Bankzeile läuft sie nicht** (`BuchungDetail` →
`umbuchungenErkennen: false`): dort wählt gerade jemand das Gegenbein, die Automatik käme
ihm zuvor, und sein Paaren scheiterte an „schon gepaart".

Noch nicht gebaut: eine Verwaltung der erkannten Automatismen, an der sich auch das
Zeitfenster je Weg einstellen liesse, und das Nachholen im Altbestand.
