// Der Abruf-Ablauf, ohne Netz und ohne Oberfläche: In-Memory-Fakes für alle Ports.
//
// Geprüft wird, was der Ablauf entscheidet — der Zeitraum, die Zuordnung zum richtigen
// Konto, das Fortschreiben des Stands und der Umgang mit einem Konto, das ausfällt.

import { describe, expect, it } from "vitest";
import type { Zahlungskonto } from "../../core";
import type { Abrufadapter, Abrufsitzung, Bankkonto, Bankzugang } from "./abrufPort";
import type { Kontozuordnung } from "./bankzugangPort";
import { ERSTABRUF_TAGE, RUECKGRIFF_TAGE, abrufAusfuehren, abrufStart } from "./abrufAusfuehren";

const HEUTE = "2026-08-18";

const zugang: Bankzugang = {
  id: "z1",
  bezeichnung: "Musterbank",
  url: "https://fints.example/fints",
  blz: "10000001",
  benutzer: "12345",
};

function bankkonto(over: Partial<Bankkonto> = {}): Bankkonto {
  return {
    nummer: "9876543210",
    unterkonto: "Girokonto",
    schluessel: "9876543210|Girokonto",
    iban: "[entfernt]",
    bezeichnung: "Girokonto",
    waehrung: "EUR",
    kannSaldo: true,
    kannUmsaetze: true,
    adressierbar: true,
    ...over,
  };
}

const konto: Zahlungskonto = {
  id: "k1",
  bezeichnung: "Giro",
  typ: "Giro",
  inhaberIds: [],
  saldo: 0,
};

/** Merkt sich, mit welchem Zeitraum gefragt wurde, und liefert eine feste Buchung. */
function fakeAdapter(opt: { konten: Bankkonto[]; wirft?: boolean }) {
  const anfragen: { schluessel: string; von: string; bis: string }[] = [];
  const sitzung: Abrufsitzung = {
    konten: opt.konten,
    bankparameter: () => '{"systemId":"S"}',
    hinweise: [],
    bankNachrichten: [],
    async saldo() {
      return null;
    },
    async umsaetze(k, von, bis) {
      anfragen.push({ schluessel: k.schluessel, von, bis });
      if (opt.wirft) throw new Error("3010 Kontonummer ist ungültig");
      return {
        format: "MT940",
        hinweise: [],
        ergebnis: {
          quelle: "fints",
          warnungen: [],
          umsaetze: [
            {
              buchungstag: "2026-08-17",
              betrag: -1234,
              waehrung: "EUR",
              gegenpartei: "Laden",
              verwendungszweck: "Einkauf",
              kontoIban: k.iban,
              istUmbuchung: false,
              quelle: "fints",
            },
          ],
        },
      };
    },
  };
  const adapter: Abrufadapter = {
    id: "fints",
    name: "FinTS",
    async anmelden() {
      return sitzung;
    },
  };
  return { adapter, anfragen };
}

/** Repos als einfache Halter — es geht um den Ablauf, nicht um SQL. */
function fakes(zuordnungen: Kontozuordnung[]) {
  const gespeicherteZuordnungen: Kontozuordnung[] = [...zuordnungen];
  const zugaenge: Bankzugang[] = [];
  const umsaetze: unknown[] = [];
  return {
    gespeicherteZuordnungen,
    zugaenge,
    umsaetze,
    deps: {
      zugangRepo: {
        alle: async () => [],
        speichern: async (z: Bankzugang) => void zugaenge.push(z),
        loeschen: async () => {},
      },
      zuordnungRepo: {
        alle: async () => gespeicherteZuordnungen,
        nachZugang: async () => gespeicherteZuordnungen.filter((z) => z.zugangId === "z1"),
        speichern: async (z: Kontozuordnung) => {
          const i = gespeicherteZuordnungen.findIndex(
            (a) => a.zugangId === z.zugangId && a.schluessel === z.schluessel,
          );
          if (i >= 0) gespeicherteZuordnungen[i] = z;
          else gespeicherteZuordnungen.push(z);
        },
        loeschen: async () => {},
      },
      kontoRepo: {
        alle: async () => [konto],
        speichern: async () => {},
        loeschen: async () => {},
      },
      kategorieRepo: { alle: async () => [], speichern: async () => {}, loeschen: async () => {} },
      umsatzRepo: {
        speichern: async () => {},
        speichernViele: async (u: readonly unknown[]) => void umsaetze.push(...u),
        alle: async () => [],
        nachLauf: async () => [],
        offene: async () => [],
        loeschen: async () => {},
        bestandsSchluessel: async () => ({ hashes: [], nativeIds: [] }),
      },
      laufRepo: { alle: async () => [], speichern: async () => {}, loeschen: async () => {} },
      id: () => "id",
      heute: HEUTE,
    },
  };
}

