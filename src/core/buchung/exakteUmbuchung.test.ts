import { describe, expect, it } from "vitest";
import type { Zahlungskonto } from "../konten/konto";
import { exakteUmbuchungen, kontenNachIban, type Umbuchungssuche } from "./exakteUmbuchung";
import type { IstBuchung } from "./istbuchung";

const IBAN_A = "DE02999999010000001002";
const IBAN_B = "DE02999999120000000001";
const IBAN_FREMD = "DE04999999980000000003";

const KONTO_NACH_IBAN = new Map([[IBAN_A, "a"], [IBAN_B, "b"]]);

function buchung(id: string, kontoId: string, betrag: number, datum: string, over: Partial<IstBuchung> = {}): IstBuchung {
  return { id, datum, betrag, kontoId, charakter: betrag < 0 ? "Aufwand" : "Ertrag", quelle: "import", ...over };
}

function suche(
  buchungen: IstBuchung[],
  gegenIban: Record<string, string>,
  over: Partial<Umbuchungssuche> = {},
): [string, string][] {
  return exakteUmbuchungen({
    neueIds: new Set(buchungen.map((b) => b.id)),
    buchungen,
    gegenIbanNachBuchung: new Map(Object.entries(gegenIban)),
    kontoNachIban: KONTO_NACH_IBAN,
    maxTage: 14,
    ...over,
  }).map(([ab, zu]) => [ab.id, zu.id]);
}

