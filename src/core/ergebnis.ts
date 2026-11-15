// Ergebnisrechnung — was ein Monat KOSTET, nicht was in ihm vom Konto ging.
//
// Die Begriffe und Regeln stehen in `core/CLAUDE.md` unter „Auszahlung und Kosten"; hier
// steht ihre Umsetzung. Die Rechnung liegt in der Wurzel des Kerns, weil sie über alle
// Bereiche rechnet — Buchungen, Verträge, Budgets, Rücklagen, Konten.
//
// Sie baut auf der Einordnung (`einordnung.ts`) und sortiert selbst nichts. Was sie
// hinzufügt, ist die ZEIT:
//
//   • Fixkosten werden PERIODISIERT. Ein Jahresbeitrag kostet zwölf Monate lang ein
//     Zwölftel, ab dem Monat seiner Zahlung (vorschüssig).
//   • Ein TOPF kostet seine Rate. Was aus ihm bezahlt wird, ist eine Entnahme und zählt
//     nicht noch einmal — ausser der Topf reicht nicht (siehe `topfKosten`).
//   • Eine RÜCKLAGE kostet den Zuwachs ihres Solls. Ihr Kauf ist eine Entnahme.
//
// Darunter steht die ÜBERLEITUNG: sie führt vom Ergebnis zur Änderung der Kontostände
// und muss exakt auf die Summe der Buchungen ohne Gegenbein aufgehen. Das ist keine
// Zierde, sondern die Probe — eine Kostenrechnung, die sich nicht auf die Bank
// zurückführen lässt, ist eine Behauptung.
//
// Drei Stufen, Pflichten zuerst:
//
//     Einnahmen − Fixkosten                       = nach den Pflichten
//     − laufende Kosten − Ungeplantes             = was der Alltag übrig lässt
//     − Abschreibungen − Wagnisse − Vorsorge      = Ergebnis
//
// WAS HIER NOCH NICHT GILT, und wer es ändert, ändert es hier:
//
//   • Einnahmen werden nicht periodisiert — ein Jahresbonus steht in seinem Monat.
//   • Die Vorsorge zählt mit dem, was tatsächlich umgebucht wurde, nicht mit der Rate,
//     die ein Vorsorgeziel verlangt. Das Ziel gibt es noch nicht.
//   • Der Kauf aus einer RÜCKLAGE wird nur gegen ihren Stand geprüft, wenn die
//     Ausbuchung ihren Zyklus kennt (seit Migration 76). Bei älteren ist der Stand
//     von damals nicht mehr zu rechnen; ihr Kauf gilt als gedeckt.

import type { Cent } from "./basis/geld";
import { addMonate, monateZwischen, parseIso, toIso } from "./basis/datum";
import { RHYTHMUS_MONATE, type Zahlungsregel } from "./basis/zahlungsregel";
import type { IstBuchung } from "./buchung/istbuchung";
import { projiziereRegel } from "./buchung/projektion";
import { budgetRahmen, zufuehrungIm, type Budget } from "./budgets/budget";
import { einordnen, type Einordnung, type Einordnungskontext } from "./einordnung";
import type { Kategorie } from "./kategorien/kategorie";
import { istVorsorgekonto, type Zahlungskonto } from "./konten/konto";
import { hatGeschichte, sollRuecklage, zyklusSoll, type Ruecklage, type Ruecklagenzyklus } from "./ruecklagen/ruecklage";

export type ErgebnisZeileId =
  | "einnahmen"
  | "fixkosten"
  | "laufend"
  | "ungeplant"
  | "abschreibungen"
  | "wagnisse"
  | "vorsorge";

export type PostenStand = "gebucht" | "offen" | "ohnePlan";

export interface ErgebnisPosten {
  /** Stabil innerhalb eines Monats. */
  readonly schluessel: string;
  /** Name der Regel bzw. Rücklage; bei Budgets leer — die Oberfläche löst `kategorieId` auf. */
  readonly bezeichnung: string;
  readonly datum?: string;
  /** Geplante Kosten, vorzeichenbehaftet (Kosten negativ). */
  readonly plan: Cent;
  /** Tatsächliche Kosten; `null` in einem künftigen Monat. */
  readonly ist: Cent | null;
  readonly status: PostenStand;
  /** Die Buchung dahinter, wenn es genau eine ist. */
  readonly istId?: string;
  readonly kategorieId?: string;
  readonly vertragId?: string;
  readonly budgetId?: string;
  readonly ruecklageId?: string;
  /** Über wie viele Monate die Zahlung verteilt ist — nur gesetzt, wenn mehr als einer. */
  readonly teile?: number;
  /**
   * Bei einem Topf: was im Monat aus ihm BEZAHLT wurde, vorzeichenbehaftet. Das ist die
   * Auszahlung, nicht die Kosten — sie steht in der Überleitung.
   */
  readonly entnahme?: Cent;
}

