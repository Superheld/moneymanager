// Inventar-Use-Cases: Gegenstand + abgeleiteter Ersatz-Topf.
//
// Der Kernpunkt dieser Schicht ist die Kopplung: ein Gegenstand, für den gespart wird,
// ist für den Nutzer EINE Einheit — im Modell sind es zwei Aggregate in zwei Kontexten
// (Stammdaten und Planung). Diese Tests halten fest, dass die beiden zusammenbleiben:
// beim Anlegen, beim Ändern (IDs bleiben erhalten) und beim Löschen.

import { describe, expect, it } from "vitest";
import type { Inventargegenstand, Topf } from "../core";
import type { InventarRepository, TopfRepository } from "./ports";
import {
  ersatztopfAusInventar,
  inventarAktualisieren,
  inventarAnlegen,
  inventarLoeschen,
  inventarMitTopfAnlegen,
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

function memToepfe() {
  const daten: Topf[] = [];
  const repo: TopfRepository = {
    alle: async () => daten,
    speichern: async (t) => {
      const i = daten.findIndex((x) => x.id === t.id);
      if (i >= 0) daten[i] = t;
      else daten.push(t);
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

  it("lehnt ein unplausibles Anschaffungsdatum ab", async () => {
    const { repo } = memInventar();
    await expect(inventarAnlegen(repo, { ...gueltig, anschaffung: "01.01.2024" })).rejects.toThrow(
      "anschaffung.ungueltig",
    );
  });

  it("lässt eine leere Kategorie zu undefined werden statt zu einem leeren String", async () => {
    const { repo } = memInventar();
    const g = await inventarAnlegen(repo, { ...gueltig, kategorieId: "" });
    expect(g.kategorieId).toBeUndefined();
  });
});

describe("ersatztopfAusInventar", () => {
  it("übernimmt Zielwert, Nutzungsdauer und Rückverweis", async () => {
    const inv = memInventar();
    const toepfe = memToepfe();
    const g = await inventarAnlegen(inv.repo, gueltig);
    const topf = await ersatztopfAusInventar(toepfe.repo, g);

    expect(topf.typ).toBe("ersatz");
    expect(topf.wiederbeschaffung).toBe(60000);
    expect(topf.nutzungsdauerMonate).toBe(120);
    expect(topf.inventarId).toBe(g.id);
    expect(toepfe.daten).toHaveLength(1);
  });
});

describe("inventarMitTopfAnlegen", () => {
  it("legt Gegenstand und Topf in einem Schritt an", async () => {
    const inv = memInventar();
    const toepfe = memToepfe();
    const { gegenstand, topf } = await inventarMitTopfAnlegen(inv.repo, toepfe.repo, gueltig);

    expect(inv.daten).toHaveLength(1);
    expect(toepfe.daten).toHaveLength(1);
    expect(topf.inventarId).toBe(gegenstand.id);
  });

  it("legt bei ungültiger Eingabe auch keinen Topf an", async () => {
    const inv = memInventar();
    const toepfe = memToepfe();
    await expect(
      inventarMitTopfAnlegen(inv.repo, toepfe.repo, { ...gueltig, wiederbeschaffung: -1 }),
    ).rejects.toThrow();
    expect(inv.daten).toHaveLength(0);
    expect(toepfe.daten).toHaveLength(0);
  });
});

describe("inventarAktualisieren", () => {
  it("behält beide IDs und zieht den Topf mit", async () => {
    const inv = memInventar();
    const toepfe = memToepfe();
    const { gegenstand, topf } = await inventarMitTopfAnlegen(inv.repo, toepfe.repo, gueltig);

    await inventarAktualisieren(inv.repo, toepfe.repo, gegenstand.id, {
      ...gueltig,
      bezeichnung: "Waschmaschine (neu)",
      wiederbeschaffung: 80000,
    });

    expect(inv.daten).toHaveLength(1);
    expect(inv.daten[0].id).toBe(gegenstand.id);
    expect(inv.daten[0].bezeichnung).toBe("Waschmaschine (neu)");

    // Entscheidend: derselbe Topf wird aktualisiert, kein zweiter angelegt.
    expect(toepfe.daten).toHaveLength(1);
    expect(toepfe.daten[0].id).toBe(topf.id);
    const aktualisiert = toepfe.daten[0];
    expect(aktualisiert.typ === "ersatz" && aktualisiert.wiederbeschaffung).toBe(80000);
  });

  it("legt einen fehlenden Topf nach, statt die Änderung ohne Topf zu lassen", async () => {
    const inv = memInventar();
    const toepfe = memToepfe();
    const g = await inventarAnlegen(inv.repo, gueltig); // bewusst ohne Topf

    await inventarAktualisieren(inv.repo, toepfe.repo, g.id, gueltig);

    expect(toepfe.daten).toHaveLength(1);
    expect(toepfe.daten[0].typ === "ersatz" && toepfe.daten[0].inventarId).toBe(g.id);
  });

  it("prüft dieselben Regeln wie beim Anlegen", async () => {
    const inv = memInventar();
    const toepfe = memToepfe();
    const g = await inventarAnlegen(inv.repo, gueltig);
    await expect(
      inventarAktualisieren(inv.repo, toepfe.repo, g.id, { ...gueltig, bezeichnung: " " }),
    ).rejects.toThrow("bezeichnung.fehlt");
    await expect(
      inventarAktualisieren(inv.repo, toepfe.repo, g.id, { ...gueltig, anschaffung: "kaputt" }),
    ).rejects.toThrow("anschaffung.ungueltig");
  });
});

describe("inventarLoeschen", () => {
  it("löscht Gegenstand und zugehörigen Topf zusammen", async () => {
    const inv = memInventar();
    const toepfe = memToepfe();
    const { gegenstand } = await inventarMitTopfAnlegen(inv.repo, toepfe.repo, gueltig);

    await inventarLoeschen(inv.repo, toepfe.repo, gegenstand.id);

    expect(inv.daten).toHaveLength(0);
    expect(toepfe.daten).toHaveLength(0);
  });

  it("lässt fremde Töpfe unangetastet", async () => {
    const inv = memInventar();
    const toepfe = memToepfe();
    const { gegenstand } = await inventarMitTopfAnlegen(inv.repo, toepfe.repo, gueltig);
    await toepfe.repo.speichern({
      id: "fremd", typ: "spartopf", bezeichnung: "Urlaub", start: "2026-01-01",
      zufuehrungProMonat: 5000,
    });

    await inventarLoeschen(inv.repo, toepfe.repo, gegenstand.id);

    expect(toepfe.daten).toHaveLength(1);
    expect(toepfe.daten[0].id).toBe("fremd");
  });
});
