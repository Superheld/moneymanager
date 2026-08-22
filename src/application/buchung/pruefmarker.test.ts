import { describe, expect, it } from "vitest";
import { FachlicherFehler, type IstBuchung } from "../../core";
import type { LedgerPort } from "../ports";
import { pruefmarkerSetzen } from "./pruefmarker";

function buchung(over: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: "i1", datum: "2026-03-04", betrag: -1250, kontoId: "k1",
    charakter: "Aufwand", quelle: "import", ...over,
  };
}

function ledgerMit(buchungen: IstBuchung[]) {
  const bestand = [...buchungen];
  const ledger: LedgerPort = {
    alle: async () => bestand,
    speichern: async (b) => {
      const i = bestand.findIndex((x) => x.id === b.id);
      if (i >= 0) bestand[i] = b;
      else bestand.push(b);
    },
    loeschen: async (id) => {
      const i = bestand.findIndex((x) => x.id === id);
      if (i >= 0) bestand.splice(i, 1);
    },
  };
  return { ledger, bestand };
}

describe("pruefmarkerSetzen", () => {
  it("merkt eine Buchung zum Ansehen vor", async () => {
    const { ledger, bestand } = ledgerMit([buchung()]);
    await pruefmarkerSetzen(ledger, "i1", true);
    expect(bestand[0].zuPruefen).toBe(true);
  });

  /**
   * Abgehakt heisst `undefined`, nicht `false`: eine erledigte Zeile soll wieder aussehen
   * wie eine, die den Marker nie hatte. Sonst unterscheiden sich zwei gleichwertige
   * Zustände in jedem Vergleich, und die Prüfung „hat sie den Marker" hinge davon ab,
   * welchen Weg die Zeile genommen hat.
   */
  it("hakt ihn wieder ab, und zwar spurlos", async () => {
    const { ledger, bestand } = ledgerMit([buchung({ zuPruefen: true })]);
    await pruefmarkerSetzen(ledger, "i1", false);
    expect(bestand[0].zuPruefen).toBeUndefined();
  });

  /**
   * Der Marker fasst NUR sich selbst an. Würde der Aufrufer die ganze Buchung
   * zurückschicken, überschriebe ein veralteter Stand aus einem offenen Dialog
   * stillschweigend Kategorie oder Bezeichnung.
   */
  it("lässt alles andere an der Buchung unberührt", async () => {
    const { ledger, bestand } = ledgerMit([
      buchung({ kategorieId: "kat1", notiz: "Kesselmann", kategorieHerkunft: "manuell" }),
    ]);
    await pruefmarkerSetzen(ledger, "i1", true);
    expect(bestand[0]).toMatchObject({
      kategorieId: "kat1", notiz: "Kesselmann", kategorieHerkunft: "manuell", betrag: -1250,
    });
  });

  it("meldet es, wenn die Buchung gar nicht (mehr) da ist", async () => {
    const { ledger } = ledgerMit([]);
    await expect(pruefmarkerSetzen(ledger, "i1", true)).rejects.toThrow(FachlicherFehler);
  });
});