export interface ErgebnisZeile {
  readonly id: ErgebnisZeileId;
  readonly plan: Cent;
  readonly ist: Cent | null;
  readonly posten: readonly ErgebnisPosten[];
}

export interface Stufe {
  readonly plan: Cent;
  readonly ist: Cent | null;
}

export type UeberleitungId = "raten" | "entnahmen" | "periodisierung" | "vorsorgeEigen";

/**
 * Vom Ergebnis zur Änderung der Kontostände.
 *
 *   raten          + Raten der Töpfe und Rücklagen: Kosten, aber nicht abgeflossen
 *   entnahmen      − was aus Töpfen und Rücklagen bezahlt wurde: abgeflossen, keine Kosten
 *   periodisierung ± Fixkosten: bezahlt minus auf den Monat entfallend
 *   vorsorgeEigen  + Vorsorge auf eigenen Konten: Kosten, aber weiter eigenes Geld
 */
export interface Ueberleitung {
  readonly ergebnis: Cent;
  readonly posten: readonly { readonly id: UeberleitungId; readonly betrag: Cent }[];
  /** Σ aller Buchungen des Monats ohne Gegenbein — die Änderung aller Kontostände zusammen. */
  readonly kontoaenderung: Cent;
}

export interface MonatsErgebnis {
  readonly jahr: number;
  readonly monat: number;
  /** „YYYY-MM". */
  readonly label: string;
  readonly von: string;
  /** Exklusiv. */
  readonly bis: string;
  readonly laufend: boolean;
  readonly zukunft: boolean;
  readonly zeilen: readonly ErgebnisZeile[];
  readonly nachPflichten: Stufe;
  readonly nachAlltag: Stufe;
  readonly ergebnis: Stufe;
  /** Fehlt in einem künftigen Monat: wo nichts gebucht ist, gibt es nichts überzuleiten. */
  readonly ueberleitung?: Ueberleitung;
  /**
   * Womit der LAUFENDE Monat voraussichtlich endet (`hochrechnung`). Nur dort gesetzt:
   * ein vergangener Monat ist sein Ist, ein künftiger sein Plan — eine dritte Zahl
   * daneben sagte in beiden Fällen nichts Neues.
   */
  readonly erwartet?: Cent;
}

export interface ErgebnisEingabe {
  readonly regeln: readonly Zahlungsregel[];
  readonly budgets: readonly Budget[];
  readonly ruecklagen: readonly Ruecklage[];
  /**
   * Die Ausbuchungen — jede hält den Zyklus fest, den sie beendet hat (seit Migration
   * 76). Aus ihnen kommen die Raten vergangener Monate und die Prüfung, ob ein Kauf vom
   * Angesparten gedeckt war.
   */
  readonly ausbuchungen: readonly Ruecklagenzyklus[];
  /** ALLE Buchungen aller Konten — Kosten hängen nicht daran, von wo bezahlt wurde. */
  readonly ist: readonly IstBuchung[];
  readonly kategorien: readonly Kategorie[];
  readonly konten: readonly Zahlungskonto[];
  /** Buchungs-ID → Vertrags-ID (siehe `Einordnungskontext`). */
  readonly vertragJeBuchung: ReadonlyMap<string, string>;
  /** Heutiges Datum (ISO) — trennt Plan von Plan und Ist. */
  readonly heute: string;
}

/**
 * Die Vorarbeit, die für jeden Monat dieselbe ist: der eingeordnete Bestand.
 *
 * Getrennt herausgegeben, damit eine Auswertung über viele Monate (Analyse) nicht für
 * jeden Monat neu einordnet — und damit andere Sichten dieselbe Einordnung lesen können,
 * statt eine zweite zu bauen.
 */
export interface Ergebnisbasis {
  readonly eingabe: ErgebnisEingabe;
  readonly vorsorgeKonten: ReadonlySet<string>;
  readonly einordnungen: readonly Einordnung[];
}

export function einordnungskontext(
  e: Pick<ErgebnisEingabe, "kategorien" | "budgets" | "konten" | "vertragJeBuchung" | "ausbuchungen">,
): Einordnungskontext {
  return {
    kategorien: e.kategorien,
    budgets: e.budgets,
    vertragJeBuchung: e.vertragJeBuchung,
    vorsorgeKonten: new Set(e.konten.filter(istVorsorgekonto).map((k) => k.id)),
    ruecklagenKaeufe: new Set(e.ausbuchungen.flatMap((a) => (a.istbuchungId ? [a.istbuchungId] : []))),
  };
}

