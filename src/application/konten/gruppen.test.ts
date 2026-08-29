import { describe, expect, it } from "vitest";

import { FachlicherFehler, type Kontogruppe, type Zahlungskonto } from "../../core";
import type { KontogruppeRepository, ZahlungskontoRepository } from "../ports";
import { gruppensichten, kontogruppeSpeichern } from "./gruppen";

function gruppenRepo(start: Kontogruppe[] = []): KontogruppeRepository & { stand: Kontogruppe[] } {
  const stand = [...start];
  return {
    stand,
    async alle() {
      return [...stand];
    },
    async speichern(g) {
      const i = stand.findIndex((x) => x.id === g.id);
      if (i >= 0) stand[i] = g;
      else stand.push(g);
    },
    async loeschen(id) {
      const i = stand.findIndex((x) => x.id === id);
      if (i >= 0) stand.splice(i, 1);
    },
  };
}

const GIRO: Zahlungskonto = {
  id: "giro",
  bezeichnung: "Gemeinschaftskonto",
  typ: "Giro",
  klasse: "liquide",
  inhaberIds: [],
  saldo: 120000,
};
const BAR: Zahlungskonto = {
  id: "bar",
  bezeichnung: "Portemonnaie",
  typ: "Bargeld",
  klasse: "liquide",
  inhaberIds: [],
  saldo: 4500,
};
const TAGESGELD: Zahlungskonto = {
  id: "tagesgeld",
  bezeichnung: "Notgroschen",
  typ: "Tagesgeld",
  klasse: "ruecklage",
  inhaberIds: [],
  saldo: 300000,
};

const kontoRepo: ZahlungskontoRepository = {
  async alle() {
    return [GIRO, BAR, TAGESGELD];
  },
  async speichern() {},
  async loeschen() {},
};

describe("Kontogruppen speichern", () => {
  it("legt an und vergibt eine Id", async () => {
    const repo = gruppenRepo();
    const g = await kontogruppeSpeichern(repo, {
      bezeichnung: "Lebenshaltung",
      kontoIds: ["giro", "bar"],
    });
    expect(g.id).toBeTruthy();
    expect(repo.stand).toHaveLength(1);
    expect(repo.stand[0].kontoIds).toEqual(["giro", "bar"]);
  });

  it("ändert unter derselben Id, statt eine zweite anzulegen", async () => {
    const repo = gruppenRepo();
    const g = await kontogruppeSpeichern(repo, { bezeichnung: "Alt", kontoIds: ["giro"] });
    await kontogruppeSpeichern(repo, { bezeichnung: "Neu", kontoIds: ["bar"] }, g.id);
    expect(repo.stand).toHaveLength(1);
    expect(repo.stand[0]).toMatchObject({ bezeichnung: "Neu", kontoIds: ["bar"] });
  });

  it("weist eine Gruppe ohne Bezeichnung ab", async () => {
    await expect(
      kontogruppeSpeichern(gruppenRepo(), { bezeichnung: "   ", kontoIds: [] }),
    ).rejects.toBeInstanceOf(FachlicherFehler);
  });

  // Ein doppeltes Mitglied zählte sonst zweimal in jede Summe über die Gruppe — die
  // Gruppe zeigte dann einen Stand, den es nicht gibt.
  it("wirft doppelte Mitglieder weg", async () => {
    const repo = gruppenRepo();
    const g = await kontogruppeSpeichern(repo, {
      bezeichnung: "Doppelt",
      kontoIds: ["giro", "giro", "bar"],
    });
    expect(g.kontoIds).toEqual(["giro", "bar"]);
  });

  // Zwei Gruppen dürfen gleich heißen: es ist die Ordnung des Nutzers, und eine
  // erzwungene Eindeutigkeit verhinderte keinen Schaden.
  it("lässt zwei Gruppen mit demselben Namen zu", async () => {
    const repo = gruppenRepo();
    await kontogruppeSpeichern(repo, { bezeichnung: "Urlaub", kontoIds: ["giro"] });
    await kontogruppeSpeichern(repo, { bezeichnung: "Urlaub", kontoIds: ["bar"] });
    expect(repo.stand).toHaveLength(2);
  });

  it("erlaubt eine leere Gruppe — sie wird gerade erst gefüllt", async () => {
    const repo = gruppenRepo();
    await kontogruppeSpeichern(repo, { bezeichnung: "Noch leer", kontoIds: [] });
    expect(repo.stand[0].kontoIds).toEqual([]);
  });
});

describe("Gruppensichten", () => {
  it("löst die Mitglieder auf und summiert ihre Anfangsbestände", async () => {
    const repo = gruppenRepo([
      { id: "g1", bezeichnung: "Lebenshaltung", kontoIds: ["giro", "bar"] },
    ]);
    const [sicht] = await gruppensichten({ gruppeRepo: repo, kontoRepo });
    expect(sicht.konten.map((k) => k.id)).toEqual(["giro", "bar"]);
    expect(sicht.anfangsbestand).toBe(124500);
  });

  // Die Gruppe ist eine Sicht, keine Rechenregel: sie darf Konten verschiedener Klassen
  // bündeln, ohne dass sich an der Klasse etwas ändert.
  it("bündelt über Kontoklassen hinweg", async () => {
    const repo = gruppenRepo([{ id: "g1", bezeichnung: "Alles", kontoIds: ["bar", "tagesgeld"] }]);
    const [sicht] = await gruppensichten({ gruppeRepo: repo, kontoRepo });
    expect(sicht.konten.map((k) => k.klasse)).toEqual(["liquide", "ruecklage"]);
  });

  it("überspringt Mitglieder, zu denen es kein Konto mehr gibt", async () => {
    const repo = gruppenRepo([{ id: "g1", bezeichnung: "Rest", kontoIds: ["giro", "weg"] }]);
    const [sicht] = await gruppensichten({ gruppeRepo: repo, kontoRepo });
    expect(sicht.konten.map((k) => k.id)).toEqual(["giro"]);
    expect(sicht.anfangsbestand).toBe(120000);
  });
});
