// Der Sammelweg über den Entwurfs-Stapel.

import { describe, expect, it } from "vitest";
import type { Kategorie } from "../../core";
import type { UmsatzRepository } from "../ports";
import type { Umsatz } from "./umsatz";
import { umsaetzeKategorisieren, umsaetzeVerwerfen } from "./umsaetzeSammelbearbeiten";

const lebensmittel: Kategorie = { id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" };
const sparen: Kategorie = { id: "k-sp", name: "Sparen & Anlegen", defaultCharakter: "Umschichtung" };

function umsatz(over: Partial<Umsatz> = {}): Umsatz {
  return {
    id: "u1",
    laufId: "l1",
    zahlungskontoId: "k1",
    buchungstag: "2026-01-05",
    betrag: -655,
    waehrung: "EUR",
    gegenpartei: "Kesselmann",
    verwendungszweck: "Kartenzahlung",
    rohHash: "h1",
    status: "neu",
    ...over,
  };
}

/** Ein Repository, das nur mitschreibt — geprüft wird, WAS gespeichert wurde. */
function repo(): UmsatzRepository & { gespeichert: Umsatz[] } {
  const gespeichert: Umsatz[] = [];
  return {
    gespeichert,
    speichern: async (u) => { gespeichert.push(u); },
    anlegenViele: async () => {},
    anlegen: async () => {},
    ergaenzen: async () => {},
    alle: async () => [],
    nachLauf: async () => [],
    offene: async () => [],
    loeschen: async () => {},
    bestandsSchluessel: async () => ({ hashes: [], nativeIds: [] }),
  };
}

describe("umsaetzeKategorisieren", () => {
  it("setzt dieselbe Kategorie an allen markierten Zeilen", async () => {
    const r = repo();
    const erg = await umsaetzeKategorisieren(
      r,
      [umsatz({ id: "a" }), umsatz({ id: "b" })],
      lebensmittel,
    );
    expect(erg).toEqual({ geaendert: 2, uebersprungen: 0 });
    expect(r.gespeichert.map((u) => u.vorschlag)).toEqual([
      { kategorieId: "k-le", charakter: "Aufwand", quelle: "manuell" },
      { kategorieId: "k-le", charakter: "Aufwand", quelle: "manuell" },
    ]);
  });

  it("nimmt den Charakter aus dem Katalog, nicht aus dem Vorzeichen", async () => {
    // Sonst käme eine Umschichtung als Aufwand herein und belastete ein Budget.
    const r = repo();
    await umsaetzeKategorisieren(r, [umsatz({ betrag: -10000 })], sparen);
    expect(r.gespeichert[0].vorschlag?.charakter).toBe("Umschichtung");
  });

  it("markiert die Herkunft als Handarbeit", async () => {
    // Woran später hängt, dass ein Training diese Zeile als Korrektur lesen darf.
    const r = repo();
    await umsaetzeKategorisieren(r, [umsatz({ vorschlag: { kategorieId: "k-alt", charakter: "Aufwand", quelle: "ki" } })], lebensmittel);
    expect(r.gespeichert[0].vorschlag?.quelle).toBe("manuell");
  });

  it("lässt Umbuchungen unangetastet und zählt sie", async () => {
    // **Die Regel, die der Sammelweg nicht aushebeln darf.** Die Einzelansicht bietet bei
    // einer Umbuchung gar keine Kategoriewahl an; dürfte der Stapelweg es trotzdem, wäre
    // er der bequeme Weg um die Regel herum — und aufgefallen wäre es an einer
    // Umschichtung, die plötzlich ein Budget belastet.
    const r = repo();
    const erg = await umsaetzeKategorisieren(
      r,
      [
        umsatz({ id: "a", vorschlag: { charakter: "Umschichtung", quelle: "umbuchung" } }),
        umsatz({ id: "b" }),
      ],
      lebensmittel,
    );
    expect(erg).toEqual({ geaendert: 1, uebersprungen: 1 });
    expect(r.gespeichert.map((u) => u.id)).toEqual(["b"]);
  });

  it("nimmt die Kategorie wieder weg, wenn keine übergeben wird", async () => {
    // Der Rückweg aus einer Sammelaktion, die danebenging: die Zeilen stehen wieder
    // unter „offen" statt mit einer falschen Kategorie unter „fertig".
    const r = repo();
    const erg = await umsaetzeKategorisieren(
      r,
      [umsatz({ vorschlag: { kategorieId: "k-le", charakter: "Aufwand", quelle: "ki" } })],
      undefined,
    );
    expect(erg.geaendert).toBe(1);
    expect(r.gespeichert[0].vorschlag).toBeUndefined();
  });
});

describe("umsaetzeVerwerfen", () => {
  it("legt alle markierten Zeilen weg, ohne sie zu löschen", async () => {
    const r = repo();
    expect(await umsaetzeVerwerfen(r, [umsatz({ id: "a" }), umsatz({ id: "b" })])).toBe(2);
    expect(r.gespeichert.map((u) => u.status)).toEqual(["verworfen", "verworfen"]);
  });
});