export function ergebnisbasis(eingabe: ErgebnisEingabe): Ergebnisbasis {
  const kontext = einordnungskontext(eingabe);
  return {
    eingabe,
    vorsorgeKonten: kontext.vorsorgeKonten,
    einordnungen: einordnen(eingabe.ist, kontext),
  };
}

const summe = (werte: readonly Cent[]): Cent => werte.reduce((s, w) => s + w, 0);
const monatVon = (iso: string): string => iso.slice(0, 7);

/**
 * Der Teil einer Zahlung, der auf einen ihrer `teile` Monate entfällt.
 *
 * Der Rest der ganzzahligen Teilung fällt in den ERSTEN Monat (`index` 0, der Monat der
 * Zahlung). So summieren die Teile exakt auf den Betrag — mit gerundeten gleichen Teilen
 * fehlte am Ende ein Cent, und die Überleitung ginge über das Jahr nicht auf.
 */
export function monatsanteil(betrag: Cent, teile: number, index: number): Cent {
  if (teile <= 1) return betrag;
  const basis = Math.trunc(betrag / teile);
  return index === 0 ? betrag - basis * (teile - 1) : basis;
}

/**
 * Was ein aufbauendes Budget im Monat `monat` kostet, POSITIV.
 *
 * Bis zum Monatsende sind die Kosten des Topfs insgesamt das GRÖSSERE aus dem, was
 * hineinging, und dem, was herausging:
 *
 *     Kosten bis M = max(Σ Raten bis M, Σ Ausgaben bis M)
 *
 * und der Monat kostet die Differenz zum Vormonat. Daraus folgt alles, was die Regel
 * verlangt, ohne Fallunterscheidung:
 *
 *   • Reicht der Topf, kostet der Monat die Rate — gleich, wie viel entnommen wurde.
 *   • Wird er überzogen, kostet der Monat die Rate PLUS das Ungedeckte. Sonst machte ein
 *     leerer Topf jede Ausgabe folgenlos.
 *   • Solange er danach im Minus steht, kostet der Monat NICHTS: die Rate füllt nur das
 *     Loch, und das Loch war schon Kosten. Zählte sie weiter, stünde dieselbe Ausgabe
 *     zweimal da.
 *
 * Eine Erstattung senkt die Ausgaben und damit, im überzogenen Topf, die Kosten — das
 * Ergebnis kann dann negativ sein, und das ist richtig so.
 */
export function topfKosten(
  budget: Budget,
  entnahmen: readonly Einordnung[],
  monat: string,
): Cent {
  const monatsende = toIso(addMonate(parseIso(`${monat}-01`), 1));
  const monatsanfang = `${monat}-01`;
  const vormonat = monatVon(toIso(addMonate(parseIso(monatsanfang), -1)));
  const ausgabenBis = (bis: string) =>
    -summe(
      entnahmen
        .filter((x) => x.budgetId === budget.id && x.buchung.datum >= budget.start && x.buchung.datum < bis)
        .map((x) => x.betrag),
    );
  const kostenBis = (m: string, bis: string) => Math.max(budgetRahmen(budget, `${m}-01`), ausgabenBis(bis));
  return kostenBis(monat, monatsende) - kostenBis(vormonat, monatsanfang);
}

