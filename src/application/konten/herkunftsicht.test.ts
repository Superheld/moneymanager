import { describe, expect, it } from "vitest";
import { herkunftLaden, type HerkunftDeps } from "./herkunftsicht";
import type { ImportLauf, Umsatz } from "../import";
import type { IstBuchung, Zahlungskonto } from "../../core";

const GIRO: Zahlungskonto = {
  id: "giro", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
};
const BAR: Zahlungskonto = {
  id: "bar", bezeichnung: "Bargeld", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 0,
};

const LAEUFE: ImportLauf[] = [
  { id: "l-datei", quelle: "finanzguru", zeitpunkt: "2026-08-10T09:00:00.000Z", eingelesen: 3, neu: 3, duplikate: 0 },
  { id: "l-abruf", quelle: "fints", zeitpunkt: "2026-08-20T09:00:00.000Z", eingelesen: 9, neu: 0, duplikate: 9 },
];

function umsatz(over: Partial<Umsatz> & { id: string }): Umsatz {
  return {
    laufId: "l-datei", zahlungskontoId: "giro", buchungstag: "2026-08-01",
    betrag: -1250, waehrung: "EUR", gegenpartei: "Kesselmann", verwendungszweck: "Rechnung",
    rohHash: `h-${over.id}`, status: "verbucht", ...over,
  };
}

function deps(umsaetze: Umsatz[], buchungen: IstBuchung[] = []): HerkunftDeps {
  return {
    kontoRepo: { async alle() { return [GIRO, BAR]; }, async speichern() {}, async loeschen() {} },
    umsatzRepo: { async alle() { return umsaetze; } } as unknown as HerkunftDeps["umsatzRepo"],
    laufRepo: { async alle() { return LAEUFE; }, async speichern() {}, async loeschen() {} },
    ledger: { async alle() { return buchungen; }, async speichern() {}, async loeschen() {} },
  };
}

describe("herkunftLaden", () => {
  it("ordnet jede Rohzeile ihrem Konto zu — auch die weggelegten", async () => {
    const [giro, bar] = await herkunftLaden(
      deps([
        umsatz({ id: "u1" }),
        umsatz({ id: "u2", status: "verworfen", istbuchungId: undefined }),
        umsatz({ id: "u3", zahlungskontoId: "bar" }),
      ]),
    );
    expect(giro.zeilen).toHaveLength(2);
    expect(bar.zeilen).toHaveLength(1);
    // Der Punkt der ganzen Sicht: die weggelegte Zeile ist dabei.
    expect(giro.zeilen.some((z) => z.umsatz.status === "verworfen")).toBe(true);
  });

  it("sortiert die neuesten nach oben", async () => {
    const [giro] = await herkunftLaden(
      deps([
        umsatz({ id: "alt", buchungstag: "2026-07-01" }),
        umsatz({ id: "neu", buchungstag: "2026-08-15" }),
      ]),
    );
    expect(giro.zeilen.map((z) => z.umsatz.id)).toEqual(["neu", "alt"]);
  });

  /**
   * Der Widerspruch, den man sonst nie sieht: der Umsatz sagt „verbucht", die Buchung
   * dazu gibt es nicht mehr. Genau dieser Zustand entstand früher beim Löschen einer
   * importierten Zeile und musste einmal per Migration aufgeräumt werden.
   */
  it("erkennt, wenn die verbuchte Zeile keine Buchung mehr hat", async () => {
    const buchung: IstBuchung = {
      id: "b1", datum: "2026-08-01", betrag: -1250, kontoId: "giro",
      charakter: "Aufwand", quelle: "import",
    };
    const [giro] = await herkunftLaden(
      deps(
        [umsatz({ id: "u1", istbuchungId: "b1" }), umsatz({ id: "u2", istbuchungId: "weg" })],
        [buchung],
      ),
    );
    expect(giro.zeilen.find((z) => z.umsatz.id === "u1")?.gebucht).toBe(true);
    expect(giro.zeilen.find((z) => z.umsatz.id === "u2")?.gebucht).toBe(false);
  });

  it("zählt je Lauf, was FÜR DIESES KONTO ankam", async () => {
    const [giro] = await herkunftLaden(
      deps([
        umsatz({ id: "u1", laufId: "l-datei" }),
        umsatz({ id: "u2", laufId: "l-datei", status: "verworfen" }),
        umsatz({ id: "u3", laufId: "l-abruf", status: "neu" }),
        // Zählt für das andere Konto und darf hier nicht mitgerechnet werden.
        umsatz({ id: "u4", laufId: "l-datei", zahlungskontoId: "bar" }),
      ]),
    );
    const datei = giro.laeufe.find((l) => l.lauf.id === "l-datei");
    expect(datei).toMatchObject({ zeilen: 2, verbucht: 1, weggelegt: 1, offen: 0 });
    expect(giro.laeufe.find((l) => l.lauf.id === "l-abruf")).toMatchObject({ offen: 1 });
  });

  it("stellt die neuesten Läufe nach vorn", async () => {
    const [giro] = await herkunftLaden(
      deps([umsatz({ id: "u1", laufId: "l-datei" }), umsatz({ id: "u2", laufId: "l-abruf" })]),
    );
    expect(giro.laeufe.map((l) => l.lauf.id)).toEqual(["l-abruf", "l-datei"]);
  });

  /**
   * Ein Umsatz, dessen Lauf nicht mehr existiert, ist eine Altlast und kein Fehler. Er
   * darf die Sicht nicht kippen und auch keinen leeren Platzhalter erzeugen.
   */
  it("übergeht einen Lauf, den es nicht mehr gibt", async () => {
    const [giro] = await herkunftLaden(deps([umsatz({ id: "u1", laufId: "verschwunden" })]));
    expect(giro.laeufe).toHaveLength(0);
    expect(giro.zeilen).toHaveLength(1);
    expect(giro.zeilen[0].lauf).toBeUndefined();
  });

  it("liefert ein Konto ohne Zeilen als leer, nicht gar nicht", async () => {
    const konten = await herkunftLaden(deps([]));
    expect(konten).toHaveLength(2);
    expect(konten.every((k) => k.zeilen.length === 0)).toBe(true);
  });
});
