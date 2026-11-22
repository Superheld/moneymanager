// Der Wertverlust eines Gegenstands, den eine Rücklage ersetzen soll — nur zum ANZEIGEN.
//
// Der Fall: ein Fernseher, vor zwei Jahren gekauft, hält fünf Jahre. Die Rücklage dafür
// wurde erst später angelegt, ihr Stand beginnt bei null. Daneben soll stehen, wie viel
// der Fernseher bis heute an Wert verloren hat — das ist, was die Rücklage ausgleichen
// soll, und ihr Stand allein sagt das nicht.
//
// **Gerechnet wird damit nichts anderes.** Stand, Raten, Kosten, Ergebnis und
// Kontobelegung lesen `Ruecklage.kauf` nicht; die Umstellungsprobe hält das fest.
//
// **Linear und auf null**, mehr nicht: vom Kaufdatum bis Kaufdatum + Nutzungsdauer steigt
// der Wertverlust gleichmässig von 0 auf den Kaufpreis. Ein Restwert, eine schnellere
// Abnutzung am Anfang oder ein Wiederverkaufswert wären Annahmen, die niemand getroffen
// hat.
//
// **In ganzen Monaten**: der Wertverlust wächst mit jedem vollen Monat seit dem Kauf um
// Kaufpreis ÷ Nutzungsdauer. So steht nach genau zwei von fünf Jahren genau zwei Fünftel
// da, und eine Zahl, die jeden Tag um ein paar Cent springt, sagte nicht mehr.

import { parseIso, tageImMonat } from "../basis/datum";
import type { Cent } from "../basis/geld";
import type { Kaufangabe } from "./ruecklage";

/** Wie viele VOLLE Monate von `von` bis `bis` vergangen sind; 0, wenn `bis` davor liegt. */
function volleMonate(von: string, bis: string): number {
  if (bis < von) return 0;
  const a = parseIso(von);
  const b = parseIso(bis);
  const monate = (b.y - a.y) * 12 + (b.m - a.m);
  // Ein Monat ist voll, wenn der Tag des Kaufs erreicht ist. Endet der Monat früher (Kauf am
  // 31., dann Februar), gilt sein letzter Tag — wie `addMonate`.
  const voll = b.d >= Math.min(a.d, tageImMonat(b.y, b.m));
  return Math.max(0, voll ? monate : monate - 1);
}

/**
 * Der Wertverlust am Tag `am`, positiv, in Cent: Kaufpreis × volle Monate seit dem Kauf ÷
 * Nutzungsdauer, nie mehr als der Kaufpreis, vor dem Kauf 0.
 *
 * Beispiel: Kaufpreis 120000 Cent am 15.03.2024, 60 Monate → am 15.03.2026 (24 volle
 * Monate) zwei Fünftel, 48000 Cent.
 */
export function wertverlustAm(kauf: Kaufangabe, am: string): Cent {
  if (!(kauf.nutzungsdauerMonate > 0) || !(kauf.preis > 0)) return 0;
  const monate = Math.min(volleMonate(kauf.datum, am), kauf.nutzungsdauerMonate);
  return Math.round((kauf.preis * monate) / kauf.nutzungsdauerMonate);
}

/** Ein Punkt der Linie im Verlauf: der Wertverlust am Ende eines Monats. */
export interface Wertverlustpunkt {
  readonly monat: string;
  readonly betrag: Cent;
}

/**
 * Der Wertverlust Monat für Monat in [`vonMonat`, `bisMonat`], ab dem Monat des Kaufs —
 * auch vor dem Beginn der Rücklage, denn verloren hat der Gegenstand seit dem Kauf. Je
 * Monat am letzten Tag (wie der Stand am Monatsende im Verlauf), im Monat von `heute` am
 * Tag `heute`, damit der letzte Punkt die Zahl der Liste ist.
 */
export function wertverlustVerlauf(kauf: Kaufangabe, vonMonat: string, bisMonat: string, heute: string): Wertverlustpunkt[] {
  const kaufmonat = kauf.datum.slice(0, 7);
  const raus: Wertverlustpunkt[] = [];
  let { y, m } = parseIso(`${vonMonat > kaufmonat ? vonMonat : kaufmonat}-01`);
  for (let i = 0; i < 1200; i++) {
    const monat = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
    if (monat > bisMonat) break;
    const letzter = `${monat}-${String(tageImMonat(y, m)).padStart(2, "0")}`;
    const am = heute.slice(0, 7) === monat ? heute : letzter;
    raus.push({ monat, betrag: wertverlustAm(kauf, am) });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return raus;
}

/** Was eine Zeile der Liste neben dem Stand zeigt. */
export interface Wertverlust {
  /** Der Wertverlust bis heute, positiv. */
  readonly bisHeute: Cent;
  /** Um wie viel der Stand darunter liegt; 0, wenn er reicht. */
  readonly fehlt: Cent;
}

/** Wertverlust bis `am` und was der Stand davon nicht deckt. */
export function wertverlustNeben(kauf: Kaufangabe, stand: Cent, am: string): Wertverlust {
  const bisHeute = wertverlustAm(kauf, am);
  return { bisHeute, fehlt: Math.max(0, bisHeute - stand) };
}
