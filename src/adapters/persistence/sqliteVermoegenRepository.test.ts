// Das Vermögens-Repository gegen echte In-Memory-SQLite (sql.js) — wie
// `sqliteRepositories.test.ts`, nur in eigener Datei: der Bereich ist neu und hängt an
// keinem der dortigen Fälle. Alle Werte erfunden.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("./db", () => ({ getDb: async () => halter.lesen() }));

import { MIGRATIONS } from "./migrations";
import { sqliteVermoegenRepository as repo } from "./sqliteVermoegenRepository";

/** Dieselbe Naht wie in der App: nummerierte Platzhalter, auf sql.js abgebildet. */
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

const JETZT = "2026-06-15T09:00:00.000Z";

describe("Vermögenswerte", () => {
  it("speichert und liest einen Vermögenswert, auch stillgelegt", async () => {
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Wohnung Lindenhof", art: "immobilie" });
    await repo.gegenstandSpeichern({ id: "g2", bezeichnung: "Transporter", art: "fahrzeug", aktiv: false });

    expect(await repo.gegenstaende()).toEqual([
      { id: "g2", bezeichnung: "Transporter", art: "fahrzeug", aktiv: false },
      { id: "g1", bezeichnung: "Wohnung Lindenhof", art: "immobilie", aktiv: true },
    ]);
  });

  it("ändert am selben Schlüssel, statt eine zweite Zeile anzulegen", async () => {
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Wohnung", art: "immobilie" });
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Wohnung Lindenhof", art: "sonstiges", aktiv: false });
    expect(await repo.gegenstaende()).toEqual([
      { id: "g1", bezeichnung: "Wohnung Lindenhof", art: "sonstiges", aktiv: false },
    ]);
  });

  it("führt die Wertreihe nach Stichtag und hält den Zeitpunkt der Erfassung fest", async () => {
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Police Nordlicht", art: "versicherung" });
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2025-12-31", wert: 14_250_00 }, JETZT);
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2024-12-31", wert: 13_100_00 }, JETZT);

    expect(await repo.werte()).toEqual([
      { gegenstandId: "g1", stichtag: "2024-12-31", wert: 13_100_00 },
      { gegenstandId: "g1", stichtag: "2025-12-31", wert: 14_250_00 },
    ]);
    expect(db.exec("SELECT DISTINCT erfasst_am FROM vermoegenswert")[0].values).toEqual([[JETZT]]);
  });

  it("überschreibt einen belegten Stichtag nicht", async () => {
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Police Nordlicht", art: "versicherung" });
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2025-12-31", wert: 14_250_00 }, JETZT);
    await expect(
      repo.wertEintragen({ gegenstandId: "g1", stichtag: "2025-12-31", wert: 1 }, JETZT),
    ).rejects.toThrow();
    expect((await repo.werte())[0].wert).toBe(14_250_00);
  });

  it("entfernt genau die eine Beobachtung", async () => {
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Police Nordlicht", art: "versicherung" });
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2024-12-31", wert: 13_100_00 }, JETZT);
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2025-12-31", wert: 14_250_00 }, JETZT);
    await repo.wertEntfernen("g1", "2024-12-31");
    expect((await repo.werte()).map((w) => w.stichtag)).toEqual(["2025-12-31"]);
  });

  it("nimmt beim Löschen die Reihe mit und löst den Verweis der Schuld", async () => {
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Wohnung Lindenhof", art: "immobilie" });
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2025-12-31", wert: 250_000_00 }, JETZT);
    await repo.verbindlichkeitSpeichern({
      id: "v1", bezeichnung: "Darlehen Lindenhof", art: "immobilienkredit", gegenstandId: "g1",
    });

    await repo.gegenstandLoeschen("g1");

    expect(await repo.gegenstaende()).toEqual([]);
    expect(await repo.werte()).toEqual([]);
    expect(await repo.verbindlichkeiten()).toEqual([
      { id: "v1", bezeichnung: "Darlehen Lindenhof", art: "immobilienkredit", vertragId: undefined, gegenstandId: undefined, aktiv: true },
    ]);
  });
});

