import { describe, expect, it } from "vitest";
import { klassifizieren, type IstBuchung } from "../../core";
import type { KlassifikatorRepository, LedgerPort, Modellstand, UmsatzRepository } from "../ports";
import type { Umsatz } from "../import";
import { klassifikatorTrainieren, MESSBAR_AB, modellzustand, ZUWACHS_SCHWELLE } from "./klassifikatorTraining";

/** Fakes für die Ports — der Kern rechnet, hier wird nur geladen und gespeichert. */
function fakes(buchungen: IstBuchung[], umsaetze: Umsatz[]) {
  let gespeichert: Modellstand | null = null;
  const ledger: LedgerPort = {
    alle: async () => buchungen,
    speichern: async () => {},
    loeschen: async () => {},
  };
  const umsatzRepo = {
    speichern: async () => {}, anlegen: async () => {}, anlegenViele: async () => {},
    ergaenzen: async () => {},
    alle: async () => umsaetze, nachLauf: async () => [], offene: async () => [],
    loeschen: async () => {}, bestandsSchluessel: async () => ({ hashes: [], nativeIds: [] }),
  } satisfies UmsatzRepository;
  const klassifikatorRepo: KlassifikatorRepository = {
    laden: async () => gespeichert,
    speichern: async (s) => { gespeichert = s; },
  };
  return {
    deps: { ledger, umsatzRepo, klassifikatorRepo, jetzt: () => "2026-08-16T12:00:00.000Z" },
    gelesen: () => gespeichert,
    setzen: (s: Modellstand | null) => { gespeichert = s; },
  };
}

