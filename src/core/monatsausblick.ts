// Monatsausblick — die Aufrechnung EINES Monats, wie man sie auf Papier machen würde:
// Einnahmen minus Verträge minus Budgets ergibt, was übrig bleibt. Rein, ohne IO.
//
// Zwei Spalten, weil ein Monat zwei Wahrheiten hat: PLAN (was gepflegt ist — Verträge
// und Budgets) und IST (was tatsächlich gebucht wurde). Kommende Monate haben nur die
// Plan-Spalte; im laufenden Monat stehen beide nebeneinander, und die Ist-Spalte ist
// die Antwort auf „wie weit bin ich durch?".
//
// EINNAHMEN KOMMEN AUS VERTRÄGEN, nicht aus einer Hochrechnung der Vergangenheit
// (Entscheidung 2026-08-16). Ein Vertrag im Sinne dieser App umfasst auch Einnahmen —
// die Zahlungsregel trägt dann Charakter `Ertrag`. Gibt es keine solche Regel, steht in
// der Plan-Spalte ehrlich 0; geschätzt wird nichts.
//
// Jede Ist-Buchung zählt in GENAU EINE Zeile. Die Reihenfolge ist:
//   1. einem Plan-Posten zugeordnet → Verträge (bzw. Einnahmen)
//   2. sonst Kategorie im Unterbaum eines Budgets → Budgets
//   3. sonst → Sonstiges
// Ohne diese Ordnung zählte eine Vertragszahlung, deren Kategorie unter einer
// Budget-Kategorie hängt (auf echten Daten: Sport → Freizeit & Kultur), doppelt — und
// die Aufrechnung ginge nicht mehr gegen den Kontostand auf.
//
// UMBUCHUNGEN HÄNGEN AM KREIS (seit 2026-11-08). Die Aufrechnung rechnet über eine
// Auswahl von Konten (`kreis`, in der Übersicht die liquiden). Eine Umbuchung, deren
// Zielkonto IM Kreis liegt, verschiebt Geld innerhalb dessen, was gerechnet wird — sie
// fällt aus Plan UND Ist heraus. Eine, die den Kreis verlässt, ist aus seiner Sicht ein
// Abfluss und bleibt stehen: auf ein Rücklagenkonto in der Zeile „Rücklagen", sonst in
// „Sparen & Vorsorge". Vorher fiel JEDE gepaarte Umbuchung aus dem Ist, auch die aufs
// Rücklagenkonto — der Plan stand da, das Ist blieb leer, obwohl das Geld geflossen war.
// Und umgekehrt stand eine geplante Umbuchung zwischen zwei liquiden Konten im Plan.
//
// Die Rücklagen-Zeile von früher (bis 2026-09-01) war etwas anderes: eine reine Rechnung
// aus dem Bedarf, in Plan und Ist mit demselben Betrag. Die neue ist die echte
// Umbuchung, geplant über den Umbuchungsvertrag und gebucht über die Bank.
//
// BUDGETS STEHEN IN ZWEI ZEILEN, monatlich und aufbauend — getrennt nach dem DACH eines
// Budgetbaums wie in der Budgetliste (`nachArtGetrennt`), damit dasselbe Budget in Karte
// und Liste auf derselben Seite steht.

import { addMonate, parseIso, toIso } from "./basis/datum";
import type { Cent } from "./basis/geld";
import { geglaetteterMonatsabfluss, budgetBuchungen, type Budget, type BudgetSicht } from "./budgets/budget";
import { istInterneUmbuchung } from "./buchung/historie";
import type { Kategorie } from "./kategorien/kategorie";
import { kategorieAnteile, type IstBuchung } from "./buchung/istbuchung";
import { projiziereRegel, type Planbuchung } from "./buchung/projektion";
import { istUmbuchungsregel } from "./vertraege/umbuchungErkennung";
import type { Zahlungsregel } from "./basis/zahlungsregel";

