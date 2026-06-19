import { describe, it, expect } from "vitest";
import type { EinstellungenRepository } from "./ports";
import { einstellungenLaden, regionWaehlen, STANDARD_EINSTELLUNGEN } from "./einstellungen";

function memRepo(): EinstellungenRepository & { daten: Record<string, string> } {
  const daten: Record<string, string> = {};
  return {
    daten,
    async lesen() { return { ...daten }; },
    async schreiben(s, w) { daten[s] = w; },
  };
}

describe("einstellungenLaden — Locale ist Quelle der Wahrheit", () => {
  it("liefert die Standard-Region, wenn nichts gesetzt ist (de-DE, EUR, de)", async () => {
    const e = await einstellungenLaden(memRepo());
    expect(e).toEqual(STANDARD_EINSTELLUNGEN);
    expect(e.locale).toBe("de-DE");
    expect(e.waehrung).toEqual({ code: "EUR", skala: 2 });
    expect(e.sprache).toBe("de");
  });

  it("leitet Währung + Sprache strikt aus der gewählten Region ab", async () => {
    const repo = memRepo();
    await regionWaehlen(repo, "de-CH"); // Schweiz: deutsch, aber CHF
    const e = await einstellungenLaden(repo);
    expect(e).toEqual({ locale: "de-CH", sprache: "de", waehrung: { code: "CHF", skala: 2 } });
  });

  it("en-US → englisch + USD", async () => {
    const repo = memRepo();
    await regionWaehlen(repo, "en-US");
    const e = await einstellungenLaden(repo);
    expect(e).toEqual({ locale: "en-US", sprache: "en", waehrung: { code: "USD", skala: 2 } });
  });

  it("unbekannte Locale fällt auf die Standard-Region zurück", async () => {
    const repo = memRepo();
    await regionWaehlen(repo, "xx-YY");
    const e = await einstellungenLaden(repo);
    expect(e).toEqual(STANDARD_EINSTELLUNGEN);
  });
});
