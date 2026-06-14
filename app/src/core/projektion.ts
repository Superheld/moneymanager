// Projektion — die Core Domain. Aus Zahlungsregeln entstehen Plan-Zahlungen auf
// einer Zeitachse; daraus wird der Monatsverlauf (netto + laufender Saldo) aggregiert.
// Strikt seiteneffektfrei: kein IO, keine Uhr, kein Zufall → trivial unit-testbar.
// Planbuchungen werden BERECHNET, nicht gespeichert (TAKTIK-PLANUNG §0).

import type { Cent } from "./geld";
import { RHYTHMUS_MONATE, type Charakter, type Zahlungsregel } from "./zahlungsregel";
import { addMonate, monatsIndex, ord, parseIso, toIso } from "./datum";

const MONATSNAMEN = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

/** Eine berechnete Plan-Zahlung (nicht persistiert). */
export interface Planbuchung {
  readonly regelId: string;
  readonly bezeichnung: string;
  readonly datum: string; // ISO
  readonly betrag: Cent;
  readonly charakter: Charakter;
}

/**
 * Projiziert die Fälligkeiten EINER Regel in das Fenster [ab, ab+monate).
 * Beginnt beim Startdatum und schreitet im Rhythmus voran; Fälligkeiten vor
 * dem Fensterstart werden übersprungen (die Regel kann älter sein als das Fenster).
 */
export function projiziereRegel(
  regel: Zahlungsregel,
  ab: string,
  monate: number,
): Planbuchung[] {
  const schritt = RHYTHMUS_MONATE[regel.rhythmus];
  const fensterStart = parseIso(ab);
  const fensterEnde = addMonate(fensterStart, monate); // exklusiv
  const startOrd = ord(fensterStart);
  const endeOrd = ord(fensterEnde);

  // Jede Fälligkeit aus dem Original-Startdatum + k·Schritt berechnen — NICHT
  // iterativ vom zuletzt geklemmten Wert, sonst driftet der Monatstag dauerhaft
  // (z. B. 31. → Feb 28. → würde 28. bleiben statt im März wieder 31. zu sein).
  const start = parseIso(regel.startdatum);
  const buchungen: Planbuchung[] = [];
  for (let k = 0; k < 10000; k++) {
    const faellig = addMonate(start, k * schritt);
    if (ord(faellig) >= endeOrd) break;
    if (ord(faellig) >= startOrd) {
      buchungen.push({
        regelId: regel.id,
        bezeichnung: regel.bezeichnung,
        datum: toIso(faellig),
        betrag: regel.betrag,
        charakter: regel.charakter,
      });
    }
  }
  return buchungen;
}

/** Ein Monat im projizierten Verlauf. */
export interface MonatsVerlauf {
  readonly jahr: number;
  readonly monat: number; // 1–12
  readonly label: string; // z. B. „Jun 26"
  readonly zufluss: Cent;
  readonly abfluss: Cent; // negativ oder 0
  readonly netto: Cent;
  readonly saldo: Cent; // laufender Kontosaldo am Monatsende
  readonly buchungen: Planbuchung[];
}

/**
 * Aggregiert alle Regeln zu einem Monatsverlauf über `monate` ab `ab`.
 * Liefert je Monat Zu-/Abfluss, Netto und den laufenden Saldo (Startsaldo +
 * kumuliertes Netto). Das ist der „projizierte 12-Monats-Verlauf" der DoD.
 */
export function projiziereVerlauf(
  regeln: Zahlungsregel[],
  ab: string,
  monate: number,
  startsaldo: Cent,
): MonatsVerlauf[] {
  const start = parseIso(ab);

  // Leere Monatskörbe vorbereiten.
  const koerbe: MonatsVerlauf[] = [];
  for (let i = 0; i < monate; i++) {
    const ym = addMonate(start, i);
    koerbe.push({
      jahr: ym.y,
      monat: ym.m,
      label: `${MONATSNAMEN[ym.m - 1]} ${String(ym.y).slice(-2)}`,
      zufluss: 0,
      abfluss: 0,
      netto: 0,
      saldo: 0,
      buchungen: [],
    });
  }

  for (const regel of regeln) {
    for (const b of projiziereRegel(regel, ab, monate)) {
      const ymd = parseIso(b.datum);
      const k = koerbe[monatsIndex(start, ymd.y, ymd.m)];
      if (!k) continue;
      k.buchungen.push(b);
      if (b.betrag >= 0) {
        (k as { zufluss: Cent }).zufluss += b.betrag;
      } else {
        (k as { abfluss: Cent }).abfluss += b.betrag;
      }
    }
  }

  let saldo = startsaldo;
  for (const k of koerbe) {
    (k as { netto: Cent }).netto = k.zufluss + k.abfluss;
    saldo += k.netto;
    (k as { saldo: Cent }).saldo = saldo;
  }
  return koerbe;
}
