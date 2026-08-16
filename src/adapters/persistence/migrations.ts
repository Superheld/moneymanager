// Schema-Migrationen — reine Daten, ohne Abhängigkeit zu Tauri/IO, damit die Kette
// isoliert (gegen ein In-Memory-SQLite) getestet werden kann. db.ts wendet sie an;
// die Reihenfolge ist die Wahrheit, Versionen sind streng aufsteigend und vorwärts.

export interface Migration {
  version: number;
  sql: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1, // P0 — Walking Skeleton
    sql: [
      `CREATE TABLE IF NOT EXISTS zahlungsregel (
        id          TEXT PRIMARY KEY,
        bezeichnung TEXT    NOT NULL,
        betrag      INTEGER NOT NULL,
        rhythmus    TEXT    NOT NULL,
        startdatum  TEXT    NOT NULL,
        charakter   TEXT    NOT NULL
      )`,
    ],
  },
  {
    version: 2, // P1 — Stammdaten
    sql: [
      `CREATE TABLE IF NOT EXISTS person (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        geburtsdatum TEXT,
        rolle        TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS zahlungskonto (
        id          TEXT PRIMARY KEY,
        bezeichnung TEXT NOT NULL,
        typ         TEXT NOT NULL,
        iban        TEXT,
        inhaber_ids TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE TABLE IF NOT EXISTS kategorie (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        eltern_id         TEXT,
        default_charakter TEXT NOT NULL
      )`,
      `ALTER TABLE zahlungsregel ADD COLUMN konto_id TEXT`,
      `ALTER TABLE zahlungsregel ADD COLUMN kategorie_id TEXT`,
    ],
  },
  {
    version: 3, // P2.1 — Verträge
    sql: [
      `CREATE TABLE IF NOT EXISTS vertrag (
        id                     TEXT PRIMARY KEY,
        anbieter               TEXT NOT NULL,
        vertragsnummer         TEXT,
        inhaber_id             TEXT,
        beginn                 TEXT NOT NULL,
        mindestlaufzeit_monate INTEGER,
        verlaengerung          TEXT NOT NULL,
        verlaengerung_monate   INTEGER,
        kuendigungsfrist_monate INTEGER,
        status                 TEXT NOT NULL,
        notizen                TEXT
      )`,
      `ALTER TABLE zahlungsregel ADD COLUMN vertrag_id TEXT`,
    ],
  },
  {
    version: 4, // P2.2 — Budgets
    sql: [
      `CREATE TABLE IF NOT EXISTS budget (
        id           TEXT PRIMARY KEY,
        kategorie_id TEXT    NOT NULL,
        rahmen       INTEGER NOT NULL,
        periode      TEXT    NOT NULL
      )`,
    ],
  },
  {
    version: 5, // P2.3 — Töpfe
    sql: [
      `CREATE TABLE IF NOT EXISTS topf (
        id                   TEXT PRIMARY KEY,
        typ                  TEXT NOT NULL,
        bezeichnung          TEXT NOT NULL,
        start                TEXT NOT NULL,
        kategorie_id         TEXT,
        wiederbeschaffung    INTEGER,
        nutzungsdauer_monate INTEGER,
        schaetzbetrag        INTEGER,
        frist_monate         INTEGER,
        zufuehrung_pro_monat INTEGER,
        sparziel             INTEGER
      )`,
    ],
  },
  {
    version: 6, // P2.5 — Inventar
    sql: [
      `CREATE TABLE IF NOT EXISTS inventargegenstand (
        id                   TEXT PRIMARY KEY,
        bezeichnung          TEXT    NOT NULL,
        wiederbeschaffung    INTEGER NOT NULL,
        nutzungsdauer_monate INTEGER NOT NULL,
        anschaffung          TEXT    NOT NULL,
        kategorie_id         TEXT
      )`,
      `ALTER TABLE topf ADD COLUMN inventar_id TEXT`,
    ],
  },
  {
    version: 7, // P2.6 — Szenario (What-if), getrennt vom Plan
    sql: [
      `CREATE TABLE IF NOT EXISTS szenario (
        id   TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS szenario_posten (
        id          TEXT PRIMARY KEY,
        szenario_id TEXT    NOT NULL,
        bezeichnung TEXT    NOT NULL,
        betrag      INTEGER NOT NULL,
        rhythmus    TEXT    NOT NULL,
        startdatum  TEXT    NOT NULL,
        charakter   TEXT    NOT NULL
      )`,
    ],
  },
  {
    version: 8, // Konten: manueller Kontostand
    sql: [`ALTER TABLE zahlungskonto ADD COLUMN kontostand INTEGER NOT NULL DEFAULT 0`],
  },
  {
    version: 9, // P3 — Ist light (ADR-0002): app-seitiges Ist-Journal hinter dem Ledger-Port
    sql: [
      `CREATE TABLE IF NOT EXISTS ist_buchung (
        id               TEXT PRIMARY KEY,
        datum            TEXT    NOT NULL,
        betrag           INTEGER NOT NULL,
        konto_id         TEXT    NOT NULL,
        kategorie_id     TEXT,
        charakter        TEXT    NOT NULL,
        quelle           TEXT    NOT NULL,
        plan_quelle_id   TEXT,
        plan_faelligkeit TEXT,
        roh_hash         TEXT
      )`,
      // 1:1-Matching/Dedup: pro (Plan-Quelle, Fälligkeit) höchstens eine Ist-Buchung.
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_ist_planref
        ON ist_buchung (plan_quelle_id, plan_faelligkeit)
        WHERE plan_quelle_id IS NOT NULL`,
    ],
  },
  {
    version: 10, // Konto-Register: Freitext-Notiz für manuelle Buchungen
    sql: [`ALTER TABLE ist_buchung ADD COLUMN notiz TEXT`],
  },
  {
    version: 11, // Umbuchen: zwei verknüpfte Beine (transferId) + Gegenkonto
    sql: [
      `ALTER TABLE ist_buchung ADD COLUMN transfer_id TEXT`,
      `ALTER TABLE ist_buchung ADD COLUMN gegenkonto_id TEXT`,
    ],
  },
  {
    version: 12, // ADR-0004 — Haushalts-Einstellungen (Währung, Locale, Sprache) als Key/Value
    sql: [
      `CREATE TABLE IF NOT EXISTS einstellung (
        schluessel TEXT PRIMARY KEY,
        wert       TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 13, // ADR-0003 — Verwendung: explizit benanntes Gegenkonto (Topf) an der Ist-Buchung
    sql: [`ALTER TABLE ist_buchung ADD COLUMN verwendung_topf_id TEXT`],
  },
  {
    version: 14, // Import (TAKTIK-IMPORT): Import-Lauf + Umsatz-Entwurfsstapel mit Dedup
    sql: [
      `CREATE TABLE IF NOT EXISTS import_lauf (
        id         TEXT PRIMARY KEY,
        quelle     TEXT    NOT NULL,
        zeitpunkt  TEXT    NOT NULL,
        dateiname  TEXT,
        eingelesen INTEGER NOT NULL DEFAULT 0,
        neu        INTEGER NOT NULL DEFAULT 0,
        duplikate  INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS umsatz (
        id                     TEXT    PRIMARY KEY,
        lauf_id                TEXT    NOT NULL,
        zahlungskonto_id       TEXT    NOT NULL,
        buchungstag            TEXT    NOT NULL,
        valuta                 TEXT,
        betrag                 INTEGER NOT NULL,
        waehrung               TEXT    NOT NULL,
        gegenpartei            TEXT    NOT NULL,
        verwendungszweck       TEXT    NOT NULL,
        roh_hash               TEXT    NOT NULL,
        native_id              TEXT,
        status                 TEXT    NOT NULL,
        vorschlag_kategorie_id TEXT,
        vorschlag_charakter    TEXT,
        vorschlag_quelle       TEXT,
        istbuchung_id          TEXT
      )`,
      // Schnelle Duplikaterkennung über beide gewählten Schlüssel.
      `CREATE INDEX IF NOT EXISTS ix_umsatz_roh_hash ON umsatz (roh_hash)`,
      `CREATE INDEX IF NOT EXISTS ix_umsatz_native_id ON umsatz (native_id) WHERE native_id IS NOT NULL`,
    ],
  },
  {
    version: 15, // S-7 — Buchung splitten: Teilbeträge je Kategorie an der Ist-Buchung
    sql: [
      // Value Objects im Aggregat IstBuchung: keine eigene fachliche Identität, Lebenszeit
      // an die Buchung gekoppelt. Die Zeilen-Id trägt nur die Persistenz.
      //
      // Kein Datenumbau — reines Anlegen. Das ist hier wichtig, weil nicht verifiziert
      // ist, ob BEGIN/COMMIT über tauri-plugin-sql auf derselben Connection landen: bei
      // einem Teilabbruch bleibt höchstens die Tabelle ohne Versionseintrag stehen, und
      // der nächste Lauf legt sie per IF NOT EXISTS folgenlos erneut an.
      `CREATE TABLE IF NOT EXISTS ist_buchung_aufteilung (
        id            TEXT    PRIMARY KEY,
        istbuchung_id TEXT    NOT NULL,
        kategorie_id  TEXT    NOT NULL,
        betrag        INTEGER NOT NULL,
        notiz         TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS ix_aufteilung_buchung ON ist_buchung_aufteilung (istbuchung_id)`,
    ],
  },
  {
    version: 16, // Gläubiger-ID am Umsatz — Schlüssel für Vertragserkennung und Regel-Schicht
    sql: [
      // Finanzguru liefert sie („Glaeubiger-ID"), RohUmsatz trug sie, der Umsatz nicht:
      // beim Übernehmen ging sie verloren. Eine SEPA-Mandatsreferenz identifiziert einen
      // Zahlungsempfänger eindeutig — anders als ein abgeschnittener, normalisierter Name.
      `ALTER TABLE umsatz ADD COLUMN glaeubiger_id TEXT`,
      `CREATE INDEX IF NOT EXISTS ix_umsatz_glaeubiger ON umsatz (glaeubiger_id) WHERE glaeubiger_id IS NOT NULL`,
    ],
  },
  {
    version: 17, // Inventar rein kalkulatorisch: Konto, auf dem die Rücklage tatsächlich liegt
    sql: [
      // Der Ersatz-Topf ist entfallen; was zurückgelegt ist, wird nicht mehr gebucht,
      // sondern gegen den realen Stand DIESES Kontos abgeglichen (siehe core/inventar.ts).
      // Reines Anlegen einer Spalte, kein Datenumbau — wiederholbar (migrate() überspringt
      // vorhandene Spalten per PRAGMA table_info).
      `ALTER TABLE inventargegenstand ADD COLUMN konto_id TEXT`,
    ],
  },
  {
    version: 18, // Alpha-Aufräumen: leere Hüllen von Szenario und Ersatz-Topf abräumen
    sql: [
      // ALPHA (siehe CLAUDE.md): Die App ist nicht veröffentlicht, es gibt keine fremden
      // Datenbestände zu schonen. Deshalb wird hier ausnahmsweise WEGGENOMMEN statt nur
      // angehängt — sonst schleppte das Schema auf Dauer Tabellen mit, die kein Code mehr
      // kennt, und der nächste Blick ins Schema fragte sich, wofür sie stehen.
      //
      // Der Rest der Regel gilt unverändert: append-only (Migration 18 ist neu, 1–17
      // bleiben unberührt), forward-only, und jedes Statement WIEDERHOLBAR — `IF EXISTS`
      // bei den Tabellen, und `DROP COLUMN` überspringt migrate(), wenn die Spalte fehlt.
      //
      // Kein Datenumbau: alle drei Ziele waren beim Umbau am 2026-08-16 nachweislich leer
      // (szenario 0 Zeilen, szenario_posten 0, topf 0). Es geht nichts verloren.

      // Szenarien — der What-if-Layer ist mit dem Bereich Planung entfallen.
      `DROP TABLE IF EXISTS szenario_posten`,
      `DROP TABLE IF EXISTS szenario`,

      // Ersatz-Topf — das Inventar rechnet seine Rücklage selbst (core/inventar.ts).
      // Damit sind diese drei Spalten an `topf` ohne Bedeutung; TopfTyp kennt nur noch
      // puffer und spartopf.
      `ALTER TABLE topf DROP COLUMN wiederbeschaffung`,
      `ALTER TABLE topf DROP COLUMN nutzungsdauer_monate`,
      `ALTER TABLE topf DROP COLUMN inventar_id`,
    ],
  },
  {
    version: 19, // Vertrag ↔ Ist-Buchung: Erkennungsregel je Vertrag, Zuordnung je Buchung
    sql: [
      // Bis hierher zeigte der Vertrag auf KEINE Buchung; die Zugehörigkeit wurde jedes
      // Mal aus dem Empfängernamen abgeleitet (core/vertragErkennung#anbieterSchluessel).
      // Zwei Tabellen statt Spalten am Vertrag, weil es zwei verschiedene Dinge sind:
      // die REGEL (wie erkenne ich die Zahlungen dieses Vertrags — änderbar, einsehbar)
      // und das ERGEBNIS je Buchung (samt Herkunft, damit Handarbeit den Abgleich
      // überlebt). Dasselbe Muster wie Vertrag ↔ Zahlungsregel: getrennte Kontexte,
      // verknüpft über vertragId.
      //
      // Reines Anlegen, kein Datenumbau — wiederholbar.
      `CREATE TABLE IF NOT EXISTS vertrag_erkennung (
        vertrag_id  TEXT    PRIMARY KEY,
        schluessel  TEXT    NOT NULL,
        betrag_von  INTEGER,
        betrag_bis  INTEGER,
        gueltig_ab  TEXT,
        gueltig_bis TEXT,
        konto_id    TEXT
      )`,
      // `vertrag_id` NULL ist hier eine AUSSAGE („gehört ausdrücklich zu keinem Vertrag"),
      // kein fehlender Wert — nur so überlebt eine Korrektur den nächsten Abgleich.
      // Deshalb auch kein NOT NULL. herkunft: 'automatisch' | 'manuell'.
      `CREATE TABLE IF NOT EXISTS vertrag_zuordnung (
        istbuchung_id TEXT PRIMARY KEY,
        vertrag_id    TEXT,
        herkunft      TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ix_vertrag_zuordnung_vertrag ON vertrag_zuordnung (vertrag_id)`,
    ],
  },
  {
    version: 20, // Herkunft der KATEGORIE an der Ist-Buchung (Fundament der Auto-Kategorisierung)
    sql: [
      // `quelle` sagt, woher die BUCHUNG kommt (import/manuell/bezahlt-markiert) — nicht,
      // woher ihre KATEGORIE kommt. Solange das fehlt, kann ein automatischer Lauf nicht
      // unterscheiden, ob er einen eigenen früheren Treffer korrigiert oder eine
      // Handentscheidung plattmacht. Dasselbe Problem war bei Vertrag ↔ Buchung schon
      // gelöst (vertrag_zuordnung.herkunft, Migration 19); hier fehlte es.
      //
      // DEFAULT 'automatisch' ist für den Bestand fachlich richtig: er stammt aus einem
      // Import und wurde über das Finanzguru-Remapping kategorisiert, nicht von Hand.
      // Damit greift ein späterer Abgleich auf allem, was nie jemand angefasst hat —
      // und lässt genau das in Ruhe, was jemand angefasst hat.
      //
      // Reines Anlegen mit Default, kein Datenumbau — wiederholbar (`migrate()`
      // überspringt einen Zugang, dessen Spalte schon existiert).
      `ALTER TABLE ist_buchung ADD COLUMN kategorie_herkunft TEXT NOT NULL DEFAULT 'automatisch'`,
    ],
  },
  {
    version: 21, // Klassifikator: das trainierte Modell der automatischen Kategorisierung
    sql: [
      // EINE Zeile, feste Id — es gibt genau ein aktuelles Modell, und ein Training
      // ersetzt es vollständig. Keine Historie: ein altes Modell ist nicht „auch eine
      // Meinung", sondern ein überholter Stand, und aus dem Bestand jederzeit in
      // Millisekunden neu herstellbar (137 ms über 3689 Beispiele).
      //
      // Vokabular und Kategorien als Textliste, die Gewichte als base64-kodierte
      // Float32-Matrix. Kein eigenes Zahlenformat, keine Zeile je Gewicht: bei ~2000
      // Merkmalen × ~50 Kategorien wären das 100.000 Zeilen für einen Wert, den ohnehin
      // niemand einzeln liest.
      `CREATE TABLE IF NOT EXISTS klassifikator_modell (
        id             TEXT    PRIMARY KEY,
        kategorien     TEXT    NOT NULL,
        vokabular      TEXT    NOT NULL,
        gewichte       TEXT    NOT NULL,
        bias           TEXT    NOT NULL,
        beispiele      INTEGER NOT NULL,
        trainiert_am   TEXT    NOT NULL,
        genauigkeit    REAL
      )`,
    ],
  },
  {
    version: 22, // Merkmale steuerbar: welche Wörter nicht ins Training gehen
    sql: [
      // Eine Zeile je ausgeschlossenem Wort. `herkuenfte` NULL heißt „überall", sonst
      // kommagetrennte Herkünfte (empGanz, empWort, vwz, gid, vz) — dasselbe Wort kann
      // im Empfängerfeld brauchbar und im Verwendungszweck Rauschen sein.
      //
      // Die aktiven Herkünfte selbst stehen NICHT hier, sondern in `einstellung`: das
      // sind fünf Schalter, genau der Fall, für den die Key/Value-Tabelle da ist. Eine
      // eigene Tabelle für fünf Zeilen mit festen Schlüsseln wäre Schema ohne Gegenwert.
      //
      // `quelle` hält fest, ob ein Eintrag mitgeliefert wurde oder von Hand kam. Ohne das
      // ließe sich die eigene Pflege nicht von der Grundausstattung trennen — und ein
      // späteres Nachliefern neuer Standardwörter könnte eigene Entscheidungen
      // überschreiben, ohne dass es auffiele.
      `CREATE TABLE IF NOT EXISTS merkmal_ausschluss (
        wort       TEXT PRIMARY KEY,
        herkuenfte TEXT,
        quelle     TEXT NOT NULL DEFAULT 'standard'
      )`,
    ],
  },
];
