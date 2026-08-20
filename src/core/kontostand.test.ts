// Der Kontostands-Anker — und vor allem: was er über eine LÜCKE aussagt.
//
// Die Zahlen sind erfunden, die Form ist echt: ein Konto, das seit Jahren läuft, ein
// Anfangsbestand, der nur die fehlende Vorgeschichte überbrückt, und Bankmeldungen, die
// nicht dazu passen.

import { describe, expect, it } from "vitest";
import { FachlicherFehler } from "./fehler";
import type { IstBuchung } from "./istbuchung";
import type { Zahlungskonto } from "./konto";
import {
  abweichungsfenster,
  anfangsbestandAusAnker,
  ankerAbweichung,
  bankAnker,
  istSummeBis,
  istSummeZwischen,
  juengsterAnker,
  type Kontostandsanker,
} from "./kontostand";

const KONTO: Zahlungskonto = {
  id: "giro", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 10000,
};

function buchung(datum: string, betrag: number, over: Partial<IstBuchung> = {}): IstBuchung {
  return { id: `b-${datum}-${betrag}`, datum, betrag, kontoId: "giro", charakter: "Aufwand", quelle: "import", ...over };
}

function anker(datum: string, betrag: number, over: Partial<Kontostandsanker> = {}): Kontostandsanker {
  return { kontoId: "giro", datum, herkunft: "bank", betrag, erfasstAm: `${datum}T09:00:00.000Z`, ...over };
}

describe("Summen mit Stichtag", () => {
  const buchungen = [buchung("2026-06-30", -1000), buchung("2026-07-01", -2000), buchung("2026-07-31", -500)];

  it("zählt den Stichtag selbst MIT", () => {
    expect(istSummeBis(buchungen, "giro", "2026-06-30")).toBe(-1000);
  });

  it("lässt beim Zwischenraum den Anfang aus und nimmt das Ende mit", () => {
    // Sonst zählte die Buchung am Ankertag zweimal: einmal im Anker, einmal danach.
    expect(istSummeZwischen(buchungen, "giro", "2026-06-30", "2026-07-31")).toBe(-2500);
  });

  it("ignoriert andere Konten", () => {
    expect(istSummeBis([...buchungen, buchung("2026-07-01", -9999, { kontoId: "bar" })], "giro", "2026-12-31")).toBe(-3500);
  });
});

describe("juengsterAnker", () => {
  const alle = [anker("2026-06-30", 50000), anker("2026-07-31", 40000)];

  it("nimmt den letzten bis zum Stichtag", () => {
    expect(juengsterAnker(alle, "giro", "2026-07-15")?.datum).toBe("2026-06-30");
  });

  it("ohne Stichtag den jüngsten überhaupt", () => {
    expect(juengsterAnker(alle, "giro")?.datum).toBe("2026-07-31");
  });

  it("liefert nichts für ein Konto ohne Anker", () => {
    expect(juengsterAnker(alle, "bar")).toBeUndefined();
  });

  it("bei zwei Ankern am selben Tag gewinnt die jüngere Beobachtung", () => {
    const bank = anker("2026-07-31", 40000);
    const gezaehlt = anker("2026-07-31", 39500, { herkunft: "hand", erfasstAm: "2026-07-31T18:00:00.000Z" });
    expect(juengsterAnker([bank, gezaehlt], "giro")?.herkunft).toBe("hand");
  });
});

describe("anfangsbestandAusAnker", () => {
  it("liefert den Wert, mit dem die Vorwärtsrechnung den Anker trifft", () => {
    const buchungen = [buchung("2026-06-01", -2000), buchung("2026-06-20", 5000)];
    const a = anker("2026-06-30", 50000);
    const neu = anfangsbestandAusAnker(buchungen, a);
    expect(neu).toBe(47000);
    // Gegenprobe: mit diesem Anfangsbestand ist die Abweichung genau null.
    expect(ankerAbweichung({ ...KONTO, saldo: neu }, buchungen, a)).toBe(0);
  });

  it("zählt nur bis zum Stichtag — was danach kommt, gehört nicht hinein", () => {
    const buchungen = [buchung("2026-06-01", -2000), buchung("2026-07-05", -777)];
    expect(anfangsbestandAusAnker(buchungen, anker("2026-06-30", 50000))).toBe(52000);
  });
});

describe("abweichungsfenster — wo ist es entstanden?", () => {
  it("schweigt, wenn die Bewegungen zur Meldung der Bank passen", () => {
    const buchungen = [buchung("2026-07-10", -3000), buchung("2026-07-20", 1000)];
    const alle = [anker("2026-06-30", 50000), anker("2026-07-31", 48000)];
    expect(abweichungsfenster(buchungen, alle, "giro")).toEqual([]);
  });

  it("benennt genau den Zeitraum, in dem etwas fehlt", () => {
    // Drei Anker, zwei Zeiträume. Im ersten passt alles, im zweiten fehlen 600,00 €.
    const buchungen = [buchung("2026-07-10", -3000), buchung("2026-08-05", -1000)];
    const alle = [anker("2026-06-30", 50000), anker("2026-07-31", 47000), anker("2026-08-31", 106000)];
    expect(abweichungsfenster(buchungen, alle, "giro")).toEqual([
      { von: "2026-07-31", bis: "2026-08-31", betrag: 60000 },
    ]);
  });

  it("ist vom Anfangsbestand UNABHÄNGIG — das ist der Punkt", () => {
    // Ein falscher Anfangsbestand verschiebt jede Abweichung um denselben Betrag. Auf die
    // Differenz zwischen zwei Ankern wirkt er sich nicht aus, und nur die zählt hier.
    const buchungen = [buchung("2026-08-05", -1000)];
    const alle = [anker("2026-07-31", 47000), anker("2026-08-31", 106000)];
    const mitFalschem = abweichungsfenster(buchungen, alle, "giro");
    expect(mitFalschem).toEqual([{ von: "2026-07-31", bis: "2026-08-31", betrag: 60000 }]);
    // Dasselbe Ergebnis, egal was am Konto steht.
    expect(ankerAbweichung({ ...KONTO, saldo: 999999 }, buchungen, alle[1])).not.toBe(60000);
  });

  it("braucht mindestens zwei Anker — mit einem gibt es keinen Zeitraum", () => {
    expect(abweichungsfenster([buchung("2026-08-05", -1000)], [anker("2026-08-31", 1)], "giro")).toEqual([]);
  });
});

describe("bankAnker", () => {
  it("weist ein Datum zurück, das es nicht gibt", () => {
    // Ein krummer Stichtag sortierte falsch und ordnete eine Abweichung dem falschen
    // Zeitraum zu — schlimmer als gar kein Anker.
    expect(() => bankAnker("giro", 100, "2026-02-31", "2026-02-28T10:00:00.000Z")).toThrow(FachlicherFehler);
  });

  it("übernimmt Stichtag und Erfassungszeitpunkt getrennt", () => {
    const a = bankAnker("giro", [Betrag], "2026-08-20", "2026-08-20T22:47:25.284Z");
    expect(a).toEqual({
      kontoId: "giro", datum: "2026-08-20", herkunft: "bank",
      betrag: [Betrag], erfasstAm: "2026-08-20T22:47:25.284Z",
    });
  });
});
