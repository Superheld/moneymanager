import { describe, expect, it } from "vitest";
import {
  festlegungFuer,
  festlegungTrifft,
  musterVorschlag,
  type Kategoriefestlegung,
} from "./kategoriefestlegung";

function f(muster: string, kategorieId: string): Kategoriefestlegung {
  return { muster, kategorieId, angelegtAm: "2026-08-17T10:00:00.000Z" };
}

describe("Muster vorschlagen", () => {
  it("nimmt die normalisierte Form des Empfängers", () => {
    expect(musterVorschlag("NETFLIX INTERNATIONAL BV")).toBe("netflix international");
  });

  it("liefert leer, wenn nach der Normalisierung nichts übrig bleibt", () => {
    // Dann gibt es nichts festzulegen — die UI darf das Angebot gar nicht erst machen.
    expect(musterVorschlag("   ")).toBe("");
  });
});

describe("Trifft", () => {
  it("trifft den rohen Namen", () => {
    expect(festlegungTrifft(f("[anonymisiert] International BV", "k1"), "netflix international bv")).toBe(true);
  });

  it("trifft die normalisierte Form", () => {
    // Wer „netflix international" aus der Begründung abtippt, soll einen Treffer bekommen.
    expect(festlegungTrifft(f("netflix international", "k1"), "NETFLIX INTERNATIONAL BV")).toBe(true);
  });

  it("nimmt den Stern als beliebigen Text", () => {
    expect(festlegungTrifft(f("dm*", "k1"), "dm Filiale 4711")).toBe(true);
    expect(festlegungTrifft(f("dm*", "k1"), "[anonymisiert]")).toBe(false);
  });

  it("nimmt alles außer dem Stern wörtlich", () => {
    // Der Punkt darf kein „beliebiges Zeichen" sein, sonst träfe „a.b" auch „axb".
    expect(festlegungTrifft(f("a.b", "k1"), "axb")).toBe(false);
  });

  it("ein leeres Muster trifft nichts", () => {
    expect(festlegungTrifft(f("  ", "k1"), "irgendwer")).toBe(false);
  });
});

describe("Welche Festlegung gilt", () => {
  it("liefert null, wenn keine passt", () => {
    expect(festlegungFuer([f("rewe", "k1")], "[anonymisiert]")).toBeNull();
  });

  it("die schärfere schlägt die breitere", () => {
    // Die Ausnahme von der breiten Regel muss gewinnen — sonst wäre sie sinnlos.
    const treffer = festlegungFuer([f("dm*", "k-drogerie"), f("dm markt bonn", "k-lebensmittel")], "dm markt bonn");
    expect(treffer?.kategorieId).toBe("k-lebensmittel");
  });

  it("bei gleicher Schärfe entscheidet das Muster — stabil, nicht zufällig", () => {
    const liste = [f("z*x", "k-z"), f("a*x", "k-a")];
    expect(festlegungFuer(liste, "aVERSCHIEDENESx")?.kategorieId).toBe("k-a");
    // Dieselbe Liste andersherum ergibt dasselbe: sonst spränge ein rückwirkender
    // Abgleich bei jedem Lauf zwischen zwei Kategorien hin und her.
    expect(festlegungFuer([...liste].reverse(), "aVERSCHIEDENESx")?.kategorieId).toBe("k-a");
  });

  it("weniger Sterne schlagen mehr Sterne", () => {
    const treffer = festlegungFuer([f("*shell*", "k-breit"), f("shell tankstelle*", "k-eng")], "Shell Tankstelle 12");
    expect(treffer?.kategorieId).toBe("k-eng");
  });
});
