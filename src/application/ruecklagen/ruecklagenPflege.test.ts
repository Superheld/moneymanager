// Rücklagen-Use-Cases.
//
// Die Rücklage steht seit 2026-08-16 für sich: kein abgeleiteter Ersatz-Topf mehr, keine
// Kopplung zweier Aggregate. Was bleibt, ist die Validierung an der Grenze — und seit
// 2026-08-31 die Frage, WELCHE der beiden Formen ausgefüllt ist. Genau eine von beiden,
// und daran hängt auch, was nach dem Ausbuchen passiert.

import { describe, expect, it } from "vitest";
import type { IstBuchung, Ruecklage } from "../../core";
import type { LedgerPort, RuecklagenAusbuchung, RuecklagenRepository } from "../ports";
import {
  ruecklageAktualisieren,
  ruecklageAnlegen,
  ruecklageAusbuchen,
  ruecklageLoeschen,
  ruecklageRateLoeschen,
  type RuecklagenEingabe,
} from "./ruecklagenPflege";

function memRuecklagen() {
  const daten: Ruecklage[] = [];
  const ausgebucht: RuecklagenAusbuchung[] = [];
  const raten: { id: string; abMonat: string; betrag: number }[] = [];
  const repo: RuecklagenRepository = {
    alle: async () => daten,
    beendete: async () => daten.filter((r) => r.beendetAm),
    speichern: async (r) => {
      const i = daten.findIndex((x) => x.id === r.id);
      if (i >= 0) daten[i] = r;
      else daten.push(r);
    },
    // Die Reihe der Raten: hier nur mitgeschrieben, damit ein Test sieht, was ankam.
    rateSpeichern: async (id, rate) => {
      raten.push({ id, ...rate });
    },
    rateLoeschen: async () => {},
    loeschen: async (id) => {
      const i = daten.findIndex((x) => x.id === id);
      if (i >= 0) daten.splice(i, 1);
    },
    ausbuchungSpeichern: async (a) => {
      ausgebucht.push(a);
    },
    ausbuchungen: async () => ausgebucht,
  };
  return { repo, daten, ausgebucht, raten };
}

function memLedger(start: IstBuchung[] = []) {
  const daten = [...start];
  const ledger = {
    alle: async () => daten,
    speichern: async (b: IstBuchung) => {
      const i = daten.findIndex((x) => x.id === b.id);
      if (i >= 0) daten[i] = b;
      else daten.push(b);
    },
  } as unknown as LedgerPort;
  return { ledger, daten };
}

const mitZiel: RuecklagenEingabe = {
  bezeichnung: "Waschmaschine",
  ziel: 60000,
  fristMonate: 120,
  beginn: "2024-01-01",
  kategorieId: "k-geraete",
};

const frei: RuecklagenEingabe = {
  bezeichnung: "Urlaubskasse",
  rate: 5000,
  beginn: "2024-01-01",
  kategorieId: "k-reise",
};