/** Die Ergebnisrechnung eines Monats. `monatAb` ist sein erster Tag („YYYY-MM-01"). */
export function monatsErgebnis(basis: Ergebnisbasis, monatAb: string): MonatsErgebnis {
  const e = basis.eingabe;
  const start = parseIso(monatAb);
  const von = toIso({ ...start, d: 1 });
  const bis = toIso(addMonate(start, 1));
  const monat = monatVon(von);
  const zukunft = von > e.heute;
  const laufend = !zukunft && e.heute < bis;

  const imMonat = zukunft ? [] : basis.einordnungen.filter((x) => x.buchung.datum >= von && x.buchung.datum < bis);
  const derArt = (art: Einordnung["art"]) => imMonat.filter((x) => x.art === art);

  const istVorsorgeregel = (r: Zahlungsregel) =>
    r.charakter === "Umschichtung" &&
    (!r.gegenkontoId ||
      (basis.vorsorgeKonten.has(r.gegenkontoId) && !(r.kontoId && basis.vorsorgeKonten.has(r.kontoId))));

  const einnahmen = regelZeile(
    "einnahmen",
    e.regeln.filter((r) => r.charakter === "Ertrag"),
    basis.einordnungen.filter((x) => x.art === "einnahme"),
    { von, zukunft, periodisiert: false },
  );
  const fixkosten = regelZeile(
    "fixkosten",
    e.regeln.filter((r) => r.charakter === "Aufwand"),
    basis.einordnungen.filter((x) => x.art === "fixkosten"),
    { von, zukunft, periodisiert: true },
  );
  const vorsorge = regelZeile(
    "vorsorge",
    e.regeln.filter(istVorsorgeregel),
    basis.einordnungen.filter((x) => x.art === "vorsorge"),
    { von, zukunft, periodisiert: false },
  );

  const laufendeKosten = zeile(
    "laufend",
    e.budgets
      .filter((b) => b.art === "monatlich")
      .map((b): ErgebnisPosten => {
        const ist = zukunft ? null : summe(derArt("laufend").filter((x) => x.budgetId === b.id).map((x) => x.betrag));
        return {
          schluessel: b.id,
          bezeichnung: "",
          kategorieId: b.kategorieId,
          budgetId: b.id,
          plan: -zufuehrungIm(b, monat) || 0,
          ist,
          status: ist == null || ist === 0 ? "offen" : "gebucht",
        };
      })
      .filter((p) => p.plan !== 0 || (p.ist ?? 0) !== 0)
      .sort((a, b) => a.plan - b.plan),
    zukunft,
  );

  const topfEntnahmen = basis.einordnungen.filter((x) => x.art === "topf");
  const wagnisse = zeile(
    "wagnisse",
    e.budgets
      .filter((b) => b.art === "aufbauend")
      .map((b): ErgebnisPosten => {
        const entnahme = summe(derArt("topf").filter((x) => x.budgetId === b.id).map((x) => x.betrag));
        const ist = zukunft ? null : -topfKosten(b, topfEntnahmen, monat) || 0;
        return {
          schluessel: b.id,
          bezeichnung: "",
          kategorieId: b.kategorieId,
          budgetId: b.id,
          plan: -zufuehrungIm(b, monat) || 0,
          ist,
          status: zukunft ? "offen" : "gebucht",
          entnahme: zukunft ? undefined : entnahme,
        };
      })
      .filter((p) => p.plan !== 0 || (p.ist ?? 0) !== 0 || (p.entnahme ?? 0) !== 0)
      .sort((a, b) => a.plan - b.plan),
    zukunft,
  );

  // Beendete Zyklen: was eine Rücklage in einem VERGANGENEN Monat gekostet hat, bevor
  // sie ausgebucht wurde — und der Kauf selbst, gegen das Angesparte geprüft. Dieselbe
  // Regel wie beim aufbauenden Budget (`topfKosten`): bis zur Höhe des Stands ist die
  // Entnahme kein zweites Mal Kosten, was darüber liegt, kostet den Monat des Kaufs.
  //
  // Eine Ausbuchung ohne festgehaltenen Zyklus (von vor Migration 76) bildet keinen
  // Posten: ihre Geschichte ist unbekannt, und ihr Kauf gilt wie zuvor als gedeckt.
  const zyklusPosten = zukunft
    ? []
    : e.ausbuchungen.filter(hatGeschichte).flatMap((z): ErgebnisPosten[] => {
        const rate = zyklusSoll(z, bis) - zyklusSoll(z, von);
        const kauf = z.istbuchungId ? e.ist.find((b) => b.id === z.istbuchungId) : undefined;
        // Nur ein Kauf, den die Einordnung auch als Entnahme führt. Hängt die Buchung
        // inzwischen an einem Vertrag oder ist sie wieder budgetrelevant, zählt sie
        // dort schon als Kosten — das Ungedeckte käme sonst doppelt.
        const alsEntnahme =
          !!kauf && kauf.budgetrelevant === false && kauf.charakter === "Aufwand" &&
          !kauf.transferId && !e.vertragJeBuchung.has(kauf.id);
        const imMonat = alsEntnahme && kauf.datum >= von && kauf.datum < bis;
        // Der Kauf ist eine Ausgabe (negativ); eine Rückbuchung darauf deckt nichts auf.
        const entnahme = imMonat ? Math.max(0, -kauf.betrag) : 0;
        const ungedeckt = imMonat ? Math.max(0, entnahme - zyklusSoll(z, z.datum)) : 0;
        if (rate === 0 && entnahme === 0) return [];
        return [{
          schluessel: `zyklus:${z.id}`,
          bezeichnung: z.bezeichnung ?? "",
          ruecklageId: z.ruecklageId,
          kategorieId: z.kategorieId,
          plan: -rate || 0,
          ist: -(rate + ungedeckt) || 0,
          status: "gebucht",
          entnahme: imMonat ? -entnahme || 0 : undefined,
        }];
      });

  const abschreibungen = zeile(
    "abschreibungen",
    [...zyklusPosten, ...e.ruecklagen
      .map((r): ErgebnisPosten => {
        // Der Zuwachs des Solls und nicht die blosse Rate: vor dem Beginn steht nichts,
        // und eine Rücklage, deren Ziel erreicht ist, kostet nichts mehr — bis sie
        // ausgebucht wird und von vorn anfängt.
        const plan = -(sollRuecklage(r, bis) - sollRuecklage(r, von)) || 0;
        return {
          schluessel: `ruecklage:${r.id}`,
          bezeichnung: r.bezeichnung,
          ruecklageId: r.id,
          kategorieId: r.kategorieId,
          plan,
          ist: zukunft ? null : plan,
          status: zukunft ? "offen" : "gebucht",
        };
      })
      .filter((p) => p.plan !== 0)]
      .sort((a, b) => a.plan - b.plan),
    zukunft,
  );

  const ungeplant = zeile(
    "ungeplant",
    derArt("ungeplant")
      .map((x) => einzelposten(x))
      .sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? "")),
    zukunft,
  );

  // Die drei ersten Zeilen stehen immer da: ein Monat ohne Einnahmen, Fixkosten oder
  // Alltag ist eine Aussage. Die übrigen nur, wenn es sie gibt — Zeilen voller Nullen
  // wären bei einem Haushalt ohne Töpfe Lärm.
  const zeilen = [einnahmen, fixkosten, laufendeKosten, ungeplant, abschreibungen, wagnisse, vorsorge].filter(
    (z, i) => i < 3 || z.posten.length > 0,
  );

  const stufe = (...teile: readonly ErgebnisZeile[]): Stufe => ({
    plan: summe(teile.map((z) => z.plan)),
    ist: zukunft ? null : summe(teile.map((z) => z.ist ?? 0)),
  });
  const nachPflichten = stufe(einnahmen, fixkosten);
  const nachAlltag = stufe(einnahmen, fixkosten, laufendeKosten, ungeplant);
  const ergebnis = stufe(einnahmen, fixkosten, laufendeKosten, ungeplant, abschreibungen, wagnisse, vorsorge);

  return {
    jahr: start.y,
    monat: start.m,
    label: monat,
    von,
    bis,
    laufend,
    zukunft,
    zeilen,
    nachPflichten,
    nachAlltag,
    ergebnis,
    erwartet: laufend ? hochrechnung(zeilen) : undefined,
    ueberleitung: zukunft
      ? undefined
      : ueberleitung(ergebnis.ist ?? 0, {
          raten: -((abschreibungen.ist ?? 0) + (wagnisse.ist ?? 0)) || 0,
          entnahmen: summe([...derArt("topf"), ...derArt("ruecklage")].map((x) => x.betrag)),
          periodisierung: summe(derArt("fixkosten").map((x) => x.betrag)) - (fixkosten.ist ?? 0) || 0,
          vorsorgeEigen:
            -summe(
              derArt("vorsorge")
                .filter((x) => x.intern)
                .map((x) => x.betrag),
            ) || 0,
        }),
  };
}

