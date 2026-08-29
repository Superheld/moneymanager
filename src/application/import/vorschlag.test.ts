import { describe, expect, it } from "vitest";
import { standardErkennung, trainieren, type Kategorie } from "../../core";
import type { RohUmsatz } from "./rohUmsatz";
import {
  katalogNachId,
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

describe("Umbuchung (Grundverhalten)", () => {
  it("labelt Umbuchungen als Umschichtung, ohne konkrete Kategorie", () => {
    const v = vorschlagFuer(roh({ istUmbuchung: true }), nurKatalog);
    expect(v).toEqual({ charakter: "Umschichtung", quelle: "umbuchung" });
  });

  it("ohne jede Quelle und ohne Hinweis bleibt die Zeile unkategorisiert", () => {
    // Der Fall, für den die ganze Kette gebaut wurde: ein Bankimport liefert keine
    // Kategorie mit.
    expect(vorschlagFuer(roh(), nurKatalog)).toBeUndefined();
  });
});

describe("Vertrag", () => {
  /** Ein Vertrag über 9,99 € bei Kesselmann, mit Kategorie. */
  function mitVertrag(): Vorschlagskontext {
    return {
      ...nurKatalog,
      erkennungen: [standardErkennung("v1", "Kesselmann International", 999)],
      vertragsKategorie: new Map([["v1", "k-abo"]]),
    };
  }

  it("erbt die Kategorie des Vertrags, den die Zahlung trifft", () => {
    const v = vorschlagFuer(roh({ gegenpartei: "Kesselmann International BV", betrag: -999 }), mitVertrag());
    expect(v).toEqual({ kategorieId: "k-abo", charakter: "Aufwand", quelle: "regel" });
  });

  it("nennt den Vertrag im Befund", () => {
    const b = vorschlagsbefundFuer(roh({ gegenpartei: "Kesselmann International BV", betrag: -999 }), mitVertrag());
    expect(b.vertragId).toBe("v1");
  });

  it("greift nicht bei einer Zahlung außerhalb der Betragsspanne", () => {
    // Die Standardregel hält fremde Zahlungen an denselben Empfänger draußen. Zur
    // Kontrolle: derselbe Empfänger IM Rahmen trifft (siehe Test darüber) — hier scheitert
    // es also am Betrag, nicht am Namen.
    const v = vorschlagFuer(roh({ gegenpartei: "Kesselmann International BV", betrag: -9900 }), mitVertrag());
    expect(v).toBeUndefined();
  });

  it("ein Vertrag OHNE Kategorie schlägt nichts vor", () => {
    const kontext: Vorschlagskontext = {
      ...nurKatalog,
      erkennungen: [standardErkennung("v1", "Kesselmann International", 999)],
      vertragsKategorie: new Map(),
    };
    expect(vorschlagFuer(roh({ gegenpartei: "Kesselmann International BV", betrag: -999 }), kontext)).toBeUndefined();
  });

  it("die Umbuchung schlägt auch den Vertrag", () => {
    const v = vorschlagFuer(
      roh({ gegenpartei: "Kesselmann International BV", betrag: -999, istUmbuchung: true }),
      mitVertrag(),
    );
    expect(v).toEqual({ charakter: "Umschichtung", quelle: "umbuchung" });
  });
});

describe("Festlegung", () => {
  /** „Zahlungen an Kesselmann sind immer Abos & Streaming." */
  function mitFestlegung(): Vorschlagskontext {
    return {
      ...nurKatalog,
      festlegungen: [{ muster: "kesselmann international", kategorieId: "k-abo", angelegtAm: "2026-08-17T10:00:00.000Z" }],
    };
  }

  it("setzt die festgelegte Kategorie", () => {
    const v = vorschlagFuer(roh({ gegenpartei: "KESSELMANN INTERNATIONAL BV", betrag: -4200 }), mitFestlegung());
    expect(v).toEqual({ kategorieId: "k-abo", charakter: "Aufwand", quelle: "festlegung" });
  });

  it("nennt das Muster im Befund", () => {
    const b = vorschlagsbefundFuer(roh({ gegenpartei: "KESSELMANN INTERNATIONAL BV" }), mitFestlegung());
    expect(b.festlegung).toBe("kesselmann international");
  });

  it("kennt keine Betragsspanne — eine Kategorie ist eine Klasse, kein Vertrag", () => {
    // Genau der Unterschied zur Vertragserkennung: dort hielte die Spanne diese Zahlung
    // draußen. Lebensmittel kosten mal 8 € und mal 190 €.
    const v = vorschlagFuer(roh({ gegenpartei: "Kesselmann International BV", betrag: -190_00 }), mitFestlegung());
    expect(v?.kategorieId).toBe("k-abo");
  });

  it("schlägt den Vertrag", () => {
    const kontext: Vorschlagskontext = {
      ...mitFestlegung(),
      erkennungen: [standardErkennung("v1", "Kesselmann International", 999)],
      vertragsKategorie: new Map([["v1", "k-le"]]),
    };
    expect(vorschlagFuer(roh({ gegenpartei: "Kesselmann International BV", betrag: -999 }), kontext)?.kategorieId).toBe("k-abo");
  });

  it("die Umbuchung schlägt auch die Festlegung", () => {
    // Eigenes Geld, das das Konto wechselt, gehört in keine Ausgabenkategorie — auch
    // dann nicht, wenn für den Empfänger etwas festgelegt ist.
    const v = vorschlagFuer(roh({ gegenpartei: "Kesselmann International BV", istUmbuchung: true }), mitFestlegung());
    expect(v).toEqual({ charakter: "Umschichtung", quelle: "umbuchung" });
  });

  it("greift nicht bei einem anderen Empfänger", () => {
    expect(vorschlagFuer(roh({ gegenpartei: "REWE Markt" }), mitFestlegung())).toBeUndefined();
  });

  it("eine Festlegung auf eine gelöschte Kategorie fällt durch", () => {
    const kontext: Vorschlagskontext = {
      ...nurKatalog,
      festlegungen: [{ muster: "rewe", kategorieId: "geloescht", angelegtAm: "2026-08-17T10:00:00.000Z" }],
    };
    expect(vorschlagFuer(roh({ gegenpartei: "REWE Markt" }), kontext)).toBeUndefined();
  });
});

describe("Modell", () => {
  function mitModell(): Vorschlagskontext {
    return {
      ...nurKatalog,
      modell: trainieren([
        { merkmale: ["emp=rewe markt", "vwz:einkauf", "vz:-"], kategorieId: "k-le" },
        { merkmale: ["emp=kesselmann international", "vwz:abo", "vz:-"], kategorieId: "k-abo" },
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
