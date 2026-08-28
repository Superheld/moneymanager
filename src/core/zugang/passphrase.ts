// Was als Passphrase durchgeht.
//
// **Länge statt Zeichenklassen.** Vorschriften wie „ein Grossbuchstabe, eine Ziffer, ein
// Sonderzeichen" erzeugen zuverlässig `Passwort1!` — sie erhöhen den Aufwand fürs Raten
// kaum und den fürs Merken erheblich. Länge tut das Gegenteil: eine Folge aus vier
// gewöhnlichen Wörtern ist leichter zu behalten und schwerer zu raten als jedes
// Kunstwort mit Sonderzeichen.
//
// Zwölf Zeichen sind die Untergrenze, nicht die Empfehlung. Sie stehen hier, damit
// niemand aus Versehen `1234` eintippt — nicht, um jemanden zu erziehen.

/** Die Untergrenze. Kein Maximum: eine lange Passphrase ist genau das, was man will. */
export const MINDESTLAENGE = 12;

export type Passphrasebefund =
  | { taugt: true }
  | { taugt: false; grund: "zuKurz"; fehlt: number }
  | { taugt: false; grund: "nurLeerzeichen" };

/**
 * Taugt diese Passphrase?
 *
 * Geprüft wird an der Zeichenzahl, nicht an Bytes: für jemanden, der „Straßenbahn"
 * tippt, ist das ein Wort und keine Frage der Kodierung. Führende und folgende
 * Leerzeichen zählen dabei mit — sie sind Teil der Passphrase und werden NICHT
 * abgeschnitten, sonst passt sie beim nächsten Mal nicht mehr.
 */
export function passphrasePruefen(passphrase: string): Passphrasebefund {
  if (passphrase.trim().length === 0) return { taugt: false, grund: "nurLeerzeichen" };

  const laenge = [...passphrase].length;
  if (laenge < MINDESTLAENGE) {
    return { taugt: false, grund: "zuKurz", fehlt: MINDESTLAENGE - laenge };
  }
  return { taugt: true };
}
