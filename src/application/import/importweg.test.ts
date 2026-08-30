// Der Weg einer Rohzeile bis zur Buchung — uebernehmen UND verbuchen in einem Lauf.
//
// Es gibt ihn, weil beide Use-Cases einzeln gut abgedeckt sind und die NAHT dazwischen
// trotzdem nicht: `umsaetzeUebernehmen` baut den Vorschlag, `umsaetzeVerbuchen` liest ihn,
// und was die eine Seite als „Umbuchung" markiert, muss die andere richtig deuten. Diese
// Uebergabe lief bis 2026-08-29 falsch, ohne dass ein Test es sah — beide Seiten waren
// fuer sich gruen.
//
// Bewusst mit Attrappen statt SQLite: geprueft wird die Uebergabe, nicht die Persistenz.

import { describe, expect, it } from "vitest";
import type { Kategorie, IstBuchung, Zahlungskonto } from "../../core";
import type { ImportLauf } from "./importLauf";
import type {
  ImportLaufRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  ZahlungskontoRepository,
} from "../ports";
import type { RohUmsatz } from "./rohUmsatz";
import type { Umsatz } from "./umsatz";
import { umsaetzeUebernehmen } from "./umsaetzeUebernehmen";
import { umsaetzeVerbuchen } from "./umsatzVerbuchen";

function roh(over: Partial<RohUmsatz>): RohUmsatz {
  return {
    buchungstag: "2026-07-10", betrag: -4200, waehrung: "EUR",
    gegenpartei: "Vibora Handel", verwendungszweck: "Bestellung",
    istUmbuchung: false, quelle: "bank", kontoIban: "DE1", ...over,
  };
}

