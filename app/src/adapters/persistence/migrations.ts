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
];
