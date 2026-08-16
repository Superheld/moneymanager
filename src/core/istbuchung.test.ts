import { describe, it, expect } from "vitest";
import { euroZuCent } from "./geld";
import type { Zahlungskonto } from "./konto";
import {
  bezahlteSchluessel,
  findeIstZuPlan,
  istSummeKonto,
  kategorieIstHandverlesen,
  liquideMittelReal,
  planRefKey,
  realerKontostand,
  type IstBuchung,
} from "./istbuchung";

function ist(over: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: "i1",
    datum: "2026-06-01",
    betrag: euroZuCent(-200),
    kontoId: "k1",
    charakter: "Aufwand",
    quelle: "bezahlt-markiert",
    planRef: { quelleId: "r1", faelligkeit: "2026-06-01" },
    ...over,
  };
}

function konto(over: Partial<Zahlungskonto> = {}): Zahlungskonto {
  return { id: "k1", bezeichnung: "Giro", typ: "Giro", inhaberIds: [], saldo: euroZuCent(1000), ...over };
}

describe("planRefKey / bezahlteSchluessel / findeIstZuPlan", () => {
  it("baut einen stabilen Schlüssel aus Quelle und Fälligkeit", () => {
    expect(planRefKey("r1", "2026-06-01")).toBe("r1@2026-06-01");
  });

  it("sammelt alle belegten Plan-Posten als Schlüssel", () => {
    const s = bezahlteSchluessel([
      ist(),
      ist({ id: "i2", planRef: { quelleId: "r2", faelligkeit: "2026-07-01" } }),
      ist({ id: "i3", quelle: "import", planRef: undefined }), // ohne planRef → ignoriert
    ]);
    expect(s.has("r1@2026-06-01")).toBe(true);
    expect(s.has("r2@2026-07-01")).toBe(true);
    expect(s.size).toBe(2);
  });

  it("findet die Ist-Buchung zu einem Plan-Posten", () => {
    const buchungen = [ist()];
    expect(findeIstZuPlan(buchungen, "r1", "2026-06-01")?.id).toBe("i1");
    expect(findeIstZuPlan(buchungen, "r1", "2026-07-01")).toBeUndefined();
  });
});

describe("Reconciliation light", () => {
  it("istSummeKonto summiert nur das passende Konto, vorzeichenbehaftet", () => {
    const buchungen = [ist(), ist({ id: "i2", betrag: euroZuCent(-50) }), ist({ id: "i3", kontoId: "k2", betrag: euroZuCent(-999) })];
    expect(istSummeKonto(buchungen, "k1")).toBe(euroZuCent(-250));
    expect(istSummeKonto(buchungen, "k2")).toBe(euroZuCent(-999));
  });

  it("realerKontostand = Anfangsbestand + Σ Ist", () => {
    const k = konto({ saldo: euroZuCent(1000) });
    expect(realerKontostand(k, [ist({ betrag: euroZuCent(-200) })])).toBe(euroZuCent(800));
    expect(realerKontostand(k, [])).toBe(euroZuCent(1000));
  });

  it("liquideMittelReal summiert reale Stände über alle Konten", () => {
    const konten = [konto({ id: "k1", saldo: euroZuCent(1000) }), konto({ id: "k2", saldo: euroZuCent(500) })];
    const buchungen = [ist({ kontoId: "k1", betrag: euroZuCent(-200) }), ist({ id: "i2", kontoId: "k2", betrag: euroZuCent(-100) })];
    expect(liquideMittelReal(konten, buchungen)).toBe(euroZuCent(1200));
  });
});

describe("kategorieIstHandverlesen — was eine Automatik nicht anfassen darf", () => {
  it("fehlende Herkunft zählt als automatisch (Bestandsdaten bleiben offen)", () => {
    expect(kategorieIstHandverlesen(ist({ kategorieId: "kat-1" }))).toBe(false);
  });

  it("„automatisch“ ist offen, „manuell“ ist gesperrt", () => {
    expect(kategorieIstHandverlesen(ist({ kategorieId: "kat-1", kategorieHerkunft: "automatisch" }))).toBe(false);
    expect(kategorieIstHandverlesen(ist({ kategorieId: "kat-1", kategorieHerkunft: "manuell" }))).toBe(true);
  });

  it("eine aufgeteilte Buchung ist gesperrt, auch ohne „manuell“", () => {
    const geteilt = ist({
      kategorieId: undefined,
      betrag: euroZuCent(-52),
      aufteilungen: [
        { kategorieId: "kat-lebensmittel", betrag: euroZuCent(-40) },
        { kategorieId: "kat-drogerie", betrag: euroZuCent(-12) },
      ],
    });
    // Ein Split entsteht nur von Hand und trägt mehrere Kategorien — es gibt kein Feld,
    // in das ein Vorschlag passen würde.
    expect(geteilt.kategorieHerkunft).toBeUndefined();
    expect(kategorieIstHandverlesen(geteilt)).toBe(true);
  });
});
