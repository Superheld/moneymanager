import { describe, expect, it } from "vitest";
import type { Kategorie } from "../core";
import type { KategorieRepository } from "./ports";
import {
  EXPORT_FASSUNG,
  exportDateiname,
  inExportform,
  konfigurationExportieren,
  type Konfigurationsexport,
} from "./konfiguration";

function repo(kategorien: Kategorie[]): KategorieRepository {
  return {
    alle: async () => kategorien,
    speichern: async () => {},
    loeschen: async () => {},
  };
}

const BAUM: Kategorie[] = [
  { id: "k-wohnen", name: "Wohnen", defaultCharakter: "Aufwand" },
  { id: "k-miete", name: "Miete", elternId: "k-wohnen", defaultCharakter: "Aufwand" },
  { id: "k-energie", name: "Energie", elternId: "k-wohnen", defaultCharakter: "Aufwand" },
  { id: "k-gehalt", name: "Gehalt", defaultCharakter: "Ertrag" },
];

describe("inExportform", () => {
  it("stellt jede Elternkategorie vor ihre Kinder", () => {
    // Der Grund für die Sortierung: wer die Liste von oben nach unten einliest, findet
    // jedes Elternteil bereits angelegt vor. Nach Namen sortiert stünde „Energie" vor
    // „Wohnen", und ein Importeur müsste zweimal laufen.
    const namen = inExportform(BAUM).map((k) => k.id);
    for (const kind of ["k-miete", "k-energie"]) {
      expect(namen.indexOf("k-wohnen")).toBeLessThan(namen.indexOf(kind));
    }
  });

  it("sortiert Geschwister nach Namen", () => {
    const namen = inExportform(BAUM).map((k) => k.name);
    expect(namen.indexOf("Energie")).toBeLessThan(namen.indexOf("Miete"));
    expect(namen.indexOf("Gehalt")).toBeLessThan(namen.indexOf("Wohnen"));
  });

  it("macht aus einer fehlenden Elternkategorie ein null, kein undefined", () => {
    // In JSON gibt es kein `undefined`: ein Feld mit diesem Wert verschwindet beim
    // Serialisieren. Eine Wurzelkategorie sähe dann aus wie eine, bei der jemand das Feld
    // vergessen hat — und das sind zwei verschiedene Aussagen.
    const [wurzel] = inExportform([BAUM[0]]);
    expect(wurzel.elternId).toBeNull();
    expect("elternId" in wurzel).toBe(true);
  });

  it("lässt keine Waise liegen", () => {
    // Ein Export, der stillschweigend Zeilen weglässt, ist schlimmer als einer mit einer
    // Waise darin: die Lücke fällt beim Einlesen auf, das Fehlen nicht.
    const waise: Kategorie = { id: "k-waise", name: "Waise", elternId: "gibt-es-nicht", defaultCharakter: "Aufwand" };
    expect(inExportform([...BAUM, waise]).map((k) => k.id)).toContain("k-waise");
  });
});

describe("exportDateiname", () => {
  it("trägt den Tag und den Bestand", () => {
    expect(exportDateiname(new Date("2026-08-30T14:12:00Z"), "moneymanager.db")).toBe(
      "konfiguration-moneymanager-2026-08-30.json",
    );
  });

  it("hält echten Bestand und Spielstand auseinander", () => {
    // Beide Dateien liegen im SELBEN App-Datenverzeichnis — der Identifier trennt sie
    // nicht. Ohne die Kennung schriebe die installierte App denselben Namen wie der
    // Spielstand und überschriebe ihn wortlos.
    const tag = new Date("2026-08-30T14:12:00Z");
    expect(exportDateiname(tag, "moneymanager.db")).not.toBe(
      exportDateiname(tag, "moneymanager-dev.db"),
    );
  });
});

describe("konfigurationExportieren", () => {
  it("schreibt Fassung, Zeitpunkt und die Kategorien", async () => {
    let geschrieben: { name: string; inhalt: string } | null = null;
    const pfad = await konfigurationExportieren(
      repo(BAUM),
      {
        schreiben: async (name, inhalt) => {
          geschrieben = { name, inhalt };
          return `/irgendwo/${name}`;
        },
      },
      new Date("2026-08-30T14:12:00Z"),
      "moneymanager-dev.db",
    );

    expect(pfad).toBe("/irgendwo/konfiguration-moneymanager-dev-2026-08-30.json");
    const daten = JSON.parse(geschrieben!.inhalt) as Konfigurationsexport;
    expect(daten.fassung).toBe(EXPORT_FASSUNG);
    expect(daten.erzeugt).toBe("2026-08-30T14:12:00.000Z");
    expect(daten.kategorien).toHaveLength(BAUM.length);
  });

  it("schreibt kein Feld, das eine Buchung beschreibt", async () => {
    // Der Export sagt, wie der Haushalt ORDNET — nicht, was in ihm passiert ist. Diese
    // Grenze ist der Grund, warum die Datei überhaupt weitergegeben werden darf, und
    // deshalb steht sie hier als Zusicherung und nicht nur im Kopfkommentar.
    let inhalt = "";
    await konfigurationExportieren(
      repo(BAUM),
      { schreiben: async (_n, i) => ((inhalt = i), "/x") },
      new Date("2026-08-30T00:00:00Z"),
      "moneymanager-dev.db",
    );
    for (const verboten of ["betrag", "saldo", "iban", "buchung", "konto"]) {
      expect(inhalt.toLowerCase(), `„${verboten}" steht in der Exportdatei`).not.toContain(verboten);
    }
  });
});
