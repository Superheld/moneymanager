// Der Rückfluss — ein Aufwand, bei dem das Geld HEREINkam.
//
// Er ist der eine Fall, in dem Einordnung und Richtung auseinanderfallen. „Aufwand" sagt,
// WOFÜR das Geld war; das Vorzeichen sagt, wohin es floss. Bei einer Erstattung zeigen
// beide in verschiedene Richtungen, und deshalb steht sie als **Aufwand mit positivem
// Betrag** da.
//
// Warum diese Datei quer über mehrere Bereiche testet, statt die Fälle je Modul zu
// verteilen: der Fehler ist nie „eine Funktion ist falsch", sondern immer derselbe Griff —
// jemand leitet das Vorzeichen aus dem Charakter ab (oder aus dem `defaultCharakter` der
// Kategorie), statt das vorhandene zu nehmen. Der Griff wandert, und er wandert genau
// dorthin, wo gerade kein Test steht. Ein Ort, an dem alle Rechenwege mit demselben Fall
// beschossen werden, findet die nächste Stelle; fünf verstreute Fälle finden sie nicht.
//
// Alle Beträge hier sind erfunden.

import { describe, expect, it } from "vitest";
import { istMonatsverlauf, kategorieAggregat } from "./historie";
import { monatsAusblick } from "../monatsausblick";
import type { IstBuchung } from "./istbuchung";
import type { Kategorie } from "../kategorien/kategorie";
import type { Zahlungskonto } from "../konten/konto";

function konto(saldo: number): Zahlungskonto {
  return { id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo };
}

function buchung(
  datum: string,
  betrag: number,
  charakter: IstBuchung["charakter"],
  kategorieId?: string,
): IstBuchung {
  return { id: datum + betrag, datum, betrag, kontoId: "k1", charakter, quelle: "import", kategorieId };
}

/** Die Kategorie der Ausgabe — ihre Vorgabe ist „Aufwand", auch für den Rückfluss. */
const LEBENSMITTEL: Kategorie = { id: "le", name: "Lebensmittel", defaultCharakter: "Aufwand" };

describe("Rückfluss im Monatsverlauf", () => {
  it("entlastet die Ausgaben seines Monats, statt sie zu erhöhen", () => {
    const r = istMonatsverlauf(
      [konto(0)],
      [buchung("2022-03-04", -8000, "Aufwand"), buchung("2022-03-19", 3000, "Aufwand")],
      "2022-03-01",
      "2022-03-01",
    );
    // Nicht −11000: der Rückfluss zieht ab, er kommt nicht dazu.
    expect(r[0].ausgaben).toBe(-5000);
  });

  it("hebt den laufenden Saldo, weil Geld hereinkam", () => {
    const r = istMonatsverlauf([konto(20000)], [buchung("2022-03-19", 3000, "Aufwand")], "2022-03-01", "2022-03-01");
    expect(r[0].saldo).toBe(23000);
    expect(r[0].netto).toBe(3000);
  });

  it("lässt die Ausgabensumme positiv werden, wenn ein Monat nur Rückflüsse trägt", () => {
    // Die Zusicherung „Σ Aufwände ≤ 0" am Feld gilt hier bewusst NICHT. Wer sie erzwänge —
    // etwa mit `Math.min(0, …)` — verlöre den Rückfluss aus der Rechnung, und der Saldo
    // liefe von dem der Bank weg. Genau diese Abweichung ist teuer zu finden, weil sie
    // erst beim Abgleich auffällt und dort wie eine fehlende Buchung aussieht.
    const r = istMonatsverlauf([konto(0)], [buchung("2022-03-19", 3000, "Aufwand")], "2022-03-01", "2022-03-01");
    expect(r[0].ausgaben).toBe(3000);
  });

  it("zählt ihn NICHT zu den Einnahmen", () => {
    // Der naheliegende „Fix" wäre, nach dem Vorzeichen statt nach dem Charakter zu
    // sortieren. Dann stünde eine Erstattung unter den Einnahmen, bliebe dort für immer
    // und bliese sie auf, statt die Ausgabe auszugleichen, in deren Kategorie sie gehört.
    const r = istMonatsverlauf([konto(0)], [buchung("2022-03-19", 3000, "Aufwand")], "2022-03-01", "2022-03-01");
    expect(r[0].einnahmen).toBe(0);
  });

  it("verschiebt den Saldo um seinen Betrag, nicht um das Doppelte", () => {
    // Ein einmal zu viel gedrehtes Vorzeichen verschiebt IMMER um 2 × Betrag — das ist
    // die Signatur dieses Fehlers, und sie ist der Grund, warum er sich am Abgleich
    // überhaupt bemerkbar macht. Der Test hält die Signatur fest, nicht nur das Ergebnis.
    const ohne = istMonatsverlauf([konto(50000)], [], "2022-03-01", "2022-03-01")[0].saldo;
    const mit = istMonatsverlauf([konto(50000)], [buchung("2022-03-19", 3000, "Aufwand")], "2022-03-01", "2022-03-01")[0].saldo;
    expect(mit - ohne).toBe(3000);
  });
});

