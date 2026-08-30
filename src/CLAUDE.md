# Regeln für allen Code unter `src/`

Was je Schicht gilt, steht in deren eigener `CLAUDE.md` (`core/`, `application/`,
`adapters/persistence/`, `adapters/ui/`). Hier steht, was überall gilt.

## Sprache im Code

**Bezeichner sind deutsch** — `juengsterAnker`, `liquideMittel`, `sollRuecklage`,
`abweichungsfenster`. Das ist die auffälligste Konvention des Projekts und die einzige, die
man aktiv gegen die Gewohnheit halten muss: eine englische Funktion fällt hier sofort auf.
Umlaute werden im Bezeichner ausgeschrieben (`juengster`, nicht `jüngster`), in Kommentaren
und Texten nicht.

Fachbegriffe folgen der Domäne, nicht der Alltagssprache: im Code heißt es `Rücklage`,
`Umschichtung`, `IstBuchung`. Was davon in der Oberfläche erscheint, entscheidet
`src/i18n/i18n.ts`.

## Konventionen, die der Compiler nicht prüft

- **Dateinamen:** PascalCase für React-Komponenten (Endung `.tsx`), camelCase für alles
  andere (`.ts`).
- **`any` ist praktisch nicht in Gebrauch** (eine Handvoll Stellen im gesamten Produktivcode).
  Wo ein Typ fehlt, wird er geschrieben — nicht umgangen.
- **Kommentare erklären das WARUM**, nicht das WAS. Rund ein Viertel aller Zeilen im Kern
  sind Kommentar, und das ist Absicht: die Begründung steht neben der Entscheidung, damit
  sie beim nächsten Anfassen noch da ist. Ein Kommentar, der den Code nacherzählt, ist keiner.

## Es gibt keinen Linter

Bewusst, und aus zwei Gründen. Der erste ist technisch: `@typescript-eslint/parser`
unterstützt das hier installierte TypeScript 7 nicht (Peer bis `<6.1.0`). Der zweite wiegt
schwerer, weil er auch für die Linter gilt, denen die TypeScript-Version egal ist (oxlint,
Biome — beide bringen einen eigenen Parser mit): **an dieser Codebasis finden sie nichts.**

Am 2026-08-20 durchgemessen. Der Standard-Regelsatz meldete zwei Kleinigkeiten, beide in
kopierten Design-System-Dateien. `react-in-jsx-scope` ist bei `jsx: "react-jsx"` schlicht
falsch. Und `exhaustive-deps`, die einzige Regel mit echtem Potenzial, meldete zwölf
Stellen — durchweg Memos, deren Hilfsfunktionen über Werte schließen, die im Dep-Array
bereits stehen. Formal fehlt die Funktion, praktisch ist die Abhängigkeit abgedeckt.

Ein Linter, dessen Bestandsmeldungen man erst einzeln wegdrücken muss, erzieht dazu,
Meldungen wegzudrücken. Wird hier je eine echte Fehlerklasse sichtbar, die der Compiler
nicht sieht, ist die Entscheidung neu zu treffen — dann aber mit einem Fund als Anlass,
nicht mit der Hoffnung auf einen.

Die Rolle übernehmen bis dahin drei andere:

- **Der Compiler.** `strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch` sind an. `npm run typecheck` muss grün sein.
- **Tests als Wächter.** `architektur.test.ts` (Schichtgrenzen), `doku.test.ts`
  (Verweise in der Doku), `privatsphaere.test.ts` (keine IBAN einer echten Bank), der i18n-Test
  (de/en-Parität). Eine Regel, die zählt, wird ausführbar gemacht statt aufgeschrieben.
- **Das LSP** (`typescript-lsp`, aktiviert in `.claude/settings.json`) liefert dieselben
  Auskünfte während der Arbeit statt erst im Testlauf: wo ein Symbol definiert ist, **alle**
  Verwendungen davon, welcher Typ dahintersteht. Bei „wer benutzt das" ist es `grep`
  überlegen, weil es den Compiler fragt statt Text zu vergleichen — Erwähnungen in
  Kommentaren zählt es nicht mit, Namensgleichheit über Modulgrenzen verwechselt es nicht.

  Zwei Fallen: **Der erste Aufruf nach dem Start ist kalt** und meldet zu wenig (bei einer
  Funktion mit acht Verwendungen kam beim ersten Mal genau eine zurück) — im Zweifel
  wiederholen, ein „keine Referenzen" ist erst beim zweiten Mal eine Aussage. Und der
  Sprachserver muss **global installiert** sein (`npm install -g typescript-language-server
  typescript@5`); das Plugin bringt nur die Anbindung mit. Die Version 5 ist kein Versehen:
  das Projekt-TypeScript 7 liefert kein `tsserver.js` mehr, der Server findet dann keine
  brauchbare Installation und beendet sich. Dasselbe Muster wie beim fehlenden Linter.

## Tests

Sie liegen als `*.test.ts` **neben dem Code**, es gibt keinen Testordner —
`src/testwerkzeug/` enthält Werkzeug (Harness, Setup, Fixture-Bau), keine Tests.

- **Kern und Use-Cases:** reine Funktionen, In-Memory-Fakes für Ports. Node-Umgebung, schnell.
- **Repositories und UI:** gegen echte In-Memory-SQLite (sql.js), keine Repo-Attrappen —
  ein falsches Spalten-Mapping soll im Test auffallen, nicht in der App. Einzelheiten in
  `adapters/ui/CLAUDE.md`.
