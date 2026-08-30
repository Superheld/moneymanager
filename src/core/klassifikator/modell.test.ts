import { describe, expect, it } from "vitest";
import { aufteilen, bewerten, kategorieprofile, klassifizieren, trainieren, type Beispiel, verwechslungsmatrix } from "./modell";

/** Ein kleines, klar trennbares Problem — die Aussagen sollen am Verhalten hängen. */
function daten(): Beispiel[] {
  const b: Beispiel[] = [];
  for (let i = 0; i < 20; i++) {
    b.push({ merkmale: ["emp=rewe", "vwz:einkauf", "vz:-"], kategorieId: "lebensmittel" });
    b.push({ merkmale: ["emp=shell", "vwz:tanken", "vz:-"], kategorieId: "sprit" });
    b.push({ merkmale: ["emp=arbeitgeber", "vwz:gehalt", "vz:+"], kategorieId: "gehalt" });
  }
  return b;
}

describe("Training", () => {
  it("lernt eine trennbare Aufgabe vollständig", () => {
    const m = trainieren(daten());
    expect(klassifizieren(m, ["emp=rewe", "vwz:einkauf", "vz:-"])?.kategorieId).toBe("lebensmittel");
    expect(klassifizieren(m, ["emp=shell", "vwz:tanken", "vz:-"])?.kategorieId).toBe("sprit");
    expect(klassifizieren(m, ["emp=arbeitgeber", "vwz:gehalt", "vz:+"])?.kategorieId).toBe("gehalt");
  });

  it("baut Vokabular und Kategorien sortiert auf — gleiches Material, gleiches Layout", () => {
    const m = trainieren(daten());
    expect([...m.kategorien]).toEqual(["gehalt", "lebensmittel", "sprit"]);
    expect([...m.vokabular]).toEqual([...m.vokabular].sort());
    expect(m.gewichte.length).toBe(m.kategorien.length * m.vokabular.length);
    expect(m.beispiele).toBe(60);
  });

  it("ist deterministisch — zweimal dasselbe Material ergibt Bit für Bit dasselbe Modell", () => {
    // Ohne gesetzten Generator lieferte jeder Klick auf „Training starten" ein anderes
    // Modell, und keine Messung wäre wiederholbar.
    const a = trainieren(daten());
    const b = trainieren(daten());
    expect([...a.gewichte]).toEqual([...b.gewichte]);
    expect([...a.bias]).toEqual([...b.bias]);
  });

  it("ein anderer Seed ergibt ein anderes Modell", () => {
    const a = trainieren(daten(), { seed: 1 });
    const b = trainieren(daten(), { seed: 2 });
    expect([...a.gewichte]).not.toEqual([...b.gewichte]);
  });

  it("leeres Material ergibt ein leeres Modell statt eines Fehlers", () => {
    // „Noch nichts gelernt" ist ein gültiger Zustand der App.
    const m = trainieren([]);
    expect(m.kategorien).toHaveLength(0);
    expect(m.beispiele).toBe(0);
    expect(klassifizieren(m, ["emp=rewe"])).toBeNull();
  });

  it("kommt mit einer einzigen Kategorie zurecht", () => {
    const m = trainieren([{ merkmale: ["emp=rewe"], kategorieId: "lebensmittel" }]);
    expect(klassifizieren(m, ["emp=rewe"])?.kategorieId).toBe("lebensmittel");
  });

  it("übersteht große Scores ohne NaN", () => {
    // Ohne die Verschiebung gegen den Maximalwert läuft exp() über und alle
    // Wahrscheinlichkeiten werden NaN — das Modell klassifizierte dann irgendwas.
    const viele = Array.from({ length: 200 }, () => ({
      merkmale: Array.from({ length: 50 }, (_, i) => `t${i}`),
      kategorieId: "a",
    }));
    const m = trainieren(viele, { epochen: 50, lernrate: 5 });
    const k = klassifizieren(m, Array.from({ length: 50 }, (_, i) => `t${i}`));
    expect(Number.isFinite(k!.sicherheit)).toBe(true);
    expect(k!.kategorieId).toBe("a");
  });
});