/** Die Zeilen der Aufrechnung, in Anzeigereihenfolge. */
export type AusblickZeileId =
  | "einnahmen"
  | "vertraege"
  | "budgets"
  | "budgetsAufbauend"
  | "ruecklagen"
  | "umschichtung"
  | "sonstiges";

/**
 * Wie belegt ein Posten ist:
 *  • `gebucht`  — über Kategorie + Betragsnähe einer Ist-Buchung zugeordnet
 *  • `offen`    — geplant, aber (noch) nichts gebucht
 *  • `ohnePlan` — gebucht, aber kein Plan-Posten dahinter (Sammelzeilen)
 *
 * Ein vierter Wert `bezahlt` stand hier für einen Posten, den jemand per Häkchen
 * bestätigt hat. Das Häkchen gab es nie (siehe `IstQuelle`), und damit war die Stufe
 * unerreichbar: die Zuordnung lief immer über Kategorie und Betrag.
 */
export type PostenStatus = "gebucht" | "offen" | "ohnePlan";

export interface AusblickPosten {
  /** Stabil innerhalb eines Monats (Regel-ID + Fälligkeit, Budget-ID, oder Sammelschlüssel). */
  readonly schluessel: string;
  readonly bezeichnung: string;
  /** Fälligkeit (ISO); fehlt bei Budgets und Sammelposten — die haben keinen Termin. */
  readonly datum?: string;
  /** Geplanter Betrag, vorzeichenbehaftet (Aufwand negativ). 0 bei Sammelposten. */
  readonly plan: Cent;
  /** Tatsächlich gebucht/verbraucht, vorzeichenbehaftet. `null` = im Plan-Blick ohne Ist. */
  readonly ist: Cent | null;
  readonly status: PostenStatus;
  /**
   * Die Ist-Buchung hinter diesem Posten, falls es genau eine gibt. Der Kern kennt
   * weder Empfänger noch Kategoriename — die Oberfläche löst beides über diese ID auf.
   */
  readonly istId?: string;
  /** Kategorie des Postens (bei geteilten Buchungen die des jeweiligen Anteils). */
  readonly kategorieId?: string;
}

export interface AusblickZeile {
  readonly id: AusblickZeileId;
  /** Summe der Plan-Beträge, vorzeichenbehaftet. */
  readonly plan: Cent;
  /** Summe der Ist-Beträge; `null` in Monaten, die komplett in der Zukunft liegen. */
  readonly ist: Cent | null;
  readonly posten: readonly AusblickPosten[];
}

export interface MonatsAusblick {
  readonly jahr: number;
  readonly monat: number; // 1–12
  /** „YYYY-MM" — dieselbe Form wie im Historien-Verlauf. */
  readonly label: string;
  /** Fenster [von, bis) des Monats, ISO. */
  readonly von: string;
  readonly bis: string;
  /** Der Monat, in dem `heute` liegt. */
  readonly laufend: boolean;
  /** Monat beginnt erst nach `heute` → es gibt nichts Gebuchtes, nur den Plan. */
  readonly zukunft: boolean;
  readonly zeilen: readonly AusblickZeile[];
  /** Was nach der Aufrechnung übrig bleibt (Σ Zeilen), Plan- und Ist-Spalte. */
  readonly restPlan: Cent;
  readonly restIst: Cent | null;
}

/**
 * Relative Toleranz, innerhalb derer eine Ist-Buchung als „das ist dieser Plan-Posten"
 * gilt. 15 %, weil geplante Beträge veralten: eine Miete wird angehoben, die Regel
 * daneben bleibt auf dem alten Stand, und der Abstand zwischen beiden ist dann klein,
 * aber nicht null — mit einer engen Grenze zeigte die Zeile „offen", obwohl sie längst
 * abgebucht war. Am eigenen Bestand nachgerechnet und danach gewählt; die Zahlen dazu
 * stehen bewusst nicht hier, sie gehören keinem Kommentar (CLAUDE.md → „Keine Zahlen
 * aus dem Bestand in Prosa"). Nach oben begrenzt die Toleranz die Fehlzuordnung: zwei
 * Posten derselben Kategorie mit stark verschiedenen Beträgen werden nicht verwechselt.
 */
