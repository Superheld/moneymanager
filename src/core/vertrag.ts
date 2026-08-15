// Vertrag — Stammdaten einer wiederkehrenden Zahlung (KONZEPT §3.3): Konditionen
// und Fristen. Die Zahlungsseite (Betrag/Rhythmus) lebt NICHT hier, sondern in der
// abgeleiteten Zahlungsregel (Planung) — zwei Kontexte, verknüpft über vertragId.
// Umfasst auch Einnahmen (Charakter Ertrag der Regel) und Versicherungen.

import { addMonate, ord, parseIso, tageBis, toIso } from "./datum";

export type Verlaengerungsart = "keine" | "automatisch";
export type Vertragsstatus = "aktiv" | "gekuendigt" | "beendet";

export interface Vertrag {
  readonly id: string;
  readonly anbieter: string;
  readonly vertragsnummer?: string;
  readonly inhaberId?: string;
  readonly beginn: string; // ISO „YYYY-MM-DD"
  readonly mindestlaufzeitMonate?: number;
  readonly verlaengerung: Verlaengerungsart;
  /** Verlängerungsschritt in Monaten, wenn verlaengerung = „automatisch". */
  readonly verlaengerungMonate?: number;
  readonly kuendigungsfristMonate?: number;
  readonly status: Vertragsstatus;
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

/** Naht der nächste Kündigungstermin (kuendigenBis innerhalb `warnTage` ab heute)? */
export function kuendigungsterminNaht(v: Vertrag, heute: string, warnTage = 45): boolean {
  const t = naechsterKuendigungstermin(v, heute);
  if (!t) return false;
  const diff = tageBis(heute, t.kuendigenBis);
  return diff >= 0 && diff <= warnTage;
}
