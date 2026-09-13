// Die Kategorie des Vertrags rückwirkend auf seine Zahlungen.
//
// Zwei Zusicherungen tragen diesen Use-Case, und sie ziehen in verschiedene Richtungen:
// er MUSS Handarbeit überschreiben (das ist der Anlass, aus dem man ihn auslöst) und er
// DARF eine geteilte Buchung nicht anfassen (dort stehen die Kategorien in den Teilen).
// Beide liegen deshalb einzeln hier.

import { describe, expect, it } from "vitest";
import type { IstBuchung, Kategorie, Vertrag, Vertragszuordnung } from "../../core";
import type {
  KategorieRepository,
  LedgerPort,
  VertragRepository,
  VertragszuordnungRepository,
} from "../ports";
import { vertragskategorieUebertragen } from "./vertragskategorie";

const KATEGORIEN: Kategorie[] = [
  { id: "kat-alt", name: "Sonstiges", defaultCharakter: "Aufwand", elternId: undefined },
  { id: "kat-vertrag", name: "Laufende Kosten", defaultCharakter: "Aufwand", elternId: undefined },
];

function buchung(id: string, felder: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id,
    datum: "2026-06-01",
    betrag: -4500,
    kontoId: "k1",
    kategorieId: "kat-alt",
    charakter: "Aufwand",
    quelle: "import",
    ...felder,
  };
}

function umgebung(buchungen: IstBuchung[], zuordnungen: Vertragszuordnung[], vertrag: Vertrag) {
  const bestand = new Map(buchungen.map((b) => [b.id, b]));
  const ledger: LedgerPort = {
    alle: async () => [...bestand.values()],
    speichern: async (b) => {
      bestand.set(b.id, b);
    },
    loeschen: async (id) => {
      bestand.delete(id);
    },
  } as LedgerPort;
  const zuordnungRepo: VertragszuordnungRepository = {
    alle: async () => zuordnungen,
    speichern: async () => {},
    loeschen: async () => {},
  };
  const vertragRepo = { alle: async () => [vertrag] } as VertragRepository;
  const kategorieRepo = { alle: async () => KATEGORIEN } as KategorieRepository;
  return { deps: { ledger, zuordnungRepo, vertragRepo, kategorieRepo }, bestand };
}

const VERTRAG: Vertrag = {
  id: "v1",
  anbieter: "Terhoven",
  beginn: "2026-01-01",
  verlaengerung: "automatisch",
  status: "aktiv",
  kategorieId: "kat-vertrag",
};

describe("vertragskategorieUebertragen", () => {
  it("schreibt die Vertragskategorie auf die zugeordneten Zahlungen", async () => {
    const { deps, bestand } = umgebung(
      [buchung("b1"), buchung("b2"), buchung("fremd")],
      [
        { istbuchungId: "b1", vertragId: "v1", herkunft: "automatisch" },
        { istbuchungId: "b2", vertragId: "v1", herkunft: "automatisch" },
      ],
      VERTRAG,
    );

    const ergebnis = await vertragskategorieUebertragen(deps, "v1");

    expect(ergebnis.geaendert).toBe(2);
    expect(bestand.get("b1")?.kategorieId).toBe("kat-vertrag");
    expect(bestand.get("b2")?.kategorieId).toBe("kat-vertrag");
    // Was dem Vertrag nicht zugeordnet ist, bleibt unberührt — auch wenn es dieselbe
    // alte Kategorie trug.
    expect(bestand.get("fremd")?.kategorieId).toBe("kat-alt");
  });

  it("setzt die Herkunft auf manuell, damit die Automatik es nicht zurückholt", async () => {
    const { deps, bestand } = umgebung(
      [buchung("b1", { kategorieHerkunft: "automatisch" })],
      [{ istbuchungId: "b1", vertragId: "v1", herkunft: "automatisch" }],
      VERTRAG,
    );

    await vertragskategorieUebertragen(deps, "v1");

    expect(bestand.get("b1")?.kategorieHerkunft).toBe("manuell");
  });

  it("überschreibt AUCH eine von Hand gesetzte Kategorie", async () => {
    // Genau der Anlass, aus dem jemand den Haken setzt: „ich habe das damals falsch
    // einsortiert, der Vertrag weiss es besser". Ein Schutz der Handarbeit wäre hier ein
    // Schutz gegen die Handlung, die gerade ausgelöst wurde.
    const { deps, bestand } = umgebung(
      [buchung("b1", { kategorieHerkunft: "manuell" })],
      [{ istbuchungId: "b1", vertragId: "v1", herkunft: "manuell" }],
      VERTRAG,
    );

    const ergebnis = await vertragskategorieUebertragen(deps, "v1");

    expect(ergebnis.geaendert).toBe(1);
    expect(bestand.get("b1")?.kategorieId).toBe("kat-vertrag");
  });

  it("lässt eine GETEILTE Buchung stehen", async () => {
    // Bei einer Aufteilung stehen die Kategorien in den TEILEN. Die Kopfkategorie
    // umzuschreiben liesse die Teile stehen und erzeugte einen Widerspruch, den die
    // Budgetrechnung je nach Weg verschieden auflöst.
    const { deps, bestand } = umgebung(
      [buchung("b1", { aufteilungen: [{ kategorieId: "kat-alt", betrag: -4500 }] })],
      [{ istbuchungId: "b1", vertragId: "v1", herkunft: "automatisch" }],
      VERTRAG,
    );

    const ergebnis = await vertragskategorieUebertragen(deps, "v1");

    expect(ergebnis.geaendert).toBe(0);
    expect(ergebnis.uebersprungen).toBe(1);
    expect(bestand.get("b1")?.kategorieId).toBe("kat-alt");
  });

  it("tut nichts, wenn der Vertrag keine Kategorie hat", async () => {
    // „Übertragen" hiesse dann leeren — eine andere Handlung als die angebotene.
    const { deps, bestand } = umgebung(
      [buchung("b1")],
      [{ istbuchungId: "b1", vertragId: "v1", herkunft: "automatisch" }],
      { ...VERTRAG, kategorieId: undefined },
    );

    const ergebnis = await vertragskategorieUebertragen(deps, "v1");

    expect(ergebnis.geaendert).toBe(0);
    expect(bestand.get("b1")?.kategorieId).toBe("kat-alt");
  });

  it("übergeht eine Zahlung, die die Kategorie schon trägt", async () => {
    // Sonst schriebe jeder Haken einen Journaleintrag für eine Änderung, die keine ist.
    const { deps } = umgebung(
      [buchung("b1", { kategorieId: "kat-vertrag" })],
      [{ istbuchungId: "b1", vertragId: "v1", herkunft: "automatisch" }],
      VERTRAG,
    );

    expect((await vertragskategorieUebertragen(deps, "v1")).geaendert).toBe(0);
  });

  it("rührt eine Zeile mit dem Nein von Hand nicht an", async () => {
    // `vertragId: null` bei gesetzter Herkunft heisst „gehört ausdrücklich zu keinem
    // Vertrag". Sie ist keine Zuordnung zu diesem Vertrag und trägt hier nichts.
    const { deps, bestand } = umgebung(
      [buchung("b1")],
      [{ istbuchungId: "b1", vertragId: null, herkunft: "manuell" }],
      VERTRAG,
    );

    await vertragskategorieUebertragen(deps, "v1");

    expect(bestand.get("b1")?.kategorieId).toBe("kat-alt");
  });
});
