import { describe, expect, it } from "vitest";
import { MERKMALSHERKUENFTE, STANDARD_KONFIGURATION, type IstBuchung, type Merkmalsherkunft } from "../core";
import type {
  GespeicherterAusschluss,
  LedgerPort,
  MerkmalskonfigurationRepository,
  UmsatzRepository,
} from "./ports";
import type { Umsatz } from "./import";
import {
  herkunftSchalten,
  konfigurationLaden,
  wirkungMessen,
  wortAusschliessen,
  wortZulassen,
} from "./merkmalskonfiguration";

/** In-Memory-Fake des Konfigurations-Ports. */
function repo(): MerkmalskonfigurationRepository & { woerter: () => string[] } {
  let herkuenfte: Merkmalsherkunft[] | null = null;
  const ausschluesse = new Map<string, GespeicherterAusschluss>();
  return {
    woerter: () => [...ausschluesse.keys()].sort(),
    herkuenfteLesen: async () => herkuenfte,
    herkuenfteSetzen: async (h) => { herkuenfte = [...h]; },
    ausschluesseLesen: async () => [...ausschluesse.values()].sort((a, b) => a.wort.localeCompare(b.wort)),
    ausschlussSetzen: async (a) => { ausschluesse.set(a.wort, a); },
    ausschlussEntfernen: async (w) => { ausschluesse.delete(w); },
  };
}

describe("Konfiguration laden", () => {
  it("legt beim ersten Mal die Grundausstattung an", async () => {
    const r = repo();
    const stand = await konfigurationLaden(r);

    expect(stand.konfiguration.herkuenfte).toEqual(MERKMALSHERKUENFTE);
    expect(stand.ausschluesse.length).toBe(STANDARD_KONFIGURATION.ausschluesse.length);
    // Die mitgelieferten Wörter liegen ab jetzt in der Datenbank — nur so ist ein
    // einzelnes davon löschbar.
    expect(r.woerter()).toContain("sepa");
    expect(stand.ausschluesse.every((a) => a.quelle === "standard")).toBe(true);
  });

  it("legt die Grundausstattung NICHT ein zweites Mal an", async () => {
    const r = repo();
    await konfigurationLaden(r);
    await wortZulassen(r, "sepa");

    const stand = await konfigurationLaden(r);

    // Sonst käme jedes gelöschte Standardwort beim nächsten Start zurück.
    expect(stand.ausschluesse.map((a) => a.wort)).not.toContain("sepa");
  });

  it("ohne gesetzte Herkünfte gilt der Standard", async () => {
    const r = repo();
    expect((await konfigurationLaden(r)).konfiguration.herkuenfte).toEqual(MERKMALSHERKUENFTE);
  });

  it("alle Herkünfte abgeschaltet ist eine Aussage, kein fehlender Wert", async () => {
    const r = repo();
    await konfigurationLaden(r);
    await r.herkuenfteSetzen([]);

    // Würde das als „nie gesetzt" gelesen, käme der Standard zurück und überschriebe
    // stillschweigend eine bewusste Entscheidung.
    expect((await konfigurationLaden(r)).konfiguration.herkuenfte).toEqual([]);
  });
});

describe("Herkünfte schalten", () => {
  it("schaltet ab und wieder an", async () => {
    const r = repo();
    await konfigurationLaden(r);

    expect(await herkunftSchalten(r, "vz", false)).not.toContain("vz");
    expect(await herkunftSchalten(r, "vz", true)).toContain("vz");
  });

  it("hält die feste Reihenfolge, nicht die Klick-Reihenfolge", async () => {
    const r = repo();
    await konfigurationLaden(r);
    await herkunftSchalten(r, "empGanz", false);
    const neu = await herkunftSchalten(r, "empGanz", true);

    // Sonst springt die Anzeige, je nachdem in welcher Folge geklickt wurde.
    expect(neu).toEqual(MERKMALSHERKUENFTE);
  });

  it("zweimal abschalten ändert nichts", async () => {
    const r = repo();
    await konfigurationLaden(r);
    await herkunftSchalten(r, "gid", false);
    expect(await herkunftSchalten(r, "gid", false)).not.toContain("gid");
  });
});

