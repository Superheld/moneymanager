import { describe, expect, it } from "vitest";
import { exportDateiname } from "./export";

describe("exportDateiname", () => {
  it("trägt Art, Tag und Bestand", () => {
    expect(exportDateiname("konfiguration", new Date("2026-08-30T14:12:00Z"), "moneymanager.db")).toBe(
      "konfiguration-moneymanager-2026-08-30.json",
    );
  });

  it("hält echten Bestand und Spielstand auseinander", () => {
    // Beide Dateien liegen im SELBEN App-Datenverzeichnis — der Identifier trennt sie
    // nicht. Ohne die Kennung schriebe die installierte App denselben Namen wie der
    // Spielstand und überschriebe ihn wortlos.
    const tag = new Date("2026-08-30T14:12:00Z");
    expect(exportDateiname("konfiguration", tag, "moneymanager.db")).not.toBe(
      exportDateiname("konfiguration", tag, "moneymanager-dev.db"),
    );
  });

  it("hält Konfiguration und Bestand auseinander", () => {
    // Die wichtigere der beiden Trennungen: die eine Datei darf weitergegeben werden, die
    // andere ist der Kontoauszug. Sähen sie im Dateimanager gleich aus, wäre die ganze
    // Trennung im Code umsonst — verschickt wird, was man vor sich hat.
    const tag = new Date("2026-08-30T14:12:00Z");
    expect(exportDateiname("bestand", tag, "moneymanager.db")).not.toBe(
      exportDateiname("konfiguration", tag, "moneymanager.db"),
    );
    expect(exportDateiname("bestand", tag, "moneymanager.db")).toMatch(/^bestand-/);
  });
});
