// Der Rücklagenfluss — drei Zahlen, die verschiedene Fragen beantworten.

import { describe, expect, it } from "vitest";
import { ruecklagenfluss } from "./fluss";
import type { Ruecklage } from "./ruecklage";
import type { IstBuchung } from "../buchung/istbuchung";
import type { Zahlungskonto } from "../konten/konto";
import type { Zahlungsregel } from "../basis/zahlungsregel";

const konten: Zahlungskonto[] = [
  { id: "giro", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 },
  { id: "tagesgeld", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 0 },
  { id: "depot", bezeichnung: "Depot", typ: "Tagesgeld", klasse: "vorsorge", inhaberIds: [], saldo: 0 },
  { id: "zweit", bezeichnung: "Zweitkonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 },
];

const buchung = (over: Partial<IstBuchung> = {}): IstBuchung => ({
  id: "b1",
  datum: "2026-06-05",
  betrag: -20000,
  kontoId: "giro",
  gegenkontoId: "tagesgeld",
  charakter: "Umschichtung",
  quelle: "import",
  transferId: "t1",
  ...over,
});

const regel = (over: Partial<Zahlungsregel> = {}): Zahlungsregel => ({
  id: "r1",
  bezeichnung: "Sparrate",
  betrag: -20000,
  rhythmus: "monatlich",
  startdatum: "2026-01-01",
  charakter: "Umschichtung",
  kontoId: "giro",
  gegenkontoId: "tagesgeld",
  vertragId: "v1",
  ...over,
});

const ruecklage: Ruecklage = {
  id: "r",
  bezeichnung: "Waschmaschine",
  ziel: 60000,
  fristMonate: 12,
  beginn: "2026-01-01",
};

const VON = "2026-06-01";
const BIS = "2026-07-01";

describe("ruecklagenfluss", () => {
  it("zählt Umschichtungen von liquide nach Rücklage", () => {
    const f = ruecklagenfluss([buchung()], konten, [], [], VON, BIS);
    expect(f.ist).toBe(20000);
    expect(f.posten).toHaveLength(1);
  });

  it("zählt auch Vorsorgekonten — zurückgelegt ist zurückgelegt", () => {
    const f = ruecklagenfluss([buchung({ gegenkontoId: "depot" })], konten, [], [], VON, BIS);
    expect(f.ist).toBe(20000);
  });

  // Zwischen zwei liquiden Konten wurde nichts zurückgelegt, nur verschoben.
  it("zählt eine Umbuchung zwischen zwei liquiden Konten nicht", () => {
    const f = ruecklagenfluss([buchung({ gegenkontoId: "zweit" })], konten, [], [], VON, BIS);
    expect(f.ist).toBe(0);
  });

  it("zählt eine Rückholung aus der Rücklage nicht als Zufluss", () => {
    // Das abgehende Bein liegt hier auf dem Tagesgeldkonto — die Quelle ist nicht liquide.
    const f = ruecklagenfluss(
      [buchung({ kontoId: "tagesgeld", gegenkontoId: "giro" })],
      konten, [], [], VON, BIS,
    );
    expect(f.ist).toBe(0);
  });

  /**
   * Beide Beine zu zählen ergäbe null: einmal −200, einmal +200. Der Test steht hier,
   * weil eine Umbuchung im Bestand IMMER als Paar liegt und der Fehler deshalb nie in
   * einem konstruierten Einzelfall auffiele.
   */
  it("zählt das Paar nur einmal", () => {
    const f = ruecklagenfluss(
      [
        buchung({ id: "ab", betrag: -20000, kontoId: "giro", gegenkontoId: "tagesgeld" }),
        buchung({ id: "zu", betrag: 20000, kontoId: "tagesgeld", gegenkontoId: "giro" }),
      ],
      konten, [], [], VON, BIS,
    );
    expect(f.ist).toBe(20000);
  });

  it("hält sich ans Fenster", () => {
    const f = ruecklagenfluss(
      [buchung({ id: "vorher", datum: "2026-05-31" }), buchung({ id: "danach", datum: "2026-07-01" })],
      konten, [], [], VON, BIS,
    );
    expect(f.ist).toBe(0);
  });

  it("nimmt als Bedarf die Summe der Monatsraten", () => {
    const f = ruecklagenfluss([], konten, [ruecklage], [], VON, BIS);
    expect(f.bedarf).toBe(5000); // 60000 auf 12 Monate
  });

  it("nimmt als Plan die eingerichteten Umbuchungen", () => {
    const f = ruecklagenfluss([], konten, [], [regel()], VON, BIS);
    expect(f.plan).toBe(20000);
  });

  // Ohne Normalisierung hinge die Zahl am Kalender: im Quartalsmonat stünde der volle
  // Betrag, in den zwei anderen nichts.
  it("rechnet einen Vierteljahresrhythmus auf den Monat herunter", () => {
    const f = ruecklagenfluss([], konten, [], [regel({ rhythmus: "quartalsweise", betrag: -60000 })], VON, BIS);
    expect(f.plan).toBe(20000);
  });

  it("zählt eine Umbuchung zwischen liquiden Konten nicht in den Plan", () => {
    const f = ruecklagenfluss([], konten, [], [regel({ gegenkontoId: "zweit" })], VON, BIS);
    expect(f.plan).toBe(0);
  });

  it("zählt eine gewöhnliche Ausgaberegel nicht in den Plan", () => {
    const f = ruecklagenfluss([], konten, [], [regel({ charakter: "Aufwand" })], VON, BIS);
    expect(f.plan).toBe(0);
  });

  /** Der Fall, für den es die drei Zahlen gibt: sie sagen zusammen mehr als einzeln. */
  it("legt Bedarf, Plan und Ist nebeneinander offen", () => {
    const f = ruecklagenfluss(
      [buchung({ betrag: -15000 })],
      konten,
      [ruecklage],
      [regel()],
      VON,
      BIS,
    );
    // Verlangt 50, eingerichtet 200, geflossen 150 — jede Zahl eine andere Aussage.
    expect([f.bedarf, f.plan, f.ist]).toEqual([5000, 20000, 15000]);
  });
});
