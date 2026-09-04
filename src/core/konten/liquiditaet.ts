// Läuft ein Konto in den nächsten Wochen ins Minus?
//
// Das ist die eine Frage, aus der Handlungsbedarf entsteht. Alles andere in der Übersicht
// sagt, wie es steht; hier steht, ob etwas zu tun ist.
//
// ZWEI LINIEN, und der Unterschied zwischen ihnen ist die eigentliche Auskunft:
//
//   FEST — nur datierte Verpflichtungen: Vertragsraten und geplante Umbuchungen. Wer hier
//          ins Minus läuft, hat ein SICHERES Problem: die Termine stehen fest, und dass
//          das Geld nicht reicht, ergibt sich aus ihnen allein.
//   ERWARTET — dazu der Budgetrest, gleichmässig über die verbleibenden Tage verteilt.
//          Wer nur hier ins Minus läuft, hat noch die Wahl: er kann weniger ausgeben.
//
// Eine Linie allein taugte für keine der beiden Aussagen. Nur die feste warnte zu spät —
// die meisten Engpässe entstehen aus dem Alltagsverbrauch. Nur die erwartete warnte zu
// oft, und eine Warnung, die jeden Monat einmal aufleuchtet und sich von selbst wieder
// erledigt, liest nach dem dritten Mal niemand mehr.
//
// **Ein Budget ist keine Fälligkeit**, und darin liegt die Unsicherheit dieser Rechnung.
// Es sagt „höchstens 400 im Monat", nicht „am 14. gehen 400 ab". Gleichmässig zu
// verteilen ist die neutrale Annahme: nicht die schlimmste (alles am Monatsanfang), nicht
// die beste (alles am Ende). Sie steht hier, damit sie eine Annahme bleibt und nicht als
// Tatsache in eine Zahl einwandert.
//
// **Ein AUFBAUENDES Budget zählt nicht mit.** Seine Rate wird nicht ausgegeben, sie bleibt
// liegen — sie mitzurechnen hiesse, Geld abfliessen zu lassen, das auf dem Konto bleibt.
// Was daraus einmal gekauft wird, ist unvorhersagbar und gehört in keine Vorschau.

import { addTage, ord, parseIso, tageImMonat, toIso } from "../basis/datum";
import type { Cent } from "../basis/geld";
import { realerKontostand, type IstBuchung } from "../buchung/istbuchung";
import { projiziereRegel } from "../buchung/projektion";
import type { Zahlungsregel } from "../basis/zahlungsregel";
import { betragImMonat, budgetStand, type Budget, type BudgetSicht } from "../budgets/budget";
import type { Zahlungskonto } from "./konto";

export interface Verlaufsbefund {
  /** Der niedrigste Stand im Fenster. */
  readonly tiefstand: Cent;
  /** Der Tag, an dem er erreicht wird. */
  readonly tiefstandAm: string;
  /** Erster Tag unter null — fehlt, wenn das Konto durchgehend im Plus bleibt. */
  readonly minusAb?: string;
}

export interface Kontovorschau {
  readonly kontoId: string;
  /** Der reale Stand heute — Ausgangspunkt beider Linien. */
  readonly start: Cent;
  /** Nur datierte Verpflichtungen. */
  readonly fest: Verlaufsbefund;
  /** Zusätzlich der anteilige Budgetrest. */
  readonly erwartet: Verlaufsbefund;
}

export interface LiquiditaetsEingabe {
  readonly konten: readonly Zahlungskonto[];
  readonly buchungen: readonly IstBuchung[];
  readonly regeln: readonly Zahlungsregel[];
  /** Für den Budgetanteil der erwarteten Linie. Ohne sie sind beide Linien gleich. */
  readonly budgetsicht?: BudgetSicht;
  readonly heute: string;
  /** Wie weit vorausgerechnet wird. */
  readonly tage: number;
}

/** Ein datierter Betrag, vorzeichenbehaftet. */
interface Ereignis {
  readonly datum: string;
  readonly betrag: Cent;
}

/**
 * Die datierten Verpflichtungen EINES Kontos im Fenster.
 *
 * Eine geplante Umbuchung steht zweimal darin: als Abfluss auf dem Quellkonto und als
 * Zufluss auf dem Zielkonto. Nur die eine Seite zu rechnen hiesse, das Zielkonto ärmer
 * zu zeigen, als es sein wird — und genau das Rücklagenkonto sähe dann nach
 * Handlungsbedarf aus, auf das gerade eingezahlt wird.
 */
function feste(
  kontoId: string,
  regeln: readonly Zahlungsregel[],
  heute: string,
  monate: number,
): Ereignis[] {
  const raus: Ereignis[] = [];
  for (const r of regeln) {
    if (r.kontoId === kontoId) {
      for (const p of projiziereRegel(r, heute, monate)) {
        raus.push({ datum: p.datum, betrag: p.betrag });
      }
    }
    // Die Gegenseite einer geplanten Umbuchung.
    if (r.gegenkontoId === kontoId && r.charakter === "Umschichtung") {
      for (const p of projiziereRegel(r, heute, monate)) {
        raus.push({ datum: p.datum, betrag: Math.abs(p.betrag) });
      }
    }
  }
  return raus;
}

/**
 * Die Tageslast aus den Budgets EINES Kontos — was pro Tag erwartet abfliesst.
 *
 * Für den LAUFENDEN Monat der noch offene Rest, verteilt auf die verbleibenden Tage: was
 * diesen Monat schon ausgegeben wurde, steht bereits im Kontostand und darf nicht ein
 * zweites Mal abgezogen werden. Für spätere Monate der volle Monatsbetrag.
 */
