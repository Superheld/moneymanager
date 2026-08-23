import { describe, it, expect } from "vitest";
import type { EinstellungenRepository } from "./ports";
import {
  EXPERIMENTE,
  EXPERIMENTE_AUS,
  experimenteLaden,
  experimentSchalten,
} from "./experimente";

function memRepo(start: Record<string, string> = {}): EinstellungenRepository & {
  daten: Record<string, string>;
} {
  const daten: Record<string, string> = { ...start };
  return {
    daten,
    async lesen() { return { ...daten }; },
    async schreiben(s, w) { daten[s] = w; },
  };
}

describe("experimenteLaden — aus ist der Ausgangszustand", () => {
  it("liefert alles aus, wenn nichts gespeichert ist", async () => {
    expect(await experimenteLaden(memRepo())).toEqual(EXPERIMENTE_AUS);
  });

  it("kennt jede Kennung, auch wenn zu ihr nichts gespeichert ist", async () => {
    const stand = await experimenteLaden(memRepo());
    for (const id of EXPERIMENTE) expect(stand[id]).toBe(false);
  });

  it("liest einen gesetzten Schalter", async () => {
    const stand = await experimenteLaden(memRepo({ "experiment.hanseatic": "an" }));
    expect(stand.hanseatic).toBe(true);
  });

  // Ein Experiment darf sich nie von selbst einschalten. Ein unerwarteter Wert — von Hand
  // in der Datenbank, aus einer älteren Fassung, ein Tippfehler — ist deshalb „aus" und
  // nicht „irgendwas Wahres".
  it("wertet alles ausser genau „an\" als aus", async () => {
    for (const wert of ["", "aus", "true", "1", "AN", "ja", " an"]) {
      const stand = await experimenteLaden(memRepo({ "experiment.hanseatic": wert }));
      expect(stand.hanseatic, `„${wert}" darf nicht einschalten`).toBe(false);
    }
  });
});

describe("experimentSchalten", () => {
  it("schreibt unter dem Präfix, nicht unter der blanken Kennung", async () => {
    const repo = memRepo();
    await experimentSchalten(repo, "hanseatic", true);
    expect(repo.daten["experiment.hanseatic"]).toBe("an");
    expect(repo.daten["hanseatic"]).toBeUndefined();
  });

  it("schaltet wieder aus, ohne den Schlüssel zu verlieren", async () => {
    const repo = memRepo();
    await experimentSchalten(repo, "hanseatic", true);
    await experimentSchalten(repo, "hanseatic", false);
    expect(await experimenteLaden(repo)).toEqual(EXPERIMENTE_AUS);
    // Der Schlüssel bleibt stehen: „einmal bewusst ausgeschaltet" ist eine andere
    // Aussage als „nie angefasst", auch wenn beide gleich wirken.
    expect(repo.daten["experiment.hanseatic"]).toBe("aus");
  });

  it("rührt die übrigen Einstellungen nicht an", async () => {
    const repo = memRepo({ locale: "de-CH" });
    await experimentSchalten(repo, "hanseatic", true);
    expect(repo.daten["locale"]).toBe("de-CH");
  });
});
