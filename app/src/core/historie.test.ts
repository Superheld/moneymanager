import { describe, expect, it } from "vitest";
import { fruehesterMonat, istMonatsverlauf, kategorieAggregat } from "./historie";
import type { IstBuchung } from "./istbuchung";
import type { Kategorie } from "./kategorie";
import type { Zahlungskonto } from "./konto";

function konto(saldo: number): Zahlungskonto {
  return { id: "k1", bezeichnung: "Giro", typ: "Giro", inhaberIds: [], saldo };
}
function b(datum: string, betrag: number, charakter: IstBuchung["charakter"]): IstBuchung {
  return { id: datum + betrag, datum, betrag, kontoId: "k1", charakter, quelle: "import" };
}

describe("istMonatsverlauf", () => {
  it("bündelt Erträge/Aufwände/Umschichtungen je Monat", () => {
    const r = istMonatsverlauf(
      [konto(0)],
      [
        b("2022-01-10", 200000, "Ertrag"),
        b("2022-01-15", -5000, "Aufwand"),
        b("2022-01-20", -50000, "Umschichtung"),
      ],
      "2022-01-01",
      "2022-01-01",
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ einnahmen: 200000, ausgaben: -5000, umschichtung: -50000, netto: 195000 });
  });

  it("führt den realen Saldo über die Monate fort (inkl. Umschichtung im Saldo)", () => {
    const r = istMonatsverlauf(
      [konto(100000)], // Anfangsbestand 1000,00
      [b("2022-01-10", -30000, "Aufwand"), b("2022-02-10", 50000, "Ertrag")],
      "2022-01-01",
      "2022-02-01",
    );
    expect(r[0].saldo).toBe(70000); // 100000 - 30000
    expect(r[1].saldo).toBe(120000); // + 50000
  });

  it("listet buchungsfreie Monate mit Nullfluss, Saldo läuft weiter", () => {
    const r = istMonatsverlauf([konto(0)], [b("2022-01-10", -1000, "Aufwand")], "2022-01-01", "2022-03-01");
    expect(r.map((m) => m.label)).toEqual(["2022-01", "2022-02", "2022-03"]);
    expect(r[1]).toMatchObject({ einnahmen: 0, ausgaben: 0, saldo: -1000 });
    expect(r[2].saldo).toBe(-1000);
  });

  it("zählt Ist VOR dem Fenster in den Sockel-Saldo, nicht in die Monatsflüsse", () => {
    const r = istMonatsverlauf(
      [konto(0)],
      [b("2021-12-31", -10000, "Aufwand"), b("2022-01-05", -2000, "Aufwand")],
      "2022-01-01",
      "2022-01-01",
    );
    expect(r[0].ausgaben).toBe(-2000); // Dez nicht im Fluss
    expect(r[0].saldo).toBe(-12000); // aber im Saldo
  });
});

describe("kategorieAggregat", () => {
  const kategorien: Kategorie[] = [
    { id: "le", name: "Lebensmittel", elternId: "lh", defaultCharakter: "Aufwand" },
    { id: "lh", name: "Lebenshaltung", defaultCharakter: "Aufwand" },
    { id: "ge", name: "Gehalt", defaultCharakter: "Ertrag" },
  ];
  function bk(datum: string, betrag: number, charakter: IstBuchung["charakter"], kategorieId?: string): IstBuchung {
    return { id: datum + betrag, datum, betrag, kontoId: "k1", charakter, quelle: "import", kategorieId };
  }

  it("summiert je Kategorie im Fenster, sortiert nach Magnitude, mit Elternname", () => {
    const r = kategorieAggregat(
      [
        bk("2022-01-05", -3000, "Aufwand", "le"),
        bk("2022-01-09", -2000, "Aufwand", "le"),
        bk("2022-01-10", 250000, "Ertrag", "ge"),
        bk("2022-02-01", -9999, "Aufwand", "le"), // außerhalb des Fensters
      ],
      "2022-01-01",
      "2022-01-01",
      kategorien,
    );
    expect(r.map((x) => x.name)).toEqual(["Gehalt", "Lebensmittel"]); // Magnitude: 250000 > 5000
    const le = r.find((x) => x.kategorieId === "le")!;
    expect(le).toMatchObject({ summe: -5000, anzahl: 2, elternName: "Lebenshaltung", charakter: "Aufwand" });
  });

  it("fasst Buchungen ohne Kategorie separat zusammen", () => {
    const r = kategorieAggregat([bk("2022-01-05", -1000, "Aufwand")], "2022-01-01", "2022-01-01", kategorien);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kategorieId: undefined, name: "—", summe: -1000 });
  });
});

describe("fruehesterMonat", () => {
  it("findet den frühesten Buchungsmonat als YYYY-MM-01", () => {
    expect(fruehesterMonat([b("2023-05-10", -1, "Aufwand"), b("2021-11-02", -1, "Aufwand")])).toBe("2021-11-01");
  });
  it("liefert undefined bei leerer Liste", () => {
    expect(fruehesterMonat([])).toBeUndefined();
  });
});
