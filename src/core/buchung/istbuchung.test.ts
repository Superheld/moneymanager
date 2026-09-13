import { describe, it, expect } from "vitest";
import { euroZuCent } from "../basis/geld";
import type { Zahlungskonto } from "../konten/konto";
import {
  istSummeKonto,
  kategorieIstHandverlesen,
  liquideMittelReal,
  realerKontostand,
  staendeJeKlasse,
  type IstBuchung,
} from "./istbuchung";

function ist(over: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: "i1",
    datum: "2026-06-01",
    betrag: euroZuCent(-200),
    kontoId: "k1",
    charakter: "Aufwand",
    quelle: "manuell",
    ...over,
  };
}

function konto(over: Partial<Zahlungskonto> = {}): Zahlungskonto {
  return { id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: euroZuCent(1000), ...over };
}

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

describe("staendeJeKlasse — was da ist", () => {
  it("zählt ein stillgelegtes Konto mit, unter seiner Klasse", () => {
    // **Die Rückblick-Hälfte der Regel, und die absichtliche Nicht-Änderung.** Diese Karte
    // fragt „was existiert", nicht „was kann ich ausgeben" — und das Restgeld auf einer
    // aufgegebenen Kasse existiert. Es herauszurechnen liesse Vermögen verschwinden, ohne
    // dass es irgendwo auftauchte: das Konto steht in keiner Auswahl mehr und in keiner
    // Vorausschau. Die drei Summen dieser Karte müssen sich zum Ganzen addieren.
    //
    // Eine eigene Zeile „stillgelegt" war der erste Entwurf und ist verworfen: sie sollte
    // einen Widerspruch auflösen, den es nicht gibt — die Monatskarten benutzen das Geld
    // eines stillgelegten liquiden Kontos ja weiter.
    const staende = staendeJeKlasse(
      [konto({ id: "k1", saldo: euroZuCent(1000) }), konto({ id: "k2", aktiv: false, saldo: euroZuCent(300) })],
      [],
    );
    const liquide = staende.find((z) => z.klasse === "liquide")!;
    expect(liquide.stand).toBe(euroZuCent(1300));
    expect(liquide.konten).toHaveLength(2);
  });
});

describe("liquideMittelReal — die Vergangenheit bleibt", () => {
  it("nimmt Saldo UND Buchungen eines stillgelegten Kontos mit", () => {
    // Wer ein Konto stilllegt, darf nicht rückwirkend seine Monate leeren. Der Ist-Wert
    // der Monatskarten hängt an dieser Rechnung; fiele ein stillgelegtes Konto heraus,
    // verlöre jemand nach einem Bankwechsel den grössten Teil seines Ist der letzten
    // Monate — Plan bliebe stehen, Ist fiele auf fast null.
    const summe = liquideMittelReal(
      [konto({ id: "k1", aktiv: false, saldo: euroZuCent(1000) })],
      [ist({ kontoId: "k1", betrag: euroZuCent(-200) })],
    );
    expect(summe).toBe(euroZuCent(800));
  });
});