describe("Klassifikation und Begründung", () => {
  it("nennt die stärksten Belege für die gewählte Kategorie", () => {
    const m = trainieren(daten());
    const k = klassifizieren(m, ["emp=rewe", "vwz:einkauf", "vz:-"])!;
    // Bei einem linearen Modell IST die Begründung das Modell — die Belege müssen aus
    // den Merkmalen der Zahlung stammen, nicht aus einer Näherung daneben.
    expect(k.beitraege.length).toBeGreaterThan(0);
    expect(k.beitraege.map((b) => b.merkmal)).toContain("emp=rewe");
    for (const b of k.beitraege) expect(["emp=rewe", "vwz:einkauf", "vz:-"]).toContain(b.merkmal);
  });

  it("sortiert Belege nach Stärke", () => {
    const m = trainieren(daten());
    const k = klassifizieren(m, ["emp=rewe", "vwz:einkauf", "vz:-"])!;
    const staerken = k.beitraege.map((b) => Math.abs(b.gewicht));
    expect([...staerken]).toEqual([...staerken].sort((a, b) => b - a));
  });

  it("ignoriert unbekannte Merkmale und meldet sie getrennt", () => {
    const m = trainieren(daten());
    const k = klassifizieren(m, ["emp=rewe", "vwz:einkauf", "vz:-", "emp=voellig-neu"])!;
    expect(k.unbekannt).toEqual(["emp=voellig-neu"]);
    expect(k.kategorieId).toBe("lebensmittel");
  });

  it("legt sich auch bei völlig unbekannter Zahlung fest", () => {
    // Keine Konfidenzschwelle: das Modell entscheidet immer, die Sicherheit ist zum
    // Anschauen da, nicht zum Verwerfen.
    const m = trainieren(daten());
    const k = klassifizieren(m, ["emp=nie-gesehen"])!;
    expect(m.kategorien).toContain(k.kategorieId);
    expect(k.unbekannt).toEqual(["emp=nie-gesehen"]);
  });

  it("liefert eine Sicherheit zwischen 0 und 1, hoch bei klarem Fall", () => {
    const m = trainieren(daten());
    const klar = klassifizieren(m, ["emp=rewe", "vwz:einkauf", "vz:-"])!;
    expect(klar.sicherheit).toBeGreaterThan(0);
    expect(klar.sicherheit).toBeLessThanOrEqual(1);
    expect(klar.sicherheit).toBeGreaterThan(0.8);
  });
});

describe("Bewertung", () => {
  it("misst Genauigkeit und schlüsselt nach Kategorie auf", () => {
    const m = trainieren(daten());
    const b = bewerten(m, daten());
    expect(b.genauigkeit).toBe(1);
    expect(b.gesamt).toBe(60);
    expect(b.jeKategorie).toHaveLength(3);
  });

  it("nennt die schwächste Kategorie zuerst", () => {
    const m = trainieren(daten());
    // Eine Kategorie, die das Modell nie gesehen hat, muss ganz oben stehen.
    const b = bewerten(m, [...daten(), { merkmale: ["emp=fremd"], kategorieId: "unbekannt" }]);
    expect(b.jeKategorie[0].kategorieId).toBe("unbekannt");
    expect(b.jeKategorie[0].richtig).toBe(0);
  });

  it("leere Prüfmenge ergibt Genauigkeit 0 statt NaN", () => {
    expect(bewerten(trainieren(daten()), []).genauigkeit).toBe(0);
  });
});

