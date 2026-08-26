# `persistence/` — SQLite hinter den Ports

Umsetzung der Ports aus `application/ports.ts`, über eigene Tauri-Kommandos. Diese Schicht darf
`core` kennen (sie baut Domänenobjekte), aber niemand kennt sie außer `adapters/dienste.ts`.

## Migrationen

`migrations.ts`, versioniert, **forward-only und append-only** — bestehende Versionen nie
editieren, immer eine neue anhängen. Auch eine Reparatur an einer misslungenen Migration ist
eine NEUE Version.

**Keine Transaktionen — jedes Statement muss WIEDERHOLBAR sein.** tauri-plugin-sql führt
jedes `execute` über `pool.execute()` aus und holt pro Aufruf eine Verbindung aus dem Pool.
Ein `BEGIN` öffnete die Transaktion also auf einer Verbindung, die danach mit offener
Transaktion zurückginge, während die folgenden Statements auf anderen laufen und einzeln
committen. Deshalb klammert `migrate()` nichts, sondern macht jedes Statement für sich
wiederholbar:

- `CREATE …` trägt `IF NOT EXISTS`, `DROP …` trägt `IF EXISTS`
- `ADD`/`DROP COLUMN` überspringt `migrate()` per `PRAGMA table_info`
- ein Datenumbau (UPDATE/DELETE) braucht eine eigene wiederholbare Formulierung —
  `WHERE spalte IS NULL` statt einer Scheintransaktion

**Lesen und Abräumen gehören in GETRENNTE Versionen.** Eine Version, die eine Spalte liest,
und eine, die sie droppt, dürfen nicht dieselbe sein: bricht der Lauf dazwischen ab, läuft
die lesende Version beim nächsten Start gegen die fehlende Spalte, und die App kommt nicht
mehr hoch. SQLite prüft Spaltennamen beim Parsen — ein `WHERE … IS NULL` rettet daran nichts.

**Während Schema-Arbeiten die App schließen.** Läuft `tauri dev`, kann die App die Version
einer Migration verbuchen, bevor alle Statements drinstehen — der Rest läuft dann nie. Danach
am echten Bestand nachsehen, ob sie gewirkt hat.

**Neue Migrations-SQL vorher auf einer Kopie durchspielen** — dafür gibt es
`scripts/migrationsprobe.mjs`:

```bash
sqlite3 -readonly "$DB" ".backup '/tmp/kopie.db'"   # nicht `cp`, die DB läuft im WAL-Modus
npx vite-node scripts/migrationsprobe.mjs -- /tmp/kopie.db
```

Es fährt die Kette gegen echte Daten, meldet jede Tabelle, deren Zeilenzahl sich verändert
hat, und prüft am Ende die Fremdschlüssel. **Das ist kein Ersatz für `npm test`, sondern
die Prüfung, die `npm test` nicht leisten kann** — der Grund steht unten bei den
Fremdschlüsseln. Beim Umbau auf Fremdschlüssel war der Test grün, und die App wäre
gescheitert; gefunden hat es dieses Skript.

Im Alpha-Stadium dürfen Migrationen auch **wegnehmen**; vor dem Abräumen prüfen, dass die
Ziele leer sind.

**Eine Spalte ABLÖSEN: `-- @wennSpalte x.y` vor das Statement, das sie ein letztes Mal
liest.** Eine Version liest die Spalte (etwa in eine neue Tabelle), die nächste lässt sie
fallen — läuft die lesende danach noch einmal, scheitert ihr SELECT an „no such column".
SQLite prüft Spaltennamen beim PARSEN; ein `WHERE` oder `COALESCE` rettet daran nichts.
Beispiel: v58/v59 (der Budgetbetrag wird eine Reihe).

Und der Anspruch dahinter ist genau abgesteckt: **eine Version muss in dem Zustand
wiederholbar sein, den sie selbst hinterlässt** — das ist der Fall, den es gibt (Abbruch
mittendrin, Version noch nicht verbucht, nächster Start fährt sie erneut). Sie in einem
SPÄTEREN Schemastand zu wiederholen verlangt `migrate()` nie, und es wäre auch nicht
einlösbar, sobald eine Spalte abgelöst wurde.

**Eine Tabelle UMBAUEN: `-- @wennTabelle x` vor jedes Statement, das aus der alten liest.**
Kopieren und dann die Quelle fallen lassen ist beim zweiten Durchgang ein Widerspruch — die
Version steht noch nicht, die Migration wiederholt sich, und `INSERT … SELECT FROM alt`
scheitert an „no such table". Der Marker überspringt das Statement, wenn die Tabelle fehlt.
Derselbe Gedanke wie bei den Spaltenprüfungen, eine Ebene höher. Beispiel: v44.