describe("ruecklageAnlegen", () => {
  it("legt eine Rücklage mit getrimmter Bezeichnung an", async () => {
    const { repo, daten } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, { ...mitZiel, bezeichnung: "  Waschmaschine  " });
    expect(r.bezeichnung).toBe("Waschmaschine");
    expect(daten).toHaveLength(1);
  });

  it("rundet die Frist auf ganze Monate", async () => {
    const { repo } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, { ...mitZiel, fristMonate: 119.6 });
    expect(r.fristMonate).toBe(120);
  });

  it("legt auch eine Rücklage ohne Ziel an — nur mit Rate, und die steht in der Reihe", async () => {
    const { repo, raten } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, frei);
    // Seit Migration 80 trägt die Reihe die freie Rate, ab dem Monat des Beginns.
    expect(r.rate).toBeUndefined();
    expect(r.raten).toEqual([{ abMonat: "2024-01", betrag: 5000 }]);
    expect(raten).toEqual([{ id: r.id, abMonat: "2024-01", betrag: 5000 }]);
    expect(r.ziel).toBeUndefined();
    expect(r.fristMonate).toBeUndefined();
  });

  it("lehnt leere Bezeichnung ab", async () => {
    const { repo } = memRuecklagen();
    await expect(ruecklageAnlegen(repo, { ...mitZiel, bezeichnung: "   " })).rejects.toThrow(
      "bezeichnung.fehlt",
    );
  });

  // Der Widerspruch, nicht die Doppelangabe: aus Ziel ÷ Frist ergäbe sich eine Rate, und
  // daneben stünde eine andere. Welche gilt, entschiede dann die Reihenfolge im Code.
  it("lehnt beide Formen zugleich ab", async () => {
    const { repo } = memRuecklagen();
    await expect(ruecklageAnlegen(repo, { ...mitZiel, rate: 500 })).rejects.toThrow(
      "ruecklage.zielOderRate",
    );
  });

  it("lehnt eine Rücklage ohne beides ab", async () => {
    const { repo } = memRuecklagen();
    await expect(
      ruecklageAnlegen(repo, { bezeichnung: "Nichts", beginn: "2024-01-01", kategorieId: "k" }),
    ).rejects.toThrow("ruecklage.zielOderRate");
  });

  // Ein halb ausgefülltes Ziel ist kein Ziel — und es soll nicht stillschweigend als
  // freie Rücklage durchgehen, denn eine Rate hat es auch nicht.
  it("lehnt ein Ziel ohne Frist ab", async () => {
    const { repo } = memRuecklagen();
    await expect(
      ruecklageAnlegen(repo, { bezeichnung: "Halb", ziel: 60000, beginn: "2024-01-01", kategorieId: "k" }),
    ).rejects.toThrow("frist.groesserNull");
  });

  it("lehnt eine Frist ohne Ziel ab", async () => {
    const { repo } = memRuecklagen();
    await expect(
      ruecklageAnlegen(repo, { bezeichnung: "Halb", fristMonate: 12, beginn: "2024-01-01", kategorieId: "k" }),
    ).rejects.toThrow("ziel.groesserNull");
  });

  it("lehnt ein ungültiges Datum ab", async () => {
    const { repo } = memRuecklagen();
    await expect(ruecklageAnlegen(repo, { ...mitZiel, beginn: "01.01.2024" })).rejects.toThrow(
      "beginn.ungueltig",
    );
  });
});

