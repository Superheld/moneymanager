import { describe, expect, it } from "vitest";
import { trainieren, type Kategorie, type Zahlungskonto } from "../../core";
import type {
  ImportLaufRepository,
  KategorieRepository,
  UmsatzRepository,
  ZahlungskontoRepository,
} from "../ports";
import type { ImportLauf } from "./importLauf";
import type { RohUmsatz } from "./rohUmsatz";
import { verwerfen, type Umsatz } from "./umsatz";
import { umsaetzeUebernehmen, type UebernahmeDeps } from "./umsaetzeUebernehmen";
import { quelleKeyFuer } from "./kontoMatch";
import type { Vorschlagskontext } from "./vorschlag";

function roh(over: Partial<RohUmsatz>): RohUmsatz {
  return {
    buchungstag: "2022-01-01", betrag: -655, waehrung: "EUR", gegenpartei: "Brandeis",
    verwendungszweck: "Kartenzahlung", istUmbuchung: false, quelle: "finanzguru", ...over,
  };
}

function fakes() {
  const konten: Zahlungskonto[] = [];
  const umsaetze: Umsatz[] = [];
  const laeufe: ImportLauf[] = [];
  const kategorien: Kategorie[] = [{ id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" }];
  let n = 0;

  const kontoRepo: ZahlungskontoRepository = {
    alle: async () => konten,
    speichern: async (k) => { konten.push(k); },
    loeschen: async () => {},
  };
  const kategorieRepo: KategorieRepository = {
    alle: async () => kategorien,
    speichern: async () => {},
    loeschen: async () => {},
  };
  const umsatzRepo: UmsatzRepository = {
    speichern: async (u) => {
      // Wie das echte Repository: ON CONFLICT(id) DO UPDATE. Ohne das sähe der
      // Ergänzen-Fall im Test wie ein zweiter Datensatz aus.
      const i = umsaetze.findIndex((x) => x.id === u.id);
      if (i >= 0) umsaetze[i] = u;
      else umsaetze.push(u);
    },
    speichernViele: async (us) => { umsaetze.push(...us); },
    alle: async () => umsaetze,
    nachLauf: async (laufId) => umsaetze.filter((u) => u.laufId === laufId),
    offene: async () => umsaetze.filter((u) => u.status === "neu"),
    loeschen: async () => {},
    bestandsSchluessel: async () => ({
      hashes: umsaetze.map((u) => u.rohHash),
      nativeIds: umsaetze.flatMap((u) => (u.nativeId ? [u.nativeId] : [])),
    }),
  };
  const laufRepo: ImportLaufRepository = {
    alle: async () => laeufe,
    speichern: async (l) => { laeufe.push(l); },
    loeschen: async () => {},
  };
  const deps: UebernahmeDeps = { kontoRepo, kategorieRepo, umsatzRepo, laufRepo, id: () => `id${n++}` };
  return { deps, konten, umsaetze, laeufe };
}

describe("umsaetzeUebernehmen", () => {
  it("legt fehlende Konten an, baut Vorschläge und schreibt den Entwurfs-Stapel", async () => {
    const { deps, konten, umsaetze, laeufe } = fakes();
    const r = await umsaetzeUebernehmen(
      {
        quelle: "finanzguru",
        dateiname: "export.csv",
        zeitpunkt: "2026-06-21T10:00:00Z",
        rohUmsaetze: [
          roh({ kontoIban: "DE111", kategorieHinweis: "Lebensmittel", nativeId: "n1" }),
          roh({ kontoIban: "DE111", istUmbuchung: true, gegenpartei: "Eigen", nativeId: "n2" }),
        ],
        konten: [{ quelleKey: "DE111", neu: { bezeichnung: "Giro", typ: "Giro", iban: "DE111" } }],
      },
      deps,
    );

    expect(r).toMatchObject({ eingelesen: 2, neu: 2, duplikate: 0, ohneKonto: 0, angelegteKonten: 1 });
    expect(konten).toHaveLength(1);
    expect(umsaetze).toHaveLength(2);
    expect(umsaetze.every((u) => u.zahlungskontoId === konten[0].id)).toBe(true);

    const normal = umsaetze.find((u) => u.nativeId === "n1")!;
    expect(normal.vorschlag).toEqual({ kategorieId: "k-le", charakter: "Aufwand", quelle: "remapping" });
    const umbuchung = umsaetze.find((u) => u.nativeId === "n2")!;
    expect(umbuchung.vorschlag).toEqual({ charakter: "Umschichtung", quelle: "umbuchung" });

    expect(laeufe[0]).toMatchObject({ quelle: "finanzguru", eingelesen: 2, neu: 2, duplikate: 0 });
  });

  it("dedupliziert gegen den Bestand beim zweiten Lauf (nichts doppelt gespeichert)", async () => {
    const { deps, umsaetze } = fakes();
    const eingabe = {
      quelle: "finanzguru",
      zeitpunkt: "2026-06-21T10:00:00Z",
      rohUmsaetze: [roh({ kontoIban: "DE111", nativeId: "n1" })],
      konten: [{ quelleKey: "DE111", neu: { bezeichnung: "Giro", typ: "Giro" as const, iban: "DE111" } }],
    };
    await umsaetzeUebernehmen(eingabe, deps);
    const zweiter = await umsaetzeUebernehmen(eingabe, deps);
    expect(zweiter).toMatchObject({ neu: 0, duplikate: 1 });
    expect(umsaetze).toHaveLength(1); // nur der erste Lauf
  });

  it("überspringt Buchungen ohne aufgelöstes Konto statt sie blind zu verbuchen", async () => {
    const { deps, umsaetze } = fakes();
    const r = await umsaetzeUebernehmen(
      {
        quelle: "finanzguru",
        zeitpunkt: "2026-06-21T10:00:00Z",
        rohUmsaetze: [roh({ kontoIban: "UNBEKANNT", nativeId: "n9" })],
        konten: [], // keine Auflösung
      },
      deps,
    );
    expect(r).toMatchObject({ neu: 0, ohneKonto: 1 });
    expect(umsaetze).toHaveLength(0);
  });
});

describe("Kategorisierungs-Kette beim Import", () => {
  /** Ein Modell, das REWE kennt — ohne dass die Datei eine Kategorie mitliefert. */
  function mitModell(): Vorschlagskontext {
    return {
      katalogNachName: new Map(),
      kategorieNachId: new Map([["k-le", { id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" as const }]]),
      modell: trainieren([
        { merkmale: ["emp=rewe markt", "vwz:einkauf", "vz:-"], kategorieId: "k-le" },
        { merkmale: ["emp=shell station", "vwz:tanken", "vz:-"], kategorieId: "k-sprit" },
      ]),
    };
  }

  it("kategorisiert eine Zeile OHNE mitgelieferte Kategorie", async () => {
    // Der Fall, für den die Kette gebaut wurde: ein Bankimport liefert keinen Hinweis.
    const { deps, umsaetze } = fakes();
    await umsaetzeUebernehmen(
      {
        quelle: "bank", zeitpunkt: "2026-08-17T10:00:00.000Z",
        rohUmsaetze: [roh({ gegenpartei: "REWE Markt", verwendungszweck: "Einkauf", kontoIban: "DE1" })],
        konten: [{ quelleKey: quelleKeyFuer("DE1"), neu: { bezeichnung: "Giro", typ: "Giro" } }],
      },
      { ...deps, kategorisierung: mitModell() },
    );

    expect(umsaetze[0].vorschlag).toEqual({ kategorieId: "k-le", charakter: "Aufwand", quelle: "ki" });
  });

  it("ohne Kontext bleibt es beim alten Verhalten", async () => {
    const { deps, umsaetze } = fakes();
    await umsaetzeUebernehmen(
      {
        quelle: "bank", zeitpunkt: "2026-08-17T10:00:00.000Z",
        rohUmsaetze: [roh({ gegenpartei: "REWE Markt", kategorieHinweis: "Lebensmittel", kontoIban: "DE1" })],
        konten: [{ quelleKey: quelleKeyFuer("DE1"), neu: { bezeichnung: "Giro", typ: "Giro" } }],
      },
      deps,
    );

    expect(umsaetze[0].vorschlag?.quelle).toBe("remapping");
  });

  it("der Katalog kommt IMMER frisch aus dem Repository", async () => {
    // Ein mitgereichter Kontext könnte einen älteren Kategorie-Stand tragen; das
    // Remapping muss trotzdem gegen den aktuellen Katalog auflösen.
    const { deps, umsaetze } = fakes();
    await umsaetzeUebernehmen(
      {
        quelle: "bank", zeitpunkt: "2026-08-17T10:00:00.000Z",
        rohUmsaetze: [roh({ gegenpartei: "Irgendwer", kategorieHinweis: "Lebensmittel", kontoIban: "DE1" })],
        konten: [{ quelleKey: quelleKeyFuer("DE1"), neu: { bezeichnung: "Giro", typ: "Giro" } }],
      },
      { ...deps, kategorisierung: { katalogNachName: new Map(), kategorieNachId: new Map() } },
    );

    expect(umsaetze[0].vorschlag).toEqual({ kategorieId: "k-le", charakter: "Aufwand", quelle: "remapping" });
  });
});

describe("Dublettenfinder beim Übernehmen", () => {
  /** Ein Bestand, wie ihn der Dateiimport hinterlässt: geputzte Gegenpartei, kein Valuta. */
  async function bestandAusDatei() {
    const f = fakes();
    await umsaetzeUebernehmen(
      {
        quelle: "finanzguru",
        zeitpunkt: "2026-08-16T10:00:00.000Z",
        rohUmsaetze: [
          roh({
            buchungstag: "2026-08-04",
            betrag: -4990,
            gegenpartei: "Nordhoff",
            verwendungszweck: "EDK*NORDHOFF NORDHOFF, MUSTERSTADT DEKarte Nr. 1234 56XX XXXX 7890",
            kontoIban: "DE31999999980000000002",
            nativeId: "fg-1",
          }),
        ],
        konten: [{ quelleKey: "DE31999999980000000002", neu: { bezeichnung: "Giro", typ: "Giro" } }],
      },
      f.deps,
    );
    return f;
  }

  /** Dieselbe Buchung, wie die Bank sie liefert: roher Empfänger, Buchungstext vorn. */
  const vonDerBank = (over: Partial<RohUmsatz> = {}) =>
    roh({
      quelle: "fints",
      buchungstag: "2026-08-04",
      valuta: "2026-08-04",
      betrag: -4990,
      gegenpartei: "EDK*NORDHOFF NORDHOFF",
      verwendungszweck: "KARTENVERFÜGUNGEDK*NORDHOFF NORDHOFF, MUSTERSTADT  DE",
      kontoIban: "DE31999999980000000002",
      mandatsreferenz: "M-4711",
      nativeId: undefined,
      ...over,
    });

  it("legt eine wiedererkannte Buchung nicht nochmal an, sondern ergänzt sie", async () => {
    // Der Fall, der am echten Bestand 51 von 60 Zeilen betraf: der Roh-Hash trifft nicht,
    // weil Finanzguru die Gegenpartei putzt und die Bank sie roh liefert.
    const f = await bestandAusDatei();
    const vorher = f.umsaetze.length;

    const ergebnis = await umsaetzeUebernehmen(
      {
        quelle: "fints",
        zeitpunkt: "2026-08-18T10:00:00.000Z",
        rohUmsaetze: [vonDerBank()],
        konten: [{ quelleKey: "DE31999999980000000002", kontoId: f.konten[0].id }],
      },
      f.deps,
    );

    expect(ergebnis.neu).toBe(0);
    expect(ergebnis.duplikate).toBe(1);
    expect(ergebnis.ergaenzt).toBe(1);
    expect(f.umsaetze).toHaveLength(vorher);

    // Ergänzt wurde, was die Bank mehr weiß …
    expect(f.umsaetze[0].mandatsreferenz).toBe("M-4711");
    expect(f.umsaetze[0].valuta).toBe("2026-08-04");
    // … und die native ID der ersten Quelle bleibt unangetastet.
    expect(f.umsaetze[0].nativeId).toBe("fg-1");
    expect(f.umsaetze[0].gegenpartei).toBe("Nordhoff");
  });

  it("legt bei abweichendem Datum an, schreibt aber den Verdacht dazu", async () => {
    const f = await bestandAusDatei();

    const ergebnis = await umsaetzeUebernehmen(
      {
        quelle: "fints",
        zeitpunkt: "2026-08-18T10:00:00.000Z",
        rohUmsaetze: [vonDerBank({ buchungstag: "2026-08-05", valuta: "2026-08-05" })],
        konten: [{ quelleKey: "DE31999999980000000002", kontoId: f.konten[0].id }],
      },
      f.deps,
    );

    expect(ergebnis.neu).toBe(1);
    expect(ergebnis.verdacht).toBe(1);
    const angelegt = f.umsaetze[f.umsaetze.length - 1];
    expect(angelegt.verdachtAufId).toBe(f.umsaetze[0].id);
    expect(angelegt.verdachtGruende?.length).toBeGreaterThan(0);
  });

  it("lässt eine echt neue Buchung neu sein", async () => {
    const f = await bestandAusDatei();

    const ergebnis = await umsaetzeUebernehmen(
      {
        quelle: "fints",
        zeitpunkt: "2026-08-18T10:00:00.000Z",
        rohUmsaetze: [vonDerBank({ betrag: -1234, gegenpartei: "TANKSTELLE NORD", verwendungszweck: "TANKSTELLE NORD, MUSTERSTADT" })],
        konten: [{ quelleKey: "DE31999999980000000002", kontoId: f.konten[0].id }],
      },
      f.deps,
    );

    expect(ergebnis.neu).toBe(1);
    expect(ergebnis.verdacht).toBe(0);
    expect(f.umsaetze[f.umsaetze.length - 1].verdachtAufId).toBeUndefined();
  });

  it("holt eine verworfene Buchung nicht zurück", async () => {
    // Verworfen ist verworfen: die Zeile BLEIBT im Bestand, nur eben mit diesem Status —
    // und genau deshalb erkennt der Finder sie beim nächsten Abruf wieder und legt sie
    // nicht erneut an. Ohne die Zeile käme dieselbe Buchung bei jedem Abruf zurück.
    const f = await bestandAusDatei();
    f.umsaetze[0] = verwerfen(f.umsaetze[0]);

    const ergebnis = await umsaetzeUebernehmen(
      {
        quelle: "fints",
        zeitpunkt: "2026-08-18T10:00:00.000Z",
        rohUmsaetze: [vonDerBank()],
        konten: [{ quelleKey: "DE31999999980000000002", kontoId: f.konten[0].id }],
      },
      f.deps,
    );

    expect(ergebnis.neu).toBe(0);
    expect(f.umsaetze).toHaveLength(1);
    expect(f.umsaetze[0].status).toBe("verworfen");
  });

  it("erkennt den Reimport derselben Datei über die Buchungs-ID", async () => {
    // Bruce' Fall: Tabelle erweitern, Datei nochmal einlesen — es soll ergänzt statt
    // neu aufgebaut werden.
    const f = await bestandAusDatei();
    const vorher = f.umsaetze.length;

    const ergebnis = await umsaetzeUebernehmen(
      {
        quelle: "finanzguru",
        zeitpunkt: "2026-08-18T11:00:00.000Z",
        rohUmsaetze: [
          roh({
            buchungstag: "2026-08-04",
            betrag: -4990,
            gegenpartei: "Nordhoff",
            verwendungszweck: "EDK*NORDHOFF NORDHOFF, MUSTERSTADT DEKarte Nr. 1234 56XX XXXX 7890",
            kontoIban: "DE31999999980000000002",
            nativeId: "fg-1",
            mandatsreferenz: "M-4711",
          }),
        ],
        konten: [{ quelleKey: "DE31999999980000000002", kontoId: f.konten[0].id }],
      },
      f.deps,
    );

    expect(ergebnis.neu).toBe(0);
    expect(f.umsaetze).toHaveLength(vorher);
    expect(f.umsaetze[0].mandatsreferenz).toBe("M-4711");
  });
});

/**
 * Woher ein Lauf kam, steht AM LAUF und wird nicht aus seinen Umsätzen hergeleitet.
 *
 * Der Unterschied ist nicht theoretisch: gerade die interessanten Läufe haben keine
 * Umsätze. Der Rückgriff holt bei jedem Abruf dieselben Tage nochmal, die Mehrzahl aller
 * Läufe bringt deshalb nichts Neues — und genau die fielen aus jeder Auswertung heraus,
 * wenn der Bezug über die Umsätze liefe.
 */
describe("Herkunft am Lauf", () => {
  it("schreibt Zugang, Konto und Format ins Protokoll", async () => {
    const { deps, laeufe } = fakes();
    await umsaetzeUebernehmen(
      {
        quelle: "fints",
        zeitpunkt: "2026-08-22T10:00:00.000Z",
        rohUmsaetze: [roh({ betrag: -1000 })],
        konten: [{ quelleKey: "k1", kontoId: "k1" }],
        herkunft: { zugangId: "z1", zahlungskontoId: "k1", format: "CAMT" },
      },
      deps,
    );
    expect(laeufe[0]).toMatchObject({ zugangId: "z1", zahlungskontoId: "k1", format: "CAMT" });
  });

  it("hält fest, wenn die Bank die Trefferzahl gedeckelt hat", async () => {
    const { deps, laeufe } = fakes();
    await umsaetzeUebernehmen(
      {
        quelle: "fints",
        zeitpunkt: "2026-08-22T10:00:00.000Z",
        rohUmsaetze: [roh({ betrag: -1000 })],
        konten: [{ quelleKey: "k1", kontoId: "k1" }],
        herkunft: { abgeschnitten: true },
      },
      deps,
    );
    expect(laeufe[0].abgeschnitten).toBe(true);
  });

  /** Ein Dateiimport kennt weder Zugang noch ein einzelnes Konto — das Feld bleibt leer. */
  it("lässt die Herkunft weg, wenn keine mitkommt", async () => {
    const { deps, laeufe } = fakes();
    await umsaetzeUebernehmen(
      {
        quelle: "finanzguru",
        zeitpunkt: "2026-08-22T10:00:00.000Z",
        rohUmsaetze: [roh({ betrag: -1000 })],
        konten: [{ quelleKey: "k1", kontoId: "k1" }],
      },
      deps,
    );
    expect(laeufe[0].zugangId).toBeUndefined();
    expect(laeufe[0].format).toBeUndefined();
  });
});
