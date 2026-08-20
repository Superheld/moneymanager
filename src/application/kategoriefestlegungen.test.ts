import { describe, expect, it } from "vitest";
import type { Kategoriefestlegung } from "../core";
import { festlegungAngebot, festlegungAufheben, festlegungSetzen } from "./kategoriefestlegungen";
import type { KategoriefestlegungRepository } from "./ports";

function repo() {
  const inhalt = new Map<string, Kategoriefestlegung>();
  const r: KategoriefestlegungRepository = {
    alle: async () => [...inhalt.values()],
    speichern: async (f) => { inhalt.set(f.muster, f); },
    loeschen: async (m) => { inhalt.delete(m); },
  };
  return r;
}

const UHR = () => "2026-08-17T10:00:00.000Z";

describe("Festlegung setzen", () => {
  it("speichert Muster, Kategorie und Zeitpunkt", async () => {
    const r = repo();
    await festlegungSetzen(r, "kesselmann international", "k-abo", UHR);
    expect(await r.alle()).toEqual([
      { muster: "kesselmann international", kategorieId: "k-abo", angelegtAm: "2026-08-17T10:00:00.000Z" },
    ]);
  });

  it("normalisiert das Muster", async () => {
    const r = repo();
    await festlegungSetzen(r, "  KESSELMANN  ", "k-abo", UHR);
    expect((await r.alle())[0].muster).toBe("kesselmann");
  });

  it("legt nichts an, wenn Muster oder Kategorie fehlen", async () => {
    // Eine leere Zeile in der Liste wäre eine Regel, die alles oder nichts trifft.
    const r = repo();
    expect(await festlegungSetzen(r, "   ", "k-abo", UHR)).toBeNull();
    expect(await festlegungSetzen(r, "kesselmann", "", UHR)).toBeNull();
    expect(await r.alle()).toHaveLength(0);
  });

  it("ersetzt eine vorhandene Aussage zum selben Muster", async () => {
    const r = repo();
    await festlegungSetzen(r, "rewe", "k-le", UHR);
    await festlegungSetzen(r, "rewe", "k-abo", UHR);
    const alle = await r.alle();
    expect(alle).toHaveLength(1);
    expect(alle[0].kategorieId).toBe("k-abo");
  });

  it("lässt sich wieder aufheben", async () => {
    const r = repo();
    await festlegungSetzen(r, "rewe", "k-le", UHR);
    await festlegungAufheben(r, "rewe");
    expect(await r.alle()).toHaveLength(0);
  });
});

describe("Angebot an die Oberfläche", () => {
  const bestand: Kategoriefestlegung[] = [
    { muster: "rewe markt", kategorieId: "k-le", angelegtAm: UHR() },
  ];

  it("schlägt die normalisierte Form des Empfängers vor", () => {
    expect(festlegungAngebot([], "KESSELMANN INTERNATIONAL BV", "k-abo")).toBe("kesselmann international");
  });

  it("schweigt, wenn genau das schon festgelegt ist", () => {
    // Das Angebot zu wiederholen ließe den Eindruck entstehen, es hätte nicht gewirkt.
    expect(festlegungAngebot(bestand, "REWE Markt", "k-le")).toBeNull();
  });

  it("bietet an, wenn dieselbe Gegenpartei anders festgelegt ist", () => {
    // Der Fall „ich habe mich damals vertan" — das Angebot ist hier der Weg zur Korrektur.
    expect(festlegungAngebot(bestand, "REWE Markt", "k-abo")).toBe("rewe markt");
  });

  it("schweigt ohne Empfänger oder ohne Kategorie", () => {
    expect(festlegungAngebot([], "", "k-abo")).toBeNull();
    expect(festlegungAngebot([], "REWE Markt", "")).toBeNull();
  });
});
