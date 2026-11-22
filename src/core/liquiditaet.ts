// Läuft ein Konto in den nächsten Wochen ins Minus?
//
// Das ist die eine Frage, aus der Handlungsbedarf entsteht. Alles andere in der Übersicht
// sagt, wie es steht; hier steht, ob etwas zu tun ist.
//
// **Gezeigt wird sie im Register „Ausblick" der Analyse** („Reicht das Geld?", seit
// 2026-11-15). Bis 2026-11-08 stand sie als Karte „Da ist etwas zu tun" ganz oben in der
// Übersicht; dort war sie zu laut und ist entfallen. Der neue Ort ist eine Tabelle über
// alle liquiden Konten, die immer dasteht — `handlungsbedarf` unten, das nur die Konten
// im Minus herausgreift, benutzt sie nicht.
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
//
// **Liegt direkt in `src/core/`, weil sie bereichsübergreifend abwägt:** den Stand eines
// Kontos (`konten`, mit seinen Vormerkungen) samt Buchungen und geplanten Zahlungen
// (`buchung`) gegen die Last der Budgets (`budgets`, über die Zuständigkeit). Im Bereich
// `konten` kannte das Konto die Budgets über ihm.

import { addTage, parseIso, tageImMonat, toIso } from "./basis/datum";
import type { Cent } from "./basis/geld";
import { vormerkungslast, type Vormerkung } from "./konten/vormerkung";
import { realerKontostand, type IstBuchung } from "./buchung/istbuchung";
import { projiziereRegel } from "./buchung/projektion";
import type { Zahlungsregel } from "./basis/zahlungsregel";
import { betragImMonat, budgetStand, type Budget } from "./budgets/budget";
import type { Zustaendigkeitssicht } from "./zustaendigkeit";
import { istAktiv, type Zahlungskonto } from "./konten/konto";

export interface Verlaufsbefund {
  /** Der niedrigste Stand im Fenster. */
  readonly tiefstand: Cent;
  /** Der Tag, an dem er erreicht wird. */
  readonly tiefstandAm: string;
  /** Erster Tag unter null — fehlt, wenn das Konto durchgehend im Plus bleibt. */
  readonly minusAb?: string;
}

/** Ein datierter Posten im Fenster — eine Fälligkeit aus einer Zahlungsregel. */
export interface Liquiditaetsposten {
  readonly datum: string;
  /** Die Regel, aus der er stammt — die beiden Seiten einer Umbuchung teilen sie. */
  readonly regelId: string;
  readonly bezeichnung: string;
  /** Vorzeichenbehaftet, aus Sicht des Kontos (Abfluss negativ). */
  readonly betrag: Cent;
}

/** Der Stand am ENDE eines Tages, auf beiden Linien. */
export interface Tagesstand {
  readonly datum: string;
  readonly fest: Cent;
  readonly erwartet: Cent;
  /** Was an diesem Tag aus den Budgets erwartet abfliesst, positiv — ohne Datum verteilt. */
  readonly budgetanteil: Cent;
}

export interface Kontovorschau {
  readonly kontoId: string;
  /** Der reale Stand heute — Ausgangspunkt beider Linien. */
  readonly start: Cent;
  /** Nur datierte Verpflichtungen. */
  readonly fest: Verlaufsbefund;
  /** Zusätzlich der anteilige Budgetrest. */
  readonly erwartet: Verlaufsbefund;
  /** Die Reihe selbst, Tag für Tag ab heute — aus ihr kommen die beiden Befunde. */
  readonly tage: readonly Tagesstand[];
  /** Die datierten Posten im Fenster, nach Tag. */
  readonly posten: readonly Liquiditaetsposten[];
}

