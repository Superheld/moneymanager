import { describe, expect, it } from "vitest";
import type { IstBuchung } from "../../core";
import type { LedgerPort, UmsatzRepository } from "../ports";
import type { Umsatz } from "./umsatz";
import { umsaetzeVerbuchen } from "./umsatzVerbuchen";

function umsatz(over: Partial<Umsatz>): Umsatz {
  return {
    id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2022-01-01",
    betrag: -655, waehrung: "EUR", gegenpartei: "Trinkgut", verwendungszweck: "x",
    rohHash: "h1", status: "neu", ...over,
  };
}

function fakes() {
  const ledger: IstBuchung[] = [];
  const gespeichert: Umsatz[] = [];
  let n = 0;
  const ledgerRepo: LedgerPort = {
    alle: async () => ledger,
    speichern: async (b) => { ledger.push(b); },
    loeschen: async () => {},
  };
  const umsatzRepo = {
    speichern: async (u: Umsatz) => { gespeichert.push(u); },
    speichernViele: async () => {},
    alle: async () => gespeichert,
    nachLauf: async () => [],
    offene: async () => [],
    loeschen: async () => {},
    bestandsSchluessel: async () => ({ hashes: [], nativeIds: [] }),
  } satisfies UmsatzRepository;
  return { deps: { ledgerRepo, umsatzRepo, id: () => `ist${n++}` }, ledger, gespeichert };
}

describe("umsaetzeVerbuchen", () => {
  it("verbucht kategorisierte Umsätze als Ist-Buchung und schaltet den Umsatz auf verbucht", async () => {
    const { deps, ledger, gespeichert } = fakes();
    const r = await umsaetzeVerbuchen(
      [umsatz({ vorschlag: { kategorieId: "kat1", charakter: "Aufwand", quelle: "remapping" } })],
      deps,
    );
    expect(r).toEqual({ verbucht: 1, uebersprungen: 0 });
    expect(ledger[0]).toMatchObject({ betrag: -655, kontoId: "k1", kategorieId: "kat1", charakter: "Aufwand", quelle: "import", rohHash: "h1" });
    expect(gespeichert[0]).toMatchObject({ status: "verbucht", istbuchungId: ledger[0].id });
  });

  it("verbucht Umbuchungen als Umschichtung ohne Kategorie", async () => {
    const { deps, ledger } = fakes();
    await umsaetzeVerbuchen([umsatz({ vorschlag: { charakter: "Umschichtung", quelle: "umbuchung" } })], deps);
    expect(ledger[0].charakter).toBe("Umschichtung");
    expect(ledger[0].kategorieId).toBeUndefined();
  });

  it("überspringt unkategorisierte und bereits verbuchte Umsätze", async () => {
    const { deps, ledger } = fakes();
    const r = await umsaetzeVerbuchen(
      [
        umsatz({ id: "a" }), // kein Vorschlag
        umsatz({ id: "b", status: "verbucht", vorschlag: { kategorieId: "k", charakter: "Aufwand", quelle: "manuell" } }),
      ],
      deps,
    );
    expect(r).toEqual({ verbucht: 0, uebersprungen: 2 });
    expect(ledger).toHaveLength(0);
  });
});
