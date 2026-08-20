// Tests der Konten-Sicht — Schwerpunkt Dublettenmarkierung im Ledger.
//
// Die Beträge und Namen sind erfunden; nachgebaut ist nur die FORM, in der die beiden
// Quellen sich unterscheiden (Finanzguru hängt den Kartennummern-Block an, die Bank
// stellt den Buchungstext voran) — das Repo ist öffentlich.

import { describe, expect, it } from "vitest";
import { kontenLaden, registerSicht, type KontenDeps } from "./kontensichten";
import type { ImportLauf, Umsatz } from "./import";
import type { IstBuchung, Zahlungskonto } from "../core";
import { freigabeAus, type Dublettenfreigabe } from "./dublettensicht";

const KONTO: Zahlungskonto = {
  id: "giro", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 0,
};

const LAEUFE: ImportLauf[] = [
  { id: "l-datei", quelle: "finanzguru", zeitpunkt: "2026-08-18T09:00:00.000Z", eingelesen: 2, neu: 2, duplikate: 0 },
  { id: "l-bank", quelle: "fints", zeitpunkt: "2026-08-19T09:00:00.000Z", eingelesen: 2, neu: 2, duplikate: 0 },
];

function buchung(over: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: "b1", datum: "2026-08-11", betrag: -5700, kontoId: "giro",
    charakter: "Aufwand", quelle: "import", ...over,
  };
}

function umsatz(over: Partial<Umsatz> = {}): Umsatz {
  return {
    id: "u1", laufId: "l-datei", zahlungskontoId: "giro", buchungstag: "2026-08-11",
    betrag: -5700, waehrung: "EUR", gegenpartei: "Musterladen",
    verwendungszweck: "Musterladen, Musterstadt", rohHash: "h1",
    status: "verbucht", istbuchungId: "b1", ...over,
  };
}

function deps(
  buchungen: IstBuchung[],
  umsaetze: Umsatz[],
  freigaben: Dublettenfreigabe[] = [],
): KontenDeps {
  return {
    kontoRepo: { async alle() { return [KONTO]; }, async speichern() {}, async loeschen() {} },
    ledger: {
      async alle() { return buchungen; },
      async speichern() {}, async loeschen() {},
    } as unknown as KontenDeps["ledger"],
    regelRepo: { async alle() { return []; }, async speichern() {}, async loeschen() {} },
    kategorieRepo: { async alle() { return []; }, async speichern() {}, async loeschen() {} },
    umsatzRepo: {
      async alle() { return umsaetze; },
      async offene() { return umsaetze.filter((u) => u.status === "neu"); },
    } as unknown as KontenDeps["umsatzRepo"],
    laufRepo: { async alle() { return LAEUFE; }, async speichern() {}, async loeschen() {} },
    freigabeRepo: {
      async alle() { return freigaben; },
      async speichern() {}, async entfernen() {},
    },
    ankerRepo: { async alle() { return []; }, async speichern() {}, async entfernen() {} },
    kontozuordnungen: async () => [],
  };
}

/** Dieselbe Zahlung, einmal aus der Datei und einmal von der Bank. */
const AUS_DATEI = umsatz({ id: "u-datei", laufId: "l-datei", istbuchungId: "b-datei" });
const AUS_BANK = umsatz({
  id: "u-bank", laufId: "l-bank", istbuchungId: "b-bank", rohHash: "h2",
  verwendungszweck: "Musterladen, Musterstadt DEKarte Nr 1",
});

describe("Dublettenmarkierung im Ledger", () => {
  it("markiert BEIDE Zeilen — es gibt kein Original", async () => {
    const sicht = await kontenLaden(
      deps([buchung({ id: "b-datei" }), buchung({ id: "b-bank" })], [AUS_DATEI, AUS_BANK]),
    );
    expect(sicht.dublettenverdacht.get("b-datei")?.zwillingIstId).toBe("b-bank");
    expect(sicht.dublettenverdacht.get("b-bank")?.zwillingIstId).toBe("b-datei");
  });

  it("schweigt bei zwei gleichen Zahlungen AUS DEMSELBEN Lauf", async () => {
    // Der Import hat über genau diese Menge schon entschieden und beide durchgelassen.
    // Am echten Bestand waren solche Paare durchweg echte Mehrfachzahlungen: derselbe
    // Übertrag mehrmals an einem Tag, zweimal derselbe Anbieter.
    const a = umsatz({ id: "u-a", istbuchungId: "b-a" });
    const b = umsatz({ id: "u-b", istbuchungId: "b-b", rohHash: "h2" });
    const sicht = await kontenLaden(
      deps([buchung({ id: "b-a" }), buchung({ id: "b-b" })], [a, b]),
    );
    expect(sicht.dublettenverdacht.size).toBe(0);
  });

  it("prüft je Konto getrennt", async () => {
    const fremd = umsatz({ id: "u-fremd", laufId: "l-bank", zahlungskontoId: "bar", istbuchungId: "b-fremd" });
    const sicht = await kontenLaden(
      deps([buchung({ id: "b-datei" }), buchung({ id: "b-fremd", kontoId: "bar" })], [AUS_DATEI, fremd]),
    );
    expect(sicht.dublettenverdacht.size).toBe(0);
  });

  it("lässt noch offene Zeilen aus — sie stehen nicht im Saldo", async () => {
    const offen = umsatz({ id: "u-offen", laufId: "l-bank", status: "neu", istbuchungId: undefined });
    const sicht = await kontenLaden(deps([buchung({ id: "b-datei" })], [AUS_DATEI, offen]));
    expect(sicht.dublettenverdacht.size).toBe(0);
  });

  it("schweigt, wenn die zweite Buchung gelöscht wurde", async () => {
    // Der gemeldete Fall: das Duplikat war aus dem Ledger entfernt, der Umsatz stand aber
    // weiter auf „verbucht" und zeigte auf eine Buchung, die es nicht mehr gibt. Im
    // Ledger war nichts mehr doppelt — angemahnt wurde es trotzdem.
    const sicht = await kontenLaden(
      deps([buchung({ id: "b-datei" })], [AUS_DATEI, AUS_BANK]), // „b-bank" fehlt im Ledger
    );
    expect(sicht.dublettenverdacht.size).toBe(0);
  });

  it("schweigt bei einem Paar, das von Hand freigegeben wurde", async () => {
    const sicht = await kontenLaden(
      deps(
        [buchung({ id: "b-datei" }), buchung({ id: "b-bank" })],
        [AUS_DATEI, AUS_BANK],
        [freigabeAus(AUS_BANK.id, AUS_DATEI.id, "2026-08-20T10:00:00.000Z")],
      ),
    );
    // Auch in der anderen Richtung angelegt — der Schlüssel ist richtungslos.
    expect(sicht.dublettenverdacht.size).toBe(0);
  });

  it("hängt den Befund an die Registerzeile", async () => {
    const sicht = await kontenLaden(
      deps([buchung({ id: "b-datei" }), buchung({ id: "b-bank" })], [AUS_DATEI, AUS_BANK]),
    );
    const register = registerSicht(sicht, KONTO, "2026-08-20", 30);
    expect(register.gebucht).toHaveLength(2);
    for (const zeile of register.gebucht) {
      expect(zeile.dublette?.urteil).toBe("identisch");
      expect(zeile.dublette?.gruende.length).toBeGreaterThan(0);
    }
  });
});
