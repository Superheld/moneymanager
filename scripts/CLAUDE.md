# Der Muster-Guard

Gilt für `scripts/privacy-guard.mjs` und die Wächter um ihn. Die Regel selbst — kein Wert aus dem echten Bestand ins Repo — steht in der Wurzel-`CLAUDE.md`. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Was der Muster-Guard findet

**Der Muster-Guard** (`scripts/privacy-guard.mjs`) kennt die Formen: IBAN, SEPA-Gläubiger-ID,
Token, E-Mail, Produkt-ID, Beträge in Prosa, verbotene Dateitypen. Er findet auch, was
**nicht aus deiner Datenbank stammt** — genau die Lücke, durch die einmal eine Kontonummer
aus einem FinTS-Mitschnitt gerutscht ist (siehe „Mitgelieferte Skills"). Er läuft in
`npm test` und an allen drei Hook-Zeitpunkten.

Daneben steht in `src/privatsphaere.test.ts` noch **ein** Testfall, und er ist der einzige
dort, der ohne Datenbank auskommt: keine IBAN im Repo darf die Bankleitzahl einer echten
Bank tragen, geprüft gegen die DK-Liste. Er braucht kein Urteil und keinen Schlüssel —
deshalb hat er den Ausbau überlebt.

Zwei Entscheidungen im Muster-Guard, die man kennen muss:

- **IBANs werden gegen die DK-Bankenliste im Repo geprüft**, nicht gegen den 9999er-Präfix
  aus `src/CLAUDE.md`. Der Präfix war immer nur eine Faustregel für die eigentliche
  Anforderung: die IBAN darf zu keinem echten Konto gehören können. Eine erfundene BLZ
  ausserhalb des 9999er-Bereichs geht deshalb durch.
- **Beträge prüft er nur in PROSA** (Markdown, Commit-Nachrichten), nicht im Code. In einer
  Finanz-App steht in jedem zweiten Test ein Betrag, und ein Muster kann den abgelesenen
  nicht vom erfundenen trennen. Dafür war der Wert-Abgleich da; seit er weg ist, ist ein
  abgelesener Betrag im CODE ungeprüft — das ist die grösste Lücke, die sein Ausbau
  hinterlässt, und sie fällt in die Handarbeit. In Prosa dreht sich das um: dort steht ein
  Betrag fast nie als Beispiel, sondern als Beleg.

Einzelfall freigeben: `privacy-ok` in dieselbe Zeile. Namen und Begriffe, die keinem Muster
folgen, kommen in `.privacy-terms` (git-ignoriert, Vorlage: `.privacy-terms.example`).

## Was er nicht kann

- Er findet nur den **Originalwert**. Ob ein Ersatz neutral ist, sieht er nicht.
- Er findet nur, was einer **Form** folgt. Namen, Verwendungszwecke und Buchungszahlen
  gehören in `.privacy-terms`, sonst sieht sie niemand.
- Er bricht ab, wenn er nicht arbeiten kann — kaputter Guard, fehlende Bankenliste. Ein
  Wächter, der nichts sieht, ist schlimmer als keiner: er beruhigt.
- Ein Rewrite ist **nie vollständig** — Forks und alte Commit-SHAs bleiben bei GitHub
  abrufbar. Es zählt nur, dass es gar nicht erst hineingerät.

## Der Wert-Abgleich ist weg, und was das kostet

Bis zum 30.08.2026 gab es einen zweiten Wächter: er las den **echten Bestand** zur Laufzeit
und suchte dessen Werte im Arbeitsbaum und in den ausgehenden Commit-Texten. Er hat
gefunden, wofür er gebaut war — eine IBAN in zwei Import-Tests, Kontostände in Kommentaren,
eine mit der eigenen Miete begründete Toleranz im Monatsausblick.

**Er ist ausgebaut, und der Grund ist nicht Bequemlichkeit.** Seit der Bestand verschlüsselt
ist, kam er nur noch über den **Datenschlüssel** an seine Werte — als Wiederherstellungscode
im Klartext neben der Datenbank. Ein Wächter, der einen Generalschlüssel verlangt, nimmt der
Verschlüsselung genau das, wofür sie gebaut wurde. Und fehlte die Datei, war `npm test` rot
und **jeder** Push blockiert; das traf nicht nur den frischen Klon, sondern auch den
Rechner, auf dem die Verschlüsselung eingeführt wurde, dort in dem Moment, in dem sie
griff — und still, denn ein Push, der nicht stattfindet, sieht aus wie ein Tag ohne Push.

Dazu ist seine Voraussetzung entfallen: es liegen **keine Echtdaten im Rohformat** mehr in
der Entwicklung, und der Spielstand (`npm run seed`) ist eine eigene Umgebung mit
erfundenen Daten.

**Was damit ungeprüft bleibt, und das ist der ehrliche Teil:** alles, was keiner Form folgt
— ein Empfängername, ein Verwendungszweck, eine Buchungszahl, ein Kontostand in Prosa. Der
Muster-Guard kennt Formen, nicht Werte. Wer so etwas benennen kann, trägt es in
`.privacy-terms` ein (git-ignoriert, Vorlage `.privacy-terms.example`); dort greift der
Muster-Guard es wieder auf. Der Rest ist Handarbeit — dieselbe Art wie bei der
Anonymisierung, die ohnehin nie ein Wächter leisten konnte.

**Das Werkzeug `bestandslesen` bleibt** (`src-tauri/src/bin/bestandslesen.rs`). Es ist der
einzige Weg, den verschlüsselten Bestand von der Kommandozeile zu lesen, und dafür gibt es
gute Gründe — einen Datenbug nachsehen statt raten. Der Unterschied zu vorher ist
entscheidend: `~/.moneymanager-schluessel/entwicklung.code` ist jetzt **optional**. Wer sie
anlegt, tut es bewusst und für eine Sitzung; kein Testlauf und kein Push verlangt sie mehr.

```bash
cargo build --manifest-path src-tauri/Cargo.toml --bin bestandslesen
./src-tauri/target/debug/bestandslesen "$DB" "SELECT …"
```