describe("Rückfluss im Kategorie-Aggregat", () => {
  it("mindert die Summe der Kategorie, in der die Ausgabe stattfand", () => {
    const r = kategorieAggregat(
      [buchung("2022-03-04", -8000, "Aufwand", "le"), buchung("2022-03-19", 3000, "Aufwand", "le")],
      "2022-03-01",
      "2022-03-01",
      [LEBENSMITTEL],
    );
    expect(r[0]).toMatchObject({ kategorieId: "le", summe: -5000, anzahl: 2 });
  });

  it("behält das Etikett Aufwand, auch wenn die Summe dadurch positiv wird", () => {
    // Das Etikett kommt aus der Kategorie und beschreibt den ZWECK. Es darf nicht nach
    // dem Vorzeichen der Summe umschlagen — sonst hiesse dieselbe Kategorie mal so und
    // mal so, je nachdem welcher Monat gerade angezeigt wird.
    const r = kategorieAggregat([buchung("2022-03-19", 3000, "Aufwand", "le")], "2022-03-01", "2022-03-01", [
      LEBENSMITTEL,
    ]);
    expect(r[0]).toMatchObject({ kategorieId: "le", summe: 3000, charakter: "Aufwand" });
  });

  it("hebt eine Ausgabe vollständig auf, wenn er sie exakt erstattet", () => {
    const r = kategorieAggregat(
      [buchung("2022-03-04", -4200, "Aufwand", "le"), buchung("2022-03-19", 4200, "Aufwand", "le")],
      "2022-03-01",
      "2022-03-01",
      [LEBENSMITTEL],
    );
    // Summe null, aber ZWEI Posten — die Zeile verschwindet nicht, sie ist nur ausgeglichen.
    expect(r[0]).toMatchObject({ summe: 0, anzahl: 2 });
  });
});

describe("Rückfluss im Monatsausblick", () => {
  // Der Ausblick verzweigt an zwei Stellen auf den Charakter: Erträge werden zu weiteren
  // Einnahmen, Aufwände zu sonstigen Ausgaben. Ein Rückfluss geht durch den zweiten Zweig
  // — mit positivem Betrag. Er darf dort weder negiert noch zu den Einnahmen umsortiert
  // werden; beides verschöbe das Ergebnis, das eine um das Doppelte, das andere dauerhaft.
  const grund = {
    regeln: [],
    budgets: [],
    ist: [],
    kategorien: [LEBENSMITTEL],
    vertragsBuchungen: new Set<string>(),
    heute: "2022-03-16",
    monatAb: "2022-03-01",
  };

  it("hebt das Ist-Ergebnis um seinen Betrag", () => {
    const ohne = monatsAusblick({ ...grund });
    const mit = monatsAusblick({ ...grund, ist: [buchung("2022-03-19", 3000, "Aufwand", "le")] });
    expect(mit.restIst! - ohne.restIst!).toBe(3000);
  });

  it("erscheint unter „sonstiges“ und nicht unter den Einnahmen", () => {
    const a = monatsAusblick({ ...grund, ist: [buchung("2022-03-19", 3000, "Aufwand", "le")] });
    const sonstiges = a.zeilen.find((z) => z.id === "sonstiges");
    const einnahmen = a.zeilen.find((z) => z.id === "einnahmen");
    expect(sonstiges?.ist).toBe(3000);
    expect(einnahmen?.ist ?? 0).toBe(0);
  });

  it("gleicht eine Ausgabe desselben Monats aus, statt sie zu verdoppeln", () => {
    const a = monatsAusblick({
      ...grund,
      ist: [buchung("2022-03-04", -4200, "Aufwand", "le"), buchung("2022-03-19", 4200, "Aufwand", "le")],
    });
    expect(a.zeilen.find((z) => z.id === "sonstiges")?.ist).toBe(0);
  });
});
