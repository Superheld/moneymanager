// Was der Konfigurationsimport zusichert — und was ausdrücklich nicht.
//
// Die beiden Zusicherungen, an denen alles hängt: er legt NUR an, und verglichen wird über
// den NAMEN. Beide stehen hier als Test, weil beide beim nächsten Randfall verlockend
// aussehen — „den Charakter könnte man doch gleich mitziehen", „über den Pfad wäre es
// genauer". Was daran schiefgeht, steht im Kopf von `konfigurationsimport.ts`.

import { describe, expect, it } from "vitest";
import type { Kategorie } from "../core";
import { EXPORT_FASSUNG, inExportform, type Konfigurationsexport } from "./konfiguration";
import {
  importplan,
  konfigurationLesen,
  konfigurationUebernehmen,
} from "./konfigurationsimport";
import type { KategorieRepository } from "./ports";

function datei(
  kategorien: Konfigurationsexport["kategorien"],
  fassung = EXPORT_FASSUNG,
): Konfigurationsexport {
  return { fassung, erzeugt: "2026-09-22T08:00:00.000Z", kategorien };
}

const WOHNEN = { id: "d1", name: "Wohnen", elternId: null, defaultCharakter: "Aufwand" };
const MIETE = { id: "d2", name: "Miete", elternId: "d1", defaultCharakter: "Aufwand" };

/** Ein Repository im Speicher — die Reihenfolge der Aufrufe ist hier die Aussage. */
function repository(bestand: Kategorie[] = []): KategorieRepository & { stand: Kategorie[] } {
  return {
    stand: bestand,
    async alle() {
      return [...this.stand];
    },
    async speichern(k: Kategorie) {
      this.stand = [...this.stand.filter((x) => x.id !== k.id), k];
    },
    async loeschen(id: string) {
      this.stand = this.stand.filter((x) => x.id !== id);
    },
  };
}

describe("Eine Exportdatei lesen", () => {
  it("weist zurück, was keine ist", () => {
    expect(() => konfigurationLesen("kein json")).toThrow("import.keinJson");
    expect(() => konfigurationLesen('{"kategorien":[]}')).toThrow("import.keineKonfiguration");
    expect(() => konfigurationLesen('{"fassung":1}')).toThrow("import.keineKonfiguration");
  });

  it("weist eine NEUERE Fassung ab, statt sie zu raten", () => {
    const zuNeu = JSON.stringify(datei([], EXPORT_FASSUNG + 1));
    expect(() => konfigurationLesen(zuNeu)).toThrow("import.fassungZuNeu");
  });

  it("wirft einzelne kaputte Zeilen weg, nicht die ganze Datei", () => {
    const gemischt = JSON.stringify(
      datei([WOHNEN, { id: "x", name: "", elternId: null, defaultCharakter: "Aufwand" }, {
        id: "y",
        name: "Quatsch",
        elternId: null,
        defaultCharakter: "Erfunden",
      }]),
    );
    expect(konfigurationLesen(gemischt).kategorien.map((k) => k.name)).toEqual(["Wohnen"]);
  });
});

describe("Der Plan", () => {
  it("trennt neu, vorhanden und abweichend", () => {
    const bestand: Kategorie[] = [
      { id: "b1", name: "Wohnen", defaultCharakter: "Aufwand" },
      { id: "b2", name: "Miete", elternId: "b1", defaultCharakter: "Umschichtung" },
    ];
    const plan = importplan(datei([WOHNEN, MIETE, { id: "d3", name: "Strom", elternId: "d1", defaultCharakter: "Aufwand" }]), bestand);

    expect([plan.vorhanden, plan.abweichend, plan.neu]).toEqual([1, 1, 1]);
    const miete = plan.befunde.find((b) => b.name === "Miete")!;
    expect(miete.befund).toBe("abweichend");
    expect(miete.charakterImBestand).toBe("Umschichtung");
    // Die Elternkategorie steht als NAME da — eine fremde Id sagte dem Leser nichts.
    expect(miete.eltern).toBe("Wohnen");
  });

  it("vergleicht ohne Rücksicht auf Gross- und Kleinschreibung", () => {
    const plan = importplan(datei([{ ...WOHNEN, name: "WOHNEN" }]), [
      { id: "b1", name: "Wohnen", defaultCharakter: "Aufwand" },
    ]);
    expect(plan.neu).toBe(0);
    expect(plan.vorhanden).toBe(1);
  });

  /**
   * Der Pfad wäre die genauere Antwort und die falsche: „Miete" gäbe es danach zweimal,
   * und der Name ist die Angabe, über die sonst alles aufgelöst wird.
   */
  it("hält denselben Namen unter anderen Eltern für dieselbe Kategorie", () => {
    const plan = importplan(datei([WOHNEN, MIETE]), [
      { id: "b0", name: "Fixkosten", defaultCharakter: "Aufwand" },
      { id: "b1", name: "Miete", elternId: "b0", defaultCharakter: "Aufwand" },
    ]);
    expect(plan.befunde.find((b) => b.name === "Miete")?.befund).toBe("vorhanden");
  });

  it("zählt eine in der Datei doppelte Zeile nur einmal", () => {
    const plan = importplan(datei([WOHNEN, { ...WOHNEN, id: "d9" }]), []);
    expect(plan.neu).toBe(1);
  });
});

