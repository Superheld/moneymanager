// Vertrag — Stammdaten einer wiederkehrenden Zahlung (KONZEPT §3.3): Konditionen
// und Fristen. Die Zahlungsseite (Betrag/Rhythmus) lebt NICHT hier, sondern in der
// abgeleiteten Zahlungsregel (Planung) — zwei Kontexte, verknüpft über vertragId.
// Umfasst auch Einnahmen (Charakter Ertrag der Regel) und Versicherungen.

import { addMonate, ord, parseIso, tageBis, toIso } from "../basis/datum";
import { RHYTHMUS_MONATE, type Zahlungsregel } from "../basis/zahlungsregel";

export type Verlaengerungsart = "keine" | "automatisch";
export type Vertragsstatus = "aktiv" | "gekuendigt" | "beendet";

/**
 * Was für ein Vertrag das ist — und ob es Sinn ergibt, ihn kündigen zu wollen.
 *
 *   • `abo` — der Regelfall: Handy, Streaming, Fitnessstudio, Versicherung. Läuft
 *     weiter, bis man etwas dagegen tut, und genau deshalb warnt die App vor dem
 *     nächsten Kündigungstermin.
 *   • `dauervertrag` — Arbeitsvertrag, Mietvertrag, Kindergeld. Auch eine
 *     wiederkehrende Zahlung mit Fristen, aber niemand sucht hier nach der nächsten
 *     Gelegenheit auszusteigen. Bis 2026-08-19 bekam ein Arbeitsvertrag ohne
 *     Mindestlaufzeit dieselbe Behandlung wie ein Abo — „heute kündbar, bald!" — und
 *     stand damit in der Warnung, die den kündbaren Verträgen gehört.
 *
 * Die Frist bleibt in BEIDEN Fällen sichtbar: bei einem Mietvertrag ist sie eine
 * nützliche Auskunft, nur eben keine Aufforderung.
 */
export type Vertragsart = "abo" | "dauervertrag";

export interface Vertrag {
  readonly id: string;
  readonly anbieter: string;
  readonly vertragsnummer?: string;
  readonly inhaberId?: string;
  readonly beginn: string; // ISO „YYYY-MM-DD"
  readonly mindestlaufzeitMonate?: number;
  readonly verlaengerung: Verlaengerungsart;
  /** Fehlend zählt als `abo` — Bestandsdaten und frisch gebaute Objekte bleiben so gültig. */
  readonly art?: Vertragsart;
  /** Verlängerungsschritt in Monaten, wenn verlaengerung = „automatisch". */
  readonly verlaengerungMonate?: number;
  readonly kuendigungsfristMonate?: number;
  readonly status: Vertragsstatus;
  /**
   * Kategorie der Zahlungen dieses Vertrags.
   *
   * Sie sitzt hier und nicht (nur) an der Zahlungsregel, weil die Vertragszuordnung auf
   * den VERTRAG zeigt: eine Buchung, die zu diesem Vertrag gehört, erbt genau diese
   * Kategorie. Der Weg über die Zahlungsregel wäre eine Ableitung, die es nicht für jeden
   * Vertrag gibt — und damit eine Lücke in der Kategorisierung.
   */
  readonly kategorieId?: string;
  readonly notizen?: string;
}

export interface Kuendigungstermin {
  /** Termin, zu dem der Vertrag endet. */
  readonly endeDatum: string;
  /** Spätester Tag, an dem die Kündigung raus sein muss. */
  readonly kuendigenBis: string;
}

/**
 * Nächster zulässiger Kündigungstermin ab `heute`. Aus Beginn, Mindestlaufzeit,
 * Verlängerungsregel und Frist. Liefert den frühesten Endtermin, für den die
 * Kündigung noch rechtzeitig (kuendigenBis ≥ heute) raus kann. null, wenn der
 * Vertrag nicht aktiv ist oder kein künftiger Termin mehr erreichbar ist.
 */