function ueberleitung(ergebnis: Cent, teile: Record<UeberleitungId, Cent>): Ueberleitung {
  const posten = (Object.keys(teile) as UeberleitungId[])
    .map((id) => ({ id, betrag: teile[id] }))
    .filter((p) => p.betrag !== 0);
  return { ergebnis, posten, kontoaenderung: ergebnis + summe(posten.map((p) => p.betrag)) };
}

function zeile(id: ErgebnisZeileId, posten: readonly ErgebnisPosten[], zukunft: boolean): ErgebnisZeile {
  return {
    id,
    plan: summe(posten.map((p) => p.plan)),
    ist: zukunft ? null : summe(posten.map((p) => p.ist ?? 0)),
    posten,
  };
}

/** Ein Anteil ohne Plan dahinter, als eigener Posten. */
function einzelposten(x: Einordnung): ErgebnisPosten {
  return {
    schluessel: `${x.buchung.id}#${x.anteil}`,
    bezeichnung: x.buchung.notiz ?? "",
    datum: x.buchung.datum,
    plan: 0,
    ist: x.betrag,
    status: "ohnePlan",
    istId: x.buchung.id,
    kategorieId: x.kategorieId,
    vertragId: x.vertragId,
  };
}

/**
 * Eine Zeile, deren Plan aus Zahlungsregeln kommt: Einnahmen, Fixkosten, Vorsorge.
 *
 * Plan und Ist finden über den VERTRAG zusammen (`regel.vertragId` gegen die
 * Vertragszuordnung der Buchung), nicht über Betragsnähe. Die Zuordnung ist die Aussage,
 * die jemand getroffen hat; ein Betrag, der zufällig passt, ist keine.
 *
 * `periodisiert` verteilt Regel und Zahlung auf die Monate ihres Rhythmus, ab dem Monat
 * der Fälligkeit bzw. der Zahlung. Ohne zählt beides in seinem Monat.
 *
 * Was keiner Regel zugeordnet werden kann, steht als Einzelposten ohne Plan da — bei den
 * Fixkosten unverteilt, weil ohne Regel niemand weiss, für wie lange die Zahlung gilt.
 */
