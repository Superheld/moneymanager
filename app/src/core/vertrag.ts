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
  const heuteO = ord(parseIso(heute));
  const frist = v.kuendigungsfristMonate ?? 0;
  const min = v.mindestlaufzeitMonate ?? 0;
  const verl = v.verlaengerung === "automatisch" ? v.verlaengerungMonate ?? 0 : 0;

  let ende = addMonate(beginn, min);
  for (let k = 0; k < 1200; k++) {
    const kuendigenBis = addMonate(ende, -frist);
    if (ord(kuendigenBis) >= heuteO) {
      return { endeDatum: toIso(ende), kuendigenBis: toIso(kuendigenBis) };
    }
    if (verl <= 0) return null; // keine Verlängerung → kein weiterer Termin
    ende = addMonate(ende, verl);
  }
  return null;
}

/** Naht der nächste Kündigungstermin (kuendigenBis innerhalb `warnTage` ab heute)? */
export function kuendigungsterminNaht(v: Vertrag, heute: string, warnTage = 45): boolean {
  const t = naechsterKuendigungstermin(v, heute);
  if (!t) return false;
  const diff = tageBis(heute, t.kuendigenBis);
  return diff >= 0 && diff <= warnTage;
}
