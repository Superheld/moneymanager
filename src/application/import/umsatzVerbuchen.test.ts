import { describe, expect, it } from "vitest";
import type { IstBuchung } from "../../core";
import type { LedgerPort, UmsatzRepository } from "../ports";
import type { Umsatz } from "./umsatz";
import { paareUmbuchungen, umsaetzeVerbuchen } from "./umsatzVerbuchen";

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
    expect(r).toEqual({ verbucht: 1, uebersprungen: 0, umbuchungen: 0 });
    expect(ledger[0]).toMatchObject({ betrag: -655, kontoId: "k1", kategorieId: "kat1", charakter: "Aufwand", quelle: "import", rohHash: "h1" });
    expect(gespeichert[0]).toMatchObject({ status: "verbucht", istbuchungId: ledger[0].id });
  });

  it("ungepaarte Umbuchung → einseitige Umschichtung als Fallback", async () => {
    const { deps, ledger } = fakes();
    await umsaetzeVerbuchen([umsatz({ vorschlag: { charakter: "Umschichtung", quelle: "umbuchung" } })], deps);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].charakter).toBe("Umschichtung");
    expect(ledger[0].kategorieId).toBeUndefined();
    expect(ledger[0].transferId).toBeUndefined();
  });

  const umb = (over: Partial<Umsatz>): Umsatz =>
    umsatz({ vorschlag: { charakter: "Umschichtung", quelle: "umbuchung" }, ...over });

  it("paart zwei Beine zu einer verknüpften Umbuchung (transferId + Gegenkonto)", async () => {
    const { deps, ledger, gespeichert } = fakes();
    const r = await umsaetzeVerbuchen(
      [
        umb({ id: "ab", betrag: -50000, zahlungskontoId: "giro", buchungstag: "2022-05-01", rohHash: "a" }),
        umb({ id: "zu", betrag: 50000, zahlungskontoId: "tagesgeld", buchungstag: "2022-05-01", rohHash: "b" }),
      ],
      deps,
    );
    expect(r).toMatchObject({ verbucht: 2, umbuchungen: 1, uebersprungen: 0 });
    expect(ledger).toHaveLength(2);
    const [a, b] = ledger;
    expect(a.transferId).toBeDefined();
    expect(a.transferId).toBe(b.transferId);
    expect(a.kontoId).toBe("giro"); expect(a.gegenkontoId).toBe("tagesgeld"); expect(a.betrag).toBe(-50000);
    expect(b.kontoId).toBe("tagesgeld"); expect(b.gegenkontoId).toBe("giro"); expect(b.betrag).toBe(50000);
    expect(a.charakter).toBe("Umschichtung");
    expect(gespeichert.every((u) => u.status === "verbucht")).toBe(true);
  });

  it("paart Beine bis 3 Tage versetzt (verschiedene Banken buchen oft an verschiedenen Tagen)", () => {
    expect(paareUmbuchungen([
      umb({ id: "1", betrag: -10, zahlungskontoId: "k1", buchungstag: "2022-01-01" }),
      umb({ id: "2", betrag: 10, zahlungskontoId: "k2", buchungstag: "2022-01-03" }),
    ]).paare).toHaveLength(1);
  });

  it("paart NICHT bei gleichem Konto oder zu großem Datumsabstand", () => {
    // gleiches Konto → kein Paar
    expect(paareUmbuchungen([
      umb({ id: "1", betrag: -10, zahlungskontoId: "k1", buchungstag: "2022-01-01" }),
      umb({ id: "2", betrag: 10, zahlungskontoId: "k1", buchungstag: "2022-01-01" }),
    ]).paare).toHaveLength(0);
    // > 3 Tage auseinander → kein Paar
    expect(paareUmbuchungen([
      umb({ id: "1", betrag: -10, zahlungskontoId: "k1", buchungstag: "2022-01-01" }),
      umb({ id: "2", betrag: 10, zahlungskontoId: "k2", buchungstag: "2022-01-10" }),
    ]).paare).toHaveLength(0);
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
    expect(r).toEqual({ verbucht: 0, uebersprungen: 2, umbuchungen: 0 });
    expect(ledger).toHaveLength(0);
  });
});