describe("Schulden", () => {
  it("speichert die Verweise und liest sie zurück", async () => {
    db.run(
      `INSERT INTO vertrag (id, anbieter, beginn, verlaengerung, status)
       VALUES ('ver1', 'Talmberger Bank', '2024-01-01', 'keine', 'aktiv')`,
    );
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Wohnung Lindenhof", art: "immobilie" });
    await repo.verbindlichkeitSpeichern({
      id: "v1", bezeichnung: "Darlehen Lindenhof", art: "immobilienkredit", vertragId: "ver1", gegenstandId: "g1",
    });
    expect(await repo.verbindlichkeiten()).toEqual([
      { id: "v1", bezeichnung: "Darlehen Lindenhof", art: "immobilienkredit", vertragId: "ver1", gegenstandId: "g1", aktiv: true },
    ]);

    // Beim Ändern lassen sich die Verweise auch wieder lösen.
    await repo.verbindlichkeitSpeichern({ id: "v1", bezeichnung: "Darlehen", art: "sonstiges", aktiv: false });
    expect(await repo.verbindlichkeiten()).toEqual([
      { id: "v1", bezeichnung: "Darlehen", art: "sonstiges", vertragId: undefined, gegenstandId: undefined, aktiv: false },
    ]);
  });

  it("führt die Reihe der Restschulden und weist den belegten Stichtag ab", async () => {
    await repo.verbindlichkeitSpeichern({ id: "v1", bezeichnung: "Ratenkauf", art: "ratenkredit" });
    await repo.standEintragen({ verbindlichkeitId: "v1", stichtag: "2025-12-31", restschuld: 3_000_00 }, JETZT);
    await repo.standEintragen({ verbindlichkeitId: "v1", stichtag: "2024-12-31", restschuld: 4_200_00 }, JETZT);
    await expect(
      repo.standEintragen({ verbindlichkeitId: "v1", stichtag: "2025-12-31", restschuld: 1 }, JETZT),
    ).rejects.toThrow();

    expect(await repo.staende()).toEqual([
      { verbindlichkeitId: "v1", stichtag: "2024-12-31", restschuld: 4_200_00 },
      { verbindlichkeitId: "v1", stichtag: "2025-12-31", restschuld: 3_000_00 },
    ]);

    await repo.standEntfernen("v1", "2024-12-31");
    expect((await repo.staende()).map((s) => s.stichtag)).toEqual(["2025-12-31"]);
  });

  it("nimmt beim Löschen die Reihe mit", async () => {
    await repo.verbindlichkeitSpeichern({ id: "v1", bezeichnung: "Ratenkauf", art: "ratenkredit" });
    await repo.standEintragen({ verbindlichkeitId: "v1", stichtag: "2025-12-31", restschuld: 3_000_00 }, JETZT);
    await repo.verbindlichkeitLoeschen("v1");
    expect(await repo.verbindlichkeiten()).toEqual([]);
    expect(await repo.staende()).toEqual([]);
  });
});

/**
 * Die Fremdschlüssel sind in der App AN und in sql.js AUS. Was die Migration zusagt
 * (CASCADE, SET NULL), wird deshalb hier mit eingeschalteter Prüfung nachgesehen — sonst
 * prüfte der Test etwas anderes, als die App tut.
 */
describe("Migration 77 mit eingeschalteten Fremdschlüsseln", () => {
  beforeEach(() => {
    db.run("PRAGMA foreign_keys = ON");
    db.run(
      `INSERT INTO vertrag (id, anbieter, beginn, verlaengerung, status)
       VALUES ('ver1', 'Talmberger Bank', '2024-01-01', 'keine', 'aktiv')`,
    );
    db.run("INSERT INTO vermoegensgegenstand (id, bezeichnung, art) VALUES ('g1', 'Wohnung Lindenhof', 'immobilie')");
    db.run(`INSERT INTO vermoegenswert (gegenstand_id, stichtag, wert, erfasst_am) VALUES ('g1', '2025-12-31', 25000000, '${JETZT}')`);
    db.run(
      `INSERT INTO verbindlichkeit (id, bezeichnung, art, vertrag_id, gegenstand_id)
       VALUES ('v1', 'Darlehen Lindenhof', 'immobilienkredit', 'ver1', 'g1')`,
    );
    db.run(`INSERT INTO verbindlichkeit_stand (verbindlichkeit_id, stichtag, restschuld, erfasst_am) VALUES ('v1', '2025-12-31', 17000000, '${JETZT}')`);
  });

  it("führt neue Einträge von selbst", () => {
    expect(db.exec("SELECT aktiv FROM vermoegensgegenstand")[0].values).toEqual([[1]]);
    expect(db.exec("SELECT aktiv FROM verbindlichkeit")[0].values).toEqual([[1]]);
  });

  it("weist eine Beobachtung ohne Stammsatz ab", () => {
    expect(() =>
      db.run(`INSERT INTO vermoegenswert (gegenstand_id, stichtag, wert, erfasst_am) VALUES ('weg', '2025-12-31', 1, '${JETZT}')`),
    ).toThrow();
    expect(() =>
      db.run(`INSERT INTO verbindlichkeit_stand (verbindlichkeit_id, stichtag, restschuld, erfasst_am) VALUES ('weg', '2025-12-31', 1, '${JETZT}')`),
    ).toThrow();
  });

  it("lässt die Schuld stehen, wenn ihr Vertrag oder ihr Vermögenswert verschwindet", () => {
    db.run("DELETE FROM vertrag WHERE id = 'ver1'");
    db.run("DELETE FROM vermoegensgegenstand WHERE id = 'g1'");
    expect(db.exec("SELECT id, vertrag_id, gegenstand_id FROM verbindlichkeit")[0].values).toEqual([
      ["v1", null, null],
    ]);
    // Die Wertreihe ging mit ihrem Vermögenswert.
    expect(db.exec("SELECT COUNT(*) FROM vermoegenswert")[0].values).toEqual([[0]]);
  });

  it("nimmt die Restschulden mit ihrer Schuld", () => {
    db.run("DELETE FROM verbindlichkeit WHERE id = 'v1'");
    expect(db.exec("SELECT COUNT(*) FROM verbindlichkeit_stand")[0].values).toEqual([[0]]);
  });
});
