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

Bewusst: `@typescript-eslint/parser` unterstützt das hier installierte TypeScript 7 nicht
(Peer bis 6.0). Die Rolle übernehmen zwei andere:

- **Der Compiler.** `strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch` sind an. `npm run typecheck` muss grün sein.
- **Tests als Wächter.** `architektur.test.ts` (Schichtgrenzen), `doku.test.ts`
  (Verweise in der Doku), `privatsphaere.test.ts` (keine echten Daten), der i18n-Test
  (de/en-Parität). Eine Regel, die zählt, wird ausführbar gemacht statt aufgeschrieben.

## Tests

Sie liegen als `*.test.ts` **neben dem Code**, es gibt keinen Testordner —
`src/testwerkzeug/` enthält Werkzeug (Harness, Setup, Fixture-Bau), keine Tests.

- **Kern und Use-Cases:** reine Funktionen, In-Memory-Fakes für Ports. Node-Umgebung, schnell.
- **Repositories und UI:** gegen echte In-Memory-SQLite (sql.js), keine Repo-Attrappen —
  ein falsches Spalten-Mapping soll im Test auffallen, nicht in der App. Einzelheiten in
  `adapters/ui/CLAUDE.md`.
- Nach **Daten** suchen, die der Test selbst angelegt hat, nicht nach Formulierungen — sonst
  wird die Suite beim nächsten Wording-Durchgang reihenweise rot.

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

## Was die Wächter können — und was nicht

`src/privatsphaere.test.ts` liest die Merkmale zur Laufzeit aus der echten Datenbank und
prüft den Arbeitsbaum dagegen; `.githooks/pre-push` prüft zusätzlich die ausgehenden
Commit-Texte. Beide finden nur den **Originalwert**. Ob ein Ersatz neutral ist und ob er
sich über Testfälle hinweg wiederholt, kann keiner von beiden sehen. Regel 2 und 3 sind
Handarbeit.

Warum das Repo überhaupt so behandelt wird und was die Wächter im Einzelnen tun, steht in
`../CLAUDE.md` unter „Nichts aus dem echten Bestand ins Repo".
