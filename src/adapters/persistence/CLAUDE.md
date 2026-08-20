# `persistence/` — SQLite hinter den Ports

Umsetzung der Ports aus `application/ports.ts`, über `tauri-plugin-sql`. Diese Schicht darf
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

**Neue Migrations-SQL vorher auf einer Kopie durchspielen.** Vorbelegungen greifen sonst
plausibel daneben, und kein Test merkt es. Wie man eine belastbare Kopie zieht — nicht mit
`cp`, die Datenbank läuft im WAL-Modus —, steht in `CLAUDE.local.md`.

Im Alpha-Stadium dürfen Migrationen auch **wegnehmen**; vor dem Abräumen prüfen, dass die
Ziele leer sind.

## Zwei Fallen im Schema

**`IstBuchung` trägt KEINEN Empfänger und keinen Verwendungszweck.** Die stehen am `Umsatz`
(dem Import-Kontext). Für Detail- und Reporting-Ansichten wird über `Umsatz.istbuchungId`
gejoint. Wer sie an der Buchung sucht, findet nichts und baut sich ein zweites Feld.

**Repositories werden in Tests nicht ersetzt.** Sie laufen gegen echte In-Memory-SQLite
(sql.js), damit ein falsches Spalten-Mapping im Test auffällt und nicht erst in der App.