describe("exakteUmbuchungen", () => {
  it("paart, wenn beide Beine einander nennen, und stellt den Abgang voran", () => {
    const ab = buchung("ab", "a", -20000, "2026-03-02");
    const zu = buchung("zu", "b", 20000, "2026-03-03");
    expect(suche([zu, ab], { ab: IBAN_B, zu: IBAN_A })).toEqual([["ab", "zu"]]);
  });

  it("ein Bein genügt, wenn das andere keine Gegen-IBAN hat: es trägt beide Enden", () => {
    const ab = buchung("ab", "a", -20000, "2026-03-02");
    const zu = buchung("zu", "b", 20000, "2026-03-03");
    expect(suche([ab, zu], { ab: IBAN_B })).toEqual([["ab", "zu"]]);
    expect(suche([ab, zu], { zu: IBAN_A })).toEqual([["ab", "zu"]]);
  });

  it("gleicher Betrag allein reicht nie", () => {
    const ab = buchung("ab", "a", -5000, "2026-03-02");
    const zu = buchung("zu", "b", 5000, "2026-03-02");
    expect(suche([ab, zu], {})).toEqual([]);
  });

  it("paart nicht, wenn ein Beleg ein fremdes Konto nennt", () => {
    const ab = buchung("ab", "a", -5000, "2026-03-02");
    const zu = buchung("zu", "b", 5000, "2026-03-02");
    expect(suche([ab, zu], { ab: IBAN_FREMD, zu: IBAN_A })).toEqual([]);
  });

  it("paart nicht, wenn das Gegenbein auf einem dritten Konto liegt", () => {
    const ab = buchung("ab", "a", -5000, "2026-03-02");
    const dritter = buchung("c", "c", 5000, "2026-03-02");
    expect(suche([ab, dritter], { ab: IBAN_B })).toEqual([]);
  });

  it("verlangt den exakten Gegenbetrag", () => {
    const ab = buchung("ab", "a", -5000, "2026-03-02");
    const zu = buchung("zu", "b", 4999, "2026-03-02");
    expect(suche([ab, zu], { ab: IBAN_B })).toEqual([]);
  });

  it("das Zeitfenster schliesst den Rand ein, und was dahinter liegt, zählt nicht", () => {
    const ab = buchung("ab", "a", -5000, "2026-03-01");
    const amRand = buchung("zu", "b", 5000, "2026-03-15");
    const dahinter = buchung("spaet", "b", 5000, "2026-03-16");
    expect(suche([ab, amRand], { ab: IBAN_B })).toEqual([["ab", "zu"]]);
    expect(suche([ab, dahinter], { ab: IBAN_B })).toEqual([]);
  });

  it("findet eine schon gebuchte Gegenseite, auch wenn sie aus einem früheren Lauf stammt", () => {
    const alt = buchung("alt", "a", -5000, "2026-03-02");
    const neu = buchung("neu", "b", 5000, "2026-03-04");
    expect(suche([alt, neu], { alt: IBAN_B }, { neueIds: new Set(["neu"]) })).toEqual([["alt", "neu"]]);
  });

  it("rollt den Bestand nicht auf: ohne neue Buchung passiert nichts", () => {
    const ab = buchung("ab", "a", -5000, "2026-03-02");
    const zu = buchung("zu", "b", 5000, "2026-03-02");
    expect(suche([ab, zu], { ab: IBAN_B }, { neueIds: new Set() })).toEqual([]);
  });

  it("nimmt von zwei Treffern den näheren", () => {
    const ab = buchung("ab", "a", -5000, "2026-03-10");
    const nah = buchung("nah", "b", 5000, "2026-03-11");
    const fern = buchung("fern", "b", 5000, "2026-03-15");
    expect(suche([ab, nah, fern], { ab: IBAN_B }, { neueIds: new Set(["ab"]) })).toEqual([["ab", "nah"]]);
  });

  it("lässt die Buchung stehen, wenn zwei Treffer gleich weit weg sind", () => {
    const ab = buchung("ab", "a", -5000, "2026-03-10");
    const vorher = buchung("vorher", "b", 5000, "2026-03-09");
    const nachher = buchung("nachher", "b", 5000, "2026-03-11");
    expect(suche([ab, vorher, nachher], { ab: IBAN_B }, { neueIds: new Set(["ab"]) })).toEqual([]);
  });

  it("paart nur gegenseitig Nächste: ein Gegenbein geht nicht an den ferneren Abgang", () => {
    const nah = buchung("nah", "a", -5000, "2026-03-10");
    const fern = buchung("fern", "a", -5000, "2026-03-05");
    const zu = buchung("zu", "b", 5000, "2026-03-11");
    expect(suche([fern, nah, zu], { nah: IBAN_B, fern: IBAN_B })).toEqual([["nah", "zu"]]);
  });

  it("zwei gleiche Umbuchungen im Abstand werden sauber getrennt", () => {
    const ab1 = buchung("ab1", "a", -5000, "2026-03-02");
    const zu1 = buchung("zu1", "b", 5000, "2026-03-03");
    const ab2 = buchung("ab2", "a", -5000, "2026-03-09");
    const zu2 = buchung("zu2", "b", 5000, "2026-03-10");
    const gegen = { ab1: IBAN_B, ab2: IBAN_B };
    expect(suche([ab1, zu1, ab2, zu2], gegen).sort()).toEqual([["ab1", "zu1"], ["ab2", "zu2"]]);
  });

  describe("was jemand entschieden hat, bleibt", () => {
    const ab = buchung("ab", "a", -5000, "2026-03-02");
    const zu = (over: Partial<IstBuchung>) => buchung("zu", "b", 5000, "2026-03-02", over);

    it("ein Bein aus einer gelösten Paarung (Umschichtung ohne Partner) bleibt draussen", () => {
      expect(suche([ab, zu({ charakter: "Umschichtung" })], { ab: IBAN_B })).toEqual([]);
    });

    it("eine von Hand kategorisierte Buchung bleibt draussen", () => {
      expect(suche([ab, zu({ kategorieId: "k", kategorieHerkunft: "manuell" })], { ab: IBAN_B })).toEqual([]);
    });

    it("eine automatische Kategorie steht nicht im Weg", () => {
      expect(suche([ab, zu({ kategorieId: "k", kategorieHerkunft: "automatisch" })], { ab: IBAN_B }))
        .toEqual([["ab", "zu"]]);
    });

    it("ein schon verbundenes Bein bleibt draussen", () => {
      expect(suche([ab, zu({ transferId: "t" })], { ab: IBAN_B })).toEqual([]);
    });

    it("eine aufgeteilte Buchung bleibt draussen", () => {
      expect(suche([ab, zu({ aufteilungen: [{ betrag: 5000, kategorieId: "k" }] as IstBuchung["aufteilungen"] })], { ab: IBAN_B }))
        .toEqual([]);
    });

    it("eine von Hand erfasste Buchung bleibt draussen", () => {
      expect(suche([ab, zu({ quelle: "manuell" })], { ab: IBAN_B })).toEqual([]);
    });
  });
});

describe("kontenNachIban", () => {
  const konto = (id: string, iban?: string) => ({ id, iban }) as Zahlungskonto;

  it("normalisiert die Schreibweise", () => {
    const karte = kontenNachIban([konto("a", "de02 9999 9901 0000 0010 02")]);
    expect(karte.get(IBAN_A)).toBe("a");
  });

  it("nimmt eine IBAN heraus, die zwei Konten tragen", () => {
    const karte = kontenNachIban([konto("a", IBAN_A), konto("b", IBAN_A), konto("c", IBAN_B)]);
    expect(karte.has(IBAN_A)).toBe(false);
    expect(karte.get(IBAN_B)).toBe("c");
  });

  it("übergeht Konten ohne IBAN", () => {
    expect(kontenNachIban([konto("bar")]).size).toBe(0);
  });
});
