// Das Journal über die ganze Naht: schreiben durch das Ledger-Repository, lesen durch das
// Journal-Repository — gegen eine echte SQLite-Engine (sql.js, In-Memory).
//
// Der Grund für die Rundreise statt zweier Einzeltests: die beiden Hälften sind an EINEM
// Textformat verklebt, das nirgends deklariert ist. Wer nur das Schreiben prüft, sieht
// nicht, ob das Lesen dieselbe Form erwartet — und ein Feld, das dabei verlorengeht,
// verschwindet lautlos. Genau diese Sorte Fehler hat der Merkmals-Parser der
// Vertragserkennung gehabt.
//
// Alle Werte hier sind erfunden.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { MIGRATIONS } from "./migrations";
import type { IstBuchung } from "../../core";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});

vi.mock("./db", () => ({ getDb: async () => halter.lesen() }));

import { sqliteLedgerRepository } from "./sqliteLedgerRepository";
import { sqliteJournalRepository } from "./sqliteJournalRepository";

function pluginApi(db: Database) {
  const benannt = (werte: unknown[] = []) =>
    Object.fromEntries(werte.map((w, i) => [`$${i + 1}`, w as never]));
  return {
    async execute(sql: string, werte?: unknown[]) {
      db.run(sql, benannt(werte));
      return { rowsAffected: db.getRowsModified(), lastInsertId: 0 };
    },
    async select<T>(sql: string, werte?: unknown[]): Promise<T> {
      const stmt = db.prepare(sql);
      if (werte?.length) stmt.bind(benannt(werte));
      const zeilen: unknown[] = [];
      while (stmt.step()) zeilen.push(stmt.getAsObject());
      stmt.free();
      return zeilen as unknown as T;
    },
  };
}

const require = createRequire(import.meta.url);
let SQL: SqlJsStatic;
let db: Database;

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
});

beforeEach(() => {
  db?.close();
  db = new SQL.Database();
  for (const m of MIGRATIONS) for (const sql of m.sql) db.run(sql);
  db.run(
    "INSERT INTO zahlungskonto (id, bezeichnung, typ, inhaber_ids, kontostand) VALUES ('k1','Alltag','Giro','[]',0)",
  );
  db.run(
    "INSERT INTO zahlungskonto (id, bezeichnung, typ, inhaber_ids, kontostand) VALUES ('k2','Beiseite','Tagesgeld','[]',0)",
  );
  db.run("INSERT INTO kategorie (id, name, default_charakter) VALUES ('kat-a','Alpha','Aufwand')");
  db.run("INSERT INTO kategorie (id, name, default_charakter) VALUES ('kat-b','Beta','Aufwand')");
  halter.setzen(pluginApi(db));
});

function buchung(felder: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: "b1",
    datum: "2026-04-09",
    betrag: -1357,
    kontoId: "k1",
    charakter: "Aufwand",
    quelle: "manuell",
    ...felder,
  };
}

