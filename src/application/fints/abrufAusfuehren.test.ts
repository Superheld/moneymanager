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
    iban: "DE15200000049876543210",
    bezeichnung: "Girokonto",
    waehrung: "EUR",
    kannSaldo: true,
    kannUmsaetze: true,
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
function fakeAdapter(opt: { konten: Bankkonto[]; wirft?: boolean; saldo?: number; saldoWirft?: boolean }) {
  const anfragen: { schluessel: string; von: string; bis: string }[] = [];
  const sitzung: Abrufsitzung = {
    konten: opt.konten,
    bankparameter: () => '{"systemId":"S"}',
    hinweise: [],
    bankNachrichten: [],
    async saldo() {
      if (opt.saldoWirft) throw new Error("9000 Auftrag abgelehnt");
      return opt.saldo == null ? null : { betrag: opt.saldo, datum: "2026-08-18", waehrung: "EUR" };
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
  // Die Umsätze müssen sich merken lassen: der Abruf verbucht selbst und liest dafür
  // seine eigenen frischen Zeilen über `offene()` zurück.
  const umsaetze: any[] = [];
  const buchungen: any[] = [];
  const anker: any[] = [];
  return {
    gespeicherteZuordnungen,
    zugaenge,
    umsaetze,
    buchungen,
    anker,
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
        speichern: async (u: any) => {
          const i = umsaetze.findIndex((x) => x.id === u.id);
          if (i >= 0) umsaetze[i] = u; else umsaetze.push(u);
        },
        speichernViele: async (u: readonly any[]) => void umsaetze.push(...u),
        alle: async () => [...umsaetze],
        nachLauf: async (laufId: string) => umsaetze.filter((u) => u.laufId === laufId),
        offene: async () => umsaetze.filter((u) => u.status === "neu"),
        loeschen: async () => {},
        bestandsSchluessel: async () => ({ hashes: [], nativeIds: [] }),
      },
      ledgerRepo: {
        alle: async () => [...buchungen],
        speichern: async (b: any) => {
          const i = buchungen.findIndex((x) => x.id === b.id);
          if (i >= 0) buchungen[i] = b; else buchungen.push(b);
        },
        loeschen: async (id: string) => {
          const i = buchungen.findIndex((x) => x.id === id);
          if (i >= 0) buchungen.splice(i, 1);
        },
      },
      laufRepo: { alle: async () => [], speichern: async () => {}, loeschen: async () => {} },
      ankerRepo: {
        alle: async () => [...anker],
        speichern: async (a: any) => {
          const i = anker.findIndex((x) => x.kontoId === a.kontoId && x.datum === a.datum && x.herkunft === a.herkunft);
          if (i >= 0) anker[i] = a; else anker.push(a);
        },
        entfernen: async () => {},
      },
      // Eindeutige IDs: der Abruf legt Umsatz UND Ist-Buchung an; mit einer konstanten
      // ID überschrieben die sich gegenseitig.
      id: (() => { let n = 0; return () => `id-${++n}`; })(),
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

  it("ein ausdrücklich gewünschter Zeitraum gewinnt gegen den letzten Stand", () => {
    // Wer 180 Tage anfordert, will 180 Tage — sonst liesse sich ein alter Dateibestand
    // nie durch die Zeilen der Bank ersetzen.
    const z = { zugangId: "z1", schluessel: "s", zahlungskontoId: "k1", letzterAbrufBis: "2026-08-15" };
    expect(abrufStart(z, HEUTE, 90)).toBe("2026-05-20");
    expect(abrufStart(z, HEUTE, 0)).toBe(HEUTE);
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

  it("verbucht die geholten Zeilen sofort, statt sie in eine Warteliste zu legen", async () => {
    // Was die Bank meldet, IST passiert — daran gibt es nichts zu bestätigen. Bis
    // 2026-08-19 lag alles als Entwurf am Konto und musste abgenickt werden.
    const { adapter } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([zuordnung]);

    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(f.buchungen).toHaveLength(1);
    expect(f.buchungen[0]).toMatchObject({ betrag: -1234, kontoId: "k1", quelle: "import" });
    // Und der Umsatz zeigt auf die Buchung, statt offen zu bleiben.
    expect(f.umsaetze[0].status).toBe("verbucht");
    expect(f.umsaetze[0].istbuchungId).toBe(f.buchungen[0].id);
  });

  it("legt dieselbe Zeile beim zweiten Abruf nicht noch einmal an", async () => {
    // Der Rückgriff (RUECKGRIFF_TAGE) holt jeden Abruf ein paar Tage doppelt. Der Finder
    // erkennt die Zeile als „identisch" und legt sie gar nicht erst an — das ist die
    // Stufe, die ohne Rückfrage entschieden wird.
    const { adapter } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([zuordnung]);
    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });
    expect(f.buchungen).toHaveLength(1);

    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });
    expect(f.buchungen).toHaveLength(1);
  });

  it("bucht auch einen VERDACHTSFALL — entschieden wird danach im Auszug", async () => {
    // Bis 2026-08-20 blieb so eine Zeile als Entwurf am Konto liegen. Die Warteliste dort
    // gibt es nicht mehr: beide Zeilen stehen jetzt im Auszug und tragen dort die
    // Markierung, mit Gründen und mit dem Weg zum Gegenstück.
    const { adapter } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([zuordnung]);
    // Ein Bestandssatz, der nur BEINAHE passt: gleicher Betrag, gleicher Empfänger,
    // einen Tag daneben. Abweichendes Datum deckelt das Urteil auf „verdacht".
    f.umsaetze.push({
      id: "alt", laufId: "l-alt", zahlungskontoId: "k1", buchungstag: "2026-08-16",
      betrag: -1234, waehrung: "EUR", gegenpartei: "Laden", verwendungszweck: "Einkauf",
      rohHash: "h-alt", status: "verbucht", istbuchungId: "b-alt",
    });

    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    const frisch = f.umsaetze.find((u) => u.id !== "alt");
    expect(frisch.verdachtAufId).toBe("alt"); // der Verdacht steht dran …
    expect(frisch.status).toBe("verbucht"); // … hält aber nichts mehr auf
    expect(f.buchungen).toHaveLength(1);
  });

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

  it("hält den Kontostand der Bank als ANKER fest", async () => {
    // Ohne ihn ist der Stand der App nur in sich schlüssig; er ist die zweite,
    // unabhängige Aussage und damit die einzige Chance, eine fehlende Buchung zu merken.
    // Aufgehoben statt überschrieben: erst mehrere Anker sagen, WANN es auseinanderlief.
    const { adapter } = fakeAdapter({ konten: [bankkonto()], saldo: 250000 });
    const f = fakes([{ zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1" }]);
    const befunde = await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(befunde[0].bankSaldo).toBe(250000);
    expect(f.anker).toHaveLength(1);
    expect(f.anker[0]).toMatchObject({
      kontoId: "k1", datum: "2026-08-18", herkunft: "bank", betrag: 250000,
    });
  });

  it("hält den Saldo auch fest, wenn die Umsätze scheitern", async () => {
    // Er sagt bereits, dass etwas fehlt — auch ohne die Zeilen dazu. Der Abrufstand
    // bleibt dagegen stehen, der Zeitraum wurde ja nicht geholt.
    const { adapter } = fakeAdapter({ konten: [bankkonto()], wirft: true, saldo: 250000 });
    const f = fakes([{ zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1", letzterAbrufBis: "2026-08-10" }]);
    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(f.anker[0]?.betrag).toBe(250000);
    expect(f.gespeicherteZuordnungen[0].letzterAbrufBis).toBe("2026-08-10");
  });

  it("ersetzt den Anker desselben Tages, statt einen zweiten anzulegen", async () => {
    // Zwei Abrufe an einem Tag sind zwei Aussagen über DENSELBEN Stichtag, nicht zwei
    // Stichtage. Sonst stünden im Verlauf Fenster der Länge null.
    const { adapter } = fakeAdapter({ konten: [bankkonto()], saldo: 250000 });
    const f = fakes([{ zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1" }]);
    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });
    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(f.anker).toHaveLength(1);
  });

  it("lässt einen scheiternden Saldo den Abruf nicht kippen", async () => {
    // Nicht jede Bank gibt HKSAL heraus. Dann fehlt die Kontrollzahl — die Umsätze
    // kommen trotzdem.
    const { adapter } = fakeAdapter({ konten: [bankkonto()], saldoWirft: true });
    const f = fakes([{ zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1" }]);
    const befunde = await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(befunde[0].fehler).toBeUndefined();
    expect(befunde[0].bankSaldo).toBeUndefined();
    expect(f.gespeicherteZuordnungen[0].letzterAbrufBis).toBe(HEUTE);
  });

  it("holt den gewünschten Zeitraum statt des fortlaufenden", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([{ zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1", letzterAbrufBis: "2026-08-15" }]);
    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps, rueckgriffTage: 90 });

    expect(anfragen[0].von).toBe("2026-05-20");
  });

  it("tut nichts, wenn dem Zugang kein Konto zugeordnet ist", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([]);

    expect(await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).toEqual([]);
    expect(anfragen).toEqual([]);
  });
});