/** n verbuchte Zahlungen eines Empfängers auf eine Kategorie. */
function zahlungen(n: number, empfaenger: string, kategorieId: string, ab = 0) {
  const buchungen: IstBuchung[] = [];
  const umsaetze: Umsatz[] = [];
  for (let i = ab; i < ab + n; i++) {
    const id = `${empfaenger}-${i}`;
    buchungen.push({
      id, datum: "2026-03-01", betrag: -1234, kontoId: "k1",
      kategorieId, charakter: "Aufwand", quelle: "import",
    });
    umsaetze.push({
      id: `u-${id}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-03-01",
      betrag: -1234, waehrung: "EUR", gegenpartei: empfaenger, verwendungszweck: "Zahlung",
      rohHash: `h-${id}`, status: "verbucht", istbuchungId: id,
    });
  }
  return { buchungen, umsaetze };
}

/** Genug Beispiele für einen Holdout, aus zwei klar trennbaren Gruppen. */
function genugMaterial(proGruppe = 40) {
  const a = zahlungen(proGruppe, "REWE Markt", "kat-lm");
  const b = zahlungen(proGruppe, "Shell Tankstelle", "kat-sprit");
  return { buchungen: [...a.buchungen, ...b.buchungen], umsaetze: [...a.umsaetze, ...b.umsaetze] };
}

describe("Training", () => {
  it("trainiert, speichert und liefert ein brauchbares Modell", async () => {
    const { buchungen, umsaetze } = genugMaterial();
    const { deps, gelesen } = fakes(buchungen, umsaetze);

    const r = await klassifikatorTrainieren(deps);

    expect(r.stand.trainiertAm).toBe("2026-08-16T12:00:00.000Z");
    expect(r.stand.modell.beispiele).toBe(80);
    expect(gelesen()).toEqual(r.stand);
    // Das gespeicherte Modell trifft die Aufgabe, aus der es entstand.
    expect(klassifizieren(r.stand.modell, ["emp=rewe markt", "vwz:zahlung", "vz:-"])?.kategorieId).toBe("kat-lm");
  });

  it("misst an zurückgehaltenen Beispielen, nicht an den eigenen Trainingsdaten", async () => {
    const { buchungen, umsaetze } = genugMaterial();
    const { deps } = fakes(buchungen, umsaetze);

    const r = await klassifikatorTrainieren(deps);

    expect(r.bewertung).toBeDefined();
    expect(r.bewertung!.gesamt).toBe(16); // 20 % von 80 — die Prüfmenge, nicht alles
    expect(r.stand.genauigkeit).toBe(r.bewertung!.genauigkeit);
  });

  it("das gespeicherte Modell nutzt ALLE Beispiele, auch die gemessenen", async () => {
    // Sonst würde ein Fünftel der Daten weggeworfen, nur um eine Zahl nennen zu können.
    const { buchungen, umsaetze } = genugMaterial();
    const { deps } = fakes(buchungen, umsaetze);
    const r = await klassifikatorTrainieren(deps);
    expect(r.stand.modell.beispiele).toBe(80);
    expect(r.bewertung!.gesamt).toBeLessThan(80);
  });

  it("behauptet keine Genauigkeit, wenn zu wenig Material da ist", async () => {
    // Bei einer Handvoll Zeilen sagte die Prüfmenge mehr über den Zufall des Splits als
    // über das Modell. Lieber keine Angabe als eine erfundene.
    const { buchungen, umsaetze } = genugMaterial(5);
    expect(buchungen.length).toBeLessThan(MESSBAR_AB);
    const { deps } = fakes(buchungen, umsaetze);

    const r = await klassifikatorTrainieren(deps);

    expect(r.bewertung).toBeUndefined();
    expect(r.stand.genauigkeit).toBeUndefined();
    expect(r.stand.modell.beispiele).toBe(10); // trainiert wird trotzdem
  });

  it("kommt mit leerem Bestand zurecht", async () => {
    const { deps, gelesen } = fakes([], []);
    const r = await klassifikatorTrainieren(deps);
    expect(r.stand.modell.kategorien).toHaveLength(0);
    expect(r.material.beispiele).toHaveLength(0);
    expect(gelesen()).not.toBeNull();
  });

  it("überspringt Umschichtungen und aufgeteilte Buchungen", async () => {
    const { buchungen, umsaetze } = genugMaterial(10);
    buchungen.push({
      id: "um1", datum: "2026-03-01", betrag: -50000, kontoId: "k1",
      charakter: "Umschichtung", quelle: "import",
    });
    buchungen.push({
      id: "split1", datum: "2026-03-01", betrag: -5200, kontoId: "k1",
      charakter: "Aufwand", quelle: "import",
      aufteilungen: [
        { kategorieId: "kat-lm", betrag: -4000 },
        { kategorieId: "kat-drogerie", betrag: -1200 },
      ],
    });
    const { deps } = fakes(buchungen, umsaetze);

    const r = await klassifikatorTrainieren(deps);

    expect(r.stand.modell.beispiele).toBe(20);
    expect(r.material.ausgeschlossen.umschichtung).toBe(1);
    expect(r.material.ausgeschlossen.geteilt).toBe(1);
  });
});

describe("Modellzustand", () => {
  it("meldet ohne Modell: veraltet, sobald es Material gibt", async () => {
    const { buchungen, umsaetze } = genugMaterial(10);
    const { deps } = fakes(buchungen, umsaetze);

    const z = await modellzustand(deps);

    expect(z.stand).toBeNull();
    expect(z.beispieleJetzt).toBe(20);
    expect(z.veraltet).toBe(true);
  });

  it("meldet ohne Modell UND ohne Material: nichts zu tun", async () => {
    const { deps } = fakes([], []);
    const z = await modellzustand(deps);
    expect(z.veraltet).toBe(false);
  });

  it("nach dem Training ist der Stand aktuell", async () => {
    const { buchungen, umsaetze } = genugMaterial();
    const { deps } = fakes(buchungen, umsaetze);
    await klassifikatorTrainieren(deps);

    const z = await modellzustand(deps);

    expect(z.zuwachs).toBe(0);
    expect(z.veraltet).toBe(false);
  });

  it("zählt neue Beispiele und meldet ab der Schwelle", async () => {
    const { buchungen, umsaetze } = genugMaterial();
    const { deps } = fakes(buchungen, umsaetze);
    await klassifikatorTrainieren(deps);

    const nachschub = zahlungen(ZUWACHS_SCHWELLE, "Aldi Sued", "kat-lm", 1000);
    buchungen.push(...nachschub.buchungen);
    umsaetze.push(...nachschub.umsaetze);

    const z = await modellzustand(deps);

    expect(z.zuwachs).toBe(ZUWACHS_SCHWELLE);
    expect(z.veraltet).toBe(true);
  });

  it("wenige neue Beispiele lösen noch keinen Hinweis aus", async () => {
    const { buchungen, umsaetze } = genugMaterial();
    const { deps } = fakes(buchungen, umsaetze);
    await klassifikatorTrainieren(deps);

    const nachschub = zahlungen(3, "Aldi Sued", "kat-lm", 1000);
    buchungen.push(...nachschub.buchungen);
    umsaetze.push(...nachschub.umsaetze);

    expect((await modellzustand(deps)).veraltet).toBe(false);
  });

  it("auch WENIGER Beispiele machen den Stand veraltet", async () => {
    // Gelöschte Buchungen heißen genauso: der Stand passt nicht mehr zu den Daten.
    const { buchungen, umsaetze } = genugMaterial();
    const { deps } = fakes(buchungen, umsaetze);
    await klassifikatorTrainieren(deps);

    buchungen.splice(0, ZUWACHS_SCHWELLE);

    const z = await modellzustand(deps);
    expect(z.zuwachs).toBe(-ZUWACHS_SCHWELLE);
    expect(z.veraltet).toBe(true);
  });
});
