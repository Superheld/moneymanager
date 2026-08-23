// Bankzugänge gegen eine echte SQLite-Engine (sql.js, In-Memory) — nie gegen die
// Nutzer-DB. Geprüft wird die Rundreise über die beiden Spalten, die mit dem zweiten
// Abrufweg dazukamen: die Art und der gespeicherte Ausweis.
//
// Der wichtigste Fall ist der BESTAND: Zeilen, die vor der Migration angelegt wurden,
// tragen keine Art. Sie sind FinTS — das stand bis dahin nur nirgends, weil es keinen
// zweiten Weg gab. Wer das falsch abbildet, schickt einen bestehenden Zugang beim
// nächsten Abruf über den falschen Adapter.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { MIGRATIONS } from "./migrations";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});

vi.mock("./db", () => ({ getDb: async () => halter.lesen() }));

import { sqliteBankzugangRepository } from "./sqliteBankzugangRepositories";

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
  halter.setzen(pluginApi(db));
});

describe("Bankzugang — Art und Ausweis", () => {
  it("speichert einen FinTS-Zugang und liest ihn zurück", async () => {
    await sqliteBankzugangRepository.speichern({
      id: "z1",
      bezeichnung: "Kesselmann Bank",
      art: "fints",
      url: "https://fints.example/fints",
      blz: "99999901",
      benutzer: "nutzer",
    });
    const [z] = await sqliteBankzugangRepository.alle();
    expect(z?.art).toBe("fints");
    // FinTS braucht keinen Ausweis — das Feld bleibt leer und wird nicht zu "".
    expect(z?.token).toBeUndefined();
  });

  it("speichert den zweiten Weg samt Ausweis", async () => {
    await sqliteBankzugangRepository.speichern({
      id: "z2",
      bezeichnung: "Testbank",
      art: "hanseatic",
      url: "https://connect.example.invalid",
      blz: "",
      benutzer: "0000000000", // privacy-ok — erfundener Testwert
      token: "dGVzdDp0ZXN0", // privacy-ok — erfundener Testwert
    });
    const [z] = await sqliteBankzugangRepository.alle();
    expect(z?.art).toBe("hanseatic");
    expect(z?.token).toBe("dGVzdDp0ZXN0"); // privacy-ok — erfundener Testwert
    // Dieser Weg kennt keine Bankleitzahl. Leer ist die richtige Antwort, nicht erfunden.
    expect(z?.blz).toBe("");
  });

  it("überschreibt Art und Ausweis beim erneuten Speichern", async () => {
    const basis = {
      id: "z3",
      bezeichnung: "Testbank",
      url: "https://connect.example.invalid",
      blz: "",
      benutzer: "0000000000", // privacy-ok — erfundener Testwert
    } as const;
    await sqliteBankzugangRepository.speichern({ ...basis, art: "hanseatic", token: "alt" });
    await sqliteBankzugangRepository.speichern({ ...basis, art: "hanseatic", token: "neu" });
    const alle = await sqliteBankzugangRepository.alle();
    expect(alle).toHaveLength(1);
    expect(alle[0]?.token).toBe("neu");
  });

  // Der Bestandsfall: eine Zeile, die vor der Migration entstand. Der Standardwert der
  // Spalte trägt sie — hier direkt in die Tabelle geschrieben, damit der Test wirklich
  // den Weg des Bestands nimmt und nicht den des Repositories.
  it("liest eine Zeile ohne Art als FinTS", async () => {
    db.run(
      `INSERT INTO bankzugang (id, bezeichnung, url, blz, benutzer, angelegt_am)
       VALUES ('alt', 'Altbestand', 'https://fints.example/fints', '99999901', 'nutzer', '2026-01-01')`,
    );
    const [z] = await sqliteBankzugangRepository.alle();
    expect(z?.art).toBe("fints");
  });

  // Ein unbekannter Wert (von Hand gesetzt, aus einer neueren Fassung) fällt ebenfalls
  // auf FinTS zurück: lieber der Weg, der jede Bank bedient, als gar keiner.
  it("fällt bei unbekannter Art auf FinTS zurück", async () => {
    db.run(
      `INSERT INTO bankzugang (id, bezeichnung, art, url, blz, benutzer, angelegt_am)
       VALUES ('x', 'Testbank', 'irgendwas', 'https://fints.example/fints', '99999901', 'nutzer', '2026-01-01')`,
    );
    const [z] = await sqliteBankzugangRepository.alle();
    expect(z?.art).toBe("fints");
  });

  it("löscht einen Zugang samt seiner Kontozuordnungen", async () => {
    await sqliteBankzugangRepository.speichern({
      id: "z4",
      bezeichnung: "Testbank",
      art: "hanseatic",
      url: "https://connect.example.invalid",
      blz: "",
      benutzer: "0000000000", // privacy-ok — erfundener Testwert
      token: "dGVzdDp0ZXN0", // privacy-ok — erfundener Testwert
    });
    await sqliteBankzugangRepository.loeschen("z4");
    expect(await sqliteBankzugangRepository.alle()).toEqual([]);
  });
});
