// Vorsorge — was ein Ziel im Ruhestand heute verlangt.
//
// Die Frage ist eine Kette, und jedes Glied steht hier als eigene Funktion, damit die
// Oberfläche jedes davon zeigen kann:
//
//   Wunsch − Rente            = Lücke je Monat
//   Lücke über die Entnahmezeit = Kapitalbedarf am Zieltag
//   heutiges Vermögen, verzinst = was bis dahin ohne weiteres Sparen da ist
//   Bedarf − das                = Fehlbetrag
//   Fehlbetrag über die Ansparzeit = nötige Sparrate
//
// **Alles in heutiger Kaufkraft.** Wunsch, Rente und jedes Ergebnis sind Beträge von
// heute; die Rendite ist die ÜBER der Inflation. Eine eigene Inflationsannahme gibt es
// deshalb nicht: sie würde mit der Rendite nur multipliziert und machte das Ergebnis
// nicht genauer, sondern schwerer zu erklären.
//
// **Die Annahmen sind Eingaben.** Keine Rendite steht hier als Konstante; wer rechnet,
// reicht sie herein, und die Oberfläche zeigt sie neben jedem Ergebnis, das von ihr
// abhängt (`src/core/CLAUDE.md`, „Annahmen sind Eingaben").
//
// **Zinsen sind die eine Stelle im Kern, an der mit Kommazahlen gerechnet wird.** Ein
// Zinsfaktor über dreissig Jahre ist kein Geldbetrag. Herein kommen Integer (Cent,
// Basispunkte, Monate), heraus kommen gerundete Cent; dazwischen bleibt die Kommazahl in
// dieser Datei.

import { monateZwischen } from "../basis/datum";
import type { Cent } from "../basis/geld";

/** Die Annahmen eines Ziels — was der Nutzer einträgt. */
export interface Vorsorgeannahmen {
  /** Ab wann entnommen wird, als Monat („YYYY-MM"). */
  readonly zielMonat: string;
  /** Was im Monat zur Verfügung stehen soll, heutige Kaufkraft. */
  readonly wunschMonatlich: Cent;
  /** Erwartete Renten im Monat, heutige Kaufkraft. */
  readonly renteMonatlich: Cent;
  /** Wie viele Monate das Kapital reichen soll. */
  readonly entnahmeMonate: number;
  /** Rendite über Inflation im Jahr, in Basispunkten (300 = 3,00 %). */
  readonly renditeBp: number;
}

/**
 * Der Zins eines Monats zu einer Jahresrendite in Basispunkten.
 *
 * Geometrisch und nicht ein Zwölftel: zwölf Monate zu einem Zwölftel ergäben durch den
 * Zinseszins mehr als die eingetragene Jahresrendite, und die Abweichung wächst über
 * Jahrzehnte zu einem sichtbaren Betrag.
 */
export function monatszins(renditeBp: number): number {
  return Math.pow(1 + renditeBp / 10000, 1 / 12) - 1;
}

/** Was im Monat fehlt, wenn die Rente kommt — nie negativ. */
export function versorgungsluecke(a: Pick<Vorsorgeannahmen, "wunschMonatlich" | "renteMonatlich">): Cent {
  return Math.max(0, a.wunschMonatlich - a.renteMonatlich);
}

/**
 * Was am Zieltag da sein muss, damit `monatlich` über `monate` Monate entnommen werden
 * kann und das Kapital dabei aufgebraucht wird.
 *
 * Das Restkapital verzinst sich während der Entnahme weiter; deshalb ist der Bedarf
 * kleiner als Monate × Betrag. Entnommen wird am Monatsende (nachschüssig) — die
 * vorsichtigere Lesart wäre der Monatsanfang, der Unterschied ist ein Monatszins.
 */
export function kapitalbedarf(monatlich: Cent, monate: number, renditeBp: number): Cent {
  if (monatlich <= 0 || monate <= 0) return 0;
  const i = monatszins(renditeBp);
  if (i === 0) return monatlich * monate;
  return Math.round((monatlich * (1 - Math.pow(1 + i, -monate))) / i);
}

