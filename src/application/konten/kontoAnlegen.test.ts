import { describe, it, expect } from "vitest";
import { euroZuCent, type Zahlungskonto } from "../../core";
import type { ZahlungskontoRepository } from "../ports";
import { kontoAnlegen } from "./kontoAnlegen";

function memKonto(): ZahlungskontoRepository & { daten: Zahlungskonto[] } {
  const daten: Zahlungskonto[] = [];
  // `speichern` laesst `aktiv` stehen und `aktivSetzen` aendert NUR das — genau wie der
  // SQLite-Weg. Eine Attrappe, die beides vermischte, liesse den Fall durchgehen, gegen
  // den die Trennung gebaut ist (Bearbeiten macht ein stillgelegtes Konto wieder aktiv).
  return { daten, async alle() { return [...daten]; }, async speichern(k) { const i = daten.findIndex((x) => x.id === k.id); if (i >= 0) daten[i] = { ...k, aktiv: daten[i].aktiv }; else daten.push(k); }, async aktivSetzen(id, aktiv) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten[i] = { ...daten[i], aktiv }; }, async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); } };
}
describe("kontoAnlegen", () => {
  it("rechnet den Anfangsbestand in Cent", async () => {
    const repo = memKonto();
    const k = await kontoAnlegen(repo, { bezeichnung: "Giro", typ: "Giro", klasse: "liquide", saldo: euroZuCent(1000) });
    expect(k.saldo).toBe(euroZuCent(1000));
  });
  it("ohne Saldo → 0", async () => {
    const k = await kontoAnlegen(memKonto(), { bezeichnung: "Bar", typ: "Bargeld", klasse: "liquide" });
    expect(k.saldo).toBe(0);
  });
  it("weist eine ungültige IBAN ab", async () => {
    await expect(kontoAnlegen(memKonto(), { bezeichnung: "Giro", typ: "Giro", klasse: "liquide", iban: "DE00 0000" })).rejects.toThrow("iban.ungueltig");
  });
});
