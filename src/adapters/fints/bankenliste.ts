// Nachschlagen in der DK-Bankenliste: BLZ oder Name → FinTS-Endpunkt.
//
// Die Liste liegt NICHT im Quelltext, sondern wird lokal aus der DK-CSV erzeugt
// (`npm run bankenliste`) und landet als `public/bankenliste.json` im Bundle. Beides ist
// gitignoriert: die Deutsche Kreditwirtschaft verteilt die Liste an registrierte
// Hersteller, nicht öffentlich.
//
// Deshalb wird sie zur LAUFZEIT geholt und nicht importiert: fehlt die Datei, gibt es
// keine Auswahl und die FinTS-Adresse wird von Hand eingetragen — die App läuft trotzdem.
// Ein statischer Import würde stattdessen den Build abbrechen.

export interface Bankeintrag {
  readonly blz: string;
  readonly name: string;
  readonly ort: string;
  readonly url: string;
  /** FinTS-Version laut Liste, z. B. „FinTS V3.0". */
  readonly version: string;
}

let geladen: Promise<Bankeintrag[]> | null = null;

/** Lädt die Liste einmal. Fehlt sie, ist das Ergebnis leer — kein Fehler. */
export function bankenliste(): Promise<Bankeintrag[]> {
  if (!geladen) {
    geladen = fetch("/bankenliste.json")
      .then((r) => (r.ok ? r.json() : { banken: [] }))
      .then((j: { banken?: Bankeintrag[] }) => j.banken ?? [])
      .catch(() => []);
  }
  return geladen;
}

function normalisiere(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Sucht nach BLZ oder Name/Ort. Ziffern-Eingaben werden als BLZ-Präfix gelesen, alles
 * andere als Textsuche über Institut und Ort.
 *
 * Eine IBAN darf ebenfalls hinein: die BLZ steht darin an Stelle 5–12. Wer die IBAN zur
 * Hand hat, muss sie nicht erst zerlegen.
 */
export function bankenSuchen(alle: readonly Bankeintrag[], eingabe: string, max = 12): Bankeintrag[] {
  const roh = eingabe.trim();
  if (!roh) return [];

  const alsIban = roh.replace(/\s+/g, "").toUpperCase();
  if (/^DE\d{20}$/.test(alsIban)) {
    const blz = alsIban.slice(4, 12);
    return alle.filter((b) => b.blz === blz).slice(0, max);
  }

  const ziffern = roh.replace(/\s+/g, "");
  if (/^\d+$/.test(ziffern)) {
    return alle.filter((b) => b.blz.startsWith(ziffern)).slice(0, max);
  }

  const q = normalisiere(roh);
  const treffer = alle.filter((b) => normalisiere(`${b.name} ${b.ort}`).includes(q));
  // Wer vorn beginnt, ist der wahrscheinlichere Treffer — „Sparkasse" soll nicht mit
  // „Kreissparkasse …" anfangen.
  treffer.sort((a, b) => {
    const av = normalisiere(a.name).startsWith(q) ? 0 : 1;
    const bv = normalisiere(b.name).startsWith(q) ? 0 : 1;
    return av - bv || a.name.localeCompare(b.name);
  });
  return treffer.slice(0, max);
}