const BETRAGS_TOLERANZ = 0.15;

export interface MonatsAusblickEingabe {
  readonly regeln: readonly Zahlungsregel[];
  readonly budgets: readonly Budget[];
  /**
   * Budgets, die hier Ausgaben TRAGEN, aber nichts PLANEN.
   *
   * Der Fall ist ein Budget, dessen Geld auf einem Konto liegt, das diese Aufrechnung
   * nicht rechnet — ein aufbauendes Budget auf dem Rücklagenkonto, gesehen von den
   * liquiden Konten aus. Seine Rate fließt dort über eine Umbuchung hin, und die steht
   * schon als Plan in „Sparen & Vorsorge"; sie hier noch einmal zu planen, zählte sie
   * doppelt. Seine Ausgaben gehen trotzdem oft vom Girokonto ab, und die gehören in
   * seine Zeile — ohne es zu führen, landeten sie unter „Sonstiges".
   */
  readonly budgetsOhnePlan?: ReadonlySet<string>;
  readonly ist: readonly IstBuchung[];
  readonly kategorien: readonly Kategorie[];
  /**
   * IDs der Buchungen, die zu einem Vertrag gehören — sie zählen nicht gegen ein Budget.
   * Pflichtfeld, damit die Aufrechnung hier dieselbe Regel benutzt wie die Budgetliste;
   * die beiden zeigten sonst für dasselbe Budget verschiedene Zahlen — kein Verbrauch
   * hier, ein überschrittener Rahmen dort, auf derselben Übersicht.
   */
  readonly vertragsBuchungen: ReadonlySet<string>;
  /** Erster Tag des Monats, „YYYY-MM-01". */
  readonly monatAb: string;
  /** Heutiges Datum (ISO) — trennt Plan-only von Plan+Ist. */
  readonly heute: string;
  /**
   * Die Konten, über die gerechnet wird. Eine Umbuchung, deren Zielkonto hier liegt, ist
   * aus Sicht der Aufrechnung intern und fällt heraus; eine, die hinausführt, ist ein
   * Abfluss und bleibt.
   *
   * Optional, weil es auch eine Aufrechnung über ALLE Konten gibt (der Ausblick der
   * Analyse). Ohne Angabe gilt jede gepaarte Umbuchung als intern — das ist dort richtig,
   * denn jedes erfasste Konto liegt im Kreis.
   */
  readonly kreis?: ReadonlySet<string>;
  /** Konten der Klasse Rücklage — eine Umbuchung dorthin steht in der Zeile „Rücklagen". */
  readonly ruecklagenKonten?: ReadonlySet<string>;
}

/**
 * Ist diese Buchung aus Sicht des Kreises eine interne Verschiebung?
 *
 * Mit Kreis entscheidet das Zielkonto. Ohne Gegenkonto bleibt nur der Verweis auf ein
 * zweites Bein — dann ist es eine Umbuchung zwischen erfassten Konten, deren Ziel
 * niemand kennt, und sie gilt wie bisher als intern. Eine Umschichtung OHNE beides (der
 * Wertpapierkauf vom Girokonto) verlässt den Kreis und bleibt.
 */
function istIntern(b: IstBuchung, kreis: ReadonlySet<string> | undefined): boolean {
  if (!kreis) return istInterneUmbuchung(b);
  if (b.gegenkontoId) return kreis.has(b.gegenkontoId);
  return istInterneUmbuchung(b);
}

/** Eine geplante Umbuchung, deren Ziel im Kreis liegt — sie verschiebt nur. */
function istInterneRegel(r: Zahlungsregel, kreis: ReadonlySet<string> | undefined): boolean {
  return !!kreis && r.charakter === "Umschichtung" && !!r.gegenkontoId && kreis.has(r.gegenkontoId);
}