export interface LiquiditaetsEingabe {
  readonly konten: readonly Zahlungskonto[];
  readonly buchungen: readonly IstBuchung[];
  readonly regeln: readonly Zahlungsregel[];
  /** Für den Budgetanteil der erwarteten Linie. Ohne sie sind beide Linien gleich. */
  readonly budgetsicht?: Zustaendigkeitssicht;
  /**
   * Was die Bank kennt und noch nicht gebucht hat. Fließt in BEIDE Linien ein, und zwar
   * in die feste zuerst.
   *
   * Eine Vormerkung ist sicherer als jede Vertragsrate: sie ist bereits geschehen, nur
   * noch nicht verbucht. `realerKontostand` sieht sie nicht — er rechnet über Buchungen
   * —, und deshalb steht ohne sie am Anfang der Reihe Geld, das faktisch weg ist.
   * Dasselbe meint die Bank, wenn sie neben den Saldo einen „verfügbaren Betrag" stellt.
   */
  readonly vormerkungen?: readonly Vormerkung[];
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
): Liquiditaetsposten[] {
  const raus: Liquiditaetsposten[] = [];
  for (const r of regeln) {
    if (r.kontoId === kontoId) {
      for (const p of projiziereRegel(r, heute, monate)) {
        raus.push({ datum: p.datum, regelId: r.id, bezeichnung: p.bezeichnung, betrag: p.betrag });
      }
    }
    // Die Gegenseite einer geplanten Umbuchung.
    if (r.gegenkontoId === kontoId && r.charakter === "Umschichtung") {
      for (const p of projiziereRegel(r, heute, monate)) {
        raus.push({ datum: p.datum, regelId: r.id, bezeichnung: p.bezeichnung, betrag: Math.abs(p.betrag) });
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
  sicht: Zustaendigkeitssicht | undefined,
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

  // **Stillgelegte Konten kommen hier nicht vor, und der Filter steht bewusst IM Kern.**
  // `liquideMittel` filtert nicht und lässt die Wahl der Aufrufstelle — diese Funktion
  // nicht, und der Unterschied ist die Zeitrichtung: ein Bestand lässt sich sinnvoll mit
  // und ohne stillgelegte Konten bilden („was ist da" gegen „was kann ich ausgeben"), eine
  // VORAUSSCHAU nicht. Ein Konto, das niemand mehr führt, hat keine nächsten 90 Tage; es
  // mitzurechnen ergäbe eine Zeile über ein Konto, an dem man nichts mehr tun kann —
  // und ein Minus dort stünde neben den Konten, an denen sich etwas ändern lässt.
  return e.konten.filter(istAktiv).map((konto): Kontovorschau => {
    // Der reale Stand MINUS dessen, was schon feststeht und noch nicht gebucht ist. Eine
    // Vormerkung ohne Datum wirkt ab sofort — was die Bank bereits kennt, ist näher als
    // alles Datierte —, und eine mit Datum ebenso: sie wird in Tagen gebucht, und den
    // Tag genau zu treffen wäre eine Genauigkeit, die die Angabe nicht hergibt.
    const offen = vormerkungslast(
      (e.vormerkungen ?? []).filter((v) => v.zahlungskontoId === konto.id),
    );
    const start = realerKontostand(konto, [...e.buchungen]) + offen.betrag;
    const ereignisse = feste(konto.id, e.regeln, e.heute, monate).filter(
      (x) => x.datum >= e.heute && x.datum <= bis,
    );
    const proTag = budgetlast(konto.id, e.budgetsicht, e.heute);

    const jeTag = new Map<string, Cent>();
    for (const x of ereignisse) jeTag.set(x.datum, (jeTag.get(x.datum) ?? 0) + x.betrag);

    const festeReihe: Ereignis[] = [];
    const erwarteteReihe: Ereignis[] = [];
    const tage: Tagesstand[] = [];
    let standFest = start;
    let standErwartet = start;
    for (let i = 0; i <= e.tage; i++) {
      const datum = toIso(addTage(parseIso(e.heute), i));
      const termin = jeTag.get(datum) ?? 0;
      const budgetanteil = proTag(datum);
      standFest += termin;
      standErwartet += termin - budgetanteil;
      festeReihe.push({ datum, betrag: standFest });
      erwarteteReihe.push({ datum, betrag: standErwartet });
      tage.push({ datum, fest: standFest, erwartet: standErwartet, budgetanteil });
      // Hier stand bis 2026-11-16 ein „Sicherheitsnetz", das die Schleife abbrach, sobald
      // `ord(datum)` nicht mehr `ord(heute) + i` war. `ord` ist aber ein Sortierschlüssel
      // (YYYYMMDD) und kein Tageszähler: am ersten Monatswechsel sprang er, und die
      // Vorschau endete dort still — sie rechnete bis zum Monatsende statt über das
      // ganze Fenster. `addTage` rechnet echte Kalendertage und braucht kein Netz.
    }

    return {
      kontoId: konto.id,
      start,
      fest: befund(festeReihe),
      erwartet: befund(erwarteteReihe),
      tage,
      posten: [...ereignisse].sort((a, b) => a.datum.localeCompare(b.datum)),
    };
  });
}

/** Ein Tag der Kurve über mehrere Konten — mit den Posten, die an ihm fallen. */
export interface Kurventag extends Tagesstand {
  /** Ohne `regelId`: über die Konten zusammengefasst, je Regel einer. */
  readonly posten: readonly { readonly bezeichnung: string; readonly betrag: Cent }[];
}

/**
 * Die Summe mehrerer Kontovorschauen, Tag für Tag — der Stand ALLER gerechneten Konten
 * zusammen, wie ihn eine Kurve zeigt.
 *
 * **Eine Umbuchung zwischen zwei gerechneten Konten fällt heraus**, als Stufe und als
 * Posten: sie steht auf beiden Konten mit derselben Regel, einmal ab und einmal zu, und
 * ändert die Summe nicht. Zusammengefasst wird deshalb je Tag und Regel; was sich dabei
 * zu null aufhebt, ist kein Posten dieses Tages. Eine Umbuchung auf ein Konto AUSSERHALB
 * der Auswahl bleibt dagegen stehen — für die Summe ist sie ein Abfluss.
 *
 * Alle Vorschauen müssen dasselbe Fenster haben (sie kommen aus EINEM Aufruf von
 * `liquiditaetsvorschau`); die Tage werden über ihr Datum zusammengeführt.
 */
export function liquiditaetskurve(vorschauen: readonly Kontovorschau[]): Kurventag[] {
  const tage = new Map<string, { fest: Cent; erwartet: Cent; budgetanteil: Cent }>();
  for (const v of vorschauen) {
    for (const t of v.tage) {
      const x = tage.get(t.datum) ?? { fest: 0, erwartet: 0, budgetanteil: 0 };
      x.fest += t.fest;
      x.erwartet += t.erwartet;
      x.budgetanteil += t.budgetanteil;
      tage.set(t.datum, x);
    }
  }

  const jeTagUndRegel = new Map<string, Map<string, { bezeichnung: string; betrag: Cent }>>();
  for (const v of vorschauen) {
    for (const p of v.posten) {
      const tag = jeTagUndRegel.get(p.datum) ?? new Map<string, { bezeichnung: string; betrag: Cent }>();
      const x = tag.get(p.regelId) ?? { bezeichnung: p.bezeichnung, betrag: 0 };
      x.betrag += p.betrag;
      tag.set(p.regelId, x);
      jeTagUndRegel.set(p.datum, tag);
    }
  }

  return [...tage.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([datum, x]): Kurventag => ({
      datum,
      ...x,
      posten: [...(jeTagUndRegel.get(datum)?.values() ?? [])]
        .filter((p) => p.betrag !== 0)
        .sort((a, b) => a.betrag - b.betrag),
    }));
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
