// Selbstaktualisierung — prüfen, ob eine neuere Fassung bereitliegt, und sie einspielen.
//
// **Das ist der erste Netzzugriff, den die App von sich aus macht.** Bisher sprach sie nur
// nach draußen, wenn jemand einen Bankabruf auslöste. Eine Prüfung beim Start ist etwas
// anderes: sie geschieht ungefragt. Deshalb ist sie abschaltbar, und deshalb steht das hier
// oben und nicht in einer Fußnote.
//
// **Ein Fehlschlag ist kein Fehler.** Kein Netz, Endpunkt weg, Antwort kaputt — in allen
// Fällen lautet die Antwort „nichts Neues", nicht „etwas ist schiefgegangen". Ein Haushalt,
// der seine Ausgaben eintragen will, hat mit einer Updater-Fehlermeldung nichts zu tun; sie
// wäre reine Beunruhigung ohne Handlungsmöglichkeit. Was schiefging, steht auf der Konsole.
//
// Beim EINSPIELEN dreht sich das um: dort hat jemand geklickt und wartet auf ein Ergebnis.
// Ein Fehler gehört ihm gesagt, und `einspielen` wirft deshalb weiter.

import type { EinstellungenRepository } from "./ports";

/** Was über eine bereitliegende Fassung bekannt ist. */
export interface Aktualisierung {
  /** Die neue Version, wie der Endpunkt sie nennt (z. B. „0.20.0"). */
  readonly version: string;
  /** Was sich ändert, falls der Endpunkt es mitliefert. */
  readonly hinweis?: string;
  /** Wann sie veröffentlicht wurde (ISO), falls angegeben. */
  readonly erschienen?: string;
}

/**
 * Der Zugang zum Updater. Eine eigene Schnittstelle, damit die Anwendungsschicht das
 * Tauri-Plugin nicht kennt — und damit sich der Ablauf ohne Shell prüfen lässt.
 */
export interface AktualisierungPort {
  /** `null`, wenn nichts bereitliegt. Wirft nur bei Programmierfehlern, nicht bei Netz. */
  pruefen(): Promise<Aktualisierung | null>;
  /** Lädt, installiert und startet neu. Kehrt im Erfolgsfall nicht zurück. */
  einspielen(): Promise<void>;
}

/** Einstellung: ob beim Start geprüft wird. */
export const SCHLUESSEL_AKTUALISIERUNG = "aktualisierungPruefen";

/**
 * Ist die Prüfung erlaubt?
 *
 * Standard ist JA — ein Update, von dem niemand erfährt, ist keines. Abgeschaltet wird
 * ausdrücklich, und nur dann steht `"aus"` in der Einstellung. Ein fehlender Schlüssel
 * heißt „nie entschieden", und das ist etwas anderes als „abgelehnt".
 */
export function pruefungErlaubt(einstellungen: Record<string, string>): boolean {
  return einstellungen[SCHLUESSEL_AKTUALISIERUNG] !== "aus";
}

/** Schaltet die Prüfung beim Start an oder aus. */
export async function pruefungSchalten(
  repo: EinstellungenRepository,
  erlaubt: boolean,
): Promise<void> {
  await repo.schreiben(SCHLUESSEL_AKTUALISIERUNG, erlaubt ? "an" : "aus");
}

/**
 * Prüft, ob etwas bereitliegt — oder gibt `null` zurück, wenn nicht, wenn es nicht geht,
 * oder wenn der Haushalt die Prüfung abgeschaltet hat.
 *
 * Die drei Fälle sind für die Oberfläche derselbe: es erscheint kein Knopf. Sie
 * auseinanderzuhalten hätte nur einen Zweck, wenn man sie verschieden anzeigen wollte —
 * und genau das soll nicht passieren.
 */
export async function aktualisierungPruefen(
  port: AktualisierungPort,
  repo: EinstellungenRepository,
): Promise<Aktualisierung | null> {
  try {
    if (!pruefungErlaubt(await repo.lesen())) return null;
    return await port.pruefen();
  } catch (fehler) {
    // Bewusst verschluckt — siehe Kopf. Sichtbar bleibt es trotzdem, sonst sucht man
    // später eine Prüfung, die nie stattgefunden hat.
    console.warn("Aktualisierungsprüfung nicht möglich:", fehler);
    return null;
  }
}

/**
 * Spielt die bereitliegende Fassung ein und startet neu.
 *
 * Wirft weiter: hier hat jemand geklickt und wartet. Ein stiller Fehlschlag hinterließe
 * einen Knopf, der nichts tut — die schlechteste aller Rückmeldungen.
 */
export async function aktualisierungEinspielen(port: AktualisierungPort): Promise<void> {
  await port.einspielen();
}
