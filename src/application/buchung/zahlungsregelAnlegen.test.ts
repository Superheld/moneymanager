// Use-Case „Zahlungsregel anlegen" — der Einstieg in die Plan-Schicht.
//
// Zentral ist die Vorzeichen-Regel: der Nutzer tippt einen positiven Betrag, die Richtung
// kommt aus dem Charakter. Läuft das auseinander, dreht sich in der Projektion ein Abfluss
// in einen Zufluss — und der Liquiditätsplan ist nicht bloss ungenau, sondern falsch herum.

import { describe, expect, it } from "vitest";
import type { Zahlungsregel } from "../../core";
import type { ZahlungsregelRepository } from "../ports";
import {
  vorzeichenbehaftet,
  zahlungsregelAnlegen,
  type ZahlungsregelEingabe,
} from "./zahlungsregelAnlegen";

function memRegeln() {
  const daten: Zahlungsregel[] = [];
  const repo: ZahlungsregelRepository = {
    alle: async () => daten,
    speichern: async (r) => {
      daten.push(r);
    },
    loeschen: async (id) => {
      const i = daten.findIndex((x) => x.id === id);
      if (i >= 0) daten.splice(i, 1);
    },
  };
  return { repo, daten };
}

const gueltig: ZahlungsregelEingabe = {
  bezeichnung: "Miete",
  betrag: 90000,
  rhythmus: "monatlich",
  charakter: "Aufwand",
  startdatum: "2026-01-01",
};

describe("vorzeichenbehaftet", () => {
  it("macht Erträge positiv und Aufwände negativ", () => {
    expect(vorzeichenbehaftet(1000, "Ertrag")).toBe(1000);
    expect(vorzeichenbehaftet(1000, "Aufwand")).toBe(-1000);
  });

  it("ignoriert das Vorzeichen der Eingabe — der Charakter entscheidet", () => {
    // Sonst hinge die Richtung davon ab, ob der Nutzer ein Minus mitgetippt hat.
    expect(vorzeichenbehaftet(-1000, "Ertrag")).toBe(1000);
    expect(vorzeichenbehaftet(-1000, "Aufwand")).toBe(-1000);
  });

  it("behandelt Umschichtungen wie Abflüsse", () => {
    expect(vorzeichenbehaftet(1000, "Umschichtung")).toBe(-1000);
  });
});

describe("zahlungsregelAnlegen", () => {
  it("legt eine Regel an und speichert sie", async () => {
    const { repo, daten } = memRegeln();
    const r = await zahlungsregelAnlegen(repo, gueltig);
    expect(daten).toHaveLength(1);
    expect(r.bezeichnung).toBe("Miete");
    expect(r.rhythmus).toBe("monatlich");
    expect(r.startdatum).toBe("2026-01-01");
  });

  it("setzt das Vorzeichen aus dem Charakter", async () => {
    const { repo } = memRegeln();
    const aufwand = await zahlungsregelAnlegen(repo, gueltig);
    const ertrag = await zahlungsregelAnlegen(repo, {
      ...gueltig,
      bezeichnung: "Gehalt",
      charakter: "Ertrag",
    });
    expect(aufwand.betrag).toBe(-90000);
    expect(ertrag.betrag).toBe(90000);
  });

  it("trimmt die Bezeichnung und lehnt eine leere ab", async () => {
    const { repo } = memRegeln();
    const r = await zahlungsregelAnlegen(repo, { ...gueltig, bezeichnung: "  Miete  " });
    expect(r.bezeichnung).toBe("Miete");
    await expect(zahlungsregelAnlegen(repo, { ...gueltig, bezeichnung: "   " })).rejects.toThrow(
      "bezeichnung.fehlt",
    );
  });

  it("verlangt einen positiven, ganzzahligen Betrag in Minor Units", async () => {
    const { repo } = memRegeln();
    await expect(zahlungsregelAnlegen(repo, { ...gueltig, betrag: 0 })).rejects.toThrow(
      "betrag.groesserNull",
    );
    await expect(zahlungsregelAnlegen(repo, { ...gueltig, betrag: 10.5 })).rejects.toThrow(
      "betrag.groesserNull",
    );
    await expect(zahlungsregelAnlegen(repo, { ...gueltig, betrag: Infinity })).rejects.toThrow(
      "betrag.groesserNull",
    );
  });

  it("verlangt ein ISO-Startdatum", async () => {
    const { repo } = memRegeln();
    await expect(
      zahlungsregelAnlegen(repo, { ...gueltig, startdatum: "01.01.2026" }),
    ).rejects.toThrow("startdatum.ungueltig");
  });

  it("macht leere Konto- und Kategoriebezüge zu undefined statt zu leeren Strings", async () => {
    const { repo } = memRegeln();
    const r = await zahlungsregelAnlegen(repo, { ...gueltig, kontoId: "", kategorieId: "" });
    expect(r.kontoId).toBeUndefined();
    expect(r.kategorieId).toBeUndefined();
  });

  it("behält gesetzte Konto- und Kategoriebezüge", async () => {
    const { repo } = memRegeln();
    const r = await zahlungsregelAnlegen(repo, { ...gueltig, kontoId: "k1", kategorieId: "kat1" });
    expect(r.kontoId).toBe("k1");
    expect(r.kategorieId).toBe("kat1");
  });
});
