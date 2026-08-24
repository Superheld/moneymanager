import { describe, it, expect } from "vitest";
import { euroZuCent } from "../basis/geld";
import type { Zahlungskonto } from "./konto";
import type { Zahlungsregel } from "../basis/zahlungsregel";
import type { IstBuchung } from "../buchung/istbuchung";
import { kontoRegister } from "./kontoregister";

function konto(over: Partial<Zahlungskonto> = {}): Zahlungskonto {
  return { id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: euroZuCent(1000), ...over };
}
function regel(over: Partial<Zahlungsregel> = {}): Zahlungsregel {
  return {
    id: "miete",
    bezeichnung: "Miete",
    betrag: euroZuCent(-1200),
    rhythmus: "monatlich",
    startdatum: "2026-06-01",
    charakter: "Aufwand",
    kontoId: "k1",
    ...over,
  };
}
function ist(over: Partial<IstBuchung> = {}): IstBuchung {
  return { id: "i1", datum: "2026-06-05", betrag: euroZuCent(-50), kontoId: "k1", charakter: "Aufwand", quelle: "manuell", ...over };
}

describe("kontoRegister — gebuchtes Ist", () => {
  it("rechnet den laufenden Saldo aus dem Anfangsbestand", () => {
    const r = kontoRegister(
      konto({ saldo: euroZuCent(1000) }),
      [ist({ id: "a", datum: "2026-06-05", betrag: euroZuCent(-50) }), ist({ id: "b", datum: "2026-06-10", betrag: euroZuCent(-30) })],
      [],
      "2026-06-15",
      30,
    );
    expect(r.gebucht.map((z) => z.saldo)).toEqual([euroZuCent(950), euroZuCent(920)]);
    expect(r.standHeute).toBe(euroZuCent(920));
  });

  it("nimmt nur Buchungen des eigenen Kontos und nutzt die Notiz als Bezeichnung", () => {
    const r = kontoRegister(
      konto(),
      [ist({ id: "a", notiz: "Bäcker", kontoId: "k1" }), ist({ id: "b", kontoId: "k2", betrag: euroZuCent(-999) })],
      [],
      "2026-06-15",
      30,
    );
    expect(r.gebucht).toHaveLength(1);
    expect(r.gebucht[0].bezeichnung).toBe("Bäcker");
    expect(r.gebucht[0].quelle).toBe("manuell");
  });

  it("benennt aus Plan bestätigtes Ist über die Regel-Bezeichnung", () => {
    const r = kontoRegister(
      konto(),
      [ist({ id: "a", notiz: undefined, planRef: { quelleId: "miete", faelligkeit: "2026-06-01" }, betrag: euroZuCent(-1200) })],
      [regel()],
      "2026-06-15",
      30,
    );
    expect(r.gebucht[0].bezeichnung).toBe("Miete");
  });
});

describe("kontoRegister — geplante Vorschau", () => {
  it("zeigt Fälligkeiten dieses Kontos im Tagesfenster, Saldo ab realem Stand", () => {
    const r = kontoRegister(konto({ saldo: euroZuCent(2000) }), [], [regel()], "2026-06-15", 30);
    // nächste Miete 2026-07-01 liegt im 30-Tage-Fenster, 2026-08-01 nicht.
    expect(r.geplant).toHaveLength(1);
    expect(r.geplant[0].datum).toBe("2026-07-01");
    expect(r.geplant[0].saldo).toBe(euroZuCent(800)); // 2000 − 1200
    expect(r.geplant[0].planRef).toEqual({ quelleId: "miete", faelligkeit: "2026-07-01" });
  });

  it("schließt bereits bezahlte Fälligkeiten aus der Vorschau aus", () => {
    const bezahltIst = ist({ id: "p", datum: "2026-07-01", betrag: euroZuCent(-1200), planRef: { quelleId: "miete", faelligkeit: "2026-07-01" }, quelle: "bezahlt-markiert" });
    const r = kontoRegister(konto(), [bezahltIst], [regel()], "2026-06-15", 30);
    expect(r.geplant).toHaveLength(0);
    // die bezahlte Fälligkeit erscheint stattdessen im gebuchten Teil
    expect(r.gebucht.some((z) => z.planRef?.faelligkeit === "2026-07-01")).toBe(true);
  });

  it("ignoriert Regeln, die einem anderen Konto zugeordnet sind", () => {
    const r = kontoRegister(konto(), [], [regel({ kontoId: "k2" })], "2026-06-15", 60);
    expect(r.geplant).toHaveLength(0);
  });
});

// Manche Banken vergeben fuer eine heute veranlasste Ueberweisung den Buchungstag von
// morgen und fuehren sie bereits im Saldo. Solche Zeilen sind GEBUCHT, nicht geplant —
// wer sie weglaesst, erzeugt eine Differenz zum Bankstand, die niemand erklaeren kann.
// Sichtbar unterscheidbar muessen sie trotzdem sein.
describe("kontoRegister — gebucht, aber Buchungstag in der Zukunft", () => {
  it("markiert eine Buchung nach heute als zukuenftig", () => {
    const r = kontoRegister(konto(), [ist({ id: "z", datum: "2026-06-20" })], [], "2026-06-15", 30);
    expect(r.gebucht[0].zukuenftig).toBe(true);
  });

  it("markiert heute und frueher NICHT", () => {
    const r = kontoRegister(
      konto(),
      [ist({ id: "a", datum: "2026-06-10" }), ist({ id: "b", datum: "2026-06-15" })],
      [],
      "2026-06-15",
      30,
    );
    expect(r.gebucht.map((z) => z.zukuenftig)).toEqual([false, false]);
  });

  it("laesst sie im GEBUCHTEN Teil und im Saldo stehen", () => {
    // Der Kern der Sache: sie ist keine Vorhersage. Sie gehoert nicht nach `geplant`,
    // und `standHeute` muss sie enthalten — sonst laeuft der Stand von dem der Bank weg.
    const r = kontoRegister(
      konto({ saldo: euroZuCent(1000) }),
      [ist({ id: "z", datum: "2026-06-20", betrag: euroZuCent(-40) })],
      [],
      "2026-06-15",
      30,
    );
    expect(r.gebucht).toHaveLength(1);
    expect(r.geplant.some((z) => z.datum === "2026-06-20")).toBe(false);
    expect(r.standHeute).toBe(euroZuCent(960));
  });
});