**Fremdschlüssel sind in der App AN, im Test AUS.** sqlx setzt `foreign_keys=ON` als
Startup-Pragma auf jeder Pool-Verbindung; sql.js und die `sqlite3`-CLI defaulten auf OFF.
Eine Migration mit `REFERENCES` kann deshalb im Test grün sein und in der App an verwaisten
Verweisen scheitern — an genau der Sorte Widerspruch, die sich über Monate ansammelt. Wer
Constraints einführt, prüft vorher am echten Bestand, ob sie halten, und räumt den
Widerspruch in derselben Migration auf. Ein Test dazu setzt `PRAGMA foreign_keys = ON`
selbst; sonst prüft er etwas anderes als die App tut.

**SQLite kann Constraints nicht per `ALTER TABLE` nachrüsten.** Wer einen Fremdschlüssel an
eine bestehende Tabelle hängen will, baut sie neu — anlegen, umkopieren, alte fallen
lassen, umbenennen, mit dem Marker oben.

**Und dabei muss die Prüfung AUS sein.** Mit eingeschalteten Fremdschlüsseln geht beim
Neubau zweierlei schief, beides gemessen: `DROP TABLE` scheitert, wenn ein Schlüssel mit
RESTRICT darauf zeigt, und es **löscht still**, wo einer mit CASCADE darauf zeigt — SQLite
behandelt den Drop wie das Löschen aller Zeilen. Das erledigt `migrate()` von selbst: jedes
Migrations-Statement läuft über `schemaStatement`, und nach der Kette holt
`fremdschluesselPruefen` die Prüfung nach. In der App braucht es dafür den Rust-Weg, weil
`PRAGMA foreign_keys` pro Verbindung gilt und der Plugin-Pool eine beliebige erwischt.

Genau diese Asymmetrie ist der Grund, warum so etwas lange unentdeckt bleibt: sql.js hat
Fremdschlüssel aus, der Test war grün, und die App wäre gescheitert. **Wer am Schema
arbeitet, prüft gegen eine Lesekopie des echten Bestands** — Rezept in `CLAUDE.local.md`.

## Zwei Fallen im Schema

**`IstBuchung` trägt KEINEN Empfänger und keinen Verwendungszweck.** Die stehen am Beleg
(`umsatz_roh`). Für Detail- und Reporting-Ansichten wird über `Umsatz.istbuchungId`
gejoint. Wer sie an der Buchung sucht, findet nichts und baut sich ein zweites Feld.

**Ein `Umsatz` steht in ZWEI Tabellen und kommt als EIN Objekt zurück.** `umsatz_roh` ist
der Beleg und nach dem Anlegen unveränderlich, `umsatz_verarbeitung` der Stand. Sichtbar ist
das nur an den Schreibwegen: `anlegen` schreibt beides (in einer Transaktion), `speichern`
nur den Stand, `ergaenzen` als einzige Rohdaten — und dort nur Fehlendes, per `COALESCE`.
Wer eine neue Zeile mit `speichern` anlegt, bekommt einen Stand ohne Beleg und findet die
Zeile nie wieder. Die Begründung der Trennung steht in der Wurzel-`CLAUDE.md`.

**Von der Buchung zum Beleg wird GEJOINT, nicht gesucht.** Der Weg ist
`umsatz_verarbeitung.istbuchung_id` — indiziert und per Fremdschlüssel abgesichert. Eine
zweite Referenz an der Buchung (`herkunft_umsatz_id` o. ä.) sieht naheliegend aus und wäre
Redundanz: zwei Wahrheiten über dieselbe 1:1-Beziehung, die auseinanderlaufen können.

**`ist_buchung.roh_hash` ist dafür NICHT gedacht** und trotzdem kein Überbleibsel: er
überlebt das Löschen der Umsatz-Zeile und lässt einen späteren Bankimport gegen die
verbuchte Buchung deduppen. Deshalb steht er da, und deshalb ist er seit v46 indiziert —
die Abfrage lief vorher als Scan über das ganze Ledger, bei jedem Import.

**Jede Änderung am Ledger schreibt ins `buchung_journal`** — Anlegen, Ändern, Löschen, je
mit dem ganzen Zustand vorher und nachher. Zwei Dinge daran sind Absicht und sehen von
aussen wie Fehler aus:

- **Kein Fremdschlüssel** auf `ist_buchung`. Das Journal muss die Löschung überleben, sonst
  protokolliert es genau den Fall nicht, für den es da ist.
- **JSON mit sortierten Schlüsseln** (`alsText`). Ohne das Sortieren schlägt der Vergleich
  „hat sich etwas geändert" bei jedem Speichern an, weil `SELECT *` die Spalten in
  Tabellenreihenfolge liefert und ein Objektliteral in seiner eigenen. Gemessen.

Buchung und Aufteilungen werden **in einer Transaktion** geschrieben. Vorher waren es
einzelne Statements: brach es dazwischen ab, stand die Buchung ohne ihre Teile da, und
Σ Teile ≠ Betrag — eine Invariante, die der Kern voraussetzt.

**Repositories werden in Tests nicht ersetzt.** Sie laufen gegen echte In-Memory-SQLite
(sql.js), damit ein falsches Spalten-Mapping im Test auffällt und nicht erst in der App.
