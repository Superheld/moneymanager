import { describe, expect, it } from "vitest";
import type { IstBuchung, Person, Vertrag, Vertragszuordnung, Zahlungskonto } from "../core";
import type { Umsatz } from "./import/umsatz";
import type {
  LedgerPort,
  PersonRepository,
  UmsatzRepository,
  VertragRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
} from "./ports";
import {
  BESTANDSEXPORT_FASSUNG,
  bestandExportieren,
  buchungenInExportform,
  kontenInExportform,
  type Bestandsexport,
  type Bestandsquellen,
} from "./bestandsexport";

// Erfundene Namen, sektorneutral und nur in DIESER Datei gültig (siehe src/CLAUDE.md).
// Die IBANs tragen die Bankleitzahl 99999901, die es nicht gibt.

const KONTO: Zahlungskonto = {
  id: "ko-1",
  bezeichnung: "Zahltag",
  typ: "Giro",
  klasse: "liquide",
  iban: "DE62999999010000000123",
  inhaberIds: ["p-1"],
  saldo: 120_00,
};

const PERSON: Person = { id: "p-1", name: "Marlen Ortweg", rolle: "Inhaberin" };

const VERTRAG: Vertrag = {
  id: "v-1",
  anbieter: "Kesselmann",
  beginn: "2025-01-01",
  verlaengerung: "automatisch",
  status: "aktiv",
  kategorieId: "kat-1",
};

function buchung(teil: Partial<IstBuchung> & Pick<IstBuchung, "id" | "datum">): IstBuchung {
  return {
    betrag: -19_90,
    kontoId: "ko-1",
    charakter: "Aufwand",
    quelle: "import",
    ...teil,
  };
}

function beleg(teil: Partial<Umsatz> & Pick<Umsatz, "id" | "istbuchungId">): Umsatz {
  return {
    laufId: "lauf-1",
    zahlungskontoId: "ko-1",
    buchungstag: "2026-03-04",
    betrag: -19_90,
    waehrung: "EUR",
    gegenpartei: "Kesselmann",
    verwendungszweck: "Monatsbeitrag 03/2026",
    rohHash: `hash-${teil.id}`,
    status: "verbucht",
    ...teil,
  };
}

function quellen(teil: {
  buchungen?: IstBuchung[];
  umsaetze?: Umsatz[];
  konten?: Zahlungskonto[];
  personen?: Person[];
  vertraege?: Vertrag[];
  zuordnungen?: Vertragszuordnung[];
}): Bestandsquellen {
  const nichts = { speichern: async () => {}, loeschen: async () => {} };
  return {
    ledger: { alle: async () => teil.buchungen ?? [], ...nichts } as LedgerPort,
    umsaetze: { alle: async () => teil.umsaetze ?? [] } as UmsatzRepository,
    konten: { alle: async () => teil.konten ?? [], ...nichts } as ZahlungskontoRepository,
    personen: { alle: async () => teil.personen ?? [], ...nichts } as PersonRepository,
    vertraege: { alle: async () => teil.vertraege ?? [], ...nichts } as VertragRepository,
    vertragszuordnungen: {
      alle: async () => teil.zuordnungen ?? [],
      ...nichts,
    } as unknown as VertragszuordnungRepository,
  };
}

async function exportieren(teil: Parameters<typeof quellen>[0]): Promise<Bestandsexport> {
  let inhalt = "";
  await bestandExportieren(
    quellen(teil),
    { schreiben: async (_n, i) => ((inhalt = i), "/irgendwo/x.json") },
    new Date("2026-08-30T14:12:00Z"),
    "moneymanager-dev.db",
  );
  return JSON.parse(inhalt) as Bestandsexport;
}