function regelZeile(
  id: ErgebnisZeileId,
  regeln: readonly Zahlungsregel[],
  zahlungen: readonly Einordnung[],
  o: { von: string; zukunft: boolean; periodisiert: boolean },
): ErgebnisZeile {
  const bis = toIso(addMonate(parseIso(o.von), 1));
  const jeVertrag = new Map<string, Zahlungsregel[]>();
  for (const r of regeln) {
    if (!r.vertragId) continue;
    const liste = jeVertrag.get(r.vertragId);
    if (liste) liste.push(r);
    else jeVertrag.set(r.vertragId, [r]);
  }
  // Hat ein Vertrag mehrere Regeln, gehört die Zahlung zu der, deren Betrag ihr am
  // nächsten liegt. Das Schema erlaubt den Fall; er ist selten.
  const regelFuer = (x: Einordnung): Zahlungsregel | undefined => {
    const kandidaten = x.vertragId ? jeVertrag.get(x.vertragId) : undefined;
    if (!kandidaten) return undefined;
    return [...kandidaten].sort(
      (a, b) => Math.abs(a.betrag - x.buchung.betrag) - Math.abs(b.betrag - x.buchung.betrag),
    )[0];
  };
  const zahlungenJeRegel = new Map<string, Einordnung[]>();
  const ohneRegel: Einordnung[] = [];
  for (const x of zahlungen) {
    const r = regelFuer(x);
    if (!r) {
      if (x.buchung.datum >= o.von && x.buchung.datum < bis) ohneRegel.push(x);
      continue;
    }
    const liste = zahlungenJeRegel.get(r.id);
    if (liste) liste.push(x);
    else zahlungenJeRegel.set(r.id, [x]);
  }

  const posten: ErgebnisPosten[] = [];
  for (const r of regeln) {
    const teile = o.periodisiert ? RHYTHMUS_MONATE[r.rhythmus] : 1;
    // Das Fenster, aus dem eine Zahlung noch in diesen Monat hineinreicht.
    const fensterAb = toIso(addMonate(parseIso(o.von), -(teile - 1)));
    const index = (datum: string) => monateZwischen(datum, o.von);

    const faellig = projiziereRegel(r, fensterAb, teile);
    const plan = summe(faellig.map((p) => monatsanteil(p.betrag, teile, index(p.datum))));
    const eigene = (zahlungenJeRegel.get(r.id) ?? []).filter(
      (x) => x.buchung.datum >= fensterAb && x.buchung.datum < bis,
    );
    const ist = o.zukunft ? null : summe(eigene.map((x) => monatsanteil(x.betrag, teile, index(x.buchung.datum))));
    if (plan === 0 && (ist ?? 0) === 0) continue;

    const dieserMonat = eigene.filter((x) => x.buchung.datum >= o.von);
    posten.push({
      schluessel: `${r.id}@${o.von}`,
      bezeichnung: r.bezeichnung,
      datum: faellig.length === 1 ? faellig[0].datum : undefined,
      plan,
      ist,
      status: o.zukunft || eigene.length === 0 ? "offen" : "gebucht",
      istId: dieserMonat.length === 1 && eigene.length === 1 ? dieserMonat[0].buchung.id : undefined,
      kategorieId: r.kategorieId,
      vertragId: r.vertragId,
      teile: teile > 1 ? teile : undefined,
    });
  }
  if (!o.zukunft) for (const x of ohneRegel) posten.push(einzelposten(x));

  posten.sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? "") || a.plan - b.plan);
  return zeile(id, posten, o.zukunft);
}

