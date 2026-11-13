# `persistence/` — SQLite hinter den Ports

Umsetzung der Ports aus `application/ports.ts`, über eigene Tauri-Kommandos. Diese Schicht darf
`core` kennen (sie baut Domänenobjekte), aber niemand kennt sie außer `adapters/dienste.ts`.

## Migrationen

`migrations.ts`, versioniert, **forward-only und append-only** — bestehende Versionen nie
editieren, immer eine neue anhängen. Auch eine Reparatur an einer misslungenen Migration ist
eine NEUE Version.

**Jede Migration läuft in EINER Transaktion, samt ihrem Versionseintrag** (seit
2026-11-10). Bricht sie ab, steht die Datenbank da, wo sie vorher stand; den halben
Zustand gibt es nicht mehr. SQLite kann das, weil dort auch `CREATE`, `ALTER` und `DROP`
transaktional sind. `migrate()` schickt `BEGIN` und `COMMIT` als gewöhnliche Statements —
in der App durch eine **Schemasitzung** (eine festgehaltene Verbindung,
`src-tauri/src/transaktion.rs`), im Test durch sql.js, das ohnehin nur eine hat. Der
Ablauf ist damit an beiden Orten wortgleich, und `migrations.test.ts` prüft die
Rücknahme an JEDER Version.

**Bis dahin hiess die Regel „keine Transaktionen, jedes Statement wiederholbar".** Der
Grund stammte aus der Zeit von tauri-plugin-sql: jedes `execute` holte eine beliebige
Verbindung aus dem Pool, ein `BEGIN` landete auf der einen, die Statements auf anderen.
Seit dem eigenen Pool galt er nicht mehr — die Regel blieb trotzdem stehen, weil nichts
sie in Frage stellte. Wiederholbarkeit ist ein Versprechen, das jede Migration von Hand
neu halten muss; die Transaktion hält es für alle.

**Die Wiederholbarkeit bleibt als zweites Netz**, und für neue Versionen als gute
Gewohnheit — die bestehenden sind darauf gebaut, und ein Bestand, der unter dem alten
Ablauf mittendrin stehenblieb, kommt nur so wieder hoch:

- `CREATE …` trägt `IF NOT EXISTS`, `DROP …` trägt `IF EXISTS`
- `ADD`/`DROP COLUMN` überspringt `migrate()` per `PRAGMA table_info`
- **Ein Index vor seiner Spalte** — `DROP COLUMN` scheitert, solange ein Index sie nennt,
  und die Meldung zeigt auf die Spalte. Erst `DROP INDEX IF EXISTS`, dann die Spalte
  (Migration 62 räumt so `ux_ist_planref` samt `plan_quelle_id` ab).
- ein Datenumbau (UPDATE/DELETE) wird wiederholbar formuliert — `WHERE spalte IS NULL`

**Was in einer Migration NICHT stehen darf:** `VACUUM` und `PRAGMA foreign_keys` — beide
wirken innerhalb einer Transaktion nicht (das erste scheitert, das zweite wird still
übergangen). Die Fremdschlüssel schaltet die Sitzung ab, bevor die Transaktion beginnt.

**Die Fremdschlüsselprüfung steht NACH der Kette und ausserhalb der Transaktionen**, und
das ist Absicht: in die Klammer gezogen, würde ein Widerspruch, der schon vorher im
Bestand lag, jede künftige Migration zurückrollen — für immer. So meldet sie ihn einmal
laut, und der nächste Start kommt hoch.

**Lesen und Abräumen in GETRENNTEN Versionen** war die Regel, solange ein Lauf zwischen
beiden abbrechen konnte: die lesende Version lief dann beim nächsten Start gegen die
fehlende Spalte (SQLite prüft Spaltennamen beim Parsen — ein `WHERE … IS NULL` rettet
daran nichts). Mit der Transaktion entsteht dieser Zustand nicht mehr; die bestehenden
Versionen sind so gebaut und bleiben es.

**Während Schema-Arbeiten die App schließen.** Läuft `tauri dev`, fährt die App eine
Migration, sobald die Datei gespeichert ist — auch eine halb geschriebene. Die Transaktion
ändert daran nichts: sie verbucht dann die Version mit dem, was in dem Augenblick dastand,
und der Rest läuft nie. Danach am Spielstand nachsehen, ob sie gewirkt hat.

**Neue Migrations-SQL vorher auf einer Kopie des SPIELSTANDS durchspielen** — dafür gibt es
`scripts/migrationsprobe.mjs`. Nicht auf dem echten Bestand: siehe `../../../CLAUDE.md`,
„Eine Änderung machen".

```bash
npx vite-node scripts/migrationsprobe.mjs -- /pfad/kopie.db
```

Es fährt die Kette, meldet jede Tabelle, deren Zeilenzahl sich verändert hat, und prüft am
Ende die Fremdschlüssel. **Das ist kein Ersatz für `npm test`, sondern die Prüfung, die
`npm test` nicht leisten kann** — der Grund steht unten bei den Fremdschlüsseln.

