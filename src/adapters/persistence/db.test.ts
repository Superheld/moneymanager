// `getDb` merkt sich seine Zusage — und darf sich einen FEHLSCHLAG nicht merken.
//
// `invoke` ist hier ersetzt, und das ist sonst in diesem Projekt verpönt (siehe
// `transaktion.ts`: wer `invoke` wegmockt, testet die Attrappe). Hier geht es aber nicht
// um den Weg nach Rust, sondern um das Gedächtnis davor: was `getDb` mit einer Antwort
// anfängt, egal woher sie kommt.

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

/** Eine Naht, die sich wie eine offene, fertig migrierte Datenbank verhält. */
function offen(kommando: string, args?: { sql?: string }): unknown {
  if (kommando === "db_select" || kommando === "schemasitzung_select") {
    if (args?.sql?.includes("MAX(version)")) return [{ v: Number.MAX_SAFE_INTEGER }];
    return [];
  }
  if (kommando === "sicherungen_auflisten") return [];
  if (kommando === "sicherung_anlegen") return false;
  return { rowsAffected: 0, lastInsertId: 0 };
}

const GESPERRT = "Die Datenbank ist gesperrt.";
function gesperrt(kommando: string): unknown {
  if (kommando.startsWith("db_") || kommando.startsWith("schemasitzung_")) throw new Error(GESPERRT);
  return offen(kommando);
}

describe("getDb", () => {
  beforeEach(async () => {
    invoke.mockReset();
    const { zugangVergessen } = await import("./db");
    zugangVergessen();
  });

  it("versucht nicht, die Datenbank selbst zu öffnen", async () => {
    invoke.mockImplementation(async (k: string, a?: { sql?: string }) => offen(k, a));
    const { getDb } = await import("./db");
    await getDb();
    const kommandos = invoke.mock.calls.map((c) => c[0]);
    expect(kommandos).not.toContain("datenbank_oeffnen");
  });

  it("fährt Sicherung und Migrationen einmal je Öffnung, nicht je Aufruf", async () => {
    invoke.mockImplementation(async (k: string, a?: { sql?: string }) => offen(k, a));
    const { getDb, zugangVergessen } = await import("./db");
    await Promise.all([getDb(), getDb(), getDb()]);
    const zaehlen = () => invoke.mock.calls.filter((c) => String(c[1]?.sql).includes("MAX(version)")).length;
    expect(zaehlen()).toBe(1);

    zugangVergessen();
    await getDb();
    expect(zaehlen()).toBe(2);
  });

  // Der Fall, um den es geht: ein Ladevorgang läuft noch, während gesperrt wird, und
  // trifft auf die geschlossene Datenbank. Danach wird entsperrt.
  it("merkt sich einen Fehlschlag nicht — nach dem Entsperren geht es weiter", async () => {
    const { getDb } = await import("./db");

    invoke.mockImplementation(async (k: string) => gesperrt(k));
    await expect(getDb()).rejects.toThrow(GESPERRT);

    invoke.mockImplementation(async (k: string, a?: { sql?: string }) => offen(k, a));
    const db = await getDb();
    await expect(db.select("SELECT 1")).resolves.toEqual([]);
  });

  // Die Migrationen laufen auf EINER festgehaltenen Verbindung. Bleibt die Sitzung nach
  // einem Fehler offen, hält sie eine Schreibsperre — und daran wartet auch das Sperren.
  it("beendet die Schemasitzung in jedem Fall, auch wenn die Migration scheitert", async () => {
    const { getDb } = await import("./db");
    invoke.mockImplementation(async (k: string, a?: { sql?: string }) => {
      if (k === "schemasitzung_select") throw new Error("mittendrin kaputt");
      return offen(k, a);
    });

    await expect(getDb()).rejects.toThrow("mittendrin kaputt");

    const kommandos = invoke.mock.calls.map((c) => c[0] as string);
    expect(kommandos.filter((k) => k === "schemasitzung_beginnen")).toHaveLength(1);
    expect(kommandos[kommandos.length - 1]).toBe("schemasitzung_beenden");
  });

  it("schickt die Migrationen durch die Sitzung, nicht über den Pool", async () => {
    invoke.mockImplementation(async (k: string, a?: { sql?: string }) => offen(k, a));
    const { getDb } = await import("./db");
    await getDb();
    const mitVersion = invoke.mock.calls.filter((c) => String(c[1]?.sql).includes("_migration"));
    expect(mitVersion.length).toBeGreaterThan(0);
    for (const [kommando] of mitVersion) expect(kommando).toMatch(/^schemasitzung_/);
  });
});