describe("ruecklageAktualisieren", () => {
  it("behält die ID und wechselt die Form", async () => {
    const { repo, daten } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, mitZiel);
    const nachher = await ruecklageAktualisieren(repo, r.id, frei, "2026-11-16");
    expect(nachher.id).toBe(r.id);
    expect(daten).toHaveLength(1);
    // Die alten Felder bleiben nicht stehen — sonst hätte sie danach beides.
    expect(nachher.ziel).toBeUndefined();
    expect(nachher.raten).toEqual([{ abMonat: "2024-01", betrag: 5000 }]);
  });

  it("legt eine neue Rücklage mit Kategorie so an, dass sie ab ihrem Beginn findet", async () => {
    const { repo } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, { ...mitZiel, kategorieId: "k-hamstede" });
    expect(r.art).toBe("abschliessend");
    expect(r.findetAb).toBe("2024-01-01");
  });

  it("behält Sorte und Fundfenster beim Bearbeiten", async () => {
    // Vorher fiel ein gesetztes `findetAb` beim ersten Speichern auf leer — die
    // Rücklage fand danach nichts mehr über ihre Kategorie.
    const { repo, daten } = memRuecklagen();
    daten.push({ id: "r-tolk", bezeichnung: "Tolkemit", ziel: 60000, fristMonate: 12, beginn: "2024-01-01", kategorieId: "k-tolk", art: "abschliessend", findetAb: "2026-11-16", raten: [] });
    const nachher = await ruecklageAktualisieren(repo, "r-tolk", { ...mitZiel, bezeichnung: "Tolkemit neu", kategorieId: "k-tolk" }, "2027-02-03");
    expect(nachher.findetAb).toBe("2026-11-16");
    expect(nachher.art).toBe("abschliessend");
    expect(daten[0].findetAb).toBe("2026-11-16");
  });

  it("lässt eine nachgetragene Kategorie erst ab heute finden", async () => {
    // Der Altfall: eine Rücklage von Hand ohne Kategorie aus der Zeit vor Paket 4.
    const { repo, daten } = memRuecklagen();
    daten.push({ id: "r-alt", bezeichnung: "Ruhnke", ziel: 60000, fristMonate: 120, beginn: "2024-01-01", art: "abschliessend", raten: [] });
    const nachher = await ruecklageAktualisieren(repo, "r-alt", { ...mitZiel, kategorieId: "k-ruhn" }, "2026-12-04");
    expect(nachher.findetAb).toBe("2026-12-04");
  });

  it("verlangt die Kategorie beim Anlegen", async () => {
    const { repo, daten } = memRuecklagen();
    await expect(ruecklageAnlegen(repo, { ...mitZiel, kategorieId: undefined })).rejects.toThrow("ruecklage.kategorieFehlt");
    expect(daten).toHaveLength(0);
  });

  it("lässt einen Altfall ohne Kategorie stehen, verlangt sie aber beim Speichern", async () => {
    const { repo, daten } = memRuecklagen();
    const alt: Ruecklage = { id: "r-alt", bezeichnung: "Quelvin", rate: 3000, raten: [{ abMonat: "2024-01", betrag: 3000 }], beginn: "2024-01-01", art: "abschliessend" };
    daten.push(alt);
    await expect(ruecklageAktualisieren(repo, "r-alt", { ...frei, kategorieId: undefined }, "2026-12-04")).rejects.toThrow("ruecklage.kategorieFehlt");
    // Nichts geschrieben: die Rücklage steht da, wie sie war.
    expect(daten[0]).toEqual(alt);
  });

  it("legt eine Rücklage an, die weiterläuft — mit Fundfenster ab ihrem Beginn", async () => {
    const { repo } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, { ...frei, art: "fortlaufend" });
    expect(r).toMatchObject({ art: "fortlaufend", findetAb: "2024-01-01", raten: [{ abMonat: "2024-01", betrag: 5000 }] });
  });

  it("behält die Sorte beim Bearbeiten, auch wenn die Eingabe eine andere nennt", async () => {
    const { repo } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, { ...frei, art: "fortlaufend" });
    const nachher = await ruecklageAktualisieren(repo, r.id, { ...frei, art: "abschliessend" }, "2026-12-04");
    expect(nachher.art).toBe("fortlaufend");
  });

  it("lässt eine geänderte Rate ab dem gewählten Monat gelten — wie beim Budgetbetrag", async () => {
    const { repo } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, frei);
    const nachher = await ruecklageAktualisieren(repo, r.id, { ...frei, rate: 6500, rateAb: "2025-03" }, "2026-12-04");
    expect(nachher.raten).toEqual([{ abMonat: "2024-01", betrag: 5000 }, { abMonat: "2025-03", betrag: 6500 }]);
    // Nie vor dem Beginn: ein Monat davor landet beim Beginn.
    const korrigiert = await ruecklageAktualisieren(repo, r.id, { ...frei, rate: 4500, rateAb: "2023-06" }, "2026-12-04");
    expect(korrigiert.raten?.[0]).toEqual({ abMonat: "2024-01", betrag: 4500 });
  });

  it("weist einen Monat in falscher Form ab", async () => {
    const { repo } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, frei);
    await expect(ruecklageAktualisieren(repo, r.id, { ...frei, rateAb: "2025-3" }, "2026-12-04")).rejects.toThrow("ruecklage.rateAbUngueltig");
  });

  it("lässt eine geänderte freie Rate ab dem laufenden Monat gelten, die Monate davor behalten ihre", async () => {
    const { repo, raten } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, frei);
    const nachher = await ruecklageAktualisieren(repo, r.id, { ...frei, rate: 7000 }, "2026-12-04");
    expect(nachher.rate).toBeUndefined();
    expect(nachher.raten).toEqual([{ abMonat: "2024-01", betrag: 5000 }, { abMonat: "2026-12", betrag: 7000 }]);
    expect(raten[raten.length - 1]).toEqual({ id: r.id, abMonat: "2026-12", betrag: 7000 });
    // Dieselbe Rate noch einmal schreibt nichts Neues.
    const vorher = raten.length;
    await ruecklageAktualisieren(repo, r.id, { ...frei, rate: 7000 }, "2026-12-20");
    expect(raten).toHaveLength(vorher);
  });
});

/**
 * Ausbuchen — die Stelle, an der die Form der Rücklage über das Ergebnis entscheidet.
 * Genau deshalb gibt es kein Feld „wiederkehrend": es könnte der Form widersprechen.
 */
/**
 * Seit Paket 5 wird nur noch eine Rücklage OHNE Kategorie ausgebucht — der Altbestand von
 * vor der Umstellung. `ruecklageAnlegen` verlangt eine Kategorie; die Fälle hier nehmen sie
 * ihr deshalb wieder, wie sie im Bestand stünde.
 */
const altfall = (r: Ruecklage): Ruecklage => ({ ...r, kategorieId: undefined, findetAb: undefined });

