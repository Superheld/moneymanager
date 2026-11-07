import { describe, expect, it } from "vitest";
import type { IstBuchung, Zahlungskonto } from "../../core";
import type { Umsatz } from "../import/umsatz";
import type { LedgerPort, UmsatzRepository, ZahlungskontoRepository } from "../ports";
import { paarungLoesen } from "./umbuchungAusBuchung";
import { umbuchungenErkennen } from "./umbuchungenErkennen";

const IBAN_GIRO = "DE02999999010000001002";
const IBAN_TAGESGELD = "DE02999999120000000001";

function welt(buchungen: IstBuchung[], umsaetze: Partial<Umsatz>[]) {
  const ledger = [...buchungen];
  const ledgerRepo: LedgerPort = {
    alle: async () => [...ledger],
    speichern: async (b) => {
      const i = ledger.findIndex((x) => x.id === b.id);
      if (i >= 0) ledger[i] = b; else ledger.push(b);
    },
    loeschen: async () => {},
  };
  const konten = [
    { id: "giro", iban: IBAN_GIRO },
    { id: "tagesgeld", iban: IBAN_TAGESGELD },
  ] as Zahlungskonto[];
  return {
    ledger,
    deps: {
      ledgerRepo,
      umsatzRepo: { alle: async () => umsaetze as Umsatz[] } as unknown as UmsatzRepository,
      kontoRepo: { alle: async () => konten } as unknown as ZahlungskontoRepository,
    },
  };
}

function bein(id: string, kontoId: string, betrag: number, datum: string): IstBuchung {
  return { id, datum, betrag, kontoId, charakter: betrag < 0 ? "Aufwand" : "Ertrag", quelle: "import", kategorieId: "kat", kategorieHerkunft: "automatisch" };
}

describe("umbuchungenErkennen", () => {
  it("verbindet das neue Bein mit dem aus dem früheren Lauf, wie von Hand gepaart", async () => {
    const { ledger, deps } = welt(
      [bein("b-giro", "giro", -20000, "2026-03-02"), bein("b-tg", "tagesgeld", 20000, "2026-03-04")],
      [
        { id: "u-giro", istbuchungId: "b-giro", gegenparteiIban: IBAN_TAGESGELD },
        { id: "u-tg", istbuchungId: "b-tg", gegenparteiIban: IBAN_GIRO },
      ],
    );

    expect(await umbuchungenErkennen(["u-tg"], deps)).toBe(1);

    const [ab, zu] = ledger;
    expect(ab.transferId).toBeTruthy();
    expect(zu.transferId).toBe(ab.transferId);
    expect(ab).toMatchObject({ charakter: "Umschichtung", gegenkontoId: "tagesgeld", kategorieId: undefined });
    expect(zu).toMatchObject({ charakter: "Umschichtung", gegenkontoId: "giro", kategorieId: undefined });
  });

  it("markiert beide Beine als noch anzusehen, auch das schon gesehene", async () => {
    const { ledger, deps } = welt(
      [bein("b-giro", "giro", -20000, "2026-03-02"), bein("b-tg", "tagesgeld", 20000, "2026-03-04")],
      [{ id: "u-giro", istbuchungId: "b-giro", gegenparteiIban: IBAN_TAGESGELD }, { id: "u-tg", istbuchungId: "b-tg" }],
    );
    await umbuchungenErkennen(["u-tg"], deps);
    expect(ledger.map((b) => b.zuPruefen)).toEqual([true, true]);
  });

  it("nimmt das Bein auch dann, wenn nur der ältere Beleg die IBAN trägt", async () => {
    const { ledger, deps } = welt(
      [bein("b-giro", "giro", -20000, "2026-03-02"), bein("b-tg", "tagesgeld", 20000, "2026-03-04")],
      [{ id: "u-giro", istbuchungId: "b-giro", gegenparteiIban: IBAN_TAGESGELD }, { id: "u-tg", istbuchungId: "b-tg" }],
    );
    expect(await umbuchungenErkennen(["u-tg"], deps)).toBe(1);
    expect(ledger[0].transferId).toBeTruthy();
  });

  it("wartet, solange das zweite Bein fehlt: die Buchung bleibt, was sie ist", async () => {
    const einzeln = bein("b-giro", "giro", -20000, "2026-03-02");
    const { ledger, deps } = welt([einzeln], [{ id: "u-giro", istbuchungId: "b-giro", gegenparteiIban: IBAN_TAGESGELD }]);
    expect(await umbuchungenErkennen(["u-giro"], deps)).toBe(0);
    expect(ledger).toEqual([einzeln]);
  });

  it("setzt eine gelöste Paarung beim nächsten Lauf nicht wieder zusammen", async () => {
    const { ledger, deps } = welt(
      [bein("b-giro", "giro", -20000, "2026-03-02"), bein("b-tg", "tagesgeld", 20000, "2026-03-04")],
      [
        { id: "u-giro", istbuchungId: "b-giro", gegenparteiIban: IBAN_TAGESGELD },
        { id: "u-tg", istbuchungId: "b-tg", gegenparteiIban: IBAN_GIRO },
      ],
    );
    await umbuchungenErkennen(["u-tg"], deps);
    await paarungLoesen(deps.ledgerRepo, ledger[0].transferId!);

    // Selbst wenn dieselben Zeilen noch einmal als „neu" hereinkämen.
    expect(await umbuchungenErkennen(["u-giro", "u-tg"], deps)).toBe(0);
    expect(ledger.every((b) => b.transferId === undefined)).toBe(true);
  });

  it("tut ohne frische Umsätze nichts und fragt auch nichts ab", async () => {
    const { deps } = welt([], []);
    const nichtFragen = { ...deps, ledgerRepo: { ...deps.ledgerRepo, alle: async () => { throw new Error("gefragt"); } } };
    expect(await umbuchungenErkennen([], nichtFragen)).toBe(0);
  });
});