function welt() {
  const konten: Zahlungskonto[] = [];
  const umsaetze: Umsatz[] = [];
  const laeufe: ImportLauf[] = [];
  const ledger: IstBuchung[] = [];
  const kategorien: Kategorie[] = [{ id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" }];
  let n = 0;

  const kontoRepo: ZahlungskontoRepository = {
    alle: async () => konten,
    speichern: async (k) => { konten.push(k); },
    loeschen: async () => {},
  };
  const kategorieRepo: KategorieRepository = {
    alle: async () => kategorien, speichern: async () => {}, loeschen: async () => {},
  };
  const umsatzRepo: UmsatzRepository = {
    anlegen: async (u) => { umsaetze.push(u); },
    anlegenViele: async (us) => { umsaetze.push(...us); },
    speichern: async (u) => {
      const i = umsaetze.findIndex((x) => x.id === u.id);
      if (i >= 0) umsaetze[i] = u; else umsaetze.push(u);
    },
    ergaenzen: async () => {},
    alle: async () => umsaetze,
    nachLauf: async (id) => umsaetze.filter((u) => u.laufId === id),
    offene: async () => umsaetze.filter((u) => u.status === "neu"),
    loeschen: async () => {},
    bestandsSchluessel: async () => ({
      hashes: umsaetze.map((u) => u.rohHash),
      nativeIds: umsaetze.flatMap((u) => (u.nativeId ? [u.nativeId] : [])),
    }),
  };
  const laufRepo: ImportLaufRepository = {
    alle: async () => laeufe, speichern: async (l) => { laeufe.push(l); }, loeschen: async () => {},
  };
  const ledgerRepo: LedgerPort = {
    alle: async () => ledger,
    speichern: async (b) => { ledger.push(b); },
    loeschen: async () => {},
  };
  const id = () => `id${n++}`;
  return {
    ledger, umsaetze, konten,
    uebernahme: { kontoRepo, kategorieRepo, umsatzRepo, laufRepo, id },
    verbuchung: { ledgerRepo, umsatzRepo, id },
  };
}

async function fahre(rohUmsaetze: RohUmsatz[], konten: string[]) {
  const w = welt();
  await umsaetzeUebernehmen(
    {
      quelle: "bank",
      zeitpunkt: "2026-07-11T10:00:00.000Z",
      rohUmsaetze,
      konten: konten.map((iban) => ({
        quelleKey: iban,
        neu: { bezeichnung: `Konto ${iban}`, typ: "Giro", iban },
      })),
    },
    w.uebernahme,
  );
  await umsaetzeVerbuchen(await w.uebernahme.umsatzRepo.offene(), w.verbuchung);
  return w;
}

describe("Rohzeile bis Buchung", () => {
  /**
   * Zwei Beine derselben Umbuchung, beide Konten im Bestand: das ist ein Transfer. Sie
   * bekommen eine gemeinsame `transferId`, das Gegenkonto und den Charakter Umschichtung.
   */
  it("paart zwei Umbuchungs-Beine zu einem Transfer", async () => {
    const w = await fahre(
      [
        roh({ kontoIban: "DE1", betrag: -30000, istUmbuchung: true, gegenpartei: "Eigen" }),
        roh({ kontoIban: "DE2", betrag: 30000, istUmbuchung: true, gegenpartei: "Eigen" }),
      ],
      ["DE1", "DE2"],
    );
    expect(w.ledger).toHaveLength(2);
    expect(w.ledger.every((b) => b.charakter === "Umschichtung")).toBe(true);
    expect(w.ledger[0].transferId).toBe(w.ledger[1].transferId);
    expect(w.ledger[0].transferId).toBeTruthy();
    expect(w.ledger[0].gegenkontoId).toBe(w.ledger[1].kontoId);
  });

  /**
   * DER Fall dieser Naht: dasselbe Bein, aber das Gegenkonto liegt nicht im Bestand.
   *
   * Eine Umbuchung ohne Gegenbuchung gibt es nicht — das Geld hat den erfassten Bereich
   * verlassen, und das ist ein Abfluss. Bis 2026-08-29 entstand hier eine einseitige
   * Umschichtung: sie zaehlte in kein Budget und in keine Ausgabe, das Geld war weg und
   * fehlte nirgends.
   */
  it("bucht ein Umbuchungs-Bein OHNE Gegenstueck als Aufwand, nicht als Umschichtung", async () => {
    const w = await fahre(
      [roh({ kontoIban: "DE1", betrag: -30000, istUmbuchung: true, gegenpartei: "Eigen" })],
      ["DE1"],
    );
    expect(w.ledger).toHaveLength(1);
    expect(w.ledger[0].charakter).toBe("Aufwand");
    expect(w.ledger[0].transferId).toBeUndefined();
    // Ohne Kategorie — welche Ausgabe es war, entscheidet der Mensch in der Inbox.
    expect(w.ledger[0].kategorieId).toBeUndefined();
  });

  it("ein ungepaarter ZUFLUSS wird entsprechend zum Ertrag", async () => {
    const w = await fahre(
      [roh({ kontoIban: "DE1", betrag: 30000, istUmbuchung: true, gegenpartei: "Eigen" })],
      ["DE1"],
    );
    expect(w.ledger[0].charakter).toBe("Ertrag");
  });

  /**
   * Die Belegfelder ueberleben den Weg. `endempfaenger` steht NEBEN `gegenpartei`: dort
   * bleibt der Zahlungsdienstleister, und wer die Zahlung wirklich bekommt, ist eine
   * eigene Angabe — fuer die Kategorie-Erkennung der erheblichere Teil, weil der
   * Dienstleister bei jedem Haendler derselbe ist.
   */
  it("traegt Endempfaenger und Zweckcode bis in den gespeicherten Beleg", async () => {
    const w = await fahre(
      [
        roh({
          kontoIban: "DE1",
          gegenpartei: "Zahlungsdienst Norderwiek",
          endempfaenger: "Bierbaum Versand",
          zweckCode: "OTHR",
        }),
      ],
      ["DE1"],
    );
    expect(w.umsaetze).toHaveLength(1);
    expect(w.umsaetze[0].gegenpartei).toBe("Zahlungsdienst Norderwiek");
    expect(w.umsaetze[0].endempfaenger).toBe("Bierbaum Versand");
    expect(w.umsaetze[0].zweckCode).toBe("OTHR");
  });
});
