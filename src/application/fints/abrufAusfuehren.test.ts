// Der Abruf-Ablauf, ohne Netz und ohne Oberfläche: In-Memory-Fakes für alle Ports.
//
// Geprüft wird, was der Ablauf entscheidet — der Zeitraum, die Zuordnung zum richtigen
// Konto, das Fortschreiben des Stands und der Umgang mit einem Konto, das ausfällt.

import { describe, expect, it } from "vitest";
import type { Zahlungskonto } from "../../core";
import type { Abrufadapter, Abrufsitzung, Bankkonto, Bankzugang, Formatvorgabe } from "./abrufPort";
import type { Kontozuordnung } from "./bankzugangPort";
import type { Bankprofil } from "./abrufPort";
import { ERSTABRUF_TAGE, RUECKGRIFF_TAGE, abrufAusfuehren, abrufZeitraum } from "./abrufAusfuehren";

const HEUTE = "2026-08-18";

const zugang: Bankzugang = {
  id: "z1",
  bezeichnung: "Musterbank",
  art: "fints",
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
    kannDepot: false,
    ...over,
  };
}

const konto: Zahlungskonto = {
  id: "k1",
  bezeichnung: "Giro",
  typ: "Giro", klasse: "liquide",
  inhaberIds: [],
  saldo: 0,
};

/** Eine Bank, die nichts über sich sagt — der Normalfall in den Tests unten. */
function leeresProfil(): Bankprofil {
  return { standAm: HEUTE, tanVerfahren: [], vorfaelle: [], kontoVorfaelle: {} };
}

/** Eine Bank, die einen Speicherzeitraum nennt. */
function profilMitSpeicherzeitraum(tage: number): Bankprofil {
  return {
    ...leeresProfil(),
    vorfaelle: [{ segment: "HKKAZ", speicherzeitraumTage: tage }],
  };
}

