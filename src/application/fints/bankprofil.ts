// Rechnen mit dem Bankfähigkeitsprofil.
//
// Das Profil selbst ist eine Datenform ohne Verhalten (`abrufPort.ts`); erhoben wird es
// im Adapter, weil nur der die Bibliothek kennt. Was hier steht, sind die Fragen, die
// Abruf und Oberfläche daran stellen — und sie stehen hier statt in der UI, weil sie
// AUSWÄHLEN und RECHNEN.

import type { Bankprofil, Vorfallprofil } from "./abrufPort";

/** Die beiden Wege, auf denen Umsätze kommen. CAMT zuerst, weil wir es zuerst versuchen. */
const UMSATZVORFAELLE = ["HKCAZ", "HKKAZ"] as const;

export function vorfall(profil: Bankprofil, segment: string): Vorfallprofil | undefined {
  return profil.vorfaelle.find((v) => v.segment === segment);
}

export function kannVorfall(profil: Bankprofil, segment: string): boolean {
  return vorfall(profil, segment) !== undefined;
}

/** Ob ein bestimmtes KONTO diesen Vorfall darf — die Bank gibt das je Konto verschieden frei. */
export function kontoKannVorfall(profil: Bankprofil, schluessel: string, segment: string): boolean {
  return (profil.kontoVorfaelle[schluessel] ?? []).includes(segment);
}

/**
 * Wie weit die Bank Umsätze vorhält, in Tagen.
 *
 * Das Maximum über die Formate, nicht das Minimum: die beiden Wege haben verschiedene
 * Speicherzeiträume, und wer 540 Tage über CAMT bekommen kann, soll nicht auf die 90 von
 * MT940 gedeckelt werden. Der Preis ist ein Randfall — CAMT scheitert, MT940 greift, und
 * der ältere Teil des Zeitraums bleibt leer. Das ist sichtbar (leere Tage), während der
 * umgekehrte Fehler unsichtbar wäre (nie geholte Monate).
 *
 * `undefined`, wenn die Bank zu keinem Format etwas gesagt hat. Das heißt „unbekannt",
 * nicht „null" — wer daraus eine Null macht, hat den Abruf abgeschaltet.
 */
export function speicherzeitraumTage(profil: Bankprofil): number | undefined {
  const werte = UMSATZVORFAELLE.map((s) => vorfall(profil, s)?.speicherzeitraumTage).filter(
    (t): t is number => typeof t === "number" && t > 0,
  );
  return werte.length > 0 ? Math.max(...werte) : undefined;
}

/** Was ein Abruf höchstens umfassen kann, aufgeschlüsselt nach Format — für die Anzeige. */
export function speicherzeitraumJeFormat(profil: Bankprofil): { segment: string; tage: number }[] {
  return UMSATZVORFAELLE.flatMap((s) => {
    const tage = vorfall(profil, s)?.speicherzeitraumTage;
    return typeof tage === "number" && tage > 0 ? [{ segment: s, tage }] : [];
  });
}

export interface Abruffenster {
  /** Tage, die tatsächlich geholt werden. */
  readonly tage: number;
  /** true, wenn der Wunsch über das hinausging, was die Bank vorhält. */
  readonly gedeckelt: boolean;
  /** Die Grenze der Bank, sofern sie eine genannt hat. */
  readonly grenze?: number;
}

/**
 * Den gewünschten Zeitraum an dem messen, was die Bank hergibt.
 *
 * Bis hierher lief ein zu großer Wunsch ins Leere: die Bank lieferte einfach weniger, und
 * niemand erfuhr, dass die Grenze erreicht war. Der Unterschied zwischen „in diesen
 * Monaten gab es nichts" und „diese Monate hat die Bank nicht mehr" ist für jede
 * Saldo-Abweichung entscheidend.
 *
 * Ohne Angabe der Bank bleibt der Wunsch stehen — nicht raten, wo nichts gesagt wurde.
 */
export function abruffenster(profil: Bankprofil | undefined, gewuenschtTage: number): Abruffenster {
  const grenze = profil ? speicherzeitraumTage(profil) : undefined;
  if (grenze === undefined) return { tage: gewuenschtTage, gedeckelt: false };
  return grenze < gewuenschtTage
    ? { tage: grenze, gedeckelt: true, grenze }
    : { tage: gewuenschtTage, gedeckelt: false, grenze };
}

/**
 * Wie viele Tage ein ERSTABRUF holen soll.
 *
 * Was die Bank vorhält, sofern sie es sagt — und nicht eine feste Zahl. Ein Institut mit
 * langem Speicherzeitraum gibt beim ersten Abruf mehr als ein Jahr Geschichte her; sie
 * später nachzuholen kostet einen ausdrücklichen Nachholabruf, den niemand auslöst, der
 * nicht weiß, dass er etwas verpasst hat.
 */
export function erstabrufTage(profil: Bankprofil | undefined, vorgabe: number): number {
  const grenze = profil ? speicherzeitraumTage(profil) : undefined;
  return grenze !== undefined ? Math.max(grenze, vorgabe) : vorgabe;
}

/**
 * Ob ein Konto in einem Auftrag mit allen anderen abgefragt werden dürfte.
 *
 * Die Bank meldet das je Umsatzformat. Für uns ist es erst dann nutzbar, wenn BEIDE
 * Wege es erlauben — sonst hinge am Rückfall auf MT940 ein zweiter, anders geschnittener
 * Auftrag.
 */
export function alleKontenAmStueck(profil: Bankprofil): boolean {
  const vorhanden = UMSATZVORFAELLE.map((s) => vorfall(profil, s)).filter(
    (v): v is Vorfallprofil => v !== undefined,
  );
  return vorhanden.length > 0 && vorhanden.every((v) => v.alleKontenAmStueck === true);
}