- Nach **Daten** suchen, die der Test selbst angelegt hat, nicht nach Formulierungen — sonst
  wird die Suite beim nächsten Wording-Durchgang reihenweise rot.
- Bei **UI-Texten** nach dem i18n-SCHLÜSSEL suchen, nicht nach dem deutschen Wortlaut —
  dieselbe Regel wie oben, eine Ebene tiefer. **Wie man ihn sucht, hängt aber am Test:**

  `src/i18n/i18n.ts` initialisiert sich beim IMPORTIEREN. Zieht die geprüfte Komponente es
  über ihre Importkette herein (etwa über `dienste`), gibt `t()` deutschen Text zurück und
  `findByText("konten.gruppen.keine")` findet nichts; tut sie es nicht, kommt der Schlüssel
  selbst heraus. Beides gibt es im Bestand — `zugang/Sperrbildschirm.test.tsx` sucht
  Schlüssel, `konten/gruppen.test.tsx` bekommt Text.

  Der Weg, der in beiden Fällen trägt: `i18n.t(schluessel)` im Test aufrufen und danach
  suchen. Der Test hängt dann am Schlüssel und nicht am Wortlaut, egal welcher Fall
  vorliegt.
- **Keine deutschen Anführungszeichen in Testnamen.** `it("nimmt 0 als „aus"", …)` bricht
  den Parser: das schliessende `"` beendet die Zeichenkette, das folgende `"` steht dann
  allein. Gemeldet wird „no tests" — und zwar für die GANZE Datei, nicht für den Testfall.
  Zweimal passiert, beide Male suchte man zuerst beim Testfall.

### Kein E2E — und was stattdessen trägt

`tauri-driver` gibt es für Linux und Windows, **nicht für macOS** (WKWebView bietet keinen
WebDriver). Playwright gegen `npm run dev` bringt nichts: die Webview allein hat kein
SQLite-Plugin und damit keine Daten. Es tragen zwei Ersatzwege: die jsdom-Tests laufen von
der Oberfläche bis ins Schema, und App-Code-Pfade lassen sich headless gegen eine Lesekopie
der echten Datenbank fahren (Rezept in `CLAUDE.local.md`).

# Testdaten — erfunden, anonym, je Testfall eigen

**Das Repo ist öffentlich.** Was hier hineingerät, ist draußen, auch wenn es später
gelöscht wird: geklont, geforkt und indiziert ist es dann längst. Ein Rewrite der
Historie ist nie vollständig.

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
taugen dafür nicht: was als „bekanntes Dummy-Beispiel" kursiert, trägt regelmäßig die BLZ
einer echten Bank.

## Was der Wächter kann — und was nicht

**Bis zum 30.08.2026 stand hier mehr.** `src/privatsphaere.test.ts` las die Merkmale zur
Laufzeit aus der echten Datenbank und prüfte den Arbeitsbaum dagegen, `.githooks/pre-push`
zusätzlich die ausgehenden Commit-Texte. Dieser Wert-Abgleich ist ausgebaut — warum, steht
in `../CLAUDE.md` unter „Der Wert-Abgleich ist weg, und was das kostet". Die Kurzfassung:
er brauchte den Datenschlüssel im Klartext und sperrte ohne ihn jeden Push.

Was bleibt, sind **Formen**:

- `scripts/privacy-guard.mjs` — IBAN, SEPA-Gläubiger-ID, Token, E-Mail, Produkt-ID,
  Beträge in Prosa, verbotene Dateitypen.
- `src/privatsphaere.test.ts` — keine IBAN im Repo trägt die BLZ einer echten Bank,
  geprüft gegen die DK-Liste.

**Was jetzt niemand mehr findet, und damit musst du rechnen:** einen Empfängernamen, einen
Verwendungszweck, eine Buchungszahl, einen abgeschriebenen Betrag **im Code** (in Prosa
greift der Muster-Guard). Das ist keine Nachlässigkeit, sondern der Preis dafür, dass kein
Wächter mehr einen Generalschlüssel für den Bestand braucht.

**Was du dagegen tun kannst, ohne auf Disziplin zu setzen:** Namen und Begriffe, die keinem
Muster folgen, in `.privacy-terms` eintragen (git-ignoriert, Vorlage
`.privacy-terms.example`). Dort greift der Muster-Guard sie wieder auf, und zwar in Code,
Prosa und Commit-Texten. Wer beim Debuggen am echten Bestand auf einen Namen stösst, der
leicht mitrutscht, trägt ihn dort ein — **bevor** er ihn irgendwohin kopiert.

**Und eine Ergänzung, die man nicht hat scheitern sehen, ist ungeprüft.** Nach dem
Eintragen den Wert kurz in den Arbeitsbaum setzen und nachsehen, ob der Guard rot wird —
danach wieder entfernen. Das kostet eine Minute und ist der einzige Beleg, dass die neue
Zeile trifft.

Am 2026-08-21 ist der Fall real gewesen, damals noch mit dem alten Wächter: die
Depot-Tabellen kamen dazu, er kannte sie nicht, und ein Depotwert aus dem echten Bestand
stand als Erwartung in einem Screen-Test. Gefunden wurde er von Hand, nicht vom Testlauf.
Diese Lücke ist mit dem Ausbau nicht grösser geworden — sie ist jetzt nur die Regel statt
der Ausnahme.

Warum das Repo überhaupt so behandelt wird und was die Wächter im Einzelnen tun, steht in
`../CLAUDE.md` unter „Nichts aus dem echten Bestand ins Repo".