describe("abrufStart", () => {
  it("greift beim Folgeabruf hinter den letzten Stand zurück", () => {
    // Banken tragen nach und verschieben Valuta. Exakt am letzten Tag anzusetzen
    // verliert genau diese Nachzügler — unbemerkt.
    const start = abrufStart({ zugangId: "z1", schluessel: "s", zahlungskontoId: "k1", letzterAbrufBis: "2026-08-15" }, HEUTE);
    expect(start).toBe("2026-08-08");
    expect(RUECKGRIFF_TAGE).toBe(7);
  });

  it("nimmt beim Erstabruf ein festes Fenster", () => {
    const start = abrufStart({ zugangId: "z1", schluessel: "s", zahlungskontoId: "k1" }, HEUTE);
    expect(start).toBe("2026-07-19");
    expect(ERSTABRUF_TAGE).toBe(30);
  });

  it("rechnet über die Monatsgrenze richtig", () => {
    const start = abrufStart({ zugangId: "z1", schluessel: "s", zahlungskontoId: "k1", letzterAbrufBis: "2026-03-03" }, HEUTE);
    expect(start).toBe("2026-02-24");
  });
});

describe("abrufAusfuehren", () => {
  const zuordnung: Kontozuordnung = {
    zugangId: "z1",
    schluessel: "9876543210|Girokonto",
    zahlungskontoId: "k1",
  };

  it("holt den Zeitraum und schreibt den Stand fort", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([zuordnung]);

    const befunde = await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(anfragen).toEqual([{ schluessel: "9876543210|Girokonto", von: "2026-07-19", bis: HEUTE }]);
    expect(befunde).toHaveLength(1);
    expect(befunde[0].ergebnis?.neu).toBe(1);
    expect(befunde[0].format).toBe("MT940");
    expect(f.gespeicherteZuordnungen[0].letzterAbrufBis).toBe(HEUTE);
  });

  it("lässt den Stand stehen, wenn der Abruf scheitert", async () => {
    // Sonst gilt ein Zeitraum als geholt, den nie jemand gesehen hat.
    const { adapter } = fakeAdapter({ konten: [bankkonto()], wirft: true });
    const f = fakes([{ ...zuordnung, letzterAbrufBis: "2026-08-10" }]);

    const befunde = await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(befunde[0].fehler).toMatch(/3010/);
    expect(befunde[0].ergebnis).toBeUndefined();
    expect(f.gespeicherteZuordnungen[0].letzterAbrufBis).toBe("2026-08-10");
  });

  it("benennt ein Konto, das die Bank nicht mehr meldet, statt es zu verschlucken", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto({ schluessel: "andere|Nummer" })] });
    const f = fakes([zuordnung]);

    const befunde = await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(anfragen).toEqual([]);
    expect(befunde[0].fehler).toMatch(/meldet das zugeordnete Konto/);
  });

  it("sichert die Bankparameter, auch wenn kein Konto durchgeht", async () => {
    // Ohne sie synchronisiert die nächste Anmeldung von vorn.
    const { adapter } = fakeAdapter({ konten: [bankkonto()], wirft: true });
    const f = fakes([zuordnung]);

    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(f.zugaenge[f.zugaenge.length - 1]?.bankparameter).toBe('{"systemId":"S"}');
  });

  it("tut nichts, wenn dem Zugang kein Konto zugeordnet ist", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([]);

    expect(await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).toEqual([]);
    expect(anfragen).toEqual([]);
  });
});