/**
 * Womit ein angefangener Monat voraussichtlich endet: das Gebuchte, ergänzt um das, was
 * der Plan noch erwarten lässt.
 *
 * „Bisher" allein ist zur Monatsmitte zu gut (die Miete fehlt noch) oder zu schlecht
 * (das Gehalt fehlt noch), „geplant" allein übersieht, was schon anders gelaufen ist.
 * Die Hochrechnung nimmt je Posten die Zahl, die man heute für die wahrscheinlichere
 * halten muss:
 *
 *   • **Vertrag, noch offen** — der Plan. Die Zahlung kommt noch.
 *   • **Vertrag, gebucht** — das Ist. Was abgebucht wurde, gilt, auch wenn es vom Plan
 *     abweicht.
 *   • **Monatliches Budget** — das GRÖSSERE von Betrag und Verbrauch. Ein Budget gilt
 *     als ausgegeben, bis der Monat das Gegenteil zeigt; ist es schon überzogen, zählt
 *     die Überziehung. Wer den Rest als gespart rechnet, gibt ihn in Gedanken zweimal
 *     aus.
 *   • **Alles andere** (Rücklagen, aufbauende Budgets, Ungeplantes) — das Ist. Die
 *     Raten stehen schon mit dem ganzen Monat da, und Ungeplantes lässt sich nicht
 *     vorhersagen: geschätzt wird hier nichts.
 *
 * Der letzte Punkt ist die Grenze der Rechnung: sie kennt keine Ausgabe, die noch
 * niemand geplant hat. Die Zahl ist deshalb eine Obergrenze für einen Monat, in dem
 * nichts Ungeplantes mehr passiert.
 */
export function hochrechnung(zeilen: readonly ErgebnisZeile[]): Cent {
  let erwartet = 0;
  for (const z of zeilen) {
    for (const p of z.posten) {
      if (p.ist == null) erwartet += p.plan;
      else if (z.id === "laufend") erwartet += Math.min(p.plan, p.ist);
      else if (p.status === "offen" && VERTRAGSZEILEN.has(z.id)) erwartet += p.plan;
      else erwartet += p.ist;
    }
  }
  return erwartet || 0;
}

/** Die Zeilen, deren Posten aus Zahlungsregeln kommen: dort heisst „offen", es kommt noch. */
const VERTRAGSZEILEN: ReadonlySet<ErgebnisZeileId> = new Set(["einnahmen", "fixkosten", "vorsorge"]);

/** Die Ergebnisrechnungen ab dem Monat von `heute` — der laufende und die folgenden. */
export function monatsErgebnisse(basis: Ergebnisbasis, anzahl = 3): MonatsErgebnis[] {
  const start = parseIso(basis.eingabe.heute);
  return Array.from({ length: Math.max(0, Math.floor(anzahl)) }, (_, i) =>
    monatsErgebnis(basis, toIso({ ...addMonate(start, i), d: 1 })),
  );
}

// ------------------------------------------------------------------ über mehrere Monate
//
// Was folgt, wertet eine REIHE von Monatsergebnissen aus — die Kostensicht der Analyse.
// Es steht hier und nicht in `auswertung.ts`, weil es auf den Zeilen dieser Rechnung
// aufbaut und nicht auf Buchungen: wer eine Zeile ergänzt, sieht die Stelle, an der sie
// in die Kennzahlen eingehen muss.

/** Die Zeilen, die KOSTEN sind — alle ausser den Einnahmen, in der Reihenfolge der Stufen. */
export const KOSTENZEILEN = ["fixkosten", "laufend", "ungeplant", "abschreibungen", "wagnisse", "vorsorge"] as const;
export type KostenZeileId = (typeof KOSTENZEILEN)[number];

/**
 * Das Ist einer Zeile, vorzeichenbehaftet. Eine Zeile, die im Monat fehlt (siehe
 * `monatsErgebnis`: nur die ersten drei stehen immer da), ist 0 — nicht „unbekannt".
 */
export function zeilenIst(m: MonatsErgebnis, id: ErgebnisZeileId): Cent {
  return m.zeilen.find((z) => z.id === id)?.ist ?? 0;
}

/** Die Kosten eines Monats, POSITIV: die negierte Summe der Kostenzeilen. */
export function monatsKosten(m: MonatsErgebnis): Cent {
  return -summe(KOSTENZEILEN.map((id) => zeilenIst(m, id))) || 0;
}