/** Aufrechnung eines Monats. Reine Funktion über bereits geladene Daten. */
export function monatsAusblick(e: MonatsAusblickEingabe): MonatsAusblick {
  const start = parseIso(e.monatAb);
  const von = toIso({ ...start, d: 1 });
  const bis = toIso(addMonate(start, 1));
  const zukunft = von > e.heute;
  const laufend = !zukunft && e.heute < bis;

  const regeln = e.regeln.filter((r) => !istInterneRegel(r, e.kreis));
  const planPosten = regeln.flatMap((r) => projiziereRegel(r, von, 1).map((p) => ({ p, regel: r })));
  const regelById = new Map(regeln.map((r) => [r.id, r]));

  // Ist des Monats. Interne Umbuchungen raus — sie schieben eigenes Geld innerhalb des
  // Kreises und gehören in keine Zeile dieser Aufrechnung.
  const istImMonat = zukunft
    ? []
    : e.ist.filter((b) => b.datum >= von && b.datum < bis && !istIntern(b, e.kreis));
  const zurRuecklage = (kontoId: string | undefined) => !!kontoId && !!e.ruecklagenKonten?.has(kontoId);

  const zugeordnet = ordneZu(planPosten, istImMonat, regelById);
  const verbraucht = new Set([...zugeordnet.values()].map((b) => b.id));

  const einnahmen = zeileAusRegeln("einnahmen", planPosten, zugeordnet, "Ertrag");
  const vertraege = zeileAusRegeln("vertraege", planPosten, zugeordnet, "Aufwand");
  const ruecklagen = zeileAusRegeln(
    "ruecklagen",
    planPosten.filter((x) => zurRuecklage(x.regel.gegenkontoId)),
    zugeordnet,
    "Umschichtung",
  );
  const umschichtung = zeileAusRegeln(
    "umschichtung",
    planPosten.filter((x) => !zurRuecklage(x.regel.gegenkontoId)),
    zugeordnet,
    "Umschichtung",
  );

  // Was noch keiner Zeile gehört — die Basis für Budgets und Sonstiges.
  const offenesIst = istImMonat.filter((b) => !verbraucht.has(b.id));

  const sicht: BudgetSicht = {
    buchungen: offenesIst,
    kategorien: e.kategorien,
    budgets: e.budgets,
    vertragsBuchungen: e.vertragsBuchungen,
  };
  const { zeilen: budgetZeilen, getragen } = budgetsZeilen(sicht, von, bis, zukunft, e.budgetsOhnePlan);

  // Was gebucht, aber von keiner Plan-Zeile erfasst ist, kommt EINZELN dazu — je Buchung
  // ein Posten. Früher stand hier eine Summe pro Zeile („weitere Einnahmen: 342,10"),
  // und damit war die Zeile zwar richtig, aber unbeantwortbar: welche Buchungen das
  // waren, stand nirgends, und genau danach fragt man beim Aufklappen.
  const weitereEinnahmen = offenesIst.filter((b) => b.charakter === "Ertrag").map(buchungsPosten);
  const weitereUmschichtung = offenesIst
    .filter((b) => b.charakter === "Umschichtung" && !zurRuecklage(b.gegenkontoId))
    .map(buchungsPosten);
  const weitereRuecklagen = offenesIst
    .filter((b) => b.charakter === "Umschichtung" && zurRuecklage(b.gegenkontoId))
    .map(buchungsPosten);
  // Bei den Ausgaben zählt der ANTEIL, nicht die Buchung: eine geteilte Buchung kann
  // zur Hälfte auf ein Budget laufen und zur anderen hier landen. Gefragt wird, was die
  // Budgets TATSÄCHLICH getragen haben — nicht, ob die Kategorie unter einem Budget
  // hängt. Der Unterschied ist die Vertragszahlung auf einer Budgetkategorie: sie hängt
  // dort, wird aber nicht getragen und gehört deshalb hierher.
  const sonstigeAusgaben = offenesIst
    .filter((b) => b.charakter === "Aufwand")
    .flatMap((b) =>
      kategorieAnteile(b)
        .map((a, i) => ({ b, a, i }))
        .filter(({ b: buchung, i }) => !getragen.has(`${buchung.id}#${i}`)),
    )
    .map(({ b, a, i }) => anteilsPosten(b, a, i));

  const zeilen: AusblickZeile[] = [
    mitEinzelposten(einnahmen, weitereEinnahmen),
    vertraege,
    budgetZeilen.monatlich,
  ];
  // Aufbauende Budgets, Rücklagen und Umschichtung nur, wenn es sie gibt: drei Zeilen
  // voller Nullen wären bei einem Haushalt ohne sie Lärm.
  if (budgetZeilen.aufbauend.posten.length > 0) zeilen.push(budgetZeilen.aufbauend);
  if (ruecklagen.plan !== 0 || weitereRuecklagen.length > 0) {
    zeilen.push(mitEinzelposten(ruecklagen, weitereRuecklagen));
  }
  if (umschichtung.plan !== 0 || weitereUmschichtung.length > 0) {
    zeilen.push(mitEinzelposten(umschichtung, weitereUmschichtung));
  }
  if (sonstigeAusgaben.length > 0) {
    zeilen.push({
      id: "sonstiges",
      plan: 0,
      ist: summe(sonstigeAusgaben.map((p) => p.ist ?? 0)),
      posten: nachDatum(sonstigeAusgaben),
    });
  }

  return {
    jahr: start.y,
    monat: start.m,
    label: von.slice(0, 7),
    von,
    bis,
    laufend,
    zukunft,
    zeilen,
    restPlan: summe(zeilen.map((z) => z.plan)),
    restIst: zukunft ? null : summe(zeilen.map((z) => z.ist ?? 0)),
  };
}

