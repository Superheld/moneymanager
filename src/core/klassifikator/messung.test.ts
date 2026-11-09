import { describe, expect, it } from "vitest";
import { bewerten, trainieren, type Beispiel, type Bewertung } from "./modell";
import {
  empfaengerLinie,
  HANDVERLESEN_AB,
  kalibrierung,
  klassenwerte,
  pruefmengeWaehlen,
  zeitlichAufteilen,
} from "./messung";

/** Ein Beispiel am Tag `tag` (1…28) im März. */
function am(tag: number, kategorieId: string, merkmale: string[] = ["emp=ohlert"], handverlesen = false): Beispiel {
  return { merkmale, kategorieId, datum: `2026-03-${String(tag).padStart(2, "0")}`, handverlesen };
}

describe("zeitlichAufteilen", () => {
  it("prüft an den JÜNGSTEN Buchungen, gleich in welcher Reihenfolge sie kommen", () => {
    // Durcheinander geliefert — die Aufteilung darf nicht an der Eingangsreihenfolge
    // hängen, sonst wäre „Zukunft" Zufall.
    const b = [am(9, "a"), am(1, "a"), am(10, "a"), am(3, "a"), am(7, "a"), am(2, "a"), am(5, "a"), am(4, "a"), am(8, "a"), am(6, "a")];
    const { training, pruefung, stichtag } = zeitlichAufteilen(b, 0.2);
    expect(pruefung.map((x) => x.datum)).toEqual(["2026-03-09", "2026-03-10"]);
    expect(training).toHaveLength(8);
    expect(stichtag).toBe("2026-03-09");
    // Nichts aus der Prüfzeit steht im Training.
    expect(training.every((x) => x.datum! < stichtag!)).toBe(true);
  });

  it("legt Beispiele ohne Datum ins Training", () => {
    const { training, pruefung } = zeitlichAufteilen([{ merkmale: ["x"], kategorieId: "a" }, am(1, "a"), am(2, "a")], 0.5);
    expect(pruefung.map((x) => x.datum)).toEqual(["2026-03-02"]);
    expect(training).toHaveLength(2);
  });

  it("rollt mit `abschnittEnde` zurück — das Fenster davor, trainiert auf allem davor", () => {
    const b = Array.from({ length: 10 }, (_, i) => am(i + 1, "a"));
    const { training, pruefung } = zeitlichAufteilen(b, 0.1, 0.2);
    expect(pruefung.map((x) => x.datum)).toEqual(["2026-03-08"]);
    expect(training).toHaveLength(7);
  });
});

describe("pruefmengeWaehlen", () => {
  it("prüft nur an handverlesenen Labels, wenn genug davon da sind", () => {
    const gold = Array.from({ length: HANDVERLESEN_AB }, (_, i) => am(1 + (i % 28), "a", ["x"], true));
    const auto = Array.from({ length: 50 }, () => am(1, "b"));
    const r = pruefmengeWaehlen([...auto, ...gold]);
    expect(r.art).toBe("handverlesen");
    expect(r.beispiele).toHaveLength(HANDVERLESEN_AB);
  });

  it("fällt auf alle zurück und sagt es, wenn zu wenige handverlesen sind", () => {
    const r = pruefmengeWaehlen([am(1, "a", ["x"], true), am(2, "b")]);
    expect(r.art).toBe("alle");
    expect(r.beispiele).toHaveLength(2);
  });
});

describe("empfaengerLinie", () => {
  it("schlägt den Empfänger nach und fällt sonst auf die häufigste Kategorie zurück", () => {
    const training = [
      am(1, "a", ["emp=ohlert"]), am(2, "a", ["emp=ohlert"]), am(3, "b", ["emp=ohlert"]),
      am(4, "c", ["emp=vibora"]),
    ];
    const pruefung = [
      am(5, "a", ["emp=ohlert"]), // nachgeschlagen: a — richtig
      am(6, "c", ["emp=vibora"]), // nachgeschlagen: c — richtig
      am(7, "c", ["emp=kesselmann"]), // unbekannt → häufigste (a) — falsch
      am(8, "a", ["vwz:nur"]), // ohne Empfänger → a — richtig
    ];
    const r = empfaengerLinie(training, pruefung)!;
    expect(r.genauigkeit).toBe(0.75);
    expect(r.abdeckung).toBe(0.5);
  });

  it("ist null ohne Material", () => {
    expect(empfaengerLinie([], [am(1, "a")])).toBeNull();
  });
});

/** Eine Bewertung von Hand: was tatsächlich war → was vorhergesagt wurde. */
function bewertungAus(paare: [string, string][]): Bewertung {
  // Ein Modell, das stur sein Merkmal auf die vorhergesagte Kategorie abbildet.
  const kats = [...new Set(paare.map(([, v]) => v))];
  const modell = trainieren(kats.flatMap((k) => Array.from({ length: 10 }, () => ({ merkmale: [`m:${k}`], kategorieId: k }))));
  return bewerten(modell, paare.map(([ist, vor]) => ({ merkmale: [`m:${vor}`], kategorieId: ist })));
}

describe("klassenwerte", () => {
  it("rechnet Precision, Recall und F1 je Kategorie", () => {
    // a: 3 echt, davon 2 erkannt; b: 1 echt, erkannt; einmal a für b gehalten.
    const k = klassenwerte(bewertungAus([["a", "a"], ["a", "a"], ["a", "b"], ["b", "b"]]));
    const a = k.jeKategorie.find((x) => x.kategorieId === "a")!;
    const b = k.jeKategorie.find((x) => x.kategorieId === "b")!;
    expect(a.precision).toBe(1);
    expect(a.recall).toBeCloseTo(2 / 3);
    expect(b.precision).toBe(0.5);
    expect(b.recall).toBe(1);
    expect(b.f1).toBeCloseTo(2 / 3);
  });

  it("zählt im Macro-F1 jede Kategorie gleich — eine verfehlte seltene kostet so viel wie eine häufige", () => {
    // 9× a richtig, die eine c wird für a gehalten: Genauigkeit 90 %, aber c ist nie erkannt.
    const b = bewertungAus([...Array.from({ length: 9 }, () => ["a", "a"] as [string, string]), ["c", "a"]]);
    expect(b.genauigkeit).toBeCloseTo(0.9);
    const k = klassenwerte(b);
    const c = k.jeKategorie.find((x) => x.kategorieId === "c")!;
    expect(c.recall).toBe(0);
    expect(c.precision).toBeNull(); // nie vorhergesagt — keine Behauptung
    expect(k.macroF1!).toBeLessThan(0.5);
  });
});

describe("kalibrierung", () => {
  it("sortiert Vorhersagen in Fächer und misst die Abdeckung je Schwelle", () => {
    const b = bewertungAus([["a", "a"], ["a", "a"], ["b", "b"], ["a", "b"]]);
    const k = kalibrierung(b)!;
    expect(k.faecher.reduce((s, f) => s + f.anzahl, 0)).toBe(4);
    expect(k.ece).toBeGreaterThanOrEqual(0);
    expect(k.ece).toBeLessThanOrEqual(1);
    expect(k.schwellen[0].schwelle).toBe(0.5);
    // Die Abdeckung fällt mit steigender Schwelle, nie umgekehrt.
    for (let i = 1; i < k.schwellen.length; i++) {
      expect(k.schwellen[i].abdeckung).toBeLessThanOrEqual(k.schwellen[i - 1].abdeckung);
    }
  });

  it("ist null ohne Vorhersagen", () => {
    expect(kalibrierung(bewerten(trainieren([]), []))).toBeNull();
  });
});