describe("Wörter aus- und einschließen", () => {
  it("nimmt ein Wort auf und merkt sich, dass es von Hand kam", async () => {
    const r = repo();
    await wortAusschliessen(r, "KDN");

    const [a] = await r.ausschluesseLesen();
    // Kleingeschrieben, weil auch die Merkmale kleingeschrieben sind.
    expect(a.wort).toBe("kdn");
    expect(a.quelle).toBe("manuell");
    expect(a.herkuenfte).toBeUndefined();
  });

  it("schränkt auf Herkünfte ein, wenn welche genannt sind", async () => {
    const r = repo();
    await wortAusschliessen(r, "bank", ["vwz"]);
    expect((await r.ausschluesseLesen())[0].herkuenfte).toEqual(["vwz"]);
  });

  it("leere Herkunftsliste heißt „überall“", async () => {
    const r = repo();
    await wortAusschliessen(r, "bank", []);
    expect((await r.ausschluesseLesen())[0].herkuenfte).toBeUndefined();
  });

  it("ignoriert leere Eingaben", async () => {
    const r = repo();
    await wortAusschliessen(r, "   ");
    expect(await r.ausschluesseLesen()).toHaveLength(0);
  });

  it("nimmt ein Wort wieder ins Training auf", async () => {
    const r = repo();
    await wortAusschliessen(r, "kdn");
    await wortZulassen(r, "kdn");
    expect(await r.ausschluesseLesen()).toHaveLength(0);
  });
});

describe("Wirkungsmessung", () => {
  /** Genug Material aus zwei trennbaren Gruppen, damit gemessen werden kann. */
  function bestand(n = 60) {
    const buchungen: IstBuchung[] = [];
    const umsaetze: Umsatz[] = [];
    const anlegen = (i: number, empfaenger: string, zweck: string, kategorieId: string) => {
      const id = `${kategorieId}-${i}`;
      buchungen.push({
        id, datum: "2026-03-01", betrag: -1234, kontoId: "k1",
        kategorieId, charakter: "Aufwand", quelle: "import",
      });
      umsaetze.push({
        id: `u-${id}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-03-01",
        betrag: -1234, waehrung: "EUR", gegenpartei: empfaenger, verwendungszweck: zweck,
        rohHash: `h-${id}`, status: "verbucht", istbuchungId: id,
      });
    };
    for (let i = 0; i < n; i++) {
      anlegen(i, "REWE Markt", "Einkauf Lebensmittel", "kat-lm");
      anlegen(i, "Shell Station", "Tanken Diesel", "kat-sprit");
    }
    const ledger: LedgerPort = { alle: async () => buchungen, speichern: async () => {}, loeschen: async () => {} };
    const umsatzRepo = {
      speichern: async () => {}, speichernViele: async () => {}, alle: async () => umsaetze,
      nachLauf: async () => [], offene: async () => [], loeschen: async () => {},
      bestandsSchluessel: async () => ({ hashes: [], nativeIds: [] }),
    } satisfies UmsatzRepository;
    return { ledger, umsatzRepo };
  }

  it("misst je Herkunft, was ihr Weglassen kostet", async () => {
    const { ledger, umsatzRepo } = bestand();
    const ergebnis = await wirkungMessen({
      ledger, umsatzRepo, konfiguration: STANDARD_KONFIGURATION,
    });

    expect(ergebnis).not.toBeNull();
    expect(ergebnis!.basis).toBeGreaterThan(0.9);
    expect(ergebnis!.wirkungen.map((w) => w.herkunft)).toEqual(
      expect.arrayContaining([...MERKMALSHERKUENFTE]),
    );
  });

  it("sortiert die teuerste Herkunft nach oben", async () => {
    const { ledger, umsatzRepo } = bestand();
    const { wirkungen } = (await wirkungMessen({
      ledger, umsatzRepo, konfiguration: STANDARD_KONFIGURATION,
    }))!;

    const abstaende = wirkungen.map((w) => w.abstand);
    expect([...abstaende]).toEqual([...abstaende].sort((a, b) => a - b));
  });

  it("misst nur die aktiven Herkünfte", async () => {
    const { ledger, umsatzRepo } = bestand();
    const { wirkungen } = (await wirkungMessen({
      ledger, umsatzRepo,
      konfiguration: { herkuenfte: ["empGanz", "vwz"], ausschluesse: [] },
    }))!;

    expect(wirkungen.map((w) => w.herkunft).sort()).toEqual(["empGanz", "vwz"]);
  });

  it("liefert null, wenn zu wenig Material da ist", async () => {
    // Ohne genug Beispiele sagte die Messung mehr über den Zufall des Splits als über
    // die Merkmale — und würde genau die Fehlentscheidungen stützen, die sie verhindern soll.
    const { ledger, umsatzRepo } = bestand(3);
    expect(await wirkungMessen({ ledger, umsatzRepo, konfiguration: STANDARD_KONFIGURATION })).toBeNull();
  });

  it("ist deterministisch — zweimal messen ergibt dieselben Zahlen", async () => {
    const { ledger, umsatzRepo } = bestand();
    const a = await wirkungMessen({ ledger, umsatzRepo, konfiguration: STANDARD_KONFIGURATION });
    const b = await wirkungMessen({ ledger, umsatzRepo, konfiguration: STANDARD_KONFIGURATION });
    expect(a).toEqual(b);
  });
});
