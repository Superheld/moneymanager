import { describe, expect, it } from "vitest";
import { FachlicherFehler, type IstBuchung } from "../../core";
import type { LedgerPort, UmsatzRepository } from "../ports";
import { bankzeileVerwerfen } from "./bankzeileVerwerfen";
import type { Umsatz } from "./umsatz";

function buchung(over: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: "i1", datum: "2026-03-04", betrag: -1250, kontoId: "k1",
    charakter: "Aufwand", quelle: "import", ...over,
  };
}

function umsatz(over: Partial<Umsatz> = {}): Umsatz {
  return {
    id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-03-04",
    betrag: -1250, waehrung: "EUR", gegenpartei: "Kesselmann", verwendungszweck: "Abbuchung",
    rohHash: "h1", status: "verbucht", istbuchungId: "i1", ...over,
  };
}

function fakes(buchungen: IstBuchung[], umsaetze: Umsatz[]) {
  const ledger = [...buchungen];
  const bestand = [...umsaetze];
  const ledgerRepo: LedgerPort = {
    alle: async () => ledger,
    speichern: async (b) => {
      const i = ledger.findIndex((x) => x.id === b.id);
      if (i >= 0) ledger[i] = b;
      else ledger.push(b);
    },
    loeschen: async (id) => {
      const i = ledger.findIndex((x) => x.id === id);
      if (i >= 0) ledger.splice(i, 1);
    },
  };
  const umsatzRepo = {
    speichern: async (u: Umsatz) => {
      const i = bestand.findIndex((x) => x.id === u.id);
      if (i >= 0) bestand[i] = u;
      else bestand.push(u);
    },
    speichernViele: async () => {},
    alle: async () => bestand,
    nachLauf: async () => [],
    offene: async () => bestand.filter((u) => u.status === "neu"),
    loeschen: async () => {},
    bestandsSchluessel: async () => ({ hashes: bestand.map((u) => u.rohHash), nativeIds: [] }),
  } satisfies UmsatzRepository;
  return { deps: { ledger: ledgerRepo, umsatzRepo }, ledger, bestand };
}

describe("bankzeileVerwerfen", () => {
  it("nimmt die Buchung aus dem Ledger und hält den Umsatz als verworfen fest", async () => {
    const { deps, ledger, bestand } = fakes([buchung()], [umsatz()]);

    await bankzeileVerwerfen(deps, "i1");

    expect(ledger).toHaveLength(0);
    expect(bestand[0]).toMatchObject({ status: "verworfen", istbuchungId: undefined });
  });

  /**
   * Der eigentliche Zweck: die Zeile darf beim nächsten Abruf nicht zurückkommen. Das
   * hängt allein daran, dass der Umsatz mit seinem Roh-Hash STEHEN bleibt — würde er
   * gelöscht, wäre die Zeile beim nächsten Lauf wieder neu.
   */
  it("lässt den Roh-Hash im Bestand, damit der nächste Abruf die Zeile nicht neu anlegt", async () => {
    const f = fakes([buchung()], [umsatz({ rohHash: "h-abruf" })]);

    await bankzeileVerwerfen(f.deps, "i1");

    const schluessel = await f.deps.umsatzRepo.bestandsSchluessel();
    expect(schluessel.hashes).toContain("h-abruf");
  });

  /**
   * Das Gegenbein kann aus einer Datei stammen oder auf einem anderen Konto liegen — es
   * ist von der Entscheidung über DIESE Zeile nicht betroffen und bleibt als eigenständige
   * Buchung stehen. Nur die Paarung wird gelöst, sonst hinge sie ins Leere.
   */
  it("löst eine Paarung, nimmt das Gegenbein aber nicht mit", async () => {
    const f = fakes(
      [
        buchung({ id: "i1", transferId: "t1", gegenkontoId: "k2" }),
        buchung({ id: "i2", kontoId: "k2", betrag: 1250, transferId: "t1", gegenkontoId: "k1", quelle: "manuell" }),
      ],
      [umsatz()],
    );

    await bankzeileVerwerfen(f.deps, "i1");

    expect(f.ledger).toHaveLength(1);
    expect(f.ledger[0]).toMatchObject({ id: "i2", transferId: undefined, gegenkontoId: undefined });
  });

  it("verwirft eine Zeile, die schon offen ist, ohne Umweg über das Zurücksetzen", async () => {
    const f = fakes([buchung()], [umsatz({ status: "neu", istbuchungId: "i1" })]);

    await bankzeileVerwerfen(f.deps, "i1");

    expect(f.bestand[0].status).toBe("verworfen");
  });

  it("meldet es, wenn die Buchung gar nicht (mehr) da ist", async () => {
    const f = fakes([], [umsatz()]);
    await expect(bankzeileVerwerfen(f.deps, "i1")).rejects.toThrow(FachlicherFehler);
  });

  /**
   * Ohne Umsatz gibt es nichts, was den Reimport blocken könnte. Ein stilles Löschen wäre
   * hier das schlechtere Verhalten: die Zeile käme beim nächsten Abruf zurück, und der
   * Nutzer hätte den Eindruck, sie sei weg.
   */
  it("verweigert das Verwerfen, wenn zur Buchung keine eingelesene Zeile gehört", async () => {
    const f = fakes([buchung({ quelle: "manuell" })], []);
    await expect(bankzeileVerwerfen(f.deps, "i1")).rejects.toThrow(FachlicherFehler);
    expect(f.ledger).toHaveLength(1);
  });
});
