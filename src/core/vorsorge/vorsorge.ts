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
import { istVorsorgekonto, type Kontoklasse, type Zahlungskonto } from "../konten/konto";
import {
  nettovermoegen,
  wirdGefuehrt,
  type Nettovermoegen,
  type VermoegensEingabe,
} from "../vermoegen/vermoegen";

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

// ---------------------------------------------------------------- Das Ziel
//
// Bis hierher war alles Rechnung über Zahlen, die jemand hereinreicht. Ab hier steht,
// was davon GESPEICHERT wird und woher das Vermögen kommt, gegen das gerechnet wird.

/**
 * Ein Vorsorgeziel — der Stammsatz. Die Zahlen stehen nicht an ihm, sondern in der Reihe
 * seiner Annahmen (`Vorsorgezielannahme`).
 */
export interface Vorsorgeziel {
  readonly id: string;
  readonly bezeichnung: string;
}

/**
 * Die Annahmen eines Ziels, gültig AB einem Monat.
 *
 * Eine Reihe und kein Satz Spalten am Ziel, aus demselben Grund wie beim Budgetbetrag:
 * wer heute die Rendite senkt, hat damit nichts über das letzte Jahr gesagt. Stünden die
 * Annahmen am Ziel, wäre der Bedarf jedes vergangenen Monats rückwirkend ein anderer.
 */
export interface Vorsorgezielannahme extends Vorsorgeannahmen {
  readonly zielId: string;
  /** „YYYY-MM" — ab diesem Monat gelten sie, bis die nächste Zeile beginnt. */
  readonly abMonat: string;
}

/**
 * Die Annahmen, die in `monat` gelten: die jüngste Zeile, die nicht nach ihm beginnt.
 *
 * Vor der ersten Zeile gilt KEINE — auch nicht die erste rückwirkend. Ein Ziel, das im
 * März angelegt wurde, hat im Januar nichts verlangt.
 */
export function annahmeIm<T extends { readonly abMonat: string }>(
  reihe: readonly T[],
  monat: string,
): T | undefined {
  let treffer: T | undefined;
  for (const a of reihe) {
    if (a.abMonat > monat) continue;
    if (treffer === undefined || a.abMonat > treffer.abMonat) treffer = a;
  }
  return treffer;
}

/** Der Teil des Bestands, über den die Vorsorge rechnet — Schulden gehören nicht dazu. */
export type Vorsorgebestand = Pick<
  VermoegensEingabe,
  "konten" | "buchungen" | "depots" | "depotwerte" | "gegenstaende" | "werte"
>;

/**
 * Was zum Stichtag für das Ziel da ist.
 *
 * Drei Quellen, und keine davon wird hier neu gerechnet — es ist `nettovermoegen` über
 * eine engere Auswahl, damit die Zahl nie von der im Bereich Vermögen weglaufen kann:
 *
 *   • KONTEN der Klassen Vorsorge und Investment (`istVorsorgekonto`, dieselbe Grenze,
 *     nach der die Ergebnisrechnung eine Umbuchung als Vorsorge zählt). Das gilt auch
 *     für das Verrechnungskonto eines Depots: es zählt über seine Klasse, nicht über das
 *     Depot. Eine zweite Regel daneben („weil es am Depot hängt") hiesse, dass ein Konto
 *     an einer Stelle zählt und an einer anderen nicht.
 *   • die DEPOTS, die dem Ziel zugeordnet sind (seit Migration 83; davor alle),
 *   • die VERMÖGENSWERTE, die dem Ziel zugeordnet sind — die Versicherung mit
 *     Rückkaufswert ja, das Auto nein. Beides kann nur der Nutzer wissen.
 *
 * Jedes Konto steht in `konten` höchstens einmal, auch wenn es das Verrechnungskonto
 * mehrerer Depots ist — doppelt zählen kann es deshalb nicht.
 *
 * Schulden werden NICHT abgezogen. Ein Kredit mindert das Nettovermögen, aber nicht das,
 * was im Ruhestand entnommen werden kann — es sei denn, er läuft dann noch, und das
 * gehört in den Wunschbetrag.
 */
export function vorsorgevermoegen(e: Vorsorgebestand, zielId: string, stichtag: string): Nettovermoegen {
  const depots = new Set(e.depots.filter((d) => d.vorsorgezielId === zielId).map((d) => d.id));
  return nettovermoegen(
    {
      konten: e.konten.filter(istVorsorgekonto),
      buchungen: e.buchungen,
      depots: e.depots.filter((d) => depots.has(d.id)),
      depotwerte: e.depotwerte.filter((w) => depots.has(w.depotId)),
      gegenstaende: e.gegenstaende.filter((g) => g.vorsorgezielId === zielId),
      werte: e.werte,
      verbindlichkeiten: [],
      staende: [],
    },
    stichtag,
  );
}

