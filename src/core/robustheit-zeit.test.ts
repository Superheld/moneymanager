// Robustheits-Tests „Zeit, Periodizität, Projektion" — bewusst angreifend geschrieben.
// Grüne Tests dokumentieren, was hält. ROTE Tests belegen echte Schwachstellen; bei
// jedem steht, was erwartet wäre, was tatsächlich passiert und warum das falsch ist.
// Kein Produktivcode wurde für diese Datei geändert.

import { describe, it, expect } from "vitest";
import { addMonate, addTage, ord, parseIso, tageBis, toIso } from "./datum";
import { projiziereRegel } from "./projektion";
import { monatsRuecklage, sollRuecklage, type Inventargegenstand } from "./inventar";
import { kuendigungsterminNaht, naechsterKuendigungstermin, type Vertrag } from "./vertrag";
import type { Zahlungsregel } from "./zahlungsregel";

function regel(over: Partial<Zahlungsregel> = {}): Zahlungsregel {
  return {
    id: "r1",
    bezeichnung: "Test",
    betrag: -10000,
    rhythmus: "monatlich",
    startdatum: "2026-01-15",
    charakter: "Aufwand",
    ...over,
  };
}

function vertrag(over: Partial<Vertrag> = {}): Vertrag {
  return { id: "v1", anbieter: "A", beginn: "2026-01-01", verlaengerung: "keine", status: "aktiv", ...over };
}

// ────────────────────────────────────────────────────────────────────────────
// Was hält — diese Tests sind grün und sollen grün bleiben.
// ────────────────────────────────────────────────────────────────────────────

describe("hält: Monatsende & Schaltjahr in der Projektion", () => {
  it("monatliche Regel am 31. klemmt nur im kurzen Monat und kehrt danach zurück", () => {
    const b = projiziereRegel(regel({ startdatum: "2026-01-31" }), "2026-01-01", 6);
    expect(b.map((x) => x.datum)).toEqual([
      "2026-01-31",
      "2026-02-28", // geklemmt
      "2026-03-31", // wieder am 31. — keine Dauer-Drift
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ]);
  });

  it("jährliche Regel am 29.02. kehrt im nächsten Schaltjahr auf den 29. zurück", () => {
    const b = projiziereRegel(regel({ startdatum: "2024-02-29", rhythmus: "jaehrlich" }), "2024-01-01", 60);
    expect(b.map((x) => x.datum)).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29", // zurück auf den 29.
    ]);
  });
});

describe("hält: Zeitzonen und Sommerzeit", () => {
  it("addTage rechnet über die DST-Grenze hinweg in ganzen Kalendertagen", () => {
    // 29.03.2026 = Beginn MESZ, 25.10.2026 = Ende MESZ (Europa).
    expect(toIso(addTage(parseIso("2026-03-28"), 1))).toBe("2026-03-29");
    expect(toIso(addTage(parseIso("2026-03-29"), 1))).toBe("2026-03-30");
    expect(toIso(addTage(parseIso("2026-10-24"), 2))).toBe("2026-10-26");
  });

  it("tageBis zählt über die DST-Grenze exakt, ohne 23/25-Stunden-Rundungsfehler", () => {
    expect(tageBis("2026-03-28", "2026-03-30")).toBe(2);
    expect(tageBis("2026-10-24", "2026-10-26")).toBe(2);
    expect(tageBis("2026-01-01", "2026-12-31")).toBe(364);
  });
});