function budgetlast(
  kontoId: string,
  sicht: BudgetSicht | undefined,
  heute: string,
): (datum: string) => Cent {
  if (!sicht) return () => 0;
  const eigene = sicht.budgets.filter((b: Budget) => b.kontoId === kontoId && b.art === "monatlich");
  if (eigene.length === 0) return () => 0;

  const heuteYmd = parseIso(heute);
  const cache = new Map<string, Cent>();

  return (datum: string) => {
    const monat = datum.slice(0, 7);
    const zwischen = cache.get(monat);
    if (zwischen != null) return zwischen;

    const ymd = parseIso(`${monat}-01`);
    const tageGesamt = tageImMonat(ymd.y, ymd.m);
    const laufend = monat === heute.slice(0, 7);
    // Im laufenden Monat bleiben die Tage ab HEUTE — der Rest gilt für sie, nicht für
    // die schon vergangenen.
    const tage = laufend ? tageGesamt - heuteYmd.d + 1 : tageGesamt;

    let summe = 0;
    for (const b of eigene) {
      summe += laufend
        ? Math.max(0, budgetStand(sicht, b, heute).rest)
        : betragImMonat(b, monat);
    }
    const proTag = tage > 0 ? Math.round(summe / tage) : 0;
    cache.set(monat, proTag);
    return proTag;
  };
}

/** Der niedrigste Punkt einer Reihe von Tagesständen. */
function befund(punkte: readonly Ereignis[]): Verlaufsbefund {
  let tiefstand = punkte[0]?.betrag ?? 0;
  let tiefstandAm = punkte[0]?.datum ?? "";
  let minusAb: string | undefined;
  for (const p of punkte) {
    if (p.betrag < tiefstand) {
      tiefstand = p.betrag;
      tiefstandAm = p.datum;
    }
    if (minusAb === undefined && p.betrag < 0) minusAb = p.datum;
  }
  return { tiefstand, tiefstandAm, minusAb };
}

/**
 * Die Vorschau je Konto über `tage` Tage ab `heute`.
 *
 * Gerechnet wird TAGWEISE und nicht nur an den Terminen: sonst fiele der Budgetanteil
 * durch, und der Tiefstand läge auf einem Tag, an dem zufällig eine Rate fällig war.
 * Neunzig Tage über eine Handvoll Konten sind ein paar hundert Schritte — das ist billig
 * genug, um es nicht zu optimieren.
 */
export function liquiditaetsvorschau(e: LiquiditaetsEingabe): Kontovorschau[] {
  // Aufgerundet, damit das Fenster ganz abgedeckt ist: `projiziereRegel` rechnet in
  // Monaten, gefragt ist in Tagen.
  const monate = Math.max(1, Math.ceil(e.tage / 28));
  const bis = toIso(addTage(parseIso(e.heute), e.tage));

  return e.konten.map((konto): Kontovorschau => {
    const start = realerKontostand(konto, [...e.buchungen]);
    const ereignisse = feste(konto.id, e.regeln, e.heute, monate).filter(
      (x) => x.datum >= e.heute && x.datum <= bis,
    );
    const proTag = budgetlast(konto.id, e.budgetsicht, e.heute);

    const jeTag = new Map<string, Cent>();
    for (const x of ereignisse) jeTag.set(x.datum, (jeTag.get(x.datum) ?? 0) + x.betrag);

    const festeReihe: Ereignis[] = [];
    const erwarteteReihe: Ereignis[] = [];
    let standFest = start;
    let standErwartet = start;
    const startOrd = ord(parseIso(e.heute));
    for (let i = 0; i <= e.tage; i++) {
      const datum = toIso(addTage(parseIso(e.heute), i));
      const termin = jeTag.get(datum) ?? 0;
      standFest += termin;
      standErwartet += termin - proTag(datum);
      festeReihe.push({ datum, betrag: standFest });
      erwarteteReihe.push({ datum, betrag: standErwartet });
      // Sicherheitsnetz gegen eine falsch gerechnete Datumsreihe: ohne ihn liefe die
      // Schleife bei einem Fehler in `addTage` still ins Leere statt aufzufallen.
      if (ord(parseIso(datum)) !== startOrd + i) break;
    }

    return {
      kontoId: konto.id,
      start,
      fest: befund(festeReihe),
      erwartet: befund(erwarteteReihe),
    };
  });
}

/**
 * Die Konten, für die es etwas zu tun gibt — schärfster Fall zuerst.
 *
 * Was NICHT hier auftaucht, ist nicht „geprüft und in Ordnung", sondern „läuft im
 * gerechneten Fenster nicht ins Minus". Der Unterschied zählt, sobald jemand die Liste
 * als Freigabe liest.
 */
export function handlungsbedarf(vorschauen: readonly Kontovorschau[]): Kontovorschau[] {
  return vorschauen
    .filter((v) => v.erwartet.minusAb !== undefined)
    .sort((a, b) => {
      // Sicheres Minus vor erwartetem: das eine ist ein Termin, das andere eine Annahme.
      const sicher = (v: Kontovorschau) => (v.fest.minusAb ? 0 : 1);
      return sicher(a) - sicher(b) || (a.erwartet.minusAb ?? "").localeCompare(b.erwartet.minusAb ?? "");
    });
}
