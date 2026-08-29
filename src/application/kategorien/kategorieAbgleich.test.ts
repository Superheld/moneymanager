import { describe, expect, it } from "vitest";
import { standardErkennung, trainieren, type IstBuchung, type Kategorie, type Zahlungsspur } from "../../core";
import { charakterWechsel, kategorieAbgleich, planAnwenden, uebergaenge } from "./kategorieAbgleich";
import { katalogNachId, type Vorschlagskontext } from "../import/vorschlag";
import type { LedgerPort } from "../ports";

const KATEGORIEN: Kategorie[] = [
  { id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" },
  { id: "k-dro", name: "Drogerie", defaultCharakter: "Aufwand" },
  { id: "k-so", name: "Sonstiges", defaultCharakter: "Aufwand" },
  { id: "k-sp", name: "Sparen & Anlegen", defaultCharakter: "Umschichtung" },
];

/**
 * Ein Kontext, in dem „talmer" über die Erkennungsregel eines Vertrags auf Drogerie zeigt.
 *
 * Das Vehikel ist austauschbar — geprüft wird der ABGLEICH, nicht die Quelle des
 * Vorschlags. Bis 2026-08-29 stand hier eine Festlegung; die gibt es nicht mehr.
 */
function kontextMitVertrag(anbieter = "Talmer", kategorieId = "k-dro"): Vorschlagskontext {
  return {
    kategorieNachId: katalogNachId(KATEGORIEN),
    erkennungen: [standardErkennung("v1", anbieter, 1250)],
    vertragsKategorie: new Map([["v1", kategorieId]]),
  };
}

function spur(over: Partial<Zahlungsspur> = {}): Zahlungsspur {
  return {
    id: "b1",
    datum: "2026-03-01",
    betrag: -1234,
    gegenpartei: "Talmer",
    verwendungszweck: "Einkauf",
    charakter: "Aufwand",
    kategorieId: "k-so",
    ...over,
  };
}

describe("Plan rechnen", () => {
  it("schlägt den Wechsel samt Herkunft und Zielcharakter vor", () => {
    const plan = kategorieAbgleich([spur()], kontextMitVertrag());
    expect(plan.setzen).toEqual([
      {
        istbuchungId: "b1",
        vonKategorieId: "k-so",
        nachKategorieId: "k-dro",
        charakter: "Aufwand",
        vonCharakter: "Aufwand",
        quelle: "regel",
        gegenpartei: "Talmer",
        betrag: -1234,
        datum: "2026-03-01",
      },
    ]);
  });

  it("füllt auch eine Buchung ohne Kategorie", () => {
    const plan = kategorieAbgleich([spur({ kategorieId: undefined })], kontextMitVertrag());
    expect(plan.setzen[0].vonKategorieId).toBeUndefined();
    expect(plan.setzen[0].nachKategorieId).toBe("k-dro");
  });

  it("zählt als unverändert, was schon stimmt — und ist damit beim zweiten Lauf leer", () => {
    const plan = kategorieAbgleich([spur({ kategorieId: "k-dro" })], kontextMitVertrag());
    expect(plan.setzen).toHaveLength(0);
    expect(plan.unveraendert).toBe(1);
  });

  it("lässt eine von Hand gesetzte Kategorie in Ruhe", () => {
    // Sonst wäre jede Korrektur nur bis zum nächsten Abgleich haltbar.
    const plan = kategorieAbgleich([spur({ kategorieHerkunft: "manuell" })], kontextMitVertrag());
    expect(plan.setzen).toHaveLength(0);
    expect(plan.uebersprungen.handverlesen).toBe(1);
  });

  it("lässt eine aufgeteilte Buchung in Ruhe", () => {
    // Sie trägt mehrere Kategorien und hat gar kein Feld, in das ein Vorschlag passt.
    const plan = kategorieAbgleich([spur({ geteilt: true, kategorieId: undefined })], kontextMitVertrag());
    expect(plan.setzen).toHaveLength(0);
    expect(plan.uebersprungen.handverlesen).toBe(1);
  });

  it("lässt Umschichtungen in Ruhe", () => {
    const plan = kategorieAbgleich(
      [spur({ charakter: "Umschichtung", kategorieId: undefined })],
      kontextMitVertrag(),
    );
    expect(plan.setzen).toHaveLength(0);
    expect(plan.uebersprungen.umschichtung).toBe(1);
  });

  it("zählt, wofür die Kette nichts anzubieten hatte", () => {
    const plan = kategorieAbgleich([spur({ gegenpartei: "Jemand ganz anderes" })], kontextMitVertrag());
    expect(plan.setzen).toHaveLength(0);
    expect(plan.uebersprungen.ohneVorschlag).toBe(1);
  });

  it("nimmt den Charakter der Zielkategorie mit", () => {
    // Die Kategorie zu ändern und den Charakter stehen zu lassen, ergäbe eine Buchung,
    // die ihrer eigenen Kategorie widerspricht.
    const plan = kategorieAbgleich([spur()], kontextMitVertrag("Talmer", "k-sp"));
    expect(plan.setzen[0].charakter).toBe("Umschichtung");
  });

  it("hebt die Wechsel heraus, bei denen sich auch der Charakter ändert", () => {
    // Ein Kategoriewechsel ist eine Sortierfrage, ein Charakterwechsel eine über
    // Erfolgs- und Liquiditätswirksamkeit — die Vorschau muss ihn eigens nennen können.
    const plan = kategorieAbgleich(
      [spur({ id: "a" }), spur({ id: "b", gegenpartei: "REWE" })],
      kontextMitVertrag("Talmer", "k-sp"),
    );
    expect(charakterWechsel(plan).map((w) => w.istbuchungId)).toEqual(["a"]);
  });

  it("zählt keinen Charakterwechsel, wo keiner ist", () => {
    const plan = kategorieAbgleich([spur()], kontextMitVertrag());
    expect(charakterWechsel(plan)).toHaveLength(0);
  });

  it("nutzt dieselbe Kette wie der Import — auch das Modell", () => {
    const kontext: Vorschlagskontext = {
      kategorieNachId: katalogNachId(KATEGORIEN),
      modell: trainieren([
        { merkmale: ["emp=rewe markt", "vwz:einkauf"], kategorieId: "k-le" },
        { merkmale: ["emp=ganz anderer"], kategorieId: "k-dro" },
      ]),
    };
    const plan = kategorieAbgleich([spur({ gegenpartei: "REWE Markt" })], kontext);
    expect(plan.setzen[0]).toMatchObject({ nachKategorieId: "k-le", quelle: "ki" });
  });

  it("greift nicht aufs Remapping zurück — der Hinweis ist beim Import verbraucht", () => {
    // Eine gebuchte Zahlung trägt keine Fremdkategorie mehr; die Kette dürfte hier keine
    // erfinden.
    const kontext: Vorschlagskontext = {
      kategorieNachId: katalogNachId(KATEGORIEN),
    };
    expect(kategorieAbgleich([spur()], kontext).setzen).toHaveLength(0);
  });
});

describe("Übergänge für die Vorschau", () => {
  const kontext = kontextMitVertrag();

  it("fasst gleiche Wechsel zusammen und sortiert nach Menge", () => {
    const viele = Array.from({ length: 5 }, (_, i) => spur({ id: `a${i}` }));
    const eine = spur({ id: "b", kategorieId: "k-le" });
    const gruppen = uebergaenge(kategorieAbgleich([...viele, eine], kontext));

    expect(gruppen).toHaveLength(2);
    expect(gruppen[0]).toMatchObject({ vonKategorieId: "k-so", nachKategorieId: "k-dro", anzahl: 5 });
    expect(gruppen[1]).toMatchObject({ vonKategorieId: "k-le", anzahl: 1 });
  });

  it("hängt Beispiele an, aber nicht die ganze Liste", () => {
    // Eine Vorschau aus tausend Zeilen liest niemand — wer sie bestätigt, hat nichts geprüft.
    const viele = Array.from({ length: 20 }, (_, i) => spur({ id: `a${i}` }));
    const [gruppe] = uebergaenge(kategorieAbgleich(viele, kontext));
    expect(gruppe.anzahl).toBe(20);
    expect(gruppe.beispiele).toHaveLength(3);
  });

  it("hält „ohne Kategorie“ als eigenen Übergang auseinander", () => {
    const gruppen = uebergaenge(
      kategorieAbgleich([spur({ id: "a" }), spur({ id: "b", kategorieId: undefined })], kontext),
    );
    expect(gruppen).toHaveLength(2);
    expect(gruppen.some((g) => g.vonKategorieId === undefined)).toBe(true);
  });
});

describe("Plan anwenden", () => {
  function ledger(buchungen: IstBuchung[]) {
    const inhalt = new Map(buchungen.map((b) => [b.id, b]));
    const port: LedgerPort = {
      alle: async () => [...inhalt.values()],
      speichern: async (b) => { inhalt.set(b.id, b); },
      loeschen: async (id) => { inhalt.delete(id); },
    };
    return { port, inhalt };
  }

  const BUCHUNG: IstBuchung = {
    id: "b1", datum: "2026-03-01", betrag: -1234, kontoId: "k1",
    kategorieId: "k-so", charakter: "Aufwand", quelle: "import",
  };

  it("schreibt Kategorie und Charakter", async () => {
    const { port, inhalt } = ledger([BUCHUNG]);
    const plan = kategorieAbgleich([spur()], kontextMitVertrag("Talmer", "k-sp"));

    expect(await planAnwenden(port, plan)).toBe(1);
    expect(inhalt.get("b1")).toMatchObject({ kategorieId: "k-sp", charakter: "Umschichtung" });
  });

  it("lässt das Geschriebene für die Automatik offen", async () => {
    // Sonst wäre der erste Abgleich zugleich der letzte: er erklärte seinen eigenen
    // Bestand zu Handarbeit.
    const { port, inhalt } = ledger([BUCHUNG]);
    await planAnwenden(port, kategorieAbgleich([spur()], kontextMitVertrag()));
    expect(inhalt.get("b1")?.kategorieHerkunft).toBe("automatisch");
  });

  it("rührt nichts an, was nicht im Plan steht", async () => {
    const fremd: IstBuchung = { ...BUCHUNG, id: "b2", kategorieId: "k-le" };
    const { port, inhalt } = ledger([BUCHUNG, fremd]);
    await planAnwenden(port, kategorieAbgleich([spur()], kontextMitVertrag()));
    expect(inhalt.get("b2")?.kategorieId).toBe("k-le");
  });

  it("übergeht einen Wechsel, dessen Buchung inzwischen weg ist", async () => {
    // Der Plan kann älter sein als der Bestand — das darf kein Fehler sein.
    const { port } = ledger([]);
    expect(await planAnwenden(port, kategorieAbgleich([spur()], kontextMitVertrag()))).toBe(0);
  });

  it("läuft ein zweites Mal folgenlos durch", async () => {
    const { port } = ledger([BUCHUNG]);
    await planAnwenden(port, kategorieAbgleich([spur()], kontextMitVertrag()));
    // Neu gerechnet auf dem geschriebenen Stand: nichts mehr zu tun.
    const zweiter = kategorieAbgleich([spur({ kategorieId: "k-dro" })], kontextMitVertrag());
    expect(zweiter.setzen).toHaveLength(0);
  });
});
