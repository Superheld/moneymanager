import { describe, expect, it } from "vitest";
import type { EinstellungenRepository } from "./ports";
import { ZEITSPERRE_STANDARD, zeitsperreLaden, zeitsperreSetzen } from "./einstellungen";

function repo(start: Record<string, string> = {}): EinstellungenRepository & { stand: Record<string, string> } {
  const stand = { ...start };
  return {
    stand,
    lesen: async () => ({ ...stand }),
    schreiben: async (k: string, v: string) => {
      stand[k] = v;
    },
  } as EinstellungenRepository & { stand: Record<string, string> };
}

describe("Zeitsperre", () => {
  it("ist ohne Eintrag auf dem Standardwert — nicht aus", async () => {
    // Ein fehlender Schlüssel heisst „nie entschieden". Die Sperre daraufhin
    // abzuschalten wäre eine Entscheidung, die niemand getroffen hat.
    expect(await zeitsperreLaden(repo())).toBe(ZEITSPERRE_STANDARD);
  });

  it("liest einen gesetzten Wert", async () => {
    expect(await zeitsperreLaden(repo({ zeitsperreMinuten: "5" }))).toBe(5);
  });

  it("nimmt 0 als abgeschaltet", async () => {
    expect(await zeitsperreLaden(repo({ zeitsperreMinuten: "0" }))).toBe(0);
  });

  it("fällt bei Unsinn auf den Standard zurück, NICHT auf aus", async () => {
    for (const murks of ["abc", "", "-3", "NaN"]) {
      expect(await zeitsperreLaden(repo({ zeitsperreMinuten: murks }))).toBe(ZEITSPERRE_STANDARD);
    }
  });

  it("speichert und liest zurück", async () => {
    const r = repo();
    await zeitsperreSetzen(r, 30);
    expect(await zeitsperreLaden(r)).toBe(30);
  });

  it("macht aus negativen Werten und Bruchteilen etwas Sinnvolles", async () => {
    const r = repo();
    await zeitsperreSetzen(r, -5);
    expect(await zeitsperreLaden(r)).toBe(0);

    await zeitsperreSetzen(r, 2.7);
    expect(await zeitsperreLaden(r)).toBe(2);
  });
});