describe("Aufteilen", () => {
  it("teilt vollständig und überschneidungsfrei", () => {
    const alle = daten();
    const { training, pruefung } = aufteilen(alle, 0.2);
    expect(training.length + pruefung.length).toBe(alle.length);
    expect(pruefung.length).toBe(12); // 20 % von 60
  });

  it("ist deterministisch bei gleichem Seed und verschieden bei anderem", () => {
    const alle = daten();
    const a = aufteilen(alle, 0.2, 7);
    const b = aufteilen(alle, 0.2, 7);
    const c = aufteilen(alle, 0.2, 8);
    expect(a.pruefung).toEqual(b.pruefung);
    expect(a.pruefung).not.toEqual(c.pruefung);
  });

  it("mischt, statt hinten abzuschneiden", () => {
    // Ein Schnitt ohne Mischen träfe bei sortiertem Material genau eine Kategorie — die
    // Prüfmenge bestünde dann aus lauter Zeilen, die das Modell nie gesehen hat.
    const sortiert: Beispiel[] = [
      ...Array.from({ length: 30 }, () => ({ merkmale: ["a"], kategorieId: "erste" })),
      ...Array.from({ length: 30 }, () => ({ merkmale: ["b"], kategorieId: "zweite" })),
    ];
    const { pruefung } = aufteilen(sortiert, 0.2);
    expect(new Set(pruefung.map((p) => p.kategorieId)).size).toBe(2);
  });
});

describe("Verwechslungen", () => {
  /** Ein Modell, das „b" nie gesehen hat und Beispiele davon zwangsläufig verwechselt. */
  function schiefesModell() {
    return trainieren([
      { merkmale: ["x"], kategorieId: "a" },
      { merkmale: ["y"], kategorieId: "c" },
    ]);
  }

  it("nennt, was wofür gehalten wurde", () => {
    const m = schiefesModell();
    const b = bewerten(m, [{ merkmale: ["x"], kategorieId: "b" }]);
    expect(b.verwechslungen).toEqual([{ tatsaechlich: "b", vorhergesagt: "a", anzahl: 1 }]);
  });

  it("zählt gleiche Paare zusammen und sortiert absteigend", () => {
    const m = schiefesModell();
    const b = bewerten(m, [
      { merkmale: ["x"], kategorieId: "b" },
      { merkmale: ["x"], kategorieId: "b" },
      { merkmale: ["y"], kategorieId: "d" },
    ]);
    expect(b.verwechslungen[0]).toEqual({ tatsaechlich: "b", vorhergesagt: "a", anzahl: 2 });
    expect(b.verwechslungen[1]).toEqual({ tatsaechlich: "d", vorhergesagt: "c", anzahl: 1 });
  });

  it("führt richtige Zuordnungen NICHT als Verwechslung", () => {
    const m = trainieren(daten());
    expect(bewerten(m, daten()).verwechslungen).toEqual([]);
  });

  it("ein leeres Modell erzeugt keine Verwechslungen, aber zählt den Fehlschlag", () => {
    // Ohne Vorhersage gibt es keine Zelle, in die man sie eintragen könnte.
    const b = bewerten(trainieren([]), [{ merkmale: ["x"], kategorieId: "a" }]);
    expect(b.verwechslungen).toEqual([]);
    expect(b.genauigkeit).toBe(0);
    expect(b.jeKategorie[0]).toEqual({ kategorieId: "a", richtig: 0, gesamt: 1 });
  });
});

