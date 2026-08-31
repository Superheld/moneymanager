// Umbuchungsverträge — die Abmachung mit sich selbst, und wie man sie in den Buchungen
// wiederfindet.
//
// Ein normaler Vertrag wird am EMPFÄNGER erkannt: der Name auf dem Kontoauszug ist der
// Schlüssel, `vertragErkennung` normalisiert ihn und vergleicht. Bei einer Verschiebung
// zwischen zwei eigenen Konten gibt es diesen Schlüssel nicht — dort steht je nach Bank
// die eigene IBAN, der eigene Name oder gar nichts, und aus dem Verwendungszweck etwas
// zu raten hiesse, sich auf einen Text zu verlassen, den niemand füllen muss.
//
// Erkannt wird deshalb an der STRUKTUR: derselbe Weg (von Konto A nach Konto B) und eine
// Umschichtung. Das ist eine harte Übereinstimmung und keine Ähnlichkeit — entweder das
// Geld ist diesen Weg gegangen oder nicht.
//
// Der BETRAG entscheidet bewusst NICHT mit, ob es passt, sondern nur, WELCHE Regel es
// ist, wenn mehrere denselben Weg beschreiben. Wer seine Sparrate von 200 auf 250 erhöht
// und die Regel nicht nachzieht, hat weiterhin eine erkannte Umbuchung mit einer
// Abweichung — und genau die soll man sehen. Mit einer Betragsschwelle wäre sie
// stattdessen gar nicht erkannt, und die Zeile stünde als „offen" da, während daneben
// eine unerklärte Umschichtung liegt.

import type { Zahlungsspur } from "../buchung/zahlungsspur";
import type { Zahlungsregel } from "../basis/zahlungsregel";

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
 */
export function umbuchungsregelFuer(
  regeln: readonly Zahlungsregel[],
  spur: Zahlungsspur,
): Zahlungsregel | undefined {
  if (spur.charakter !== "Umschichtung") return undefined;
  if (spur.betrag >= 0) return undefined;
  if (!spur.kontoId || !spur.gegenkontoId) return undefined;

  const passend = regeln.filter(
    (r) => istUmbuchungsregel(r) && r.kontoId === spur.kontoId && r.gegenkontoId === spur.gegenkontoId,
  );
  if (passend.length === 0) return undefined;
  if (passend.length === 1) return passend[0];

  // Mehrere Regeln auf demselben Weg: die mit dem nächstliegenden Betrag gewinnt. Das
  // ist eine Auswahl unter Passenden, keine Prüfung auf Passung — siehe Kopf.
  return passend.reduce((beste, r) =>
    Math.abs(Math.abs(r.betrag) - Math.abs(spur.betrag)) <
    Math.abs(Math.abs(beste.betrag) - Math.abs(spur.betrag))
      ? r
      : beste,
  );
}