describe("Journal — die Rundreise", () => {
  it("hält beim Anlegen den ganzen Stand fest und liest ihn unverändert zurück", async () => {
    const b = buchung({
      kategorieId: "kat-a",
      kategorieHerkunft: "manuell",
      notiz: "Nachbarschaftshilfe",
      zuPruefen: true,
    });
    await sqliteLedgerRepository.speichern(b);

    const [eintrag] = await sqliteJournalRepository.zuBuchung("b1");
    expect(eintrag.art).toBe("angelegt");
    expect(eintrag.vorher).toBeUndefined();
    expect(eintrag.nachher).toEqual(b);
  });

  it("hält beide Seiten einer Änderung fest — und liest sie wie das Ledger", async () => {
    // Verglichen wird gegen das, was das LEDGER zurückgibt, nicht gegen das übergebene
    // Objekt: die Spalte `kategorie_herkunft` ist NOT NULL mit Vorgabe „automatisch", ein
    // fehlendes Feld kommt also gefüllt zurück. Beide Seiten müssen dieselbe Antwort
    // geben — sonst meldete der Vergleich „was hat sich geändert" bei jeder Buchung ein
    // Feld, das niemand angefasst hat.
    const vorher = buchung({ kategorieId: "kat-a" });
    await sqliteLedgerRepository.speichern(vorher);
    const [ausLedgerVorher] = await sqliteLedgerRepository.alle();

    await sqliteLedgerRepository.speichern({ ...vorher, kategorieId: "kat-b", betrag: -2468 });
    const [ausLedgerNachher] = await sqliteLedgerRepository.alle();

    const eintraege = await sqliteJournalRepository.zuBuchung("b1");
    expect(eintraege.map((e) => e.art)).toEqual(["angelegt", "geaendert"]);
    expect(eintraege[1].vorher).toEqual(ausLedgerVorher);
    expect(eintraege[1].nachher).toEqual(ausLedgerNachher);
  });

  it("nimmt die Aufteilungen mit — samt eines Feldes, das nicht wie eine Spalte heißt", async () => {
    // Die Notiz am Teil ist der Prüfstein: der alte Serialisierer filterte verschachtelte
    // Schlüssel gegen die Spaltenliste der Buchung, und was dort nicht vorkam, fiel
    // stillschweigend heraus.
    const b = buchung({
      betrag: -5000,
      aufteilungen: [
        { kategorieId: "kat-a", betrag: -3000, notiz: "Anteil eins" },
        { kategorieId: "kat-b", betrag: -2000 },
      ],
    });
    await sqliteLedgerRepository.speichern(b);

    const [eintrag] = await sqliteJournalRepository.zuBuchung("b1");
    expect(eintrag.nachher?.aufteilungen).toEqual([
      { kategorieId: "kat-a", betrag: -3000, notiz: "Anteil eins" },
      { kategorieId: "kat-b", betrag: -2000, notiz: undefined },
    ]);
  });

  it("überlebt das Löschen der Buchung", async () => {
    // Die Tabelle trägt bewusst keinen Fremdschlüssel: sonst wäre gerade der Fall, für
    // den man das Protokoll braucht, der eine, in dem es fehlt.
    const b = buchung({ notiz: "Versehentlich erfasst" });
    await sqliteLedgerRepository.speichern(b);
    await sqliteLedgerRepository.loeschen("b1");

    const eintraege = await sqliteJournalRepository.zuBuchung("b1");
    expect(eintraege.map((e) => e.art)).toEqual(["angelegt", "geloescht"]);
    expect(eintraege[1].vorher?.notiz).toBe("Versehentlich erfasst");
    expect(eintraege[1].nachher).toBeUndefined();
    expect(await sqliteLedgerRepository.alle()).toEqual([]);
  });

  it("schreibt keinen Eintrag, wenn sich nichts geändert hat", async () => {
    const b = buchung();
    await sqliteLedgerRepository.speichern(b);
    await sqliteLedgerRepository.speichern(b);
    expect((await sqliteJournalRepository.zuBuchung("b1")).length).toBe(1);
  });

  it("zählt je Buchung, ohne die Stände zu laden", async () => {
    await sqliteLedgerRepository.speichern(buchung({ id: "b1" }));
    await sqliteLedgerRepository.speichern(buchung({ id: "b1", betrag: -1 }));
    await sqliteLedgerRepository.speichern(buchung({ id: "b2" }));

    const anzahlen = await sqliteJournalRepository.anzahlen();
    expect(anzahlen.get("b1")).toBe(2);
    expect(anzahlen.get("b2")).toBe(1);
    expect(anzahlen.get("b3")).toBeUndefined();
  });

  it("übergeht einen unlesbaren Eintrag, statt die Historie zu verweigern", async () => {
    await sqliteLedgerRepository.speichern(buchung());
    db.run(
      `INSERT INTO buchung_journal (id, istbuchung_id, zeitpunkt, art, vorher, nachher)
       VALUES ('kaputt','b1','2026-04-10T00:00:00.000Z','geaendert','{kein json','{kein json')`,
    );

    const eintraege = await sqliteJournalRepository.zuBuchung("b1");
    expect(eintraege.length).toBe(2);
    const kaputt = eintraege.find((e) => e.id === "kaputt");
    const heil = eintraege.find((e) => e.id !== "kaputt");
    expect(kaputt?.vorher).toBeUndefined();
    expect(kaputt?.nachher).toBeUndefined();
    expect(heil?.nachher?.id).toBe("b1");
  });
});