/** Das Verrechnungskonto unter einem Depot in der Liste der Vorsorge. */
export interface Verrechnungskontoposten {
  readonly id: string;
  readonly bezeichnung: string;
  /** Seine Klasse — die Oberfläche nennt sie, wenn das Konto nicht mitzählt. */
  readonly klasse: Kontoklasse;
  /** Sein Stand zum Stichtag — ob er mitzählt, sagt `zaehlt`. */
  readonly betrag: Cent;
  /** Zählt es zur Vorsorge? Über seine Klasse (`istVorsorgekonto`), keine eigene Regel. */
  readonly zaehlt: boolean;
}

/** Eine Zeile in der Liste dessen, was für das Ziel da ist. */
export interface Vorsorgeposten {
  readonly art: "depot" | "konto" | "vermoegenswert";
  readonly id: string;
  readonly bezeichnung: string;
  /** Was der Posten zum Stichtag beiträgt. */
  readonly betrag: Cent;
  /** Nur am Depot: sein Verrechnungskonto, wenn eines gewählt ist und es das Konto gibt. */
  readonly verrechnungskonto?: Verrechnungskontoposten;
}

/**
 * Woraus `vorsorgevermoegen` besteht, Posten für Posten — damit die Karte zeigen kann,
 * WAS zählt, und nicht nur wie viel.
 *
 * Jeder Betrag ist ein eigener Aufruf von `nettovermoegen` über genau diesen einen Posten;
 * die Liste kann deshalb nicht von der Summe weglaufen: Σ `betrag` plus Σ der
 * Verrechnungskonten, die zählen, ist `vorsorgevermoegen(…).netto`.
 *
 * Ein Konto steht EINMAL in der Liste. Ist es das Verrechnungskonto eines Depots, das
 * zählt, steht es unter dem ersten solchen Depot — sonst, wenn seine Klasse es zur
 * Vorsorge stellt, für sich. Ein Verrechnungskonto, dessen Klasse nicht zählt, steht unter
 * seinem Depot mit `zaehlt: false`: es fehlt in der Summe, und die Oberfläche sagt warum.
 */
export function vorsorgeposten(e: Vorsorgebestand, zielId: string, stichtag: string): Vorsorgeposten[] {
  const leer: VermoegensEingabe = {
    konten: [], buchungen: e.buchungen, depots: [], depotwerte: [], gegenstaende: [], werte: [],
    verbindlichkeiten: [], staende: [],
  };
  const kontostand = (k: Zahlungskonto) => nettovermoegen({ ...leer, konten: [k] }, stichtag).netto;
  const kontoNach = new Map(e.konten.map((k) => [k.id, k]));

  const posten: Vorsorgeposten[] = [];
  const untergebracht = new Set<string>();
  for (const d of e.depots) {
    if (d.vorsorgezielId !== zielId) continue;
    const betrag = nettovermoegen(
      { ...leer, depots: [d], depotwerte: e.depotwerte.filter((w) => w.depotId === d.id) },
      stichtag,
    ).netto;
    const konto = d.verrechnungskontoId ? kontoNach.get(d.verrechnungskontoId) : undefined;
    // Ein zweites Depot mit demselben Verrechnungskonto zeigt es nicht noch einmal —
    // sonst ginge die Liste nicht mehr auf die Summe auf.
    const verrechnungskonto =
      konto && !untergebracht.has(konto.id)
        ? {
            id: konto.id,
            bezeichnung: konto.bezeichnung,
            klasse: konto.klasse,
            betrag: kontostand(konto),
            zaehlt: istVorsorgekonto(konto),
          }
        : undefined;
    if (verrechnungskonto) untergebracht.add(verrechnungskonto.id);
    posten.push({ art: "depot", id: d.id, bezeichnung: d.bezeichnung, betrag, verrechnungskonto });
  }
  for (const k of e.konten) {
    if (!istVorsorgekonto(k) || untergebracht.has(k.id)) continue;
    posten.push({ art: "konto", id: k.id, bezeichnung: k.bezeichnung, betrag: kontostand(k) });
  }
  for (const g of e.gegenstaende) {
    if (g.vorsorgezielId !== zielId) continue;
    const betrag = nettovermoegen({ ...leer, gegenstaende: [g], werte: e.werte }, stichtag).netto;
    // Was verkauft ist und nichts mehr beiträgt, ist kein Posten mehr; die Summe sieht es
    // genauso.
    if (!wirdGefuehrt(g) && betrag === 0) continue;
    posten.push({ art: "vermoegenswert", id: g.id, bezeichnung: g.bezeichnung, betrag });
  }
  return posten;
}
