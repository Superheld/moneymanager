// Welche Datenbankdatei die App öffnet.
//
// Eine Konstante, weil der Name an drei Stellen gebraucht wird — `db.ts` zum Laden,
// `transaktion.ts` zweimal für den Rust-Weg — und drei gleichlautende Zeichenketten
// irgendwann auseinanderlaufen.

/**
 * Der echte Bestand und der Spielstand liegen in ZWEI Dateien.
 *
 * Die installierte App verwaltet echtes Geld; die Entwicklung soll frei rumprobieren
 * können. Beides auf derselben Datei geht nicht gut aus: im Alpha-Stadium dürfen
 * Migrationen ausdrücklich WEGNEHMEN (siehe Wurzel-`CLAUDE.md`), und ein Versuch, der
 * schiefgeht, träfe dann den einzigen Bestand, den es gibt. Die Trennung ist deshalb
 * keine Bequemlichkeit, sondern die Grenze zwischen „kaputt" und „weg".
 *
 * **Der Dateiname trennt, nicht der Identifier.** Naheliegender wäre, die Entwicklung
 * unter eine eigene Bundle-Identität zu stellen — der Identifier bestimmt schliesslich das
 * Datenverzeichnis. Er bestimmt aber auch die Identität der installierten App: wer ihn
 * anfasst, schickt die gebaute App in ein neues, leeres Verzeichnis, und der echte Bestand
 * sieht aus wie verschwunden (er liegt noch da, nur sucht niemand mehr dort). Der
 * Dateiname ist der kleinere Hebel und trennt genauso vollständig — zwei Dateien
 * nebeneinander, beide auffindbar, keine dritte Stelle, die von der Identität abhängt.
 *
 * **`import.meta.env.DEV` zieht die Grenze an der richtigen Stelle.** Vite setzt es bei
 * `tauri dev` auf `true` und bei `tauri build` auf `false` — also genau dort, wo auch die
 * fachliche Grenze liegt: was aus dem Bundle startet, ist die echte App.
 */
export const DATEINAME = import.meta.env.VITE_DB_DATEI ?? (import.meta.env.DEV ? "moneymanager-dev.db" : "moneymanager.db");

/**
 * Was `tauri-plugin-sql` als Verbindungszeichenkette erwartet. Der relative Pfad wird
 * gegen das App-Datenverzeichnis aufgelöst, das aus dem Bundle-Identifier stammt — beide
 * Dateien liegen deshalb nebeneinander, und der Rezeptweg aus `CLAUDE.local.md` findet
 * auch die Spielkopie.
 */
export const DB_URL = `sqlite:${DATEINAME}`;
