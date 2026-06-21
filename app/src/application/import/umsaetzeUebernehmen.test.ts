import { describe, expect, it } from "vitest";
import type { Kategorie, Zahlungskonto } from "../../core";
import type {
  ImportLaufRepository,
  KategorieRepository,
  UmsatzRepository,
  ZahlungskontoRepository,
} from "../ports";
import type { ImportLauf } from "./importLauf";
import type { RohUmsatz } from "./rohUmsatz";
import type { Umsatz } from "./umsatz";
import { umsaetzeUebernehmen, type UebernahmeDeps } from "./umsaetzeUebernehmen";

function roh(over: Partial<RohUmsatz>): RohUmsatz {
  return {
    buchungstag: "2022-01-01", betrag: -655, waehrung: "EUR", gegenpartei: "Trinkgut",
    verwendungszweck: "Kartenzahlung", istUmbuchung: false, quelle: "finanzguru", ...over,
  };
}

function fakes() {
  const konten: Zahlungskonto[] = [];
  const umsaetze: Umsatz[] = [];
  const laeufe: ImportLauf[] = [];
  const kategorien: Kategorie[] = [{ id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" }];
  let n = 0;

  const kontoRepo: ZahlungskontoRepository = {
    alle: async () => konten,
    speichern: async (k) => { konten.push(k); },
    loeschen: async () => {},
  };
  const kategorieRepo: KategorieRepository = {
    alle: async () => kategorien,
    speichern: async () => {},
    loeschen: async () => {},
  };
  const umsatzRepo: UmsatzRepository = {
    speichern: async (u) => { umsaetze.push(u); },
    speichernViele: async (us) => { umsaetze.push(...us); },
    nachLauf: async (laufId) => umsaetze.filter((u) => u.laufId === laufId),
    offene: async () => umsaetze.filter((u) => u.status === "neu"),
    loeschen: async () => {},
    bestandsSchluessel: async () => ({
      hashes: umsaetze.map((u) => u.rohHash),
      nativeIds: umsaetze.flatMap((u) => (u.nativeId ? [u.nativeId] : [])),
    }),
  };
  const laufRepo: ImportLaufRepository = {
    alle: async () => laeufe,
    speichern: async (l) => { laeufe.push(l); },
    loeschen: async () => {},
  };
  const deps: UebernahmeDeps = { kontoRepo, kategorieRepo, umsatzRepo, laufRepo, id: () => `id${n++}` };
  return { deps, konten, umsaetze, laeufe };
}

describe("umsaetzeUebernehmen", () => {
  it("legt fehlende Konten an, baut Vorschläge und schreibt den Entwurfs-Stapel", async () => {
    const { deps, konten, umsaetze, laeufe } = fakes();
    const r = await umsaetzeUebernehmen(
      {
        quelle: "finanzguru",
        dateiname: "export.csv",
        zeitpunkt: "2026-06-21T10:00:00Z",
        rohUmsaetze: [
          roh({ kontoIban: "DE111", kategorieHinweis: "Lebensmittel", nativeId: "n1" }),
          roh({ kontoIban: "DE111", istUmbuchung: true, gegenpartei: "Eigen", nativeId: "n2" }),
        ],
        konten: [{ quelleKey: "DE111", neu: { bezeichnung: "Giro", typ: "Giro", iban: "DE111" } }],
      },
      deps,
    );

    expect(r).toMatchObject({ eingelesen: 2, neu: 2, duplikate: 0, ohneKonto: 0, angelegteKonten: 1 });
    expect(konten).toHaveLength(1);
    expect(umsaetze).toHaveLength(2);
    expect(umsaetze.every((u) => u.zahlungskontoId === konten[0].id)).toBe(true);

    const normal = umsaetze.find((u) => u.nativeId === "n1")!;
    expect(normal.vorschlag).toEqual({ kategorieId: "k-le", charakter: "Aufwand", quelle: "remapping" });
    const umbuchung = umsaetze.find((u) => u.nativeId === "n2")!;
    expect(umbuchung.vorschlag).toEqual({ charakter: "Umschichtung", quelle: "umbuchung" });

    expect(laeufe[0]).toMatchObject({ quelle: "finanzguru", eingelesen: 2, neu: 2, duplikate: 0 });
  });

  it("dedupliziert gegen den Bestand beim zweiten Lauf (nichts doppelt gespeichert)", async () => {
    const { deps, umsaetze } = fakes();
    const eingabe = {
      quelle: "finanzguru",
      zeitpunkt: "2026-06-21T10:00:00Z",
      rohUmsaetze: [roh({ kontoIban: "DE111", nativeId: "n1" })],
      konten: [{ quelleKey: "DE111", neu: { bezeichnung: "Giro", typ: "Giro" as const, iban: "DE111" } }],
    };
    await umsaetzeUebernehmen(eingabe, deps);
    const zweiter = await umsaetzeUebernehmen(eingabe, deps);
    expect(zweiter).toMatchObject({ neu: 0, duplikate: 1 });
    expect(umsaetze).toHaveLength(1); // nur der erste Lauf
  });

  it("überspringt Buchungen ohne aufgelöstes Konto statt sie blind zu verbuchen", async () => {
    const { deps, umsaetze } = fakes();
    const r = await umsaetzeUebernehmen(
      {
        quelle: "finanzguru",
        zeitpunkt: "2026-06-21T10:00:00Z",
        rohUmsaetze: [roh({ kontoIban: "UNBEKANNT", nativeId: "n9" })],
        konten: [], // keine Auflösung
      },
      deps,
    );
    expect(r).toMatchObject({ neu: 0, ohneKonto: 1 });
    expect(umsaetze).toHaveLength(0);
  });
});