describe("buchungenInExportform", () => {
  it("stellt den Beleg neben die Buchung", async () => {
    // Der eigentliche Zweck der Datei: der Text der Bankzeile UND die Kategorie, die
    // jemand ihr gegeben hat, in einer Zeile. Zwei Listen mit einer ID dazwischen zwängen
    // jeden Leser, den Join selbst zu bauen.
    const daten = await exportieren({
      buchungen: [buchung({ id: "b-1", datum: "2026-03-04", kategorieId: "kat-1" })],
      umsaetze: [beleg({ id: "u-1", istbuchungId: "b-1", zweckCode: "RENT", endempfaenger: "Vibora" })],
    });

    const [b] = daten.buchungen;
    expect(b.kategorieId).toBe("kat-1");
    expect(b.beleg?.gegenpartei).toBe("Kesselmann");
    expect(b.beleg?.verwendungszweck).toBe("Monatsbeitrag 03/2026");
    // Beide nur aus CAMT — und für die Kategorisierung wertvoller als der halbe Zweck.
    expect(b.beleg?.zweckCode).toBe("RENT");
    expect(b.beleg?.endempfaenger).toBe("Vibora");
  });

  it("macht aus einer Buchung ohne Beleg kein Loch, sondern ein null", () => {
    // Eine von Hand erfasste Buchung hat keinen Beleg, und das ist eine Aussage. Ein
    // fehlendes Feld sähe aus wie ein vergessenes.
    const [b] = buchungenInExportform(
      [buchung({ id: "b-1", datum: "2026-03-04", quelle: "manuell" })],
      [],
      new Map(),
    );
    expect(b.beleg).toBeNull();
    expect("beleg" in b).toBe(true);
  });

  it("sortiert nach Datum, bei Gleichstand nach Id", () => {
    // Zwei Exporte desselben Bestands sollen sich vergleichen lassen; ohne feste
    // Reihenfolge wäre jeder Unterschied im Diff Rauschen.
    const ids = buchungenInExportform(
      [
        buchung({ id: "b-c", datum: "2026-03-09" }),
        buchung({ id: "b-b", datum: "2026-03-04" }),
        buchung({ id: "b-a", datum: "2026-03-04" }),
      ],
      [],
      new Map(),
    ).map((b) => b.id);
    expect(ids).toEqual(["b-a", "b-b", "b-c"]);
  });

  it("unterscheidet 'gehoert zu keinem Vertrag' von 'nie entschieden'", () => {
    // Die mittlere Zeile der Tabelle in CLAUDE.md: eine leere vertragId MIT Herkunft ist
    // eine Handentscheidung, die bleiben muss. Ohne die Herkunft im Export sähen die
    // beiden Fälle gleich aus, und der nächste Abgleich holte den korrigierten Fehlgriff
    // zurück.
    const index = new Map([
      ["b-1", { vertragId: null, herkunft: "manuell" }],
    ]);
    const [ohne, nie] = buchungenInExportform(
      [buchung({ id: "b-1", datum: "2026-03-04" }), buchung({ id: "b-2", datum: "2026-03-05" })],
      [],
      index,
    );
    expect(ohne.vertragId).toBeNull();
    expect(ohne.vertragHerkunft).toBe("manuell");
    expect(nie.vertragId).toBeNull();
    expect(nie.vertragHerkunft).toBeNull();
  });

  it("nimmt die Aufteilungen mit", () => {
    const teile = [
      { kategorieId: "kat-1", betrag: -12_00 },
      { kategorieId: "kat-2", betrag: -7_90 },
    ];
    const [b] = buchungenInExportform(
      [buchung({ id: "b-1", datum: "2026-03-04", aufteilungen: teile })],
      [],
      new Map(),
    );
    expect(b.aufteilungen).toEqual(teile);
    expect(b.aufteilungen.reduce((s, a) => s + a.betrag, 0)).toBe(-19_90);
  });

  it("schreibt die fehlende Kategorie-Herkunft aus", () => {
    // Fehlend zählt als „automatisch". Wer die Datei ohne Regelwissen liest, soll das
    // nicht wissen müssen.
    const [b] = buchungenInExportform([buchung({ id: "b-1", datum: "2026-03-04" })], [], new Map());
    expect(b.kategorieHerkunft).toBe("automatisch");
  });
});

describe("kontenInExportform", () => {
  it("trägt IBAN und Saldo", () => {
    // Der Grund für die eigene Datei und die eigene Warnung — hier steht er als Test.
    const [k] = kontenInExportform([KONTO]);
    expect(k.iban).toBe("DE62999999010000000123");
    expect(k.saldo).toBe(120_00);
  });

  it("macht aus einer fehlenden IBAN ein null", () => {
    const [k] = kontenInExportform([{ ...KONTO, iban: undefined }]);
    expect(k.iban).toBeNull();
    expect("iban" in k).toBe(true);
  });
});