**Die Kopie muss ein ÄLTERES Schema tragen, sonst prüft sie nichts.** Ein frisch geseedeter
Spielstand steht schon im Zielschema, und einen, den die App geöffnet hat, liest sql.js
nicht mehr (er ist dann verschlüsselt). Der Weg ist ein Seed aus einem älteren Checkout
(`git worktree` auf dem letzten Tag, dort `npm run seed` mit eigenem Zielpfad).

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
Constraints einführt, räumt mögliche Widersprüche in derselben Migration auf — ob welche
da sind, lässt sich vorher nicht nachsehen (keine Echtdaten in der Entwicklung). Ein Test dazu setzt `PRAGMA foreign_keys = ON`
selbst; sonst prüft er etwas anderes als die App tut.

**SQLite kann Constraints nicht per `ALTER TABLE` nachrüsten.** Wer einen Fremdschlüssel an
eine bestehende Tabelle hängen will, baut sie neu — anlegen, umkopieren, alte fallen
lassen, umbenennen, mit dem Marker oben.

**Und dabei muss die Prüfung AUS sein.** Mit eingeschalteten Fremdschlüsseln geht beim
Neubau zweierlei schief, beides gemessen: `DROP TABLE` scheitert, wenn ein Schlüssel mit
RESTRICT darauf zeigt, und es **löscht still**, wo einer mit CASCADE darauf zeigt — SQLite
behandelt den Drop wie das Löschen aller Zeilen. Das erledigt der Ablauf von selbst: die
Schemasitzung schaltet die Prüfung auf ihrer Verbindung ab, bevor `migrate()` beginnt,
und nach der Kette holt `fremdschluesselPruefen` sie nach. In der App braucht es dafür
die festgehaltene Verbindung, weil `PRAGMA foreign_keys` pro Verbindung gilt.

Genau diese Asymmetrie ist der Grund, warum so etwas lange unentdeckt bleibt: sql.js hat
Fremdschlüssel aus, der Test war grün, und die App wäre gescheitert. **Wer am Schema
arbeitet, setzt im Test `PRAGMA foreign_keys = ON`** — das ist die Prüfung, die bleibt.

## Was an der VERBINDUNG hängt, hängt nicht an der Datei

`PRAGMA foreign_keys`, `PRAGMA key`, `ATTACH`, eine offene Transaktion: alle gelten pro
Verbindung. Über einen Pool erwischt jedes Statement eine beliebige — und das Ergebnis ist
nicht ein Fehler, sondern ein **sporadischer**: die erste Abfrage geht, die zweite nicht,
und es sieht nach allem aus ausser nach der Ursache.

Wer so etwas setzt, hält die Verbindung fest (`pool.acquire()`) oder legt es in die
Verbindungsoptionen. Diese eine Falle hat in diesem Projekt inzwischen vier Bauteile
gekostet: den Transaktions-Command, die Schemasitzung, den Schlüssel der verschlüsselten
Datenbank und die Überführung des Altbestands (`ATTACH` und `sqlcipher_export` müssen auf
DERSELBEN Verbindung laufen, sonst meldet SQLite „unknown database").

Beim Schlüssel kommt hinzu, dass er das ERSTE Statement sein muss — deshalb steht er in
den Verbindungsoptionen und nicht im `after_connect`-Haken, der nach sqlx' eigenen
Pragmas läuft. Einzelheiten in `src-tauri/src/datenbank.rs`.

## Zwei Fallen im Schema

**`IstBuchung` trägt KEINEN Empfänger und keinen Verwendungszweck.** Die stehen am Beleg
(`umsatz_roh`). Für Detail- und Reporting-Ansichten wird über `Umsatz.istbuchungId`
gejoint. Wer sie an der Buchung sucht, findet nichts und baut sich ein zweites Feld.

**Ein `Umsatz` steht in ZWEI Tabellen und kommt als EIN Objekt zurück.** `umsatz_roh` ist
der Beleg und nach dem Anlegen unveränderlich, `umsatz_verarbeitung` der Stand. Sichtbar ist
das nur an den Schreibwegen: `anlegen` schreibt beides (in einer Transaktion), `speichern`
nur den Stand, `belegAnhaengen` einen weiteren Beleg — geändert wird ein Beleg nie.
Wer eine neue Zeile mit `speichern` anlegt, bekommt einen Stand ohne Beleg und findet die
Zeile nie wieder. Die Begründung der Trennung steht in `src/application/import/CLAUDE.md`.

**Eine Zahlung kann MEHRERE Belege haben** (`umsatz_roh.zahlung_id`), und der Leseweg führt
sie zusammen: der JOIN auf `umsatz_verarbeitung` hängt an `COALESCE(r.zahlung_id, r.id)`,
nicht an `r.id`. Das `COALESCE` ist kein Zierrat — wer eine Rohzeile an den Repositories
vorbei einfügt (Spielstand, Fixtures), füllt die Spalte leicht nicht, und ohne den Rückfall
fielen alle solchen Zeilen unter EINEN Schlüssel und würden zu einer einzigen Zahlung.
Ebenso ist der JOIN auf `import_lauf` ein LEFT und kein INNER: fehlt der Lauf, verschwände
der Beleg sonst spurlos aus jeder Liste.

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