describe("ruecklageAusbuchen", () => {
  it("weist eine Rücklage mit Kategorie ab — sie wird abgeschlossen", async () => {
    const { repo, ausgebucht } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, mitZiel);
    await expect(ruecklageAusbuchen(repo, ledger, r, { datum: "2026-05-04" })).rejects.toThrow("ruecklage.abschliessenStattAusbuchen");
    expect(ausgebucht).toHaveLength(0);
  });

  it("startet eine Rücklage mit Ziel neu, statt sie zu löschen", async () => {
    const { repo, daten } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, mitZiel);

    const nachher = await ruecklageAusbuchen(repo, ledger, altfall(r), { datum: "2026-05-04" });

    expect(nachher?.beginn).toBe("2026-05-04");
    expect(daten).toHaveLength(1);
  });

  it("zieht dabei ein neues Ziel nach — Preise steigen", async () => {
    const { repo } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, mitZiel);

    const nachher = await ruecklageAusbuchen(repo, ledger, altfall(r), { datum: "2026-05-04", ziel: 72000 });

    expect(nachher?.ziel).toBe(72000);
  });

  it("beendet eine freie Rücklage", async () => {
    const { repo, daten } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, frei);

    const nachher = await ruecklageAusbuchen(repo, ledger, altfall(r), { datum: "2026-05-04" });

    expect(nachher).toBeNull();
    // Beendet, nicht gelöscht: mit der Zeile ginge ihre Ausbuchung per CASCADE mit.
    expect(daten).toHaveLength(1);
    expect(daten[0].beendetAm).toBe("2026-05-04");
  });

  it("hält an der Ausbuchung fest, wie der beendete Zyklus aussah", async () => {
    const { repo, ausgebucht } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, mitZiel);

    await ruecklageAusbuchen(repo, ledger, altfall(r), { datum: "2026-05-04", ziel: 72000 });

    // Der ALTE Zyklus, nicht der neue: Beginn und Ziel von vor dem Ausbuchen.
    expect(ausgebucht[0]).toMatchObject({ zyklusBeginn: r.beginn, zyklusZiel: r.ziel, zyklusFrist: r.fristMonate });
  });

  it("hält die Ausbuchung fest, auch wenn die Rücklage danach weg ist", async () => {
    const { repo, ausgebucht } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, frei);

    await ruecklageAusbuchen(repo, ledger, altfall(r), { datum: "2026-05-04", betrag: 120000 });

    expect(ausgebucht).toHaveLength(1);
    expect(ausgebucht[0].betrag).toBe(120000);
    expect(ausgebucht[0].ruecklageId).toBe(r.id);
  });

  // Der zweite Zweck der Verknüpfung, und der wichtigere: eine Anschaffung, für die
  // jahrelang zurückgelegt wurde, spränge jeden Monatsrahmen.
  it("nimmt die verknüpfte Buchung aus der Budgetbewertung", async () => {
    const { repo } = memRuecklagen();
    const { ledger, daten } = memLedger([
      { id: "b1", datum: "2026-05-04", betrag: -120000, kontoId: "k1", charakter: "Aufwand", quelle: "import" },
    ]);
    const r = await ruecklageAnlegen(repo, mitZiel);

    await ruecklageAusbuchen(repo, ledger, altfall(r), { datum: "2026-05-04", istbuchungId: "b1" });

    expect(daten[0].budgetrelevant).toBe(false);
  });

  it("lässt alles andere an der Buchung unangetastet", async () => {
    const { repo } = memRuecklagen();
    const { ledger, daten } = memLedger([
      {
        id: "b1", datum: "2026-05-04", betrag: -120000, kontoId: "k1",
        charakter: "Aufwand", quelle: "import", rohHash: "h1", zuPruefen: true,
        aufteilungen: [{ kategorieId: "kat", betrag: -120000 }],
      },
    ]);
    const r = await ruecklageAnlegen(repo, mitZiel);

    await ruecklageAusbuchen(repo, ledger, altfall(r), { datum: "2026-05-04", istbuchungId: "b1" });

    expect(daten[0].rohHash).toBe("h1");
    expect(daten[0].zuPruefen).toBe(true);
    expect(daten[0].aufteilungen).toHaveLength(1);
  });

  it("stolpert nicht über eine Buchung, die es nicht mehr gibt", async () => {
    const { repo, ausgebucht } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, mitZiel);

    await ruecklageAusbuchen(repo, ledger, altfall(r), { datum: "2026-05-04", istbuchungId: "weg" });

    // Die Ausbuchung steht trotzdem — sie hat stattgefunden.
    expect(ausgebucht).toHaveLength(1);
  });

  it("lehnt ein ungültiges Datum ab", async () => {
    const { repo } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, mitZiel);
    await expect(ruecklageAusbuchen(repo, ledger, altfall(r), { datum: "4.5.2026" })).rejects.toThrow(
      "ruecklage.datumUngueltig",
    );
  });
});