describe("Verwechslungsmatrix", () => {
  it("nimmt nur Kategorien auf, die an einem Fehler beteiligt sind", () => {
    const m = trainieren([
      { merkmale: ["x"], kategorieId: "a" },
      { merkmale: ["y"], kategorieId: "c" },
    ]);
    // „c" wird richtig erkannt und ist an keinem Fehler beteiligt; „b" und „a" schon.
    const b = bewerten(m, [
      { merkmale: ["x"], kategorieId: "b" },
      { merkmale: ["y"], kategorieId: "c" },
    ]);
    expect(verwechslungsmatrix(b).kategorien).toEqual(["a", "b"]);
  });

  it("trägt Diagonale und Fehlerzellen in dieselbe Zeile", () => {
    const m = trainieren([
      { merkmale: ["x"], kategorieId: "a" },
      { merkmale: ["y"], kategorieId: "b" },
    ]);
    const b = bewerten(m, [
      { merkmale: ["x"], kategorieId: "a" }, // richtig → Diagonale
      { merkmale: ["y"], kategorieId: "a" }, // falsch → a wurde als b gelesen
    ]);
    const zeile = verwechslungsmatrix(b).zeilen.find((z) => z.kategorieId === "a")!;
    expect(zeile.gesamt).toBe(2);
    expect(zeile.richtig).toBe(1);
    expect(zeile.zellen.get("a")).toBe(1);
    expect(zeile.zellen.get("b")).toBe(1);
  });

  it("eine Kategorie, die nur als falsche Vorhersage auftaucht, hat eine leere Zeile", () => {
    // Sie kam in der Prüfmenge nie vor — sie hat keine Zeilensumme, steht aber als
    // Spalte da, sonst fehlte das Ziel der Verwechslung.
    const m = trainieren([{ merkmale: ["x"], kategorieId: "a" }]);
    const b = bewerten(m, [{ merkmale: ["x"], kategorieId: "b" }]);
    const zeile = verwechslungsmatrix(b).zeilen.find((z) => z.kategorieId === "a")!;
    expect(zeile.gesamt).toBe(0);
    expect(zeile.zellen.size).toBe(0);
  });

  it("bleibt bei fehlerfreier Erkennung leer", () => {
    const b = bewerten(trainieren(daten()), daten());
    expect(verwechslungsmatrix(b).kategorien).toEqual([]);
    expect(verwechslungsmatrix(b).zeilen).toEqual([]);
  });

  it("Zeilensumme stimmt mit der Bewertung überein", () => {
    // Die Matrix darf keine Zahlen erfinden: was in einer Zeile steht, muss zusammen
    // die Beispielzahl dieser Kategorie ergeben.
    const m = trainieren([
      { merkmale: ["x"], kategorieId: "a" },
      { merkmale: ["y"], kategorieId: "b" },
    ]);
    const b = bewerten(m, [
      { merkmale: ["x"], kategorieId: "a" },
      { merkmale: ["y"], kategorieId: "a" },
      { merkmale: ["x"], kategorieId: "b" },
    ]);
    for (const z of verwechslungsmatrix(b).zeilen) {
      if (z.gesamt === 0) continue;
      const summe = [...z.zellen.values()].reduce((s, n) => s + n, 0);
      expect(summe).toBe(z.gesamt);
    }
  });
});

describe("Was eine Kategorie auszeichnet", () => {
  /** Zwei klar getrennte Kategorien, dazu ein Wort, das in beiden steht. */
  function gemischt() {
    const b: Beispiel[] = [];
    for (let i = 0; i < 20; i++) {
      b.push({ merkmale: ["emp=talmer", "vwz:einkauf", "vwz:kartenzahlung"], kategorieId: "lebensmittel" });
      b.push({ merkmale: ["emp=nordwig", "vwz:fahrschein", "vwz:kartenzahlung"], kategorieId: "mobilitaet" });
    }
    return trainieren(b);
  }

  it("nennt je Kategorie die Merkmale, die für sie sprechen", () => {
    const profile = kategorieprofile(gemischt());
    const lm = profile.find((p) => p.kategorieId === "lebensmittel")!;
    expect(lm.kennzeichen[0].merkmal).toMatch(/talmer|einkauf/);
    expect(lm.kennzeichen.map((k) => k.merkmal)).not.toContain("emp=nordwig");
  });

  it("drückt ein Wort weg, das in jeder Kategorie steht", () => {
    // „kartenzahlung" kommt in beiden Kategorien gleich oft vor. Ohne die Zentrierung
    // stünde es in JEDER Wolke gross da — als Kennzeichen von allem, also von nichts.
    const profile = kategorieprofile(gemischt());
    for (const p of profile) {
      const platz = p.kennzeichen.findIndex((k) => k.merkmal === "vwz:kartenzahlung");
      expect(platz === -1 || platz > 1).toBe(true);
    }
  });

  it("liefert für ein leeres Modell nichts, statt zu werfen", () => {
    expect(kategorieprofile(trainieren([]))).toEqual([]);
  });
});