describe("Die Runde", () => {
  /**
   * Export und Import sind zwei Hälften derselben Sache, und nur zusammen sind sie etwas
   * wert. Der Test fasst genau die Naht: was `inExportform` hinschreibt, muss der Import
   * wieder aufnehmen können — samt Baum.
   */
  it("schreibt eine Ordnung hinaus und liest dieselbe wieder ein", async () => {
    const original: Kategorie[] = [
      { id: "a", name: "Wohnen", defaultCharakter: "Aufwand" },
      { id: "b", name: "Miete", elternId: "a", defaultCharakter: "Aufwand" },
      { id: "c", name: "Nebenkosten", elternId: "a", defaultCharakter: "Aufwand" },
      { id: "d", name: "Gehalt", defaultCharakter: "Ertrag" },
    ];
    const geschrieben = JSON.stringify({
      fassung: EXPORT_FASSUNG,
      erzeugt: "2026-09-22T08:00:00.000Z",
      kategorien: inExportform(original),
    });

    const repo = repository();
    expect(await konfigurationUebernehmen(repo, konfigurationLesen(geschrieben))).toBe(4);

    const nachName = new Map(repo.stand.map((k) => [k.name, k]));
    expect([...nachName.keys()].sort()).toEqual(["Gehalt", "Miete", "Nebenkosten", "Wohnen"]);
    expect(nachName.get("Miete")!.elternId).toBe(nachName.get("Wohnen")!.id);
    expect(nachName.get("Gehalt")!.elternId).toBeUndefined();
    expect(nachName.get("Gehalt")!.defaultCharakter).toBe("Ertrag");
  });
});

describe("Das Übernehmen", () => {
  it("legt das Fehlende an und hängt es unter die Elternkategorie", async () => {
    const repo = repository();
    expect(await konfigurationUebernehmen(repo, datei([WOHNEN, MIETE]))).toBe(2);

    const wohnen = repo.stand.find((k) => k.name === "Wohnen")!;
    const miete = repo.stand.find((k) => k.name === "Miete")!;
    expect(miete.elternId).toBe(wohnen.id);
    // Nicht die Id aus der Datei: die weiss über diesen Bestand nichts.
    expect(wohnen.id).not.toBe("d1");
  });

  it("lässt Vorhandenes unberührt — auch bei abweichendem Charakter", async () => {
    const repo = repository([{ id: "b1", name: "Miete", defaultCharakter: "Umschichtung" }]);
    expect(await konfigurationUebernehmen(repo, datei([MIETE]))).toBe(0);
    expect(repo.stand).toEqual([{ id: "b1", name: "Miete", defaultCharakter: "Umschichtung" }]);
  });

  it("ist beim zweiten Lauf folgenlos", async () => {
    const repo = repository();
    await konfigurationUebernehmen(repo, datei([WOHNEN, MIETE]));
    expect(await konfigurationUebernehmen(repo, datei([WOHNEN, MIETE]))).toBe(0);
    expect(repo.stand).toHaveLength(2);
  });

  /**
   * Eine kaputte Datei — das Kind steht vor seinen Eltern, die es gar nicht gibt. Es kommt
   * als Hauptkategorie herein: sichtbar und umhängbar, statt stillschweigend zu fehlen.
   */
  it("nimmt ein Kind ohne Eltern als Hauptkategorie auf", async () => {
    const repo = repository();
    expect(await konfigurationUebernehmen(repo, datei([{ ...MIETE, elternId: "gibtesnicht" }]))).toBe(1);
    expect(repo.stand[0].elternId).toBeUndefined();
  });
});