/**
 * Ordnet jedem Plan-Posten höchstens eine Ist-Buchung zu: über die Kategorie der Regel
 * und den Betrag innerhalb der Toleranz, bester Treffer zuerst.
 *
 * Davor stand eine zweite, höhere Stufe: eine Buchung, die den Posten per Häkchen
 * bestätigt (`planRef`). Sie hat nie getragen — das Häkchen gibt es in der Oberfläche
 * nicht, keine Buchung im Bestand trug den Verweis, und die Betragszuordnung musste
 * ohnehin jeden Fall allein bedienen. Eine Rangstufe, die nie greift, ist schlimmer als
 * keine: sie liest sich wie die verlässliche Antwort, während die ganze Arbeit darunter
 * passiert.
 *
 * Jede Ist-Buchung wird höchstens einmal vergeben; die beste (kleinste relative
 * Abweichung) gewinnt, damit zwei gleichartige Posten nicht die falsche Zahlung greifen.
 */
function ordneZu(
  planPosten: readonly { p: Planbuchung; regel: Zahlungsregel }[],
  istImMonat: readonly IstBuchung[],
  regelById: ReadonlyMap<string, Zahlungsregel>,
): Map<string, IstBuchung> {
  const treffer = new Map<string, IstBuchung>();
  const vergeben = new Set<string>();

  // Alle offenen Paarungen bewerten und die besten zuerst vergeben — sonst hinge das
  // Ergebnis an der Reihenfolge der Regeln statt an der Passgenauigkeit.
  const paare: { schluessel: string; buchung: IstBuchung; abstand: number }[] = [];
  for (const { p } of planPosten) {
    const s = schluesselVon(p);
    if (treffer.has(s)) continue;
    const regel = regelById.get(p.regelId);
    if (!regel || p.betrag === 0) continue;
    // Eine Umbuchung trägt meist keine Kategorie, aber Quell- und Zielkonto — daran wird
    // sie wiedererkannt, wie in der Vertragszuordnung (`umbuchungErkennung`).
    const umbuchung = istUmbuchungsregel(regel);
    if (!umbuchung && !regel.kategorieId) continue;
    for (const b of istImMonat) {
      if (b.charakter !== p.charakter) continue;
      if (Math.sign(b.betrag) !== Math.sign(p.betrag)) continue;
      if (umbuchung) {
        if (b.kontoId !== regel.kontoId || b.gegenkontoId !== regel.gegenkontoId) continue;
      } else if (!kategorieAnteile(b).some((a) => a.kategorieId === regel.kategorieId)) continue;
      const abstand = Math.abs(b.betrag - p.betrag) / Math.abs(p.betrag);
      if (abstand > BETRAGS_TOLERANZ) continue;
      paare.push({ schluessel: s, buchung: b, abstand });
    }
  }
  paare.sort((a, b) => a.abstand - b.abstand);
  for (const paar of paare) {
    if (treffer.has(paar.schluessel) || vergeben.has(paar.buchung.id)) continue;
    treffer.set(paar.schluessel, paar.buchung);
    vergeben.add(paar.buchung.id);
  }
  return treffer;
}

