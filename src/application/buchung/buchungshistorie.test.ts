// Der Rückweg — und vor allem die Fälle, in denen er verschlossen bleibt.
//
// Alle Werte hier sind erfunden.

import { describe, expect, it } from "vitest";
import { buchungZuruecksetzen, historieLaden } from "./buchungshistorie";
import { FachlicherFehler, type IstBuchung, type Journaleintrag } from "../../core";
import type { JournalRepository, LedgerPort } from "../ports";

function buchung(felder: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: "b1",
    datum: "2026-05-12",
    betrag: -2468,
    kontoId: "k1",
    charakter: "Aufwand",
    quelle: "import",
    ...felder,
  };
}

function journal(eintraege: Journaleintrag[]): JournalRepository {
  return {
    zuBuchung: async (id) => eintraege.filter((e) => e.istbuchungId === id),
    anzahlen: async () => new Map(),
  };
}

function angelegt(stand: IstBuchung, zeitpunkt = "2026-05-12T08:00:00.000Z"): Journaleintrag {
  return { id: "j-" + zeitpunkt, istbuchungId: stand.id, zeitpunkt, art: "angelegt", nachher: stand };
}

/** Ein Ledger, das sich merkt, was geschrieben wurde. */
function ledgerFake(): LedgerPort & { geschrieben: IstBuchung[] } {
  const geschrieben: IstBuchung[] = [];
  return {
    geschrieben,
    alle: async () => [],
    speichern: async (b) => { geschrieben.push(b); },
    loeschen: async () => {},
  };
}

describe("historieLaden", () => {
  it("nennt die geänderten Felder und öffnet den Rückweg", async () => {
    const ur = buchung({ kategorieId: "le", notiz: undefined });
    const heute = buchung({ kategorieId: "dr", notiz: "falsch einsortiert" });

    const h = await historieLaden(journal([angelegt(ur)]), heute);

    expect(h.urzustand?.kategorieId).toBe("le");
    expect([...h.abweichungen].sort()).toEqual(["kategorieId", "notiz"]);
    expect(h.rueckweg).toEqual({ moeglich: true });
  });

  it("bleibt zu, solange die Buchung unverändert dasteht", async () => {
    const stand = buchung();
    const h = await historieLaden(journal([angelegt(stand)]), stand);
    expect(h.rueckweg).toEqual({ moeglich: false, grund: "unveraendert" });
  });

  it("bleibt zu ohne Anlege-Eintrag — der Bestand vor dem Journal", async () => {
    const h = await historieLaden(journal([]), buchung());
    expect(h.urzustand).toBeUndefined();
    expect(h.rueckweg).toEqual({ moeglich: false, grund: "keinUrzustand" });
  });

  it("bleibt zu bei einem Umbuchungs-Bein", async () => {
    // Ein Bein allein zurückzusetzen ließe entweder das Gegenbein mit einem Verweis ins
    // Leere stehen oder holte eine Paarung zurück, deren andere Seite nicht mehr passt.
    const ur = buchung({ transferId: "t1", gegenkontoId: "k2", charakter: "Umschichtung" });
    const heute = buchung({ transferId: "t1", gegenkontoId: "k2", charakter: "Umschichtung", datum: "2026-05-20" });
    const h = await historieLaden(journal([angelegt(ur)]), heute);
    expect(h.rueckweg).toEqual({ moeglich: false, grund: "paarung" });
  });

  it("bleibt auch dann zu, wenn erst die Paarung dazukam", async () => {
    const ur = buchung();
    const heute = buchung({ transferId: "t1", gegenkontoId: "k2", charakter: "Umschichtung" });
    const h = await historieLaden(journal([angelegt(ur)]), heute);
    expect(h.rueckweg).toEqual({ moeglich: false, grund: "paarung" });
  });
});

describe("buchungZuruecksetzen", () => {
  it("schreibt den Stand von damals zurück", async () => {
    const ur = buchung({ betrag: -2468, kategorieId: "le" });
    const heute = buchung({ betrag: -9999, kategorieId: "dr", notiz: "vertippt" });
    const ledger = ledgerFake();

    const zurueck = await buchungZuruecksetzen(ledger, journal([angelegt(ur)]), heute);

    expect(zurueck.betrag).toBe(-2468);
    expect(ledger.geschrieben).toEqual([ur]);
  });

  it("nimmt auch eine Aufteilung zurück", async () => {
    const ur = buchung({ betrag: -5000, kategorieId: "le" });
    const heute = buchung({
      betrag: -5000,
      kategorieId: undefined,
      aufteilungen: [
        { kategorieId: "le", betrag: -3000 },
        { kategorieId: "dr", betrag: -2000 },
      ],
    });
    const ledger = ledgerFake();

    await buchungZuruecksetzen(ledger, journal([angelegt(ur)]), heute);

    expect(ledger.geschrieben[0].aufteilungen).toBeUndefined();
    expect(ledger.geschrieben[0].kategorieId).toBe("le");
  });

  it("weist den verschlossenen Rückweg mit fachlichem Code ab", async () => {
    const ledger = ledgerFake();
    await expect(buchungZuruecksetzen(ledger, journal([]), buchung())).rejects.toThrow(FachlicherFehler);
    await expect(buchungZuruecksetzen(ledger, journal([]), buchung())).rejects.toThrow("journal.keinUrzustand");
    expect(ledger.geschrieben).toEqual([]);
  });
});
