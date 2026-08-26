import { describe, expect, it } from "vitest";
import { heute } from "./sicherung";

describe("Stichtag einer Sicherung", () => {
  it("nimmt die ORTSZEIT, nicht UTC", () => {
    // Kurz vor Mitternacht Ortszeit. Mit `toISOString()` wäre das je nach Zeitzone schon
    // der Folgetag — die Staffelung zählte dann Tage, die es für den Nutzer nie gab.
    const spaet = new Date(2026, 7, 26, 23, 45, 0);
    expect(heute(spaet)).toBe("2026-08-26");
  });

  it("füllt Monat und Tag auf zwei Stellen", () => {
    expect(heute(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });
});
