import { describe, expect, it } from "vitest";
import { standardErkennung, trainieren, type Kategorie } from "../../core";
import type { RohUmsatz } from "./rohUmsatz";
import {
  katalogNachId,
  katalogNachName,
  vorschlagFuer,
  vorschlagsbefundFuer,
  type Vorschlagskontext,
} from "./vorschlag";

const kategorien: Kategorie[] = [
  { id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" },
  { id: "k-sp", name: "Sparen & Anlegen", defaultCharakter: "Umschichtung" },
  { id: "k-abo", name: "Abos & Streaming", defaultCharakter: "Aufwand" },
];

/** Nur der Katalog — der Zustand vor jeder weiteren Quelle. */
const nurKatalog: Vorschlagskontext = {
  katalogNachName: katalogNachName(kategorien),
  kategorieNachId: katalogNachId(kategorien),
};

function roh(over: Partial<RohUmsatz> = {}): RohUmsatz {
  return {
    buchungstag: "2026-03-01",
    betrag: -1234,
    waehrung: "EUR",
    gegenpartei: "REWE Markt",
    verwendungszweck: "Einkauf",
    quelle: "test",
    istUmbuchung: false,
    ...over,
  };
}

describe("Umbuchung und Remapping (Grundverhalten)", () => {
  it("labelt Umbuchungen als Umschichtung, nicht nach FG-Hinweis", () => {
    const v = vorschlagFuer(roh({ istUmbuchung: true, kategorieHinweis: "Restaurants" }), nurKatalog);
    expect(v).toEqual({ charakter: "Umschichtung", quelle: "umbuchung" });
  });

  it("mappt den FG-Hinweis auf unsere Kategorie inkl. Charakter", () => {
    const v = vorschlagFuer(roh({ kategorieHinweis: "Lebensmittel" }), nurKatalog);
    expect(v).toEqual({ kategorieId: "k-le", charakter: "Aufwand", quelle: "remapping" });
  });

  it("nimmt den Charakter aus der Zielkategorie (Sparen → Umschichtung)", () => {
    const v = vorschlagFuer(roh({ kategorieHinweis: "Kapitalanlage" }), nurKatalog);
    expect(v).toEqual({ kategorieId: "k-sp", charakter: "Umschichtung", quelle: "remapping" });
  });

  it("liefert undefined, wenn der Hinweis unbekannt ist oder die Kategorie fehlt", () => {
    expect(vorschlagFuer(roh({ kategorieHinweis: "Gibtsnicht" }), nurKatalog)).toBeUndefined();
    // bekannter Hinweis, aber Zielkategorie nicht im Katalog des Nutzers:
    expect(vorschlagFuer(roh({ kategorieHinweis: "Tanken" }), nurKatalog)).toBeUndefined();
  });

  it("ohne jede Quelle und ohne Hinweis bleibt die Zeile unkategorisiert", () => {
    // Der Fall, für den die ganze Kette gebaut wurde: ein Bankimport liefert keine
    // Kategorie mit.
    expect(vorschlagFuer(roh(), nurKatalog)).toBeUndefined();
  });
});

describe("Vertrag", () => {
  /** Ein Vertrag über 9,99 € bei [anonymisiert], mit Kategorie. */
  function mitVertrag(): Vorschlagskontext {
    return {
      ...nurKatalog,
      erkennungen: [standardErkennung("v1", "[anonymisiert] International", 999)],
      vertragsKategorie: new Map([["v1", "k-abo"]]),
    };
  }

  it("erbt die Kategorie des Vertrags, den die Zahlung trifft", () => {
    const v = vorschlagFuer(roh({ gegenpartei: "[anonymisiert] International BV", betrag: -999 }), mitVertrag());
    expect(v).toEqual({ kategorieId: "k-abo", charakter: "Aufwand", quelle: "regel" });
  });

  it("nennt den Vertrag im Befund", () => {
    const b = vorschlagsbefundFuer(roh({ gegenpartei: "[anonymisiert] International BV", betrag: -999 }), mitVertrag());
    expect(b.vertragId).toBe("v1");
  });

  it("greift nicht bei einer Zahlung außerhalb der Betragsspanne", () => {
    // Die Standardregel hält fremde Zahlungen an denselben Empfänger draußen. Zur
    // Kontrolle: derselbe Empfänger IM Rahmen trifft (siehe Test darüber) — hier scheitert
    // es also am Betrag, nicht am Namen.
    const v = vorschlagFuer(roh({ gegenpartei: "[anonymisiert] International BV", betrag: -9900 }), mitVertrag());
    expect(v).toBeUndefined();
  });

  it("ein Vertrag OHNE Kategorie schlägt nichts vor", () => {
    const kontext: Vorschlagskontext = {
      ...nurKatalog,
      erkennungen: [standardErkennung("v1", "[anonymisiert] International", 999)],
      vertragsKategorie: new Map(),
    };
    expect(vorschlagFuer(roh({ gegenpartei: "[anonymisiert] International BV", betrag: -999 }), kontext)).toBeUndefined();
  });

  it("schlägt den Vertrag VOR das Remapping", () => {
    // Eine getroffene Zuordnung ist stärker als eine Fremdklassifikation.
    const v = vorschlagFuer(
      roh({ gegenpartei: "[anonymisiert] International BV", betrag: -999, kategorieHinweis: "Lebensmittel" }),
      mitVertrag(),
    );
    expect(v?.kategorieId).toBe("k-abo");
  });

  it("die Umbuchung schlägt auch den Vertrag", () => {
    const v = vorschlagFuer(
      roh({ gegenpartei: "[anonymisiert] International BV", betrag: -999, istUmbuchung: true }),
      mitVertrag(),
    );
    expect(v).toEqual({ charakter: "Umschichtung", quelle: "umbuchung" });
  });
});

describe("Modell", () => {
  function mitModell(): Vorschlagskontext {
    return {
      ...nurKatalog,
      modell: trainieren([
        { merkmale: ["emp=rewe markt", "vwz:einkauf", "vz:-"], kategorieId: "k-le" },
        { merkmale: ["emp=netflix international", "vwz:abo", "vz:-"], kategorieId: "k-abo" },
      ]),
    };
  }

  it("kategorisiert eine Zahlung ohne jeden Hinweis", () => {
    const v = vorschlagFuer(roh(), mitModell());
    expect(v).toEqual({ kategorieId: "k-le", charakter: "Aufwand", quelle: "ki" });
  });

  it("liefert die Beitragszerlegung als Begründung", () => {
    const b = vorschlagsbefundFuer(roh(), mitModell());
    expect(b.beitraege?.map((x) => x.merkmal)).toContain("emp=rewe markt");
    expect(b.sicherheit).toBeGreaterThan(0);
  });

  it("steht VOR dem Remapping", () => {
    // Ein Modell auf dem eigenen Kategoriebaum schlägt eine Fremdklassifikation.
    const v = vorschlagFuer(roh({ kategorieHinweis: "Kapitalanlage" }), mitModell());
    expect(v?.quelle).toBe("ki");
    expect(v?.kategorieId).toBe("k-le");
  });

  it("steht HINTER dem Vertrag", () => {
    const kontext: Vorschlagskontext = {
      ...mitModell(),
      erkennungen: [standardErkennung("v1", "REWE Markt", 1234)],
      vertragsKategorie: new Map([["v1", "k-abo"]]),
    };
    expect(vorschlagFuer(roh(), kontext)?.quelle).toBe("regel");
  });

  it("entscheidet nicht auf einem Vektor aus lauter Vorzeichen", () => {
    // Sonst bekäme jede textlose Zahlung dieselbe Kategorie — und zwar die häufigste.
    const v = vorschlagFuer(roh({ gegenpartei: "", verwendungszweck: "" }), mitModell());
    expect(v).toBeUndefined();
  });

  it("fällt aufs Remapping zurück, wenn kein Modell da ist", () => {
    const v = vorschlagFuer(roh({ kategorieHinweis: "Lebensmittel" }), nurKatalog);
    expect(v?.quelle).toBe("remapping");
  });

  it("schlägt keine Kategorie vor, die es im Katalog nicht mehr gibt", () => {
    const kontext: Vorschlagskontext = {
      ...nurKatalog,
      modell: trainieren([
        { merkmale: ["emp=rewe markt", "vwz:einkauf", "vz:-"], kategorieId: "geloescht" },
        { merkmale: ["emp=anderer"], kategorieId: "auch-weg" },
      ]),
    };
    // Sonst trüge die Buchung eine Id ins Leere und fiele in keiner Auswertung mehr auf.
    expect(vorschlagFuer(roh(), kontext)).toBeUndefined();
  });
});