describe("hält: entartete Projektionsfenster hängen nicht", () => {
  it("Laufzeit 0 und negative Laufzeit liefern ein leeres Fenster statt einer Endlosschleife", () => {
    expect(projiziereRegel(regel(), "2026-01-01", 0)).toEqual([]);
    expect(projiziereRegel(regel(), "2026-01-01", -12)).toEqual([]);
  }, 5000);

  it("Regelstart weit nach dem Fensterende liefert leer, ohne zu hängen", () => {
    expect(projiziereRegel(regel({ startdatum: "2999-01-01" }), "2026-01-01", 12)).toEqual([]);
  }, 5000);

  it("Fensterstart mitten im Monat: keine Fälligkeit vor dem Fenster, keine doppelt", () => {
    // Fenster [2026-01-31, 2027-01-31): der 15.01.2026 liegt davor und fällt raus, der
    // 15.01.2027 liegt drin. Zwölf Termine, jeder genau einmal.
    const b = projiziereRegel(regel({ startdatum: "2026-01-15" }), "2026-01-31", 12);
    expect(b).toHaveLength(12);
    expect(b[0].datum).toBe("2026-02-15");
    expect(new Set(b.map((p) => p.datum)).size).toBe(12);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ROT — belegte Schwachstellen.
// ────────────────────────────────────────────────────────────────────────────

describe("ROT 1 — Kündigungstermin driftet dauerhaft vom Monatsende weg", () => {
  // Erwartet: Vertrag ab 31.01. mit monatlicher Verlängerung endet jeweils zum
  //           Monatsletzten: 28.02., 31.03., 30.04., 31.05., 30.06.
  // Tatsächlich: 28.02., 28.03., 28.04., 28.05., 28.06.
  // Warum falsch: vertrag.ts:54 iteriert `ende = addMonate(ende, verl)` vom BEREITS
  //   geklemmten Wert. Genau diese Drift verhindert projektion.ts:48-50 bewusst, indem
  //   es jede Fälligkeit neu aus dem Originaldatum + k·Schritt rechnet. Die Kündigungs-
  //   logik macht denselben Fehler, den die Projektion explizit vermeidet — der
  //   angezeigte Vertragsendetermin ist ab dem zweiten Zyklus schlicht falsch.
  it("monatliche Verlängerung ab dem 31.: Termin bleibt am 28. kleben", () => {
    const v = vertrag({
      beginn: "2026-01-31",
      mindestlaufzeitMonate: 1,
      verlaengerung: "automatisch",
      verlaengerungMonate: 1,
      kuendigungsfristMonate: 0,
    });
    const termine = ["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"].map(
      (heute) => naechsterKuendigungstermin(v, heute)?.endeDatum,
    );
    expect(termine).toEqual(["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"]);
  });

  it("Gegenprobe: dieselbe Kadenz als Zahlungsregel projiziert driftet NICHT", () => {
    // Zeigt, dass die Erwartung oben keine Geschmacksfrage ist: der Kern kann es bereits.
    const b = projiziereRegel(regel({ startdatum: "2026-01-31" }), "2026-02-01", 5);
    expect(b.map((x) => x.datum)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ]);
  });
});

describe("ROT 2 — Dezimale/ungültige Laufzeit-Eingaben erzeugen kaputte Datumsstrings", () => {
  // Pfad: VertraegeScreen.tsx:296 ist ein FREITEXT-Feld (inputMode="numeric" ist nur ein
  //   Tastatur-Hinweis, keine Validierung), VertraegeScreen.tsx:149 macht `Number(...)`,
  //   und vertragAnlegen.ts validiert die Monatsfelder überhaupt nicht — anders als
  //   inventarAnlegen.ts, das `Math.round` erzwingt.
  //
  // Erwartet: entweder ein FachlicherFehler oder ein gerundeter, gültiger Termin.
  // Tatsächlich: endeDatum = "2026-2.5-15" (kein Datum), weil addMonate mit einem
  //   Nicht-Integer rechnet (datum.ts:20-26: (gesamt % 12) + 1 = 2.5) und toIso das
  //   ungeprüft zusammensetzt.
  // Warum falsch: dieser String geht in die UI, in Sortierungen (überall String-Vergleich
  //   auf ISO-Daten) und potenziell in die DB.
  it("Mindestlaufzeit 1.5 erzeugt endeDatum „2026-2.5-15“", () => {
    const t = naechsterKuendigungstermin(
      vertrag({ beginn: "2026-01-15", mindestlaufzeitMonate: 1.5, kuendigungsfristMonate: 0 }),
      "2026-01-01",
    );
    expect(t?.endeDatum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("und die Kündigungswarnung feuert auf diesen Nicht-Termin", () => {
    // kuendigungsterminNaht liefert true, d. h. die UI warnt „Kündigung naht“ mit einem
    // Datum, das kein Datum ist. tageBis rechnet über Date.UTC und schluckt den Unsinn.
    const v = vertrag({ beginn: "2026-01-15", mindestlaufzeitMonate: 1.5, kuendigungsfristMonate: 0 });
    const t = naechsterKuendigungstermin(v, "2026-01-01");
    expect(kuendigungsterminNaht(v, "2026-01-01")).toBe(false); // erwartet: keine Warnung auf Müll
    expect(t?.kuendigenBis).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("deutsches Dezimalkomma („1,5“ → NaN) lässt den Termin still verschwinden", () => {
    // Erwartet: FachlicherFehler beim Anlegen bzw. wenigstens ein erkennbarer Fehlerzustand.
    // Tatsächlich: naechsterKuendigungstermin liefert null — der Vertrag sieht aus wie
    //   einer ohne Kündigungstermin. Kein Hinweis, dass die Eingabe unbrauchbar war.
    const v = vertrag({
      beginn: "2026-01-15",
      mindestlaufzeitMonate: Number("1,5"), // NaN — genau das, was das Freitextfeld liefert
      kuendigungsfristMonate: 3,
      verlaengerung: "automatisch",
      verlaengerungMonate: 12,
    });
    expect(naechsterKuendigungstermin(v, "2026-01-01")).not.toBeNull();
  });
});

describe("ROT 3 — toIso füllt das Jahr nicht auf: Roundtrip und Datumsordnung kippen", () => {
  // Erwartet: toIso(parseIso(x)) === x für jedes formal gültige ISO-Datum; datum.ts
  //   padded m und d, aber nicht y (datum.ts:40-44).
  // Tatsächlich: "0026-01-15" → "26-01-15".
  // Warum falsch: die gesamte Codebase ordnet Daten per String-Vergleich
  //   (budget.ts:65 `b.datum < von`, localeCompare-Sortierungen in kontoregister.ts und
  //   den Screens). "0026-01-15" < "2026-01-01" ist true, "26-01-15" < "2026-01-01" ist
  //   FALSE — dasselbe Datum sortiert nach der Konvertierung in die Zukunft.
  //   Erreichbar: <input type="date"> liefert bei einem Tippfehler im Jahresfeld
  //   "0026-…", und die Validierung /^\d{4}-\d{2}-\d{2}$/ lässt das durch.
  it("Roundtrip parseIso → toIso verliert die Jahres-Nullen", () => {
    expect(toIso(parseIso("0026-01-15"))).toBe("0026-01-15");
  });

  it("und dreht damit die Sortierreihenfolge um", () => {
    expect(toIso(parseIso("0026-01-15")) < "2026-01-01").toBe(true);
  });

  it("auch addMonate liefert das ungepolsterte Jahr zurück", () => {
    expect(toIso(addMonate(parseIso("0026-01-15"), 1))).toBe("0026-02-15");
  });
});

describe("ROT 4 — Regel mit sehr altem Startdatum verschwindet still aus der Projektion", () => {
  // Erwartet: eine monatliche Regel ist im Fenster 2026 sichtbar, egal wie alt ihr
  //   Startdatum ist (oder es gibt einen Fehler).
  // Tatsächlich: 0 Fälligkeiten, kommentarlos. projektion.ts:53 deckelt die Schleife auf
  //   k < 10000; bei monatlich sind das nur ~833 Jahre ab Startdatum. Wer als Jahr
  //   versehentlich "0026" erfasst (passiert die Formatvalidierung, siehe ROT 3), sieht
  //   den Posten in der Vertrags-/Regelliste, aber NIE im Liquiditätsplan.
  // Warum falsch: stiller Verlust in der Kernrechnung — der projizierte Saldo ist zu
  //   hoch, ohne dass irgendwo etwas fehlt aussieht.
  it("monatliche Regel ab 0026 liefert 0 Fälligkeiten statt 12", () => {
    const b = projiziereRegel(regel({ startdatum: "0026-01-15" }), "2026-01-01", 12);
    expect(b).toHaveLength(12);
  }, 5000);

  it("Inkonsistenz: dieselbe Regel jährlich liefert sehr wohl eine Fälligkeit", () => {
    // Grün — dokumentiert, warum der Fehler schwer zu finden ist: der Deckel greift
    // nur bei kleinen Rhythmus-Schritten, das Verhalten ist also rhythmusabhängig.
    const b = projiziereRegel(regel({ startdatum: "0026-01-15", rhythmus: "jaehrlich" }), "2026-01-01", 12);
    expect(b.map((x) => x.datum)).toEqual(["2026-01-15"]);
  }, 5000);
});

describe("ROT 5 — Formvalidierung lässt nicht existierende Daten durch, Tag 00 überlebt", () => {
  // zahlungsregelAnlegen.ts:38 / vertragAnlegen.ts:56 prüfen nur
  // /^\d{4}-\d{2}-\d{2}$/ — also die FORM, nicht die Existenz des Datums.
  //
  // Erwartet: "2026-01-00" wird abgewiesen oder auf einen realen Tag normalisiert.
  // Tatsächlich: addMonate klemmt mit Math.min(0, 31) = 0 (datum.ts:24), toIso schreibt
  //   "00" — es entstehen Planbuchungen mit dem Datum "2026-02-00".
  // Warum falsch: dieses Datum wird angezeigt, geht in planRefKey und beim Abhaken als
  //   IstBuchung.datum in die DB. Ein Tag 00 existiert nicht; alle Datumsfenster
  //   (Budget-Periode, Kontoauszug) rechnen ihn falsch ein.
  // GRÜN seit dem Fix: parseIso prüft jetzt die EXISTENZ des Datums, nicht nur die Form.
  // Ein Tag 00 kommt gar nicht mehr in die Rechenkette, statt bis in Planbuchung und DB
  // durchgereicht zu werden.
  it("Tag 00 erreicht die Projektion nicht mehr", () => {
    expect(() => projiziereRegel(regel({ startdatum: "2026-01-00" }), "2026-01-01", 3)).toThrow(
      "datum.ungueltig",
    );
  });

  it("Monat 00 wird nicht mehr in den Dezember des Vorjahres umgedeutet", () => {
    // GRÜN seit dem Fix: statt die Regel faktisch am 2025-12-15 starten zu lassen, ohne
    // dass das jemand sieht, wird der unmögliche Monat jetzt abgewiesen.
    expect(() => projiziereRegel(regel({ startdatum: "2026-00-15" }), "2025-01-01", 24)).toThrow(
      "datum.ungueltig",
    );
  });
});

describe("ROT 6 — ungültiges Fensterdatum erzeugt „undefined aN“ statt eines Fehlers", () => {
  // Erwartet: parseIso wirft bei nicht parsbarem Input, oder die Projektion lehnt ab.
  // Tatsächlich: parseIso("heute") → { y: NaN, m: undefined, d: undefined }; die
  //   Monatskörbe bekommen das Label "undefined aN" (projektion.ts:104 greift mit
  //   MONATSNAMEN[NaN-1] ins Leere), sämtliche Buchungen werden still verworfen.
  // Warum falsch: der Kern hat keinerlei Eingangsschutz; ein kaputter Wert wird bis in
  //   die Diagrammbeschriftung gerendert statt früh zu scheitern.
  // GRÜN seit dem Fix: statt drei Monatskörben mit der Beschriftung „undefined aN" gibt
  // es jetzt einen klaren Fehler — der Aufrufer kann ihn zeigen, statt Unsinn zu rendern.
  it("projiziereRegel mit unparsbarem ab-Datum wirft", () => {
    expect(() => projiziereRegel(regel(), "heute", 3)).toThrow("datum.ungueltig");
  });

  // GRÜN seit dem Fix: die Regel verschwindet nicht mehr wortlos aus der Projektion,
  // sondern der ungültige Datensatz meldet sich. (Zwölf Fälligkeiten aus einem LEEREN
  // Startdatum zu erfinden wäre die falsche Antwort gewesen — es gibt kein Datum, aus
  // dem sich eine Fälligkeit ableiten liesse.)
  it("leeres Startdatum verschwindet nicht wortlos, sondern meldet sich", () => {
    expect(() => projiziereRegel(regel({ startdatum: "" }), "2026-01-01", 12)).toThrow(
      "datum.ungueltig",
    );
  }, 5000);
});

describe("ROT 7 — Zeitraum 0 erzeugt Infinity/NaN statt eines Fehlers", () => {
  // Erreichbarkeit: inventarAnlegen.ts validiert > 0, aber das Repository fängt mit
  //   `?? 1` nur NULL ab — eine 0 in der Spalte passiert. Der Kern selbst ist nicht
  //   defensiv. (Dieselbe Falle stand bis 2026-08-19 am Topf; die Töpfe sind entfallen.)
  // Erwartet: Fehler oder 0. Tatsächlich (vor dem Fix): rate = Infinity, und
  //   Infinity * 0 Monate = NaN → jeder Stand am Starttag ist NaN.
  // Warum falsch: NaN wandert ungebremst in Liste und Deckungsrechnung; die UI zeigt
  //   „NaN" und jede Weiterrechnung ist ab da vergiftet.
  const g: Inventargegenstand = {
    id: "g1",
    bezeichnung: "Kaputt",
    wiederbeschaffung: 120000,
    nutzungsdauerMonate: 0,
    anschaffung: "2026-01-01",
  };

  it("monatsRuecklage bleibt endlich", () => {
    expect(monatsRuecklage(g)).toBe(0);
  });

  it("sollRuecklage ist 0, nicht NaN", () => {
    expect(sollRuecklage(g, "2027-01-01")).toBe(0);
  });
});

describe("ROT 8 — nicht-ganzzahlige Laufzeit erzeugt einen Monatskorb zu viel", () => {
  // Erwartet: 12 oder 13 Körbe, aber konsistent mit dem Fensterende; sauber wäre eine
  //   Abweisung bzw. Rundung. Tatsächlich: 13 Körbe (Jan 26 … Jan 27), weil
  //   projektion.ts:99 `i < monate` mit 12.5 dreizehnmal läuft, das Fensterende aber
  //   über addMonate(start, 12.5) mit einem Nicht-Integer-Monat gebildet wird.
  // Warum falsch: Anzahl der Körbe und Fensterende driften auseinander; die Kurve zeigt
  //   einen Monat, der laut Parameter nicht im Fenster liegt.
  it("projiziereRegel mit monate = 12.5 bleibt im ganzzahligen Fenster", () => {
    // 12.5 wird auf 12 abgerundet — sonst driften Fensterende und Korbanzahl auseinander.
    expect(projiziereRegel(regel(), "2026-01-01", 12.5)).toHaveLength(12);
  });
});

describe("ROT 9 — jederzeit kündbarer Vertrag bekommt nie einen Kündigungstermin", () => {
  // Erwartet: ein aktiver Vertrag ohne Mindestlaufzeit (Streaming, monatliches Abo)
  //   liefert den nächsten erreichbaren Kündigungstermin.
  // Tatsächlich: null, sobald der Beginn in der Vergangenheit liegt — vertrag.ts:47
  //   setzt ende = beginn, das liegt vor heute, und ohne Verlängerung greift der
  //   Abbruch in Zeile 53 sofort.
  // Warum falsch: die Kündigungswarnung (kuendigungsterminNaht) feuert für den
  //   häufigsten Vertragstyp grundsätzlich nie. Modellierungslücke, nicht nur ein
  //   Rechenfehler — sie ist aber nur an diesem Verhalten sichtbar.
  it("aktiver Vertrag ohne Mindestlaufzeit und ohne Verlängerung", () => {
    const v = vertrag({ beginn: "2026-01-01", kuendigungsfristMonate: 1 });
    expect(naechsterKuendigungstermin(v, "2026-08-15")).not.toBeNull();
  });

  it("Kehrseite: derselbe Vertrag VOR Beginn liefert einen Termin am Beginn selbst", () => {
    // Grün, aber fachlich schief: „Ende = Beginn“ heißt, der Vertrag endet an dem Tag,
    // an dem er anfängt. Dokumentiert die Ursache des Falls oben.
    const v = vertrag({ beginn: "2030-01-01", kuendigungsfristMonate: 3 });
    expect(naechsterKuendigungstermin(v, "2026-08-15")).toEqual({
      endeDatum: "2030-01-01",
      kuendigenBis: "2029-10-01",
    });
  });
});

describe("ROT 10 — addMonate erzeugt bei extremen Werten unbrauchbare Daten", () => {
  // Erwartet: gültiges Datum oder Fehler. Tatsächlich: bei stark negativem Offset
  //   entsteht ein negatives Jahr, das toIso als "-474-01-15" ausgibt; ord() gibt dann
  //   einen negativen Schlüssel zurück und jede String-Sortierung ist zerstört.
  // Warum falsch (Erreichbarkeit): naechsterKuendigungstermin rechnet
  //   addMonate(ende, -frist) mit einer ungeprüften Nutzereingabe aus dem Freitextfeld
  //   für die Kündigungsfrist — dieselbe Stelle wie ROT 2.
  // GRÜN seit dem Fix: toIso erzeugt für ein Jahr ausserhalb 0001..9999 keinen String
  // mehr, den die (durchgehend stringbasierte) Datumsordnung falsch einsortieren würde,
  // sondern meldet den unmöglichen Wert.
  it("stark negativer Monatsoffset liefert keinen unbrauchbaren ISO-String", () => {
    expect(() => toIso(addMonate({ y: 2026, m: 1, d: 15 }, -30000))).toThrow("datum.ungueltig");
  });

  // ord() selbst bleibt eine reine Rechenfunktion und darf auch negative Jahre abbilden —
  // die Ordnung kippt erst beim Übergang in den ISO-String, und genau dort wird der Wert
  // jetzt abgefangen (Test darüber). Festgehalten bleibt: beides zusammen ist konsistent,
  // weil ein solcher Ymd-Wert nie mehr zu einem Datumsstring wird.
  it("ord und toIso bleiben zusammen konsistent", () => {
    const x = addMonate({ y: 2026, m: 1, d: 15 }, -30000);
    expect(x.y).toBeLessThan(1);
    expect(ord(x)).toBeLessThan(0); // ord bildet den Wert weiterhin ab, ohne zu werten
    expect(() => toIso(x)).toThrow("datum.ungueltig");
  });
});