describe("ruecklageRateLoeschen", () => {
  it("entfernt eine Version, aber nie die letzte", async () => {
    const { repo, daten } = memRuecklagen();
    daten.push({ id: "r-zwei", bezeichnung: "Ombrast", beginn: "2024-01-01", kategorieId: "k", art: "fortlaufend", raten: [{ abMonat: "2024-01", betrag: 3000 }, { abMonat: "2025-01", betrag: 4000 }] });
    await ruecklageRateLoeschen(repo, "r-zwei", "2025-01");
    daten[0] = { ...daten[0], raten: [{ abMonat: "2024-01", betrag: 3000 }] };
    await expect(ruecklageRateLoeschen(repo, "r-zwei", "2024-01")).rejects.toThrow("ruecklage.letzteRate");
  });
});

describe("ruecklageAusbuchen an einer, die weiterläuft", () => {
  it("weist es ab — sie beginnt nie neu", async () => {
    const { repo } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, { ...frei, art: "fortlaufend" });
    const ledger = { alle: async () => [], speichern: async () => {} } as unknown as LedgerPort;
    await expect(ruecklageAusbuchen(repo, ledger, altfall(r), { datum: "2026-05-01" })).rejects.toThrow("ruecklage.laeuftWeiter");
  });
});

describe("ruecklageLoeschen", () => {
  it("entfernt die Rücklage", async () => {
    const { repo, daten } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, mitZiel);
    await ruecklageLoeschen(repo, r.id);
    expect(daten).toHaveLength(0);
  });
});

describe("Kauf und Nutzungsdauer (Migration 82, nur für die Anzeige)", () => {
  const kauf = { kaufDatum: "2024-03-15", kaufPreis: 120000, nutzungsdauerMonate: 60 };

  it("speichert alle drei an einer Rücklage, die abgeschlossen wird — das Kaufdatum darf vor dem Beginn liegen", async () => {
    const { repo, daten } = memRuecklagen();
    await ruecklageAnlegen(repo, { ...mitZiel, ...kauf, art: "abschliessend" });
    expect(daten[0].kauf).toEqual({ datum: "2024-03-15", preis: 120000, nutzungsdauerMonate: 60 });
    // Ziel, Frist und Beginn bleiben, was sie sind — gerechnet wird mit dem Kauf nichts.
    expect(daten[0]).toMatchObject({ ziel: 60000, fristMonate: 120, beginn: "2024-01-01" });
  });

  it("behält sie beim Bearbeiten, nimmt sie weg, wenn alle drei leer sind", async () => {
    const { repo, daten } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, { ...mitZiel, ...kauf });
    await ruecklageAktualisieren(repo, r.id, { ...mitZiel, ...kauf, kaufPreis: 130000 }, "2026-05-10");
    expect(daten[0].kauf?.preis).toBe(130000);
    await ruecklageAktualisieren(repo, r.id, { ...mitZiel, kaufDatum: "" }, "2026-05-10");
    expect(daten[0].kauf).toBeUndefined();
  });

  it("weist eine halbe Angabe ab, eine an einer Rücklage, die weiterläuft, und unsinnige Werte", async () => {
    const { repo } = memRuecklagen();
    await expect(ruecklageAnlegen(repo, { ...mitZiel, kaufDatum: "2024-03-15" })).rejects.toThrow("ruecklage.kaufUnvollstaendig");
    await expect(ruecklageAnlegen(repo, { ...frei, ...kauf, art: "fortlaufend" })).rejects.toThrow("ruecklage.kaufNurAbschliessend");
    await expect(ruecklageAnlegen(repo, { ...mitZiel, ...kauf, kaufDatum: "15.03.2024" })).rejects.toThrow("ruecklage.datumUngueltig");
    await expect(ruecklageAnlegen(repo, { ...mitZiel, ...kauf, kaufPreis: -5 })).rejects.toThrow("ruecklage.kaufpreisGroesserNull");
    await expect(ruecklageAnlegen(repo, { ...mitZiel, ...kauf, kaufPreis: 10.5 })).rejects.toThrow("ruecklage.kaufpreisGroesserNull");
    await expect(ruecklageAnlegen(repo, { ...mitZiel, ...kauf, nutzungsdauerMonate: -12 })).rejects.toThrow("ruecklage.nutzungsdauerGroesserNull");
  });
});
