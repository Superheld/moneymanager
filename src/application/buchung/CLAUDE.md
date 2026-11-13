# Buchung — GoBD und Journal

Gilt für alles, was eine Buchung protokolliert, zurücksetzt oder löscht. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Wie weit die App den GoBD folgt

Die GoBD gelten für **Buchführungspflichtige**. Diese App führt einen privaten Haushalt und
ist ihnen **nicht unterworfen** — ihre Grundsätze sind hier trotzdem das richtige Maß, weil
sie beschreiben, was eine Aufzeichnung glaubwürdig macht. Der Abschnitt steht hier, damit
niemand später raten muss, was bewusst erfüllt ist und was bewusst nicht.

| Grundsatz | Stand |
|---|---|
| **Nachvollziehbarkeit** | Beleg und Buchung sind verbunden (`umsatz_verarbeitung.istbuchung_id`), Änderungen an Buchungen stehen im `buchung_journal` |
| **Vollständigkeit** | Der Import legt jede Zeile an, auch Verworfenes bleibt sichtbar |
| **Richtigkeit** | Geld ist Integer Cent, Fremdschlüssel halten das Schema zusammen |
| **Ordnung** | Ein Ort je Sachverhalt, keine verwaisten Verweise mehr |
| **Unveränderbarkeit** | **teilweise** — siehe unten |
| **Aufbewahrung** | lokal, nichts verfällt von selbst |
| **Verfahrensdokumentation** | diese Datei und die Doku ausserhalb des Repos |

### Was die Unveränderbarkeit heute leistet

**Der Beleg wird nie GEÄNDERT, und seit 2026-09-06 ohne Ausnahme.** `umsatz_roh` wird nach
dem Anlegen nicht mehr beschrieben — die frühere Ausnahme `ergaenzen` ist ersatzlos weg, weil
eine zweite Fassung jetzt als eigener Beleg danebensteht statt in die vorhandene Zeile
geschrieben zu werden. Was eine Quelle geliefert hat, steht unverändert da.

**Seit 2026-09-13 lässt er sich aber LÖSCHEN**, an genau einer Stelle: beim endgültigen
Löschen eines stillgelegten Kontos (siehe `src/core/konten/CLAUDE.md`). Das ist kein Widerspruch zum Absatz darüber
— unveränderlich heisst „nicht umgeschrieben", und eine gelöschte Zeile behauptet nichts
Falsches. Es ist trotzdem die Grenze der Unveränderbarkeit, und sie gehört benannt statt
beiläufig überschritten: der Inhalt der Buchungen bleibt im `buchung_journal`, der WORTLAUT
der Bankzeile nicht. Die Rückfrage sagt es mit, weil ein Institut Umsätze nur begrenzt
vorhält — nach der Frist ist diese Datei die einzige Stelle, an der sie standen.

**Änderungen an Buchungen sind protokolliert.** Jedes Anlegen, Ändern und Löschen schreibt
einen Eintrag ins `buchung_journal` — mit dem ganzen Zustand vorher und nachher, nicht mit
Unterschieden. Der ursprüngliche Inhalt bleibt damit feststellbar, auch nachdem die Buchung
gelöscht wurde. Deshalb trägt die Tabelle bewusst **keinen** Fremdschlüssel auf
`ist_buchung`: sie muss die Löschung überleben.

### Und seit 2026-08-28 ist es lesbar

Das Journal lief zwei Wochen mit, ohne dass es jemand zu sehen bekam. Es steht jetzt im
Buchungsdialog unter **Verlauf** — die Einträge, der Unterschied zum Stand bei der
Entstehung, und ein Weg zurück. Im Kontoauszug stand bis 2026-11-12 an jeder Zeile mit
Einträgen eine Pille „Verlauf n" — ausdrücklich **vorläufig**, solange das Journal jung
war. Sie ist weg, samt der Zählung dahinter (`JournalRepository.anzahlen`): fast jede
Zeile hat inzwischen Einträge, und eine Marke an fast jeder Zeile sagt nichts mehr.

