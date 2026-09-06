// Was eine nachgezogene Erkennungsregel mitbekommt — und woher.
//
// `erkennungenNachziehen` ist die Selbstheilung fuer Vertraege, die ohne Regel entstanden
// sind. Bis 2026-09-05 sah sie nur Vertraege, Zahlungsregeln und Erkennungen: die
// Glaeubiger-ID steht aber am BELEG, nicht am Vertrag, und so trug jede nachgezogene
// Regel allein ein Namensmerkmal — auch dort, wo an den zugeordneten Zahlungen der
// praezisere Schluessel stand.

import { describe, expect, it } from "vitest";
import type { IstBuchung, Vertrag, Vertragserkennung, Vertragszuordnung, Zahlungsregel } from "../../core";
import type { Umsatz } from "../import";
import type {
  LedgerPort,
  UmsatzRepository,
  VertragRepository,
  VertragserkennungRepository,
  VertragszuordnungRepository,
  ZahlungsregelRepository,
} from "../ports";
import { erkennungenNachziehen } from "./vertragszuordnung";

const vertrag = (id: string, anbieter: string) =>
  ({ id, anbieter, art: "vertrag", beginn: "2026-01-01" }) as unknown as Vertrag;

function umgebung(opts: {
  vertraege: Vertrag[];
  zuordnungen?: Vertragszuordnung[];
  glaeubigerIdVonBuchung?: Record<string, string>;
}) {
  const gespeichert: Vertragserkennung[] = [];
  const buchungIds = Object.keys(opts.glaeubigerIdVonBuchung ?? {});

  const vertragRepo = { alle: async () => opts.vertraege } as unknown as VertragRepository;
  const regelRepo = { alle: async () => [] as Zahlungsregel[] } as unknown as ZahlungsregelRepository;
  const erkennungRepo = {
    alle: async () => gespeichert,
    speichern: async (e: Vertragserkennung) => {
      gespeichert.push(e);
    },
  } as unknown as VertragserkennungRepository;

  // Eine Buchung je Beleg, und der Umsatz daneben traegt die ID — genau der Join, den
  // `zahlungsspuren` baut.
  const ledger = {
    alle: async () =>
      buchungIds.map(
        (id) =>
          ({ id, datum: "2026-02-01", betrag: -1650, kontoId: "k1", charakter: "Aufwand" }) as unknown as IstBuchung,
      ),
  } as unknown as LedgerPort;
  const umsatzRepo = {
    alle: async () =>
      buchungIds.map(
        (id) =>
          ({
            id: `u-${id}`,
            istbuchungId: id,
            gegenpartei: "Vibora GmbH",
            glaeubigerId: opts.glaeubigerIdVonBuchung?.[id],
            status: "verbucht",
          }) as unknown as Umsatz,
      ),
  } as unknown as UmsatzRepository;
  const zuordnungRepo = {
    alle: async () => opts.zuordnungen ?? [],
  } as unknown as VertragszuordnungRepository;

  return { vertragRepo, regelRepo, erkennungRepo, belege: { ledger, umsatzRepo, zuordnungRepo }, gespeichert };
}

describe("erkennungenNachziehen", () => {
  it("nimmt die Glaeubiger-ID aus einer von Hand zugeordneten Zahlung mit", async () => {
    const u = umgebung({
      vertraege: [vertrag("v1", "Vibora GmbH")],
      zuordnungen: [{ istbuchungId: "b1", vertragId: "v1", herkunft: "manuell" }],
      glaeubigerIdVonBuchung: { b1: "DE98ZZZ09999999999" },
    });

    await erkennungenNachziehen(u.vertragRepo, u.regelRepo, u.erkennungRepo, u.belege);

    const arten = u.gespeichert[0].merkmale.map((m) => m.art);
    expect(arten).toContain("glaeubigerId");
    expect(u.gespeichert[0].merkmale.find((m) => m.art === "glaeubigerId")?.muster).toBe(
      "DE98ZZZ09999999999",
    );
    // Der Name bleibt daneben stehen: die ID deckt nur, wer EINZIEHT.
    expect(arten).toContain("empfaenger");
  });

  it("laesst eine automatische Zuordnung nicht als Beleg gelten", async () => {
    // Dieselbe Regel wie bei der Merkmalsableitung: was eine Regel selbst zugeordnet hat,
    // ist ihr Ergebnis und kein Beleg fuer sie. Hier gaebe es zwar noch keine Regel, die
    // den Kreis schliessen koennte — die Ausnahme waere aber genau die Zeile, die beim
    // naechsten Umbau stehenbleibt.
    const u = umgebung({
      vertraege: [vertrag("v1", "Vibora GmbH")],
      zuordnungen: [{ istbuchungId: "b1", vertragId: "v1", herkunft: "automatisch" }],
      glaeubigerIdVonBuchung: { b1: "DE98ZZZ09999999999" },
    });

    await erkennungenNachziehen(u.vertragRepo, u.regelRepo, u.erkennungRepo, u.belege);

    expect(u.gespeichert[0].merkmale.map((m) => m.art)).toEqual(["empfaenger"]);
  });

  it("zieht aus einem Nein von Hand keine ID", async () => {
    // `vertragId` leer bei gesetzter Herkunft heisst „gehoert zu KEINEM Vertrag".
    const u = umgebung({
      vertraege: [vertrag("v1", "Vibora GmbH")],
      zuordnungen: [{ istbuchungId: "b1", vertragId: null, herkunft: "manuell" }],
      glaeubigerIdVonBuchung: { b1: "DE98ZZZ09999999999" },
    });

    await erkennungenNachziehen(u.vertragRepo, u.regelRepo, u.erkennungRepo, u.belege);

    expect(u.gespeichert[0].merkmale.map((m) => m.art)).toEqual(["empfaenger"]);
  });

  it("kommt ohne Belegquelle aus und legt die Regel wie bisher an", async () => {
    const u = umgebung({ vertraege: [vertrag("v1", "Vibora GmbH")] });

    const n = await erkennungenNachziehen(u.vertragRepo, u.regelRepo, u.erkennungRepo);

    expect(n).toBe(1);
    expect(u.gespeichert[0].merkmale.map((m) => m.art)).toEqual(["empfaenger"]);
  });
});
