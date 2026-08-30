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

describe("Was die Quelle mitbrachte", () => {
  /** Der Katalog samt Namenskarte — ohne die entfällt die Stufe. */
  const mitNamen: Vorschlagskontext = {
    ...nurKatalog,
    kategorieNachName: katalogNachName(kategorien),
  };

  it("nimmt die übersetzte Kategorie der Quelldatei", () => {
    const v = vorschlagFuer(roh({ kategorieVorschlag: "Abos & Streaming" }), mitNamen);
    expect(v).toEqual({ kategorieId: "k-abo", charakter: "Aufwand", quelle: "fremdkategorie" });
  });

  it("übernimmt dabei den Charakter aus dem KATALOG, nicht aus der Quelle", () => {
    // Die Quelle liefert einen Namen, sonst nichts. Was diese Kategorie fachlich ist,
    // steht im eigenen Baum — sonst käme eine Umschichtung als Aufwand herein.
    const v = vorschlagFuer(roh({ kategorieVorschlag: "Sparen & Anlegen" }), mitNamen);
    expect(v?.charakter).toBe("Umschichtung");
  });

  it("greift nicht, wenn es die Kategorie im Katalog nicht gibt", () => {
    // Der Nutzer darf umbenennen und löschen. Dann trägt diese Stufe eben nichts bei —
    // und legt vor allem keine Id ins Leere.
    expect(vorschlagFuer(roh({ kategorieVorschlag: "Gibt es hier nicht" }), mitNamen)).toBeUndefined();
  });

  it("greift nicht ohne Namenskarte", () => {
    // Aufrufer ohne Import müssen sie nicht bauen; dann entfällt die Stufe still.
    expect(vorschlagFuer(roh({ kategorieVorschlag: "Abos & Streaming" }), nurKatalog)).toBeUndefined();
  });

  it("steht HINTER dem Vertrag", () => {
    // Ein Vertrag ist eine Zuordnung, die jemand in DIESEM Bestand getroffen hat. Die
    // Kategorie einer fremden App kommt aus einem anderen Zusammenhang.
    const kontext: Vorschlagskontext = {
      ...mitNamen,
      erkennungen: [standardErkennung("v1", "REWE Markt", 1234)],
      vertragsKategorie: new Map([["v1", "k-abo"]]),
    };
    expect(vorschlagFuer(roh({ kategorieVorschlag: "Lebensmittel" }), kontext)?.quelle).toBe("regel");
  });

  it("steht VOR dem Modell", () => {
    // **Der Rang, an dem alles hängt.** Das Modell legt sich immer fest; stünde diese
    // Stufe dahinter, käme sie nie zum Zug — und der Import könnte die Kategorien, die in
    // der Datei stehen, gleich wegwerfen.
    const kontext: Vorschlagskontext = {
      ...mitNamen,
      modell: trainieren([
        { merkmale: ["emp=rewe markt", "vwz:einkauf", "vz:-"], kategorieId: "k-le" },
      ]),
    };
    const v = vorschlagFuer(roh({ kategorieVorschlag: "Abos & Streaming" }), kontext);
    expect(v?.quelle).toBe("fremdkategorie");
    expect(v?.kategorieId).toBe("k-abo");
  });

  it("lässt das Modell ran, wo die Quelle nichts mitbrachte", () => {
    const kontext: Vorschlagskontext = {
      ...mitNamen,
      modell: trainieren([
        { merkmale: ["emp=rewe markt", "vwz:einkauf", "vz:-"], kategorieId: "k-le" },
      ]),
    };
    expect(vorschlagFuer(roh(), kontext)?.quelle).toBe("ki");
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
