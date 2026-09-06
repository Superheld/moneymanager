import { describe, expect, it } from "vitest";
import type { BankAccount } from "lib-fints";
import { kontenAufbereiten, type FintsFaehigkeiten } from "./fintsAdapter";

const konto = (over: Partial<BankAccount> = {}) =>
  ({
    accountNumber: "300123",
    subAccountId: "00",
    product: "Verrechnungskonto",
    ...over,
  }) as BankAccount;

/** Beantwortet die drei Fragen; `wirftBei` laesst genau eine davon werfen. */
function faehigkeiten(
  antworten: { saldo?: boolean; umsaetze?: boolean; depot?: boolean },
  wirftBei?: "saldo" | "umsaetze" | "depot",
): FintsFaehigkeiten {
  const gib = (was: "saldo" | "umsaetze" | "depot", wert: boolean | undefined) => () => {
    if (wirftBei === was) throw new Error(`Konto in der Kontenliste nicht gefunden (${was})`);
    return wert ?? false;
  };
  return {
    canGetAccountBalance: gib("saldo", antworten.saldo),
    canGetAccountStatements: gib("umsaetze", antworten.umsaetze),
    canGetPortfolio: gib("depot", antworten.depot),
  };
}

describe("kontenAufbereiten", () => {
  it("uebernimmt, was die Bank je Konto freigibt", () => {
    const [k] = kontenAufbereiten(faehigkeiten({ saldo: true, umsaetze: true, depot: false }), [konto()]);
    expect([k.kannSaldo, k.kannUmsaetze, k.kannDepot]).toEqual([true, true, false]);
    expect(k.hinweis).toBeUndefined();
  });

  /**
   * Die Regression, um die es geht. Bis 2026-09-05 standen alle drei Fragen in EINEM
   * `try`: warf die erste, blieben die anderen auf `false`, ohne je gestellt worden zu
   * sein. Aus einem Wurf beim Saldo wurde so „dieses Konto kann kein Depot" — und weil
   * ohne `kannSaldo` kein Saldo abgerufen wird, entsteht auch kein Kontostands-Anker und
   * das Konto steht auf null. Ein Fehler an einer Stelle, drei falsche Aussagen.
   */
  it("laesst einen Wurf bei einer Frage die anderen beiden nicht mitnehmen", () => {
    const [k] = kontenAufbereiten(
      faehigkeiten({ umsaetze: true, depot: true }, "saldo"),
      [konto()],
    );
    expect(k.kannSaldo).toBe(false);
    expect(k.kannUmsaetze).toBe(true);
    expect(k.kannDepot).toBe(true);
  });

  it("sagt beim Wurf, dass nicht GEFRAGT werden konnte — nicht, dass die Bank nichts freigibt", () => {
    // Zwei verschiedene Aussagen, und sie auseinanderzuhalten ist der Zweck des
    // Hinweises: die eine ist eine Auskunft der Bank, die andere ein Befund ueber uns.
    // Wer beide gleich sieht, verdaechtigt die Bank und sucht an der falschen Stelle.
    const [gewuerfelt] = kontenAufbereiten(faehigkeiten({}, "depot"), [konto()]);
    expect(gewuerfelt.hinweis).toMatch(/liess sich nicht klären/);
    expect(gewuerfelt.hinweis).toContain("Bestände");

    const [stumm] = kontenAufbereiten(faehigkeiten({}), [konto()]);
    expect(stumm.hinweis).toMatch(/gibt für .* nichts frei/);
  });

  it("nimmt die Bezeichnung aus `product` — `accountType` ist bei allen Konten dasselbe", () => {
    const [mit] = kontenAufbereiten(faehigkeiten({ saldo: true }), [konto()]);
    expect(mit.bezeichnung).toBe("Verrechnungskonto");
    // Fehlt sie, traegt die IBAN, sonst die Nummer.
    const [ohne] = kontenAufbereiten(faehigkeiten({ saldo: true }), [
      konto({ product: undefined, iban: "DE31999999980000000002" }),
    ]);
    expect(ohne.bezeichnung).toBe("DE31999999980000000002");
  });
});