/** Merkt sich, mit welchem Zeitraum gefragt wurde, und liefert eine feste Buchung. */
function fakeAdapter(opt: {
  konten: Bankkonto[];
  wirft?: boolean;
  saldo?: number;
  saldoWirft?: boolean;
  /** Die Stände, die in den gelieferten Auszügen stehen. */
  auszugsSalden?: { datum: string; betrag: number }[];
  profil?: Bankprofil;
}) {
  const anfragen: { schluessel: string; von: string; bis: string; bevorzugt?: Formatvorgabe }[] = [];
  const sitzung: Abrufsitzung = {
    konten: opt.konten,
    bankparameter: () => '{"systemId":"S"}',
    hinweise: [],
    bankNachrichten: [],
    profil: opt.profil ?? leeresProfil(),
    async saldo() {
      if (opt.saldoWirft) throw new Error("9000 Auftrag abgelehnt");
      return opt.saldo == null ? null : { betrag: opt.saldo, datum: "2026-08-18", waehrung: "EUR" };
    },
    async depot() {
      return null;
    },
    async umsaetze(k, von, bis, bevorzugt) {
      anfragen.push({ schluessel: k.schluessel, von, bis, bevorzugt });
      if (opt.wirft) throw new Error("3010 Kontonummer ist ungültig");
      return {
        format: "MT940",
        hinweise: [],
        // Was die Bank im Auszug mitschickt: Stand davor und Stand danach. Über den
        // Testschalter, damit auch der Fall „Format liefert keine" geprüft werden kann.
        auszugsSalden: opt.auszugsSalden ?? [],
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
  const laeufe: any[] = [];
  return {
    gespeicherteZuordnungen,
    zugaenge,
    umsaetze,
    buchungen,
    anker,
    laeufe,
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
        anlegenViele: async (u: readonly any[]) => void umsaetze.push(...u),
        anlegen: async (u: any) => void umsaetze.push(u),
        ergaenzen: async () => {},
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
      laufRepo: { alle: async () => [...laeufe], speichern: async (l: any) => void laeufe.push(l), loeschen: async () => {} },
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

describe("abrufZeitraum", () => {
  const z = (over: Partial<Kontozuordnung> = {}): Kontozuordnung => ({
    zugangId: "z1",
    schluessel: "s",
    zahlungskontoId: "k1",
    ...over,
  });

  it("greift beim Folgeabruf hinter den letzten Stand zurück", () => {
    // Banken tragen nach und verschieben Valuta. Exakt am letzten Tag anzusetzen
    // verliert genau diese Nachzügler — unbemerkt.
    expect(abrufZeitraum(z({ letzterAbrufBis: "2026-08-15" }), HEUTE).von).toBe("2026-08-08");
    expect(RUECKGRIFF_TAGE).toBe(7);
  });

  it("ein ausdrücklich gewünschter Zeitraum gewinnt gegen den letzten Stand", () => {
    // Wer 180 Tage anfordert, will 180 Tage — sonst liesse sich ein alter Dateibestand
    // nie durch die Zeilen der Bank ersetzen.
    const mitStand = z({ letzterAbrufBis: "2026-08-15" });
    expect(abrufZeitraum(mitStand, HEUTE, 90).von).toBe("2026-05-20");
    expect(abrufZeitraum(mitStand, HEUTE, 0).von).toBe(HEUTE);
  });

  it("nimmt beim Erstabruf das feste Fenster, solange die Bank nichts sagt", () => {
    expect(abrufZeitraum(z(), HEUTE).von).toBe("2026-07-19");
    expect(ERSTABRUF_TAGE).toBe(30);
  });

  it("rechnet über die Monatsgrenze richtig", () => {
    expect(abrufZeitraum(z({ letzterAbrufBis: "2026-03-03" }), HEUTE).von).toBe("2026-02-24");
  });

  it("holt beim Erstabruf, was die Bank vorhält, statt der festen 30 Tage", () => {
    // Der Kern von Punkt 2: bei einem Institut mit langem Speicherzeitraum blieb der
    // Rest bisher liegen, bis jemand ihn ausdrücklich nachholte.
    const fenster = abrufZeitraum(z(), HEUTE, undefined, profilMitSpeicherzeitraum(540));
    expect(fenster.von).toBe("2025-02-24");
    expect(fenster.gedeckelt).toBe(false);
  });

  it("meldet, wenn der Wunsch über den Speicherzeitraum der Bank hinausgeht", () => {
    const fenster = abrufZeitraum(z(), HEUTE, 720, profilMitSpeicherzeitraum(540));
    expect(fenster.von).toBe("2025-02-24");
    expect(fenster.gedeckelt).toBe(true);
    expect(fenster.grenze).toBe(540);
  });

  it("deckelt nicht, wo die Bank nichts gesagt hat", () => {
    // Unbekannt ist nicht null: wer daraus eine Grenze macht, schaltet den Abruf ab.
    const fenster = abrufZeitraum(z(), HEUTE, 720);
    expect(fenster.von).toBe("2024-08-28");
    expect(fenster.gedeckelt).toBe(false);
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

    (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;

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
    (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;
    expect(f.buchungen).toHaveLength(1);

    (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;
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

    (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;

    const frisch = f.umsaetze.find((u) => u.id !== "alt");
    // Der Verdacht haelt nichts auf: die Zeile wird ganz normal verbucht.
    expect(frisch.status).toBe("verbucht");
    expect(f.buchungen).toHaveLength(1);
  });

  it("holt den Zeitraum und schreibt den Stand fort", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([zuordnung]);

    const befunde = (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;

    expect(anfragen).toEqual([
      // `bevorzugt` steht immer da, auch leer: der Abruf reicht Gedächtnis und Wahl
      // gemeinsam durch, und beide dürfen fehlen.
      { schluessel: "9876543210|Girokonto", von: "2026-07-19", bis: HEUTE, bevorzugt: { wahl: undefined, zuletzt: undefined } },
    ]);
    expect(befunde).toHaveLength(1);
    expect(befunde[0].ergebnis?.neu).toBe(1);
    expect(befunde[0].format).toBe("MT940");
    expect(f.gespeicherteZuordnungen[0].letzterAbrufBis).toBe(HEUTE);
  });

  it("lässt den Stand stehen, wenn der Abruf scheitert", async () => {
    // Sonst gilt ein Zeitraum als geholt, den nie jemand gesehen hat.
    const { adapter } = fakeAdapter({ konten: [bankkonto()], wirft: true });
    const f = fakes([{ ...zuordnung, letzterAbrufBis: "2026-08-10" }]);

    const befunde = (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;

    expect(befunde[0].fehler).toMatch(/3010/);
    expect(befunde[0].ergebnis).toBeUndefined();
    expect(f.gespeicherteZuordnungen[0].letzterAbrufBis).toBe("2026-08-10");
  });

  it("benennt ein Konto, das die Bank nicht mehr meldet, statt es zu verschlucken", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto({ schluessel: "andere|Nummer" })] });
    const f = fakes([zuordnung]);

    const befunde = (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;

    expect(anfragen).toEqual([]);
    expect(befunde[0].fehler).toMatch(/meldet das zugeordnete Konto/);
  });

  it("sichert die Bankparameter, auch wenn kein Konto durchgeht", async () => {
    // Ohne sie synchronisiert die nächste Anmeldung von vorn.
    const { adapter } = fakeAdapter({ konten: [bankkonto()], wirft: true });
    const f = fakes([zuordnung]);

    (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;

    expect(f.zugaenge[f.zugaenge.length - 1]?.bankparameter).toBe('{"systemId":"S"}');
  });

  it("hält den Kontostand der Bank als ANKER fest", async () => {
    // Ohne ihn ist der Stand der App nur in sich schlüssig; er ist die zweite,
    // unabhängige Aussage und damit die einzige Chance, eine fehlende Buchung zu merken.
    // Aufgehoben statt überschrieben: erst mehrere Anker sagen, WANN es auseinanderlief.
    const { adapter } = fakeAdapter({ konten: [bankkonto()], saldo: 250000 });
    const f = fakes([{ zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1" }]);
    const befunde = (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;

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
    (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;

    expect(f.anker[0]?.betrag).toBe(250000);
    expect(f.gespeicherteZuordnungen[0].letzterAbrufBis).toBe("2026-08-10");
  });

  it("ersetzt den Anker desselben Tages, statt einen zweiten anzulegen", async () => {
    // Zwei Abrufe an einem Tag sind zwei Aussagen über DENSELBEN Stichtag, nicht zwei
    // Stichtage. Sonst stünden im Verlauf Fenster der Länge null.
    const { adapter } = fakeAdapter({ konten: [bankkonto()], saldo: 250000 });
    const f = fakes([{ zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1" }]);
    (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;
    (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;

    expect(f.anker).toHaveLength(1);
  });

  it("lässt einen scheiternden Saldo den Abruf nicht kippen", async () => {
    // Nicht jede Bank gibt HKSAL heraus. Dann fehlt die Kontrollzahl — die Umsätze
    // kommen trotzdem.
    const { adapter } = fakeAdapter({ konten: [bankkonto()], saldoWirft: true });
    const f = fakes([{ zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1" }]);
    const befunde = (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps })).konten;

    expect(befunde[0].fehler).toBeUndefined();
    expect(befunde[0].bankSaldo).toBeUndefined();
    expect(f.gespeicherteZuordnungen[0].letzterAbrufBis).toBe(HEUTE);
  });

  it("holt den gewünschten Zeitraum statt des fortlaufenden", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([{ zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1", letzterAbrufBis: "2026-08-15" }]);
    (await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps, rueckgriffTage: 90 })).konten;

    expect(anfragen[0].von).toBe("2026-05-20");
  });

  it("gibt das zuletzt getragene Format als Reihenfolge mit", async () => {
    // Wo MT940 zuletzt getragen hat, spart das die ergebnislose CAMT-Runde. Es ist eine
    // Reihenfolge, keine Festlegung — der Adapter versucht den anderen Weg trotzdem,
    // wenn der erste leer bleibt.
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([
      {
        zugangId: "z1",
        schluessel: "9876543210|Girokonto",
        zahlungskontoId: "k1",
        letzterAbrufBis: "2026-08-15",
        letztesFormat: "MT940",
      },
    ]);
    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(anfragen[0].bevorzugt?.zuletzt).toBe("MT940");
    // Und ohne Festlegung — das Gedächtnis dreht nur die Reihenfolge.
    expect(anfragen[0].bevorzugt?.wahl).toBeUndefined();
  });

  it("fragt ohne Gedächtnis ohne Vorgabe", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([{ zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1" }]);
    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(anfragen[0].bevorzugt?.zuletzt).toBeUndefined();
    expect(anfragen[0].bevorzugt?.wahl).toBeUndefined();
  });

  it("schreibt das getragene Format fort", async () => {
    const { adapter } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([{ zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1" }]);
    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    // Der Fake antwortet mit MT940 — beim nächsten Lauf steht das als Reihenfolge bereit.
    expect(f.gespeicherteZuordnungen[0].letztesFormat).toBe("MT940");
  });

  it("tut nichts, wenn dem Zugang kein Konto zugeordnet ist", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([]);

    const ergebnis = await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });
    expect(ergebnis.konten).toEqual([]);
    expect(ergebnis.depots).toEqual([]);
    expect(anfragen).toEqual([]);
  });
});

/**
 * Die Stände aus den Auszügen sind der eigentliche Gewinn des Abrufs für den Abgleich:
 * `HKSAL` bieten nicht alle Banken an und es sagt nur, wie es HEUTE steht — die
 * Auszugsstände decken den abgefragten Zeitraum ab und fallen nebenbei an.
 */
describe("Auszugsstände als Anker", () => {
  const zuordnung: Kontozuordnung = {
    zugangId: "z1",
    schluessel: "9876543210|Girokonto",
    zahlungskontoId: "k1",
  };

  it("legt für jeden gelieferten Stand einen Anker an", async () => {
    const { adapter } = fakeAdapter({
      konten: [bankkonto()],
      auszugsSalden: [
        { datum: "2026-07-31", betrag: 120000 },
        { datum: "2026-08-18", betrag: 133050 },
      ],
    });
    const f = fakes([zuordnung]);

    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    const datumsListe = f.anker.filter((a) => a.herkunft === "bank").map((a) => a.datum);
    expect(datumsListe).toEqual(expect.arrayContaining(["2026-07-31", "2026-08-18"]));
    expect(f.anker.find((a) => a.datum === "2026-07-31")?.betrag).toBe(120000);
  });

  /**
   * Ein Format ohne Stände darf nichts kaputtmachen — die Umsätze sind das Wichtigere,
   * und ein fehlender Anker heisst nur, dass eine Prüfmöglichkeit fehlt.
   */
  it("läuft durch, wenn das Format keine Stände trägt", async () => {
    const { adapter } = fakeAdapter({ konten: [bankkonto()], auszugsSalden: [] });
    const f = fakes([zuordnung]);
    const ergebnis = await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });
    expect(ergebnis.konten[0].fehler).toBeUndefined();
  });

  it("übergeht einen Stand mit unbrauchbarem Datum, statt den Abruf zu kippen", async () => {
    const { adapter } = fakeAdapter({
      konten: [bankkonto()],
      auszugsSalden: [
        { datum: "kein-datum", betrag: 1 },
        { datum: "2026-08-18", betrag: 133050 },
      ],
    });
    const f = fakes([zuordnung]);
    const ergebnis = await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(ergebnis.konten[0].fehler).toBeUndefined();
    expect(f.anker.some((a) => a.datum === "2026-08-18")).toBe(true);
    expect(f.anker.some((a) => a.datum === "kein-datum")).toBe(false);
  });
});

/**
 * Der Abruf ist die einzige Quelle, die ihre Herkunft KENNT: ein Zugang, ein Konto, ein
 * Format. Bisher stand das nur im Dateinamen als Fliesstext — lesbar, aber nicht
 * auswertbar, und bei jeder Umbenennung eine Ratepartie.
 */
describe("Herkunft am Lauf", () => {
  const zuordnung: Kontozuordnung = {
    zugangId: "z1",
    schluessel: "9876543210|Girokonto",
    zahlungskontoId: "k1",
  };

  it("schreibt Zugang, Konto und Format an den Lauf", async () => {
    const { adapter } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([zuordnung]);

    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(f.laeufe[0]).toMatchObject({
      zugangId: "z1",
      zahlungskontoId: "k1",
      format: "MT940",
    });
  });
});

/**
 * Der Unterschied zwischen Gedächtnis und Festlegung ist die ganze Existenzberechtigung
 * der Wahl: das Gedächtnis dreht nur die Reihenfolge und lässt den zweiten Versuch
 * zu — die Wahl schliesst ihn aus.
 */
describe("Formatwahl", () => {
  it("reicht die Festlegung des Kontos an den Adapter durch", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([
      {
        zugangId: "z1",
        schluessel: "9876543210|Girokonto",
        zahlungskontoId: "k1",
        letztesFormat: "CAMT",
        formatwahl: "MT940",
      },
    ]);

    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    // Beides kommt an: die Wahl entscheidet, das Gedächtnis bleibt als Information.
    expect(anfragen[0].bevorzugt).toEqual({ wahl: "MT940", zuletzt: "CAMT" });
  });

  it("gibt „automatisch“ weiter wie keine Wahl", async () => {
    const { adapter, anfragen } = fakeAdapter({ konten: [bankkonto()] });
    const f = fakes([
      { zugangId: "z1", schluessel: "9876543210|Girokonto", zahlungskontoId: "k1", formatwahl: "automatisch" },
    ]);

    await abrufAusfuehren(zugang, "1234", async () => undefined, { adapter, ...f.deps });

    expect(anfragen[0].bevorzugt?.wahl).toBe("automatisch");
  });
});
