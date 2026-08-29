import { describe, it, expect } from "vitest";
import { euroZuCent } from "../basis/geld";
import type { Zahlungskonto } from "./konto";
import type { Zahlungsregel } from "../basis/zahlungsregel";
import type { IstBuchung } from "../buchung/istbuchung";
import { kontoRegister, vorschauAlleKonten } from "./kontoregister";

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

  it("benennt eine gebuchte Zeile ohne Notiz neutral", () => {
    // Sie hiess einmal wie die Zahlungsregel, wenn sie deren Fälligkeit bestätigte.
    // Diese Bestätigung gibt es nicht mehr (siehe `IstQuelle`), und aus dem blossen
    // Betrag eine Regel zu erraten wäre eine Zuordnung, die niemand getroffen hat.
    const r = kontoRegister(
      konto(),
      [ist({ id: "a", notiz: undefined, betrag: euroZuCent(-1200) })],
      [regel()],
      "2026-06-15",
      30,
    );
    expect(r.gebucht[0].bezeichnung).toBe("Buchung");
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

/**
 * Die kontoübergreifende Vorschau — was die Übersicht zeigt, seit sie aus dem Kontoauszug
 * ausgezogen ist.
 *
 * Die Zusage ist nicht „dieselben Zeilen wie vorher, nur zusammengeschüttet": sie muss
 * DIESELBE Regel benutzen, welche Fälligkeit noch offen ist. Deshalb rechnet sie über
 * `kontoRegister` und nicht neu — und deshalb prüft der erste Test genau das.
 */
describe("vorschauAlleKonten", () => {
  const giro = konto({ id: "k1", bezeichnung: "Giro" });
  const zweit = konto({ id: "k2", bezeichnung: "Zweitkonto" });

  it("führt die Fälligkeiten mehrerer Konten chronologisch zusammen", () => {
    const zeilen = vorschauAlleKonten(
      [giro, zweit],
      [],
      [
        regel({ id: "r-spaet", bezeichnung: "Spät", startdatum: "2026-06-20", kontoId: "k1" }),
        regel({ id: "r-frueh", bezeichnung: "Früh", startdatum: "2026-06-10", kontoId: "k2" }),
      ],
      "2026-06-01",
      30,
    );
    expect(zeilen.map((z) => [z.datum, z.kontoId])).toEqual([
      ["2026-06-10", "k2"],
      ["2026-06-20", "k1"],
    ]);
  });

  it("nimmt nur Regeln, deren Konto in der Liste steht", () => {
    const zeilen = vorschauAlleKonten(
      [giro],
      [],
      [regel({ id: "fremd", startdatum: "2026-06-10", kontoId: "k9" })],
      "2026-06-01",
      30,
    );
    expect(zeilen).toHaveLength(0);
  });

  it("liefert bei gleichem Tag eine stabile Reihenfolge, unabhängig von der Kontenliste", () => {
    const regeln = [
      regel({ id: "ra", startdatum: "2026-06-10", kontoId: "k1" }),
      regel({ id: "rb", startdatum: "2026-06-10", kontoId: "k2" }),
    ];
    const vorwaerts = vorschauAlleKonten([giro, zweit], [], regeln, "2026-06-01", 30);
    const rueckwaerts = vorschauAlleKonten([zweit, giro], [], regeln, "2026-06-01", 30);
    expect(vorwaerts.map((z) => z.kontoId)).toEqual(rueckwaerts.map((z) => z.kontoId));
  });

  it("schneidet am Tagesfenster ab", () => {
    const zeilen = vorschauAlleKonten(
      [giro],
      [],
      [regel({ id: "r1", startdatum: "2026-06-25", kontoId: "k1" })],
      "2026-06-01",
      10,
    );
    expect(zeilen).toHaveLength(0);
  });
});
