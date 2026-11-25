// Umbuchungsverträge — die Abmachung mit sich selbst, und wie man sie in den Buchungen
// wiederfindet.
//
// Ein normaler Vertrag wird am EMPFÄNGER erkannt: der Name auf dem Kontoauszug ist der
// Schlüssel, `vertragErkennung` normalisiert ihn und vergleicht. Bei einer Verschiebung
// zwischen zwei eigenen Konten gibt es diesen Schlüssel nicht — dort steht je nach Bank
// die eigene IBAN, der eigene Name oder gar nichts, und aus dem Verwendungszweck etwas
// zu raten hiesse, sich auf einen Text zu verlassen, den niemand füllen muss.
//
// Erkannt wird deshalb an der STRUKTUR, und zwar an dreien zusammen: derselbe WEG (von
// Konto A nach Konto B), derselbe BETRAG und ein TERMIN in der Nähe einer Fälligkeit.
//
// **Bis 2026-11-25 genügte der Weg.** Der Betrag wählte nur unter mehreren Regeln auf
// demselben Weg, der Termin zählte gar nicht. Die Begründung war die erhöhte Sparrate:
// wer von 200 auf 250 geht und die Regel nicht nachzieht, solle eine erkannte Umbuchung
// mit Abweichung sehen. Sie übersah den häufigeren Fall — zwischen zwei eigenen Konten
// wird auch OHNE Vertrag verschoben, mal dies, mal das, und jede dieser Buchungen
// landete beim Vertrag, nur weil sie denselben Weg nahm. Der Vertrag zeigte dann ein Ist,
// das mit ihm nichts zu tun hatte.
//
// Was auf dem Weg liegt und nur UNGEFÄHR passt (die erhöhte Sparrate, der verschobene
// Termin), wird seither vorgeschlagen statt zugeordnet (`zuordnungsvorschlag.ts`) — der
// Fall von damals ist damit nicht verloren, er verlangt nur einen Klick.

import type { Zahlungsspur } from "../buchung/zahlungsspur";
import type { Zahlungsregel } from "../basis/zahlungsregel";
import { naechstgelegeneFaelligkeit } from "./faelligkeit";

/**
 * Wie viele Tage eine Umbuchung von der Fälligkeit entfernt sein darf, um von selbst
 * zum Vertrag zu zählen.
 *
 * Fünf: ein Dauerauftrag rutscht über ein Wochenende mit Feiertag, und das ankommende
 * Bein wird bei einer anderen Bank einen oder zwei Tage später gebucht. Mehr wäre bei
 * monatlichem Takt bald der halbe Monat, und der Termin sagte nichts mehr.
 */
export const UMBUCHUNG_TAGE = 5;

/** Eine Zahlungsregel, die eine Verschiebung zwischen zwei eigenen Konten beschreibt. */
export function istUmbuchungsregel(r: Zahlungsregel): boolean {
  return r.charakter === "Umschichtung" && !!r.kontoId && !!r.gegenkontoId;
}

/**
 * Die Regel, zu der diese Buchung gehört — oder `undefined`.
 *
 * Nur das ABGEHENDE Bein zählt. Eine Umbuchung steht mit zwei Zeilen im Bestand, und
 * beide dem Vertrag zuzuordnen hiesse, seine Ist-Summe zu verdoppeln: einmal −200,
 * einmal +200, in Summe null, obwohl 200 geflossen sind. Das abgehende Bein ist dabei
 * das richtige, weil die Regel es beschreibt — sie sagt, was das Konto VERLÄSST.
 *
 * Passen muss dreierlei:
 *
 *   • der **Weg** — Konto und Gegenkonto wie in der Regel;
 *   • der **Betrag** — genau der der Regel. Keine Spanne: ein Dauerauftrag überweist
 *     jedes Mal dasselbe, und eine Spanne finge genau die Einzelumbuchungen wieder ein,
 *     die hier draussen bleiben sollen;
 *   • der **Termin** — höchstens `UMBUCHUNG_TAGE` von einer Fälligkeit entfernt, und
 *     diese Fälligkeit liegt nicht nach dem Ende des Vertrags.
 *     Der Takt gilt auch RÜCKWÄRTS vor die erste Fälligkeit: ein Vertrag, der erst
 *     erfasst wird, wenn der Dauerauftrag längst läuft, findet die Umbuchungen davor.
 *
 * Erfüllen mehrere Regeln alle drei (zwei Daueraufträge gleichen Betrags auf demselben
 * Weg), gewinnt die mit der näheren Fälligkeit.
 */
export function umbuchungsregelFuer(
  regeln: readonly Zahlungsregel[],
  spur: Zahlungsspur,
): Zahlungsregel | undefined {
  if (spur.charakter !== "Umschichtung") return undefined;
  if (spur.betrag >= 0) return undefined;
  if (!spur.kontoId || !spur.gegenkontoId) return undefined;

  let beste: { regel: Zahlungsregel; tage: number } | undefined;
  for (const r of regeln) {
    if (!istUmbuchungsregel(r)) continue;
    if (r.kontoId !== spur.kontoId || r.gegenkontoId !== spur.gegenkontoId) continue;
    if (Math.abs(r.betrag) !== Math.abs(spur.betrag)) continue;
    const { faelligkeit, tage } = naechstgelegeneFaelligkeit(r, spur.datum, true);
    if (Math.abs(tage) > UMBUCHUNG_TAGE) continue;
    if (r.vertragsende && faelligkeit > r.vertragsende) continue;
    if (!beste || Math.abs(tage) < Math.abs(beste.tage)) beste = { regel: r, tage };
  }
  return beste?.regel;
}
