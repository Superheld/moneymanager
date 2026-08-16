// Inventar-Use-Cases.
//
// Der Gegenstand steht seit 2026-08-16 für sich: kein abgeleiteter Ersatz-Topf mehr,
// keine Kopplung zweier Aggregate. Was bleibt, ist die Validierung an der Grenze — und
// die neue Zuordnung eines Rücklagenkontos, gegen dessen realen Stand die Rechnung
// später abgeglichen wird.

import { describe, expect, it } from "vitest";
import type { Inventargegenstand } from "../core";
import type { InventarRepository } from "./ports";
import {
  inventarAktualisieren,
  inventarAnlegen,
  inventarErsetzt,
  inventarLoeschen,
  type InventarEingabe,
} from "./inventarAnlegen";

function memInventar() {
  const daten: Inventargegenstand[] = [];
  const repo: InventarRepository = {
    alle: async () => daten,
    speichern: async (g) => {
      const i = daten.findIndex((x) => x.id === g.id);
      if (i >= 0) daten[i] = g;
      else daten.push(g);
    },
    loeschen: async (id) => {
      const i = daten.findIndex((x) => x.id === id);
      if (i >= 0) daten.splice(i, 1);
    },
  };
  return { repo, daten };
}

const gueltig: InventarEingabe = {
  bezeichnung: "Waschmaschine",
  wiederbeschaffung: 60000,
  nutzungsdauerMonate: 120,
  anschaffung: "2024-01-01",
};

describe("inventarAnlegen", () => {
  it("legt einen Gegenstand mit getrimmter Bezeichnung an", async () => {
    const { repo, daten } = memInventar();
    const g = await inventarAnlegen(repo, { ...gueltig, bezeichnung: "  Waschmaschine  " });
    expect(g.bezeichnung).toBe("Waschmaschine");
    expect(daten).toHaveLength(1);
  });

  it("rundet die Nutzungsdauer auf ganze Monate", async () => {
    const { repo } = memInventar();
    const g = await inventarAnlegen(repo, { ...gueltig, nutzungsdauerMonate: 119.6 });
    expect(g.nutzungsdauerMonate).toBe(120);
  });

  it("lehnt leere Bezeichnung, Betrag 0 und Nutzungsdauer 0 ab", async () => {
    const { repo } = memInventar();
    await expect(inventarAnlegen(repo, { ...gueltig, bezeichnung: "   " })).rejects.toThrow(
      "bezeichnung.fehlt",
    );
    await expect(inventarAnlegen(repo, { ...gueltig, wiederbeschaffung: 0 })).rejects.toThrow(
      "wiederbeschaffung.groesserNull",
    );
    await expect(inventarAnlegen(repo, { ...gueltig, nutzungsdauerMonate: 0 })).rejects.toThrow(
      "nutzungsdauer.groesserNull",
    );
  });

  // Runden VOR dem Prüfen: sonst besteht 0.4 die Schwelle und wird danach zu 0 — die
  // Rücklage teilte dann durch null und jede Folgerechnung würde NaN.
  it("lehnt eine Nutzungsdauer ab, die erst durch das Runden zu 0 würde", async () => {
    const { repo, daten } = memInventar();
    await expect(inventarAnlegen(repo, { ...gueltig, nutzungsdauerMonate: 0.4 })).rejects.toThrow(
      "nutzungsdauer.groesserNull",
    );
    expect(daten).toHaveLength(0);
  });

  it("lehnt ein unplausibles Anschaffungsdatum ab", async () => {
    const { repo } = memInventar();
    await expect(inventarAnlegen(repo, { ...gueltig, anschaffung: "01.01.2024" })).rejects.toThrow(
      "anschaffung.ungueltig",
    );
  });

  it("lässt leere Kategorie und leeres Konto zu undefined werden statt zu leeren Strings", async () => {
    const { repo } = memInventar();
    const g = await inventarAnlegen(repo, { ...gueltig, kategorieId: "", kontoId: "" });
    expect(g.kategorieId).toBeUndefined();
    expect(g.kontoId).toBeUndefined();
  });

  it("merkt sich das Rücklagenkonto", async () => {
    const { repo } = memInventar();
    const g = await inventarAnlegen(repo, { ...gueltig, kontoId: "giro" });
    expect(g.kontoId).toBe("giro");
  });
});

describe("inventarAktualisieren", () => {
  it("behält die ID und übernimmt die Änderung", async () => {
    const { repo, daten } = memInventar();
    const g = await inventarAnlegen(repo, gueltig);

    await inventarAktualisieren(repo, g.id, {
      ...gueltig,
      bezeichnung: "Waschmaschine (neu)",
      wiederbeschaffung: 80000,
      kontoId: "tagesgeld",
    });

    expect(daten).toHaveLength(1);
    expect(daten[0].id).toBe(g.id);
    expect(daten[0].bezeichnung).toBe("Waschmaschine (neu)");
    expect(daten[0].wiederbeschaffung).toBe(80000);
    expect(daten[0].kontoId).toBe("tagesgeld");
  });

  it("prüft dieselben Regeln wie beim Anlegen", async () => {
    const { repo } = memInventar();
    const g = await inventarAnlegen(repo, gueltig);
    await expect(
      inventarAktualisieren(repo, g.id, { ...gueltig, bezeichnung: " " }),
    ).rejects.toThrow("bezeichnung.fehlt");
    await expect(
      inventarAktualisieren(repo, g.id, { ...gueltig, anschaffung: "kaputt" }),
    ).rejects.toThrow("anschaffung.ungueltig");
  });
});

describe("inventarErsetzt", () => {
  it("setzt die Anschaffung neu und lässt den Wert stehen, wenn keiner kommt", async () => {
    const { repo, daten } = memInventar();
    const g = await inventarAnlegen(repo, { ...gueltig, kontoId: "giro" });

    const neu = await inventarErsetzt(repo, g, "2026-08-16");

    expect(neu.anschaffung).toBe("2026-08-16");
    expect(neu.wiederbeschaffung).toBe(60000);
    expect(neu.kontoId).toBe("giro"); // die Zuordnung überlebt den Zyklus
    expect(daten).toHaveLength(1);
    expect(daten[0].id).toBe(g.id);
  });

  it("zieht den Wiederbeschaffungswert nach, wenn einer angegeben ist", async () => {
    const { repo } = memInventar();
    const g = await inventarAnlegen(repo, gueltig);
    const neu = await inventarErsetzt(repo, g, "2026-08-16", 75000);
    expect(neu.wiederbeschaffung).toBe(75000);
  });

  // Bucht nichts: der Kauf ist eine normale Ausgabe vom Konto und senkt den realen Stand
  // ohnehin — eine zweite, kalkulatorische Buchung zählte dieselbe Bewegung doppelt.
  it("prüft Datum und Wert", async () => {
    const { repo } = memInventar();
    const g = await inventarAnlegen(repo, gueltig);
    await expect(inventarErsetzt(repo, g, "16.08.2026")).rejects.toThrow("anschaffung.ungueltig");
    await expect(inventarErsetzt(repo, g, "2026-08-16", 0)).rejects.toThrow(
      "wiederbeschaffung.groesserNull",
    );
  });
});

describe("inventarLoeschen", () => {
  it("löscht den Gegenstand", async () => {
    const { repo, daten } = memInventar();
    const g = await inventarAnlegen(repo, gueltig);
    await inventarLoeschen(repo, g.id);
    expect(daten).toHaveLength(0);
  });
});