export interface ErgebnisKennzahlen {
  /** Über wie viele Monate gemittelt wurde. */
  readonly monate: number;
  /** Durchschnitt je Monat, positiv. */
  readonly kostenJeMonat: Cent;
  /** Durchschnitt je Monat, vorzeichenbehaftet — „bleibt wirklich frei". */
  readonly ergebnisJeMonat: Cent;
  /** Fixkosten ÷ Einnahmen (0…1, bei Überdeckung darüber). `null` ohne Einnahmen. */
  readonly fixkostenquote: number | null;
  /** (Rücklagen + aufbauende Budgets + Vorsorge) ÷ Einnahmen. `null` ohne Einnahmen. */
  readonly sparquote: number | null;
}

/**
 * Die Kennzahlen der Kostensicht über eine Reihe von Monaten.
 *
 * Drei Entscheidungen stecken darin:
 *
 *   • Die Quoten rechnen über die SUMMEN des Zeitraums, nicht als Mittel der
 *     Monatsquoten. Ein Monat mit kleinen Einnahmen (Gehalt verschoben) hätte sonst
 *     dasselbe Gewicht wie alle anderen und zöge die Quote hoch, obwohl über das Jahr
 *     nichts anders war.
 *   • Ohne Einnahmen gibt es keine Quote (`null`). Eine 0 hiesse „nichts ist fix", ein
 *     Unendlich wäre keine Zahl, die jemand lesen kann.
 *   • Kosten werden durch Negieren der Summe positiv, nie mit `Math.abs` je Zeile — eine
 *     Erstattung, die eine Zeile ins Plus dreht, muss die Kosten SENKEN (dieselbe Regel
 *     wie im Kopf von `auswertung.ts`).
 *
 * Künftige Monate haben kein Ist und zählen nicht mit. Ob der LAUFENDE Monat hineingehört,
 * entscheidet der Aufrufer über die Liste, die er hereingibt — hier wird nicht gefiltert,
 * damit die Funktion für einen einzelnen Monat dasselbe sagt wie für zwölf.
 */
export function ergebnisKennzahlen(monate: readonly MonatsErgebnis[]): ErgebnisKennzahlen {
  const gewesen = monate.filter((m) => !m.zukunft);
  const n = gewesen.length;
  const ueberAlle = (id: ErgebnisZeileId) => summe(gewesen.map((m) => zeilenIst(m, id)));

  const einnahmen = ueberAlle("einnahmen");
  const kosten = summe(gewesen.map(monatsKosten));
  const ergebnis = summe(gewesen.map((m) => m.ergebnis.ist ?? 0));
  const fix = -ueberAlle("fixkosten");
  const gespart = -(ueberAlle("abschreibungen") + ueberAlle("wagnisse") + ueberAlle("vorsorge"));

  return {
    monate: n,
    kostenJeMonat: n > 0 ? Math.round(kosten / n) : 0,
    ergebnisJeMonat: n > 0 ? Math.round(ergebnis / n) : 0,
    fixkostenquote: einnahmen > 0 ? fix / einnahmen : null,
    sparquote: einnahmen > 0 ? gespart / einnahmen : null,
  };
}

/**
 * Fehlt in diesem Monat die Rate einer Rücklage, die es damals gab?
 *
 * DIE GRENZE DER KOSTENSICHT NACH HINTEN. Eine Rücklage kennt nur ihren laufenden Zyklus:
 * `sollRuecklage` zählt ab `beginn`, und das Ausbuchen setzt `beginn` auf den Tag der
 * Ausgabe (mit Ziel) oder löscht die Rücklage (ohne). Für jeden Monat VOR dem Monat einer
 * Ausbuchung liefert die Rechnung deshalb keine Rate mehr für sie — obwohl in diesen
 * Monaten zurückgelegt wurde. Die Kosten dieser Monate stehen zu niedrig da, das Ergebnis
 * zu hoch.
 *
 * Reparieren liesse sich das nur mit einer Geschichte der Zyklen, die es nicht gibt. Was
 * sich sagen lässt, ist, WELCHE Monate betroffen sind — und das gehört neben die Zahl.
 * Der Monat der Ausbuchung selbst ist nicht betroffen: in ihm zählt schon die erste Rate
 * des neuen Zyklus.
 *
 * `ausbuchungsdaten` sind die ISO-Tage aller Ausbuchungen; `monat` ist „YYYY-MM".
 */
export function ruecklagenrateFehlt(monat: string, ausbuchungsdaten: readonly string[]): boolean {
  return ausbuchungsdaten.some((d) => monatVon(d) > monat);
}