const schluesselVon = (p: Planbuchung) => `${p.regelId}@${p.datum}`;

/** Eine Zeile aus den Plan-Posten eines Charakters, mit ihrem zugeordneten Ist. */
function zeileAusRegeln(
  id: AusblickZeileId,
  planPosten: readonly { p: Planbuchung; regel: Zahlungsregel }[],
  zugeordnet: ReadonlyMap<string, IstBuchung>,
  charakter: Planbuchung["charakter"],
): AusblickZeile {
  const posten = planPosten
    .filter((x) => x.p.charakter === charakter)
    .map(({ p }): AusblickPosten => {
      const treffer = zugeordnet.get(schluesselVon(p));
      return {
        schluessel: schluesselVon(p),
        bezeichnung: p.bezeichnung,
        datum: p.datum,
        plan: p.betrag,
        ist: treffer ? treffer.betrag : null,
        status: treffer ? "gebucht" : "offen",
      };
    })
    .sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? ""));

  return {
    id,
    plan: summe(posten.map((p) => p.plan)),
    ist: summe(posten.map((p) => p.ist ?? 0)),
    posten,
  };
}

/**
 * Budgets: geplant der geglättete Monatsanteil, gebucht der Verbrauch DES MONATS —
 * auch bei jährlicher Periode. Sonst stünde ein Zwölftel Plan gegen einen Jahresverbrauch.
 */
function budgetsZeilen(
  sicht: BudgetSicht,
  von: string,
  bis: string,
  zukunft: boolean,
  ohnePlan: ReadonlySet<string> = new Set(),
): { zeilen: { monatlich: AusblickZeile; aufbauend: AusblickZeile }; getragen: Set<string> } {
  const { budgets, kategorien } = sicht;
  // Welche ANTEILE ein Budget trägt, wird hier festgehalten: „Sonstiges" nimmt genau den
  // Rest. Ohne diese Menge verschwände eine Vertragszahlung auf einer Budgetkategorie
  // aus beiden Zeilen — das Budget nimmt sie nicht (Vertrag), Sonstiges nimmt sie nicht
  // (Budgetkategorie) —, und die Ist-Spalte summierte nicht mehr auf das Gebuchte.
  const getragen = new Set<string>();
  const dachArt = dachArtVon(budgets, kategorien);
  const posten = budgets
    .map((b): AusblickPosten & { art: Budget["art"] } => {
      const beitraege = budgetBuchungen(sicht, b, von, bis);
      for (const p of beitraege) getragen.add(`${p.buchung.id}#${p.anteil}`);
      // `|| 0` fängt die negative Null: `-0` formatiert sich als „−0,00" und liest sich
      // wie eine Ausgabe, die es nicht gab.
      const roh = beitraege.reduce((sum, p) => sum + p.betrag, 0);
      const verbrauch = zukunft ? null : -roh || 0;
      return {
        schluessel: b.id,
        // Der Name der Kategorie steht nicht im Budget — die Oberfläche löst ihn auf.
        bezeichnung: b.kategorieId,
        // Der Monat der Zeile: seit der Betrag versioniert ist, plant ein Budget im
        // September womöglich mit einer anderen Rate als im Juli.
        plan: ohnePlan.has(b.id) ? 0 : geglaetteterMonatsabfluss(b, budgets, kategorien, von.slice(0, 7)),
        ist: verbrauch,
        status: verbrauch == null || verbrauch === 0 ? "offen" : "gebucht",
        art: dachArt(b),
      };
    })
    .sort((a, b) => a.plan - b.plan);

  const zeile = (id: AusblickZeileId, art: Budget["art"]): AusblickZeile => {
    const drin = posten.filter((p) => p.art === art).map(({ art: _art, ...p }) => p);
    return {
      id,
      plan: summe(drin.map((p) => p.plan)),
      ist: zukunft ? null : summe(drin.map((p) => p.ist ?? 0)),
      posten: drin,
    };
  };
  return {
    zeilen: { monatlich: zeile("budgets", "monatlich"), aufbauend: zeile("budgetsAufbauend", "aufbauend") },
    getragen,
  };
}