export function naechsterKuendigungstermin(v: Vertrag, heute: string): Kuendigungstermin | null {
  if (v.status !== "aktiv") return null;
  const beginn = parseIso(v.beginn);
  const heuteDatum = parseIso(heute);
  const heuteO = ord(heuteDatum);
  // Monatsangaben stammen aus Freitextfeldern der UI; nicht-ganzzahlige Werte erzeugten
  // sonst Datumsstrings wie „2026-2.5-15", NaN-Werte liessen den Termin still verschwinden.
  const frist = ganzeMonate(v.kuendigungsfristMonate);
  const min = ganzeMonate(v.mindestlaufzeitMonate);
  const verl = v.verlaengerung === "automatisch" ? ganzeMonate(v.verlaengerungMonate) : 0;

  for (let k = 0; k < 1200; k++) {
    // Jeden Termin aus dem ORIGINALDATUM rechnen, nicht aus dem vorigen Ergebnis.
    // Iteratives addMonate(ende, verl) driftete dauerhaft weg: ein Vertrag ab dem 31.
    // wurde im Februar auf den 28. geklemmt und blieb danach am 28. kleben, statt zum
    // 31./30. zurückzukehren. projektion.ts rechnet aus demselben Grund k·Schritt.
    const ende = addMonate(beginn, min + k * verl);
    const kuendigenBis = addMonate(ende, -frist);
    if (ord(kuendigenBis) >= heuteO) {
      return { endeDatum: toIso(ende), kuendigenBis: toIso(kuendigenBis) };
    }
    if (verl <= 0) {
      // OHNE Mindestlaufzeit und ohne automatische Verlängerung ist der Vertrag jederzeit
      // kündbar — der häufigste Typ überhaupt (monatliches Abo). Vorher bekam genau der
      // NIE einen Termin und wurde von der Kündigungswarnung nie erfasst. Frühestmöglich
      // ist dann: heute kündigen, Ende nach Ablauf der Frist.
      if (min === 0) {
        return { endeDatum: toIso(addMonate(heuteDatum, frist)), kuendigenBis: toIso(heuteDatum) };
      }
      // MIT Mindestlaufzeit, aber verpasster Frist: der Vertrag läuft bis zum Mindestende
      // und endet dort — es gibt keinen weiteren Kündigungstermin.
      return null;
    }
  }
  return null;
}

/** Monatsangabe aus einem Freitextfeld → ganze, nicht-negative Monate. */
function ganzeMonate(wert: number | undefined): number {
  const n = Math.round(Number(wert));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Was eine Zahlung im Monat kostet, obwohl sie nicht monatlich abgeht — der Betrag,
 * den man zurücklegen muss, um bei Fälligkeit nicht ins Minus zu rutschen.
 *
 * Fachlich eine Rückstellung (Oberfläche: „Puffer"): eine bekannte künftige Zahlung,
 * die schon feststeht, aber erst später abfließt. Nur Abflüsse zählen — eine jährliche
 * Einnahme braucht keine Rücklage — und monatliche Zahlungen ebenfalls nicht: die
 * kommen aus dem laufenden Monat.
 *
 * Bewusst der schlichte Anteil (Betrag ÷ Monate im Rhythmus), nicht „Restbetrag bis
 * zur nächsten Fälligkeit": das wäre nur richtig, wenn der Topf bei null anfängt, und
 * schwankte jeden Monat. Gefragt ist die Dauerrate.
 */
export function ruecklageProMonat(regel: Zahlungsregel): number {
  if (regel.betrag >= 0) return 0;
  const monate = RHYTHMUS_MONATE[regel.rhythmus];
  if (monate <= 1) return 0;
  return Math.round(Math.abs(regel.betrag) / monate);
}

/** Summe der monatlichen Rücklagen über mehrere Zahlungsregeln. */
export function ruecklagenbedarf(regeln: readonly Zahlungsregel[]): number {
  return regeln.reduce((s, r) => s + ruecklageProMonat(r), 0);
}

/** Naht der nächste Kündigungstermin (kuendigenBis innerhalb `warnTage` ab heute)? */
export function kuendigungsterminNaht(v: Vertrag, heute: string, warnTage = 45): boolean {
  // Ein Dauervertrag wird nicht „bald kündbar" — die Warnung gehört den Abos. Der Termin
  // selbst bleibt abrufbar (naechsterKuendigungstermin), er ist nur keine Aufforderung.
  if (v.art === "dauervertrag") return false;
  const t = naechsterKuendigungstermin(v, heute);
  if (!t) return false;
  const diff = tageBis(heute, t.kuendigenBis);
  return diff >= 0 && diff <= warnTage;
}
