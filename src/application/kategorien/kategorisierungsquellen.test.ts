import { describe, expect, it } from "vitest";
import {
  standardErkennung,
  trainieren,
  type Kategorie,
  type Kategoriefestlegung,
  type Vertrag,
  type Vertragserkennung,
} from "../../core";
import { kategorisierungsquellen } from "./kategorisierungsquellen";
import { vorschlagFuer } from "../import/vorschlag";
import type {
  GespeicherterAusschluss,
  KategoriefestlegungRepository,
  KategorieRepository,
  KlassifikatorRepository,
  MerkmalskonfigurationRepository,
  Modellstand,
  VertragRepository,
  VertragserkennungRepository,
} from "../ports";

const KATEGORIEN: Kategorie[] = [
  { id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" },
  { id: "k-abo", name: "Abos & Streaming", defaultCharakter: "Aufwand" },
];

function repos(over: {
  festlegungen?: Kategoriefestlegung[];
  vertraege?: Vertrag[];
  erkennungen?: Vertragserkennung[];
  modell?: Modellstand | null;
} = {}) {
  const ausschluesse: GespeicherterAusschluss[] = [];
  const kategorieRepo = { alle: async () => KATEGORIEN, speichern: async () => {}, loeschen: async () => {} } as KategorieRepository;
  const festlegungRepo = {
    alle: async () => over.festlegungen ?? [], speichern: async () => {}, loeschen: async () => {},
  } as KategoriefestlegungRepository;
  const vertragRepo = { alle: async () => over.vertraege ?? [], speichern: async () => {}, loeschen: async () => {} } as VertragRepository;
  const erkennungRepo = {
    alle: async () => over.erkennungen ?? [], speichern: async () => {}, loeschen: async () => {},
  } as VertragserkennungRepository;
  const klassifikatorRepo: KlassifikatorRepository = {
    laden: async () => over.modell ?? null,
    speichern: async () => {},
  };
  const merkmalRepo: MerkmalskonfigurationRepository = {
    herkuenfteLesen: async () => null,
    herkuenfteSetzen: async () => {},
    ausschluesseLesen: async () => ausschluesse,
    ausschlussSetzen: async (a) => { ausschluesse.push(a); },
    ausschlussEntfernen: async () => {},
  };
  return { kategorieRepo, festlegungRepo, vertragRepo, erkennungRepo, klassifikatorRepo, merkmalRepo };
}

const ZAHLUNG = {
  buchungstag: "2026-03-01",
  betrag: -999,
  gegenpartei: "Kesselmann International BV",
  verwendungszweck: "Abo",
};

describe("Quellen laden", () => {
  it("liefert beide Kategorie-Indizes", async () => {
    const q = await kategorisierungsquellen(repos());
    expect(q.katalogNachName.get("lebensmittel")?.id).toBe("k-le");
    expect(q.kategorieNachId.get("k-le")?.name).toBe("Lebensmittel");
  });

  it("nimmt Verträge mit Kategorie samt ihrer Regeln auf", async () => {
    const q = await kategorisierungsquellen(
      repos({
        vertraege: [{ id: "v1", anbieter: "Kesselmann", beginn: "2026-01-01", verlaengerung: "keine", status: "aktiv", kategorieId: "k-abo" }],
        erkennungen: [standardErkennung("v1", "Kesselmann International", 999)],
      }),
    );
    expect(q.vertragsKategorie?.get("v1")).toBe("k-abo");
    expect(vorschlagFuer(ZAHLUNG, q)?.kategorieId).toBe("k-abo");
  });

  it("lässt Regeln weg, wenn kein Vertrag eine Kategorie trägt", async () => {
    // Sonst liefe der Abgleich über den ganzen Regelsatz für ein Ergebnis, das feststeht.
    const q = await kategorisierungsquellen(
      repos({
        vertraege: [{ id: "v1", anbieter: "Kesselmann", beginn: "2026-01-01", verlaengerung: "keine", status: "aktiv" }],
        erkennungen: [standardErkennung("v1", "Kesselmann International", 999)],
      }),
    );
    expect(q.erkennungen).toBeUndefined();
    expect(q.vertragsKategorie).toBeUndefined();
  });

  it("nimmt ein trainiertes Modell auf", async () => {
    const q = await kategorisierungsquellen(
      repos({
        modell: {
          modell: trainieren([
            { merkmale: ["emp=kesselmann international", "vwz:abo"], kategorieId: "k-abo" },
            { merkmale: ["emp=rewe markt"], kategorieId: "k-le" },
          ]),
          trainiertAm: "2026-08-17T10:00:00.000Z",
        },
      }),
    );
    expect(vorschlagFuer(ZAHLUNG, q)).toEqual({ kategorieId: "k-abo", charakter: "Aufwand", quelle: "ki" });
  });

  it("lässt ein leeres Modell weg", async () => {
    // Es würde nichts liefern und die Kette nur durchlaufen.
    const q = await kategorisierungsquellen(
      repos({ modell: { modell: trainieren([]), trainiertAm: "2026-08-17T10:00:00.000Z" } }),
    );
    expect(q.modell).toBeUndefined();
  });

  it("legt beim ersten Laden die Merkmalskonfiguration an", async () => {
    const r = repos();
    const q = await kategorisierungsquellen(r);
    expect(q.merkmale?.ausschluesse.length).toBeGreaterThan(0);
    expect(await r.merkmalRepo.ausschluesseLesen()).not.toHaveLength(0);
  });

  it("nimmt die Festlegungen auf", async () => {
    const q = await kategorisierungsquellen(
      repos({ festlegungen: [{ muster: "kesselmann international", kategorieId: "k-abo", angelegtAm: "2026-08-17T10:00:00.000Z" }] }),
    );
    expect(vorschlagFuer(ZAHLUNG, q)?.quelle).toBe("festlegung");
  });

  it("lässt eine leere Festlegungsliste weg", async () => {
    expect((await kategorisierungsquellen(repos())).festlegungen).toBeUndefined();
  });

  it("kommt ohne die optionalen Repositories aus", async () => {
    // Der Zustand einer frisch aufgesetzten App: nur der Kategorie-Katalog steht.
    const { kategorieRepo } = repos();
    const q = await kategorisierungsquellen({ kategorieRepo });
    expect(q.erkennungen).toBeUndefined();
    expect(q.modell).toBeUndefined();
    expect(q.katalogNachName.size).toBe(2);
  });
});
