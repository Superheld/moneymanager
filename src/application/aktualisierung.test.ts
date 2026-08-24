// Die Zusicherungen, auf die sich die Oberfläche verlässt.
//
// Der interessante Teil ist nicht der Erfolgsfall, sondern das SCHWEIGEN: eine Prüfung, die
// scheitert, darf niemanden behelligen. Das lässt sich hier prüfen und in der Shell nicht.

import { describe, expect, it, vi } from "vitest";
import {
  aktualisierungEinspielen,
  aktualisierungPruefen,
  pruefungErlaubt,
  pruefungSchalten,
  SCHLUESSEL_AKTUALISIERUNG,
  type AktualisierungPort,
} from "./aktualisierung";
import type { EinstellungenRepository } from "./ports";

function repoMit(kv: Record<string, string> = {}): EinstellungenRepository & { kv: Record<string, string> } {
  const stand = { ...kv };
  return {
    kv: stand,
    async lesen() {
      return stand;
    },
    async schreiben(schluessel, wert) {
      stand[schluessel] = wert;
    },
  };
}

const NICHTS: AktualisierungPort = {
  async pruefen() {
    return null;
  },
  async einspielen() {},
};

describe("Aktualisierung prüfen", () => {
  it("meldet, was bereitliegt", async () => {
    const port: AktualisierungPort = {
      async pruefen() {
        return { version: "0.20.0", hinweis: "Neuerungen" };
      },
      async einspielen() {},
    };
    expect(await aktualisierungPruefen(port, repoMit())).toEqual({
      version: "0.20.0",
      hinweis: "Neuerungen",
    });
  });

  it("meldet null, wenn nichts bereitliegt", async () => {
    expect(await aktualisierungPruefen(NICHTS, repoMit())).toBeNull();
  });

  it("schweigt, wenn die Prüfung scheitert", async () => {
    // Kein Netz, Endpunkt weg, Antwort kaputt — für den Haushalt ist das alles dasselbe:
    // es liegt nichts bereit. Eine Fehlermeldung wäre Beunruhigung ohne
    // Handlungsmöglichkeit.
    const laut = vi.spyOn(console, "warn").mockImplementation(() => {});
    const port: AktualisierungPort = {
      async pruefen() {
        throw new Error("kein Netz");
      },
      async einspielen() {},
    };
    expect(await aktualisierungPruefen(port, repoMit())).toBeNull();
    // Verschluckt heisst nicht spurlos — sonst sucht man später eine Prüfung, die nie
    // stattgefunden hat.
    expect(laut).toHaveBeenCalled();
    laut.mockRestore();
  });

  it("fragt gar nicht erst, wenn die Prüfung abgeschaltet ist", async () => {
    const port: AktualisierungPort = {
      pruefen: vi.fn(async () => ({ version: "0.20.0" })),
      async einspielen() {},
    };
    const repo = repoMit({ [SCHLUESSEL_AKTUALISIERUNG]: "aus" });
    expect(await aktualisierungPruefen(port, repo)).toBeNull();
    // Der Punkt der Einstellung ist, dass KEIN Netzzugriff passiert. Ein Aufruf, dessen
    // Ergebnis danach verworfen wird, hätte den Zweck verfehlt.
    expect(port.pruefen).not.toHaveBeenCalled();
  });
});

describe("Die Einstellung", () => {
  it("ist ohne Zutun an", () => {
    // „Nie entschieden" ist etwas anderes als „abgelehnt". Ein Update, von dem niemand
    // erfährt, ist keines.
    expect(pruefungErlaubt({})).toBe(true);
  });

  it("ist nur bei ausdrücklich gesetztem Aus auch aus", () => {
    expect(pruefungErlaubt({ [SCHLUESSEL_AKTUALISIERUNG]: "aus" })).toBe(false);
    expect(pruefungErlaubt({ [SCHLUESSEL_AKTUALISIERUNG]: "an" })).toBe(true);
    // Ein unbekannter Wert schaltet nicht ab — sonst legte ein Tippfehler die Prüfung
    // still lahm.
    expect(pruefungErlaubt({ [SCHLUESSEL_AKTUALISIERUNG]: "vielleicht" })).toBe(true);
  });

  it("lässt sich schalten und wieder zurückschalten", async () => {
    const repo = repoMit();
    await pruefungSchalten(repo, false);
    expect(pruefungErlaubt(await repo.lesen())).toBe(false);
    await pruefungSchalten(repo, true);
    expect(pruefungErlaubt(await repo.lesen())).toBe(true);
  });
});

describe("Aktualisierung einspielen", () => {
  it("reicht einen Fehler DURCH", async () => {
    // Gegenstück zum Schweigen beim Prüfen: hier hat jemand geklickt und wartet. Ein
    // stiller Fehlschlag hinterliesse einen Knopf, der nichts tut.
    const port: AktualisierungPort = {
      async pruefen() {
        return null;
      },
      async einspielen() {
        throw new Error("Download abgebrochen");
      },
    };
    await expect(aktualisierungEinspielen(port)).rejects.toThrow("Download abgebrochen");
  });
});