describe("bestandExportieren", () => {
  it("schreibt Fassung, Zeitpunkt und alle vier Abschnitte", async () => {
    const daten = await exportieren({
      buchungen: [buchung({ id: "b-1", datum: "2026-03-04" })],
      konten: [KONTO],
      personen: [PERSON],
      vertraege: [VERTRAG],
    });
    expect(daten.fassung).toBe(BESTANDSEXPORT_FASSUNG);
    expect(daten.erzeugt).toBe("2026-08-30T14:12:00.000Z");
    expect(daten.personen).toHaveLength(1);
    expect(daten.konten).toHaveLength(1);
    expect(daten.vertraege).toHaveLength(1);
    expect(daten.buchungen).toHaveLength(1);
  });

  it("liefert jede Abhängigkeit einer Buchung mit", async () => {
    // Die Frage, mit der dieser Export angefangen hat: reichen die Konten? Nein — das
    // Konto zeigt auf eine Person, die Buchung zusätzlich auf einen Vertrag. Wer einen
    // der beiden Abschnitte streicht, hinterlässt Verweise ins Leere.
    const daten = await exportieren({
      buchungen: [buchung({ id: "b-1", datum: "2026-03-04" })],
      konten: [KONTO],
      personen: [PERSON],
      vertraege: [VERTRAG],
      zuordnungen: [{ istbuchungId: "b-1", vertragId: "v-1", herkunft: "automatisch" }],
    });

    const [b] = daten.buchungen;
    expect(daten.konten.map((k) => k.id)).toContain(b.kontoId);
    expect(daten.vertraege.map((v) => v.id)).toContain(b.vertragId);
    const konto = daten.konten.find((k) => k.id === b.kontoId)!;
    for (const inhaber of konto.inhaberIds) {
      expect(daten.personen.map((p) => p.id)).toContain(inhaber);
    }
  });

  it("hält beide Beine einer Umbuchung zusammen", async () => {
    // Ein Bein allein zeigt auf eine transferId, die es in der Datei nicht gibt. Da der
    // Export ohnehin alles nimmt, kann das nur schiefgehen, wenn jemand später filtert —
    // deshalb steht es als Zusicherung da.
    const daten = await exportieren({
      buchungen: [
        buchung({ id: "b-1", datum: "2026-03-04", transferId: "t-1", gegenkontoId: "ko-2", charakter: "Umschichtung" }),
        buchung({ id: "b-2", datum: "2026-03-04", transferId: "t-1", gegenkontoId: "ko-1", betrag: 19_90, charakter: "Umschichtung" }),
      ],
    });
    expect(daten.buchungen.filter((b) => b.transferId === "t-1")).toHaveLength(2);
  });

  it("enthält ausdrücklich, was der Konfigurationsexport verbietet", async () => {
    // Das Gegenstück zur Zusicherung in `konfiguration.test.ts`. Dort steht, dass kein
    // Feld eine Buchung beschreiben darf; hier steht, dass genau das der Inhalt ist. Die
    // beiden Tests zusammen sind die Trennung — einer allein wäre nur eine halbe Aussage,
    // und wer die zwei Exporte je zusammenlegen will, macht beide gleichzeitig rot.
    let name = "";
    let inhalt = "";
    await bestandExportieren(
      quellen({ buchungen: [buchung({ id: "b-1", datum: "2026-03-04" })], konten: [KONTO] }),
      { schreiben: async (n, i) => ((name = n), (inhalt = i), "/x") },
      new Date("2026-08-30T00:00:00Z"),
      "moneymanager-dev.db",
    );
    for (const erwartet of ["betrag", "saldo", "iban", "konto"]) {
      expect(inhalt.toLowerCase()).toContain(erwartet);
    }
    // Und man sieht es der Datei von aussen an, ohne sie zu öffnen.
    expect(name).toBe("bestand-moneymanager-dev-2026-08-30.json");
  });
});