/** Was aus `heute` in `monate` Monaten wird, wenn nichts dazukommt. */
export function hochgerechnet(heute: Cent, monate: number, renditeBp: number): Cent {
  if (monate <= 0) return heute;
  return Math.round(heute * Math.pow(1 + monatszins(renditeBp), monate));
}

/**
 * Was jeden Monat dazukommen muss, damit nach `monate` Monaten `fehlbetrag` zusätzlich
 * da ist.
 *
 * `null`, wenn keine Zeit mehr bleibt und trotzdem etwas fehlt: dann gibt es keine Rate,
 * die das Ziel noch erreicht, und eine Zahl an dieser Stelle wäre eine Behauptung.
 */
export function noetigeSparrate(fehlbetrag: Cent, monate: number, renditeBp: number): Cent | null {
  if (fehlbetrag <= 0) return 0;
  if (monate <= 0) return null;
  const i = monatszins(renditeBp);
  if (i === 0) return Math.ceil(fehlbetrag / monate);
  return Math.ceil((fehlbetrag * i) / (Math.pow(1 + i, monate) - 1));
}

/** Die ganze Kette für ein Ziel, zum Stand von `heute`. */
export interface Vorsorgestand {
  /** Monate von heute bis zum Zielmonat; 0, wenn er erreicht oder vorbei ist. */
  readonly monateBisZiel: number;
  readonly luecke: Cent;
  readonly kapitalbedarf: Cent;
  /** Das heutige Vorsorgevermögen, bis zum Zielmonat verzinst. */
  readonly hochgerechnet: Cent;
  /** Bedarf minus Hochgerechnetes, nie negativ. */
  readonly fehlbetrag: Cent;
  /** Die Rate, die das Ziel verlangt — `null`, wenn es nicht mehr erreichbar ist. */
  readonly sparrate: Cent | null;
  /**
   * Wie weit das Hochgerechnete den Bedarf deckt, 0 bis 1 — und 1 auch ohne Bedarf: wer
   * nichts braucht, ist am Ziel.
   */
  readonly deckung: number;
}

export function vorsorgestand(a: Vorsorgeannahmen, vermoegenHeute: Cent, heute: string): Vorsorgestand {
  const monateBisZiel = Math.max(0, monateZwischen(heute, `${a.zielMonat}-01`));
  const luecke = versorgungsluecke(a);
  const bedarf = kapitalbedarf(luecke, a.entnahmeMonate, a.renditeBp);
  const hoch = hochgerechnet(Math.max(0, vermoegenHeute), monateBisZiel, a.renditeBp);
  const fehlbetrag = Math.max(0, bedarf - hoch);
  return {
    monateBisZiel,
    luecke,
    kapitalbedarf: bedarf,
    hochgerechnet: hoch,
    fehlbetrag,
    sparrate: noetigeSparrate(fehlbetrag, monateBisZiel, a.renditeBp),
    deckung: bedarf > 0 ? Math.min(1, hoch / bedarf) : 1,
  };
}

// ---------------------------------------------------------------- Entnahme
//
// Dieselbe Rechnung in Gegenrichtung: nicht „was brauche ich", sondern „was trägt, was
// da ist".

/** Was `kapital` über `monate` Monate im Monat hergibt, bis es aufgebraucht ist. */
export function moeglicheEntnahme(kapital: Cent, monate: number, renditeBp: number): Cent {
  if (kapital <= 0 || monate <= 0) return 0;
  const i = monatszins(renditeBp);
  if (i === 0) return Math.floor(kapital / monate);
  return Math.floor((kapital * i) / (1 - Math.pow(1 + i, -monate)));
}

/**
 * Wie viele volle Monate `kapital` eine Entnahme von `monatlich` trägt.
 *
 * `null` heisst: unbegrenzt. Das ist der Fall, in dem die Entnahme den Zins nicht
 * übersteigt — das Kapital wird dann nie kleiner.
 */
export function reichweiteMonate(kapital: Cent, monatlich: Cent, renditeBp: number): number | null {
  if (monatlich <= 0) return null;
  if (kapital <= 0) return 0;
  const i = monatszins(renditeBp);
  if (i === 0) return Math.floor(kapital / monatlich);
  if (monatlich <= kapital * i) return null;
  return Math.floor(-Math.log(1 - (kapital * i) / monatlich) / Math.log(1 + i));
}
