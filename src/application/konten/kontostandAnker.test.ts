import { describe, expect, it } from "vitest";
import { FachlicherFehler, type IstBuchung, type Kontostandsanker, type Zahlungskonto } from "../../core";
import { anfangsbestandAbgleichen, kontostandFesthalten } from "./kontostandAnker";
import type { KontostandsankerRepository, LedgerPort, ZahlungskontoRepository } from "../ports";

const KONTO: Zahlungskonto = {
  id: "giro", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 9900,
};

function fakes(konto = KONTO, buchungen: IstBuchung[] = [], anker: Kontostandsanker[] = []) {
  const gespeicherteKonten: Zahlungskonto[] = [];
  const gespeicherteAnker: Kontostandsanker[] = [];
  const kontoRepo = {
    async alle() { return [konto]; },
    async speichern(k: Zahlungskonto) { gespeicherteKonten.push(k); },
    async loeschen() {},
  } as unknown as ZahlungskontoRepository;
  const ledger = { async alle() { return buchungen; } } as unknown as LedgerPort;
  const ankerRepo: KontostandsankerRepository = {
    async alle() { return anker; },
    async speichern(a) { gespeicherteAnker.push(a); },
    async entfernen() {},
  };
  return { deps: { kontoRepo, ledger, ankerRepo }, gespeicherteKonten, gespeicherteAnker };
}

function buchung(datum: string, betrag: number): IstBuchung {
  return { id: `b${datum}${betrag}`, datum, betrag, kontoId: "giro", charakter: "Aufwand", quelle: "import" };
}

describe("kontostandFesthalten — der Kassensturz", () => {
  it("legt eine Beobachtung mit Stichtag und Erfassungszeitpunkt an", () => {
    const f = fakes();
    return kontostandFesthalten(f.deps, { kontoId: "giro", datum: "2026-08-20", betrag: 4750 }, () => "2026-08-20T18:00:00.000Z")
      .then(() => {
        expect(f.gespeicherteAnker).toEqual([
          { kontoId: "giro", datum: "2026-08-20", herkunft: "hand", betrag: 4750, erfasstAm: "2026-08-20T18:00:00.000Z" },
        ]);
      });
  });

  it("weist einen Betrag zurück, der keine ganzen Cent sind", async () => {
    const f = fakes();
    await expect(kontostandFesthalten(f.deps, { kontoId: "giro", datum: "2026-08-20", betrag: 47.5 }))
      .rejects.toBeInstanceOf(FachlicherFehler);
    expect(f.gespeicherteAnker).toEqual([]);
  });

  it("weist ein Datum zurück, das es nicht gibt", async () => {
    // Die FORM prüft der Aufrufer, die EXISTENZ der Kern.
    const f = fakes();
    await expect(kontostandFesthalten(f.deps, { kontoId: "giro", datum: "2026-02-31", betrag: 4750 }))
      .rejects.toThrow();
    expect(f.gespeicherteAnker).toEqual([]);
  });
});

describe("anfangsbestandAbgleichen", () => {
  const ANKER: Kontostandsanker = {
    kontoId: "giro", datum: "2026-08-20", herkunft: "bank", betrag: 145678,
    erfasstAm: "2026-08-20T22:47:00.000Z",
  };

  it("setzt den Anfangsbestand so, dass die Rechnung den Anker trifft", async () => {
    // Der Fall, um den es geht: die App rechnet mehr als die Bank meldet, und die
    // Differenz stammt vermutlich aus der Zeit vor dem ersten Import.
    const buchungen = [buchung("2026-01-05", 133344)];
    const f = fakes(KONTO, buchungen, [ANKER]);

    const ergebnis = await anfangsbestandAbgleichen(f.deps, "giro");

    expect(ergebnis.alt).toBe(9900);
    expect(ergebnis.neu).toBe(12334); // 145678 − 133344
    expect(ergebnis.differenz).toBe(2434);
    expect(f.gespeicherteKonten[0].saldo).toBe(12334);
  });

  it("rührt nichts an, wenn schon alles stimmt", async () => {
    // Sonst schriebe ein Klick ohne Wirkung trotzdem — und ein Konto sähe geändert aus.
    const buchungen = [buchung("2026-01-05", 135778)];
    const f = fakes(KONTO, buchungen, [ANKER]);

    const ergebnis = await anfangsbestandAbgleichen(f.deps, "giro");

    expect(ergebnis.differenz).toBe(0);
    expect(f.gespeicherteKonten).toEqual([]);
  });

  it("zählt nur, was bis zum Stichtag gebucht ist", async () => {
    // Eine Buchung NACH dem Ankerdatum gehört nicht in den Anfangsbestand — sie ist ja
    // im gemeldeten Stand gar nicht enthalten.
    const buchungen = [buchung("2026-01-05", 133344), buchung("2026-08-25", -5000)];
    const f = fakes(KONTO, buchungen, [ANKER]);

    expect((await anfangsbestandAbgleichen(f.deps, "giro")).neu).toBe(12334);
  });

  it("verweigert den Abgleich ohne Anker", async () => {
    const f = fakes(KONTO, [buchung("2026-01-05", 100)], []);
    await expect(anfangsbestandAbgleichen(f.deps, "giro")).rejects.toBeInstanceOf(FachlicherFehler);
  });
});