/**
 * Die Art, nach der ein Budget einsortiert wird: die seines DACHS, des obersten Budgets
 * über ihm im Kategoriebaum. Dieselbe Regel wie `nachArtGetrennt` in der Budgetliste —
 * ein aufbauendes Kind unter einem monatlichen Dach bleibt dort, weil es aus dessen
 * Rahmen herausgerechnet ist.
 */
function dachArtVon(budgets: readonly Budget[], kategorien: readonly Kategorie[]): (b: Budget) => Budget["art"] {
  const eltern = new Map(kategorien.map((k) => [k.id, k.elternId]));
  const budgetJeKategorie = new Map(budgets.map((b) => [b.kategorieId, b]));
  return (b) => {
    let dach = b;
    const gesehen = new Set<string>();
    for (let k = eltern.get(b.kategorieId); k && !gesehen.has(k); k = eltern.get(k)) {
      gesehen.add(k);
      const ueber = budgetJeKategorie.get(k);
      if (ueber) dach = ueber;
    }
    return dach.art === "aufbauend" ? "aufbauend" : "monatlich";
  };
}

/** Hängt die ungeplanten Buchungen einer Zeile als eigene Posten an. */
function mitEinzelposten(zeile: AusblickZeile, weitere: readonly AusblickPosten[]): AusblickZeile {
  if (weitere.length === 0) return zeile;
  return {
    ...zeile,
    ist: (zeile.ist ?? 0) + summe(weitere.map((p) => p.ist ?? 0)),
    posten: nachDatum([...zeile.posten, ...weitere]),
  };
}

/** Eine ungeplante Buchung als Posten — die Oberfläche beschriftet sie über `istId`. */
function buchungsPosten(b: IstBuchung): AusblickPosten {
  return {
    schluessel: b.id,
    bezeichnung: b.notiz ?? "",
    datum: b.datum,
    plan: 0,
    ist: b.betrag,
    status: "ohnePlan",
    istId: b.id,
    kategorieId: b.kategorieId,
  };
}

/** Ein Anteil einer (womöglich geteilten) Buchung als Posten. */
function anteilsPosten(b: IstBuchung, anteil: { kategorieId?: string; betrag: Cent }, i: number): AusblickPosten {
  return {
    ...buchungsPosten(b),
    // Der Index hält den Schlüssel eindeutig, wenn eine Buchung mehrere Anteile
    // ausserhalb der Budgets hat.
    schluessel: `${b.id}#${i}`,
    ist: anteil.betrag,
    kategorieId: anteil.kategorieId,
  };
}

const nachDatum = (posten: readonly AusblickPosten[]): AusblickPosten[] =>
  [...posten].sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? ""));

const summe = (werte: readonly Cent[]): Cent => werte.reduce((s, w) => s + w, 0);

/**
 * Die drei Monate der Übersicht: der laufende und die beiden folgenden.
 * `heute` bestimmt den ersten — die Funktion liest selbst keine Uhr.
 */
export function monatsAusblicke(
  basis: Omit<MonatsAusblickEingabe, "monatAb">,
  anzahl = 3,
): MonatsAusblick[] {
  const start = parseIso(basis.heute);
  return Array.from({ length: Math.max(0, Math.floor(anzahl)) }, (_, i) =>
    monatsAusblick({ ...basis, monatAb: toIso({ ...addMonate(start, i), d: 1 }) }),
  );
}
