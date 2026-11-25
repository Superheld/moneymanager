import { describe, expect, it } from "vitest";
import type { Zahlungsregel } from "../basis/zahlungsregel";
import type { IstBuchung } from "../buchung/istbuchung";
import type { Vertragszuordnung } from "./vertragZuordnung";
import { zuordnungskandidaten } from "./zuordnungsvorschlag";

const regel = (over: Partial<Zahlungsregel> = {}): Zahlungsregel => ({
  id: "r1",
  bezeichnung: "Regel",
  betrag: -80000,
  rhythmus: "monatlich",
  startdatum: "2026-01-01",
  charakter: "Aufwand",
  kategorieId: "kat-a",
  vertragId: "v1",
  ...over,
});

const buchung = (id: string, datum: string, betrag: number, over: Partial<IstBuchung> = {}): IstBuchung => ({
  id,
  datum,
  betrag,
  kontoId: "k1",
  charakter: "Aufwand",
  quelle: "import",
  kategorieId: "kat-a",
  ...over,
});

const ids = (regelwerk: Zahlungsregel, buchungen: IstBuchung[], zuordnungen: Vertragszuordnung[] = []) =>
  zuordnungskandidaten(regelwerk, buchungen, zuordnungen).map((k) => k.buchung.id);

describe("zuordnungskandidaten", () => {
  it("findet die Zahlung mit gleicher Kategorie, Richtung und passendem Betrag", () => {
    const k = zuordnungskandidaten(regel(), [buchung("b1", "2026-03-03", -80000)], []);
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ faelligkeit: "2026-03-01", tage: 2, abweichung: 0 });
  });

  it("stellt die jüngste zuerst", () => {
    const b = [buchung("alt", "2026-02-01", -80000), buchung("neu", "2026-04-01", -80000)];
    expect(ids(regel(), b)).toEqual(["neu", "alt"]);
  });

  it("nimmt eine angehobene Zahlung innerhalb der Toleranz und nennt die Abweichung", () => {
    // Eine Erhöhung um ein Zehntel bleibt drin, eine um ein Fünftel nicht.
    const k = zuordnungskandidaten(
      regel(),
      [buchung("nah", "2026-03-01", -88000), buchung("fern", "2026-04-01", -96000)],
      [],
    );
    expect(k.map((x) => x.buchung.id)).toEqual(["nah"]);
    expect(k[0].abweichung).toBe(-8000);
  });

  it("verlangt die Kategorie der Regel", () => {
    expect(ids(regel(), [buchung("b1", "2026-03-01", -80000, { kategorieId: "kat-b" })])).toEqual([]);
    expect(ids(regel(), [buchung("b1", "2026-03-01", -80000, { kategorieId: undefined })])).toEqual([]);
  });

  it("findet die Kategorie auch in einem Anteil einer geteilten Buchung", () => {
    const geteilt = buchung("b1", "2026-03-01", -80000, {
      kategorieId: undefined,
      aufteilungen: [
        { kategorieId: "kat-a", betrag: -70000 },
        { kategorieId: "kat-b", betrag: -10000 },
      ],
    });
    expect(ids(regel(), [geteilt])).toEqual(["b1"]);
  });

  it("verlangt dieselbe Richtung — eine Erstattung ist keine Zahlung", () => {
    expect(ids(regel(), [buchung("b1", "2026-03-01", 80000)])).toEqual([]);
  });

  it("schlägt für eine Einnahme Eingänge vor", () => {
    const eingang = regel({ betrag: 250000, charakter: "Ertrag", startdatum: "2026-01-28" });
    const b = [buchung("ein", "2026-03-27", 250000, { charakter: "Ertrag" })];
    expect(ids(eingang, b)).toEqual(["ein"]);
  });

  it("lässt aus, was schon einem Vertrag zugeordnet ist — auch einem anderen", () => {
    const b = [buchung("b1", "2026-03-01", -80000), buchung("b2", "2026-04-01", -80000)];
    const z: Vertragszuordnung[] = [
      { istbuchungId: "b1", vertragId: "v1", herkunft: "automatisch" },
      { istbuchungId: "b2", vertragId: "v9", herkunft: "manuell" },
    ];
    expect(ids(regel(), b, z)).toEqual([]);
  });

  it("lässt aus, wozu jemand von Hand gesagt hat: gehört zu keinem Vertrag", () => {
    // Das Nein ist die einzige Stelle, an der „gehört nicht dazu" wirklich dasteht. Ein
    // Vorschlag, der es übergeht, stellt dieselbe Frage bei jedem Öffnen wieder.
    const b = [buchung("b1", "2026-03-01", -80000), buchung("b2", "2026-04-01", -80000)];
    const z: Vertragszuordnung[] = [{ istbuchungId: "b1", vertragId: null, herkunft: "manuell" }];
    expect(ids(regel(), b, z)).toEqual(["b2"]);
  });

  it("sucht einen Jahresbeitrag nur um seine Fälligkeit", () => {
    const jahr = regel({ betrag: -24000, rhythmus: "jaehrlich", startdatum: "2025-03-20" });
    const b = [
      buchung("puenktlich", "2026-03-24", -24000),
      buchung("frueh", "2026-03-10", -24000),
      buchung("abseits", "2026-07-20", -24000),
    ];
    expect(ids(jahr, b)).toEqual(["puenktlich", "frueh"]);
  });

  it("lässt bei monatlichem Takt den Termin nichts wegnehmen", () => {
    // Die erste Fälligkeit ist oft geschätzt: geplant zum Ersten, abgebucht zur Monatsmitte.
    const b = [buchung("mitte", "2026-03-16", -80000), buchung("ende", "2026-05-31", -80000)];
    expect(ids(regel(), b)).toEqual(["ende", "mitte"]);
  });

  it("misst eine Buchung vor dem Start an der ersten Fälligkeit", () => {
    const spaet = regel({ startdatum: "2026-06-01" });
    const k = zuordnungskandidaten(
      spaet,
      [buchung("kurzDavor", "2026-05-28", -80000), buchung("langeDavor", "2026-02-01", -80000)],
      [],
    );
    expect(k.map((x) => x.buchung.id)).toEqual(["kurzDavor"]);
    expect(k[0]).toMatchObject({ faelligkeit: "2026-06-01", tage: -4 });
  });

  it("driftet am Monatsende nicht — die Fälligkeit kehrt zum 31. zurück", () => {
    const ultimo = regel({ startdatum: "2026-01-31", betrag: -24000, rhythmus: "quartalsweise" });
    const k = zuordnungskandidaten(ultimo, [buchung("b1", "2026-07-31", -24000)], []);
    expect(k[0]).toMatchObject({ faelligkeit: "2026-07-31", tage: 0 });
  });

  it("schlägt für einen Umbuchungsvertrag vor, was auf seinem Weg liegt und ungefähr passt", () => {
    // Ohne Kategorie: bei ihm trägt der Weg. Was genau passt, ordnet die Erkennung selbst
    // zu (`umbuchungErkennung`); hier bleibt die erhöhte Rate und der verschobene Termin.
    const sparrate = regel({ charakter: "Umschichtung", kontoId: "k1", gegenkontoId: "k2", kategorieId: undefined });
    const um = (id: string, datum: string, betrag: number, over: Partial<IstBuchung> = {}) =>
      buchung(id, datum, betrag, { charakter: "Umschichtung", kontoId: "k1", gegenkontoId: "k2", kategorieId: undefined, ...over });
    const b = [
      um("erhoeht", "2026-03-01", -85000),
      um("spaet", "2026-04-11", -80000),
      // Eine einzelne Umbuchung in ganz anderer Höhe: kein Kandidat.
      um("einzeln", "2026-03-01", -30000),
      // Das ankommende Bein und ein anderer Weg: nie.
      um("ankommend", "2026-03-01", 80000, { kontoId: "k2", gegenkontoId: "k1" }),
      um("andererWeg", "2026-03-01", -80000, { gegenkontoId: "k3" }),
    ];
    expect(ids(sparrate, b).sort()).toEqual(["erhoeht", "spaet"]);
    // Und eine Umschichtung ist für einen gewöhnlichen Vertrag kein Kandidat.
    expect(ids(regel(), b)).toEqual([]);
  });

  it("schlägt ohne Kategorie nichts vor und nimmt sonst die übergebene", () => {
    const ohne = regel({ kategorieId: undefined });
    const b = [buchung("b1", "2026-03-01", -80000)];
    expect(zuordnungskandidaten(ohne, b, [])).toEqual([]);
    // Die Kategorie kann am Vertrag stehen statt an der Regel.
    expect(zuordnungskandidaten(ohne, b, [], "kat-a").map((k) => k.buchung.id)).toEqual(["b1"]);
  });

  it("schlägt bei Betrag null nichts vor", () => {
    expect(ids(regel({ betrag: 0 }), [buchung("b1", "2026-03-01", 0)])).toEqual([]);
  });
});