**Es gibt ZWEI Wege zurück, und sie bedeuten Verschiedenes.** Gebaut ist bislang der erste:

| | Quelle | reicht zurück bis | liefert |
|---|---|---|---|
| Stand bei Entstehung | Journal | 23.08.2026 | die Buchung, wie sie **damals** war |
| Stand des Belegs | `umsatz_roh` | den ganzen Bestand | die Buchung, wie sie **heute** entstünde |

Der zweite liefert den heutigen Kategorievorschlag, nicht den von damals — meist besser,
aber eben eine andere Aussage. Beide unter einen Knopf zu legen und je nach Verfügbarkeit
den einen oder anderen zu nehmen, ergäbe einen Knopf, der zwei Dinge tut, ohne dass man
sieht welches. Wer den zweiten baut, baut ihn daneben.

**Das Journal bleibt dabei eine Aufzeichnung und wird kein Speicher.** Der Unterschied ist
nicht akademisch, er entscheidet über das Risiko: als **Angebot** darf sich ein Rückweg
darauf stützen — fehlt der Eintrag, entfällt das Angebot, und verloren ist nichts, was
nicht ohnehin verloren wäre. Als **Pflichtweg** dürfte er es nicht: dann wäre eine Lücke im
Protokoll Datenverlust statt einer Lücke in der Nachvollziehbarkeit, es liesse sich nie
mehr aufräumen, und „nicht fälschungssicher" (siehe unten) wäre keine hingenommene Grenze
mehr, sondern ein Loch. Ein Ablauf, der einen Eintrag VORAUSSETZT, gehört nicht ans
Journal.

**Ein Umbuchungs-Bein lässt sich nicht zurücksetzen.** Ein Bein allein liefe auf einen von
zwei Zuständen hinaus, die es nicht geben darf: entweder fällt die `transferId` weg und das
Gegenbein zeigt auf ein Paar, das es nicht mehr gibt, oder sie kommt zurück und zeigt auf
ein Bein, das inzwischen einen anderen Betrag trägt. Dafür gibt es „Paarung lösen" — einen
Weg, der beide Seiten anfasst.

**Zwei Felder kommen nicht mit:** `vertrag_id` und `vertrag_herkunft` stehen zwar im
protokollierten Stand, gehören aber der Vertragszuordnung und nicht dem Ledger. Eine
Vertragszuordnung überlebt das Zurücksetzen.

Was damit möglich, aber noch nicht gebaut ist: eine **gelöschte** Buchung wieder anlegen.
Der Stand dafür steht im Journal (`letzterStand`), und es wäre der halbe Weg zum Storno
weiter unten.

### Was offen ist, und warum

- **Storno statt Löschen.** Eine gelöschte Buchung verschwindet weiterhin aus dem Ledger;
  nur ihr letzter Stand bleibt im Journal. Streng genommen verlangen die GoBD, dass sie
  sichtbar bleibt und durch eine Gegenbuchung aufgehoben wird. Das ist eine
  Bedienentscheidung, keine technische — und sie ändert, wie sich die App anfühlt.
- **Wer etwas geändert hat**, wird nicht festgehalten. Bei einem Einzelnutzer ohne Anmeldung
  gibt es nichts zu unterscheiden; sobald es mehrere Nutzer gibt, fehlt es.
- **Das Journal ist nicht fälschungssicher.** Wer die Datei öffnet, kann es ändern. Dagegen
  hülfe nur eine Signaturkette, und die wäre für eine lokale Haushalts-App ein Aufwand ohne
  Gegenwert — der Angreifer wäre der Nutzer selbst.
- **Kein Änderungsprotokoll für Stammdaten** (Konten, Kategorien, Verträge, Budgets). Sie
  beschreiben keine Zahlung; ihre Historie wäre Aufwand ohne Zweck.
- **`kontostand_anker` und `depotwert` werden nicht protokolliert.** Sie sind Beobachtungen
  zu einem Stichtag und werden nur ergänzt, nicht geändert.
