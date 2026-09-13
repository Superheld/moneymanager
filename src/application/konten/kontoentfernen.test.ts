// Das Tor vor dem Löschen — und die Auskunft, die den SQLite-Code ersetzt.

import { describe, expect, it } from "vitest";
import {
  istLoeschbar,
  kontoVollstaendigLoeschen,
  type Kontoloeschung,
  type KontoentfernenPort,
} from "./kontoentfernen";
import type { ZahlungskontoRepository } from "../ports";
import type { Zahlungskonto } from "../../core";

const LEER: Kontoloeschung = {
  buchungen: 0,
  belege: 0,
  bankverbindung: false,
  umbuchungspaare: 0,
  budgets: 0,
  ruecklagen: 0,
  regeln: 0,
  erkennungsregeln: 0,
};

function konto(over: Partial<Zahlungskonto> = {}): Zahlungskonto {
  return { id: "k1", bezeichnung: "Alte Kasse", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 0, ...over };
}

function deps(k: Zahlungskonto | null) {
  const geloescht: string[] = [];
  const kontoRepo: ZahlungskontoRepository = {
    async alle() {
      return k ? [k] : [];
    },
    async speichern() {},
    async aktivSetzen() {},
    async loeschen() {},
  };
  const port: KontoentfernenPort = {
    async zaehlen() {
      return LEER;
    },
    async vollstaendig(id) {
      geloescht.push(id);
    },
  };
  return { deps: { kontoRepo, port }, geloescht };
}

describe("istLoeschbar", () => {
  it("ist wahr, wenn nichts hängt", () => {
    expect(istLoeschbar(LEER)).toBe(true);
  });

  it("ist falsch bei Buchungen", () => {
    expect(istLoeschbar({ ...LEER, buchungen: 1 })).toBe(false);
  });

  it("ist falsch bei einer Importzeile OHNE jede Buchung", () => {
    // **Der ursprüngliche Fehler, als Testfall.** Die alte Meldung behauptete, ein Konto mit
    // BUCHUNGEN liesse sich nicht löschen — gesperrt war es aber auch ohne eine einzige, an
    // `umsatz_verarbeitung`. Wer die Buchungen wegräumte, kam trotzdem nicht weiter und
    // bekam wieder „FOREIGN KEY constraint failed".
    expect(istLoeschbar({ ...LEER, belege: 1 })).toBe(false);
  });

  it("ist falsch bei einer Bankverbindung", () => {
    expect(istLoeschbar({ ...LEER, bankverbindung: true })).toBe(false);
  });

  it("bleibt wahr, wenn nur FOLGEN dranhängen", () => {
    // Ein Budget, eine Rücklage, eine Regel verlieren einen Verweis und verhindern nichts.
    // Sie in die Sperren zu zählen liesse die Meldung behaupten, man müsse sie erst
    // wegräumen — und wer das tut, hat umsonst gearbeitet.
    expect(
      istLoeschbar({ ...LEER, budgets: 2, ruecklagen: 1, regeln: 3, erkennungsregeln: 1, umbuchungspaare: 4 }),
    ).toBe(true);
  });
});

describe("kontoVollstaendigLoeschen", () => {
  it("löscht ein stillgelegtes Konto", async () => {
    const { deps: d, geloescht } = deps(konto({ aktiv: false }));
    await kontoVollstaendigLoeschen(d, "k1");
    expect(geloescht).toEqual(["k1"]);
  });

  it("weist ein GEFÜHRTES Konto ab", async () => {
    // Das Tor, und es ist der Kern des Entwurfs: so ist Stilllegen die vorgegebene Antwort
    // und das Zerstörende eine zweite, eigene Handlung. Ohne es stünden beide Wege
    // gleichberechtigt am selben Mülleimer, und der kürzere gewinnt — auch dann, wenn der
    // andere gemeint war.
    const { deps: d, geloescht } = deps(konto());
    await expect(kontoVollstaendigLoeschen(d, "k1")).rejects.toThrow("konto.nichtStillgelegt");
    expect(geloescht).toEqual([]);
  });

  it("weist ein Konto ab, das es nicht gibt", async () => {
    const { deps: d } = deps(null);
    await expect(kontoVollstaendigLoeschen(d, "k1")).rejects.toThrow("konto.fehlt");
  });

  it("behandelt ein Konto ohne Angabe als geführt", async () => {
    // Fehlend heisst JA — auch hier, und hier ist es der wichtigere Fall: bedeutete es NEIN,
    // liesse sich der ganze Altbestand ohne Zwischenschritt endgültig löschen.
    const { deps: d } = deps(konto({ aktiv: undefined }));
    await expect(kontoVollstaendigLoeschen(d, "k1")).rejects.toThrow("konto.nichtStillgelegt");
  });
});
