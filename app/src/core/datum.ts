// Datum-Helfer — Monatsarithmetik auf ISO-Datumsstrings „YYYY-MM-DD", ohne
// Zeitzonen-Fallen. Reine Funktionen; geteilt von Projektion und Kündigungslogik.

export interface Ymd {
  y: number;
  m: number; // 1–12
  d: number; // 1–31
}

export function parseIso(iso: string): Ymd {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function tageImMonat(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Addiert n Monate; klemmt den Tag auf den letzten gültigen Tag des Zielmonats. */
export function addMonate(ymd: Ymd, n: number): Ymd {
  const gesamt = ymd.y * 12 + (ymd.m - 1) + n;
  const y = Math.floor(gesamt / 12);
  const m = (gesamt % 12) + 1;
  const d = Math.min(ymd.d, tageImMonat(y, m));
  return { y, m, d };
}

/** Vergleichbarer Schlüssel YYYYMMDD für Datumsordnung. */
export function ord(ymd: Ymd): number {
  return ymd.y * 10000 + ymd.m * 100 + ymd.d;
}

export function toIso(ymd: Ymd): string {
  const mm = String(ymd.m).padStart(2, "0");
  const dd = String(ymd.d).padStart(2, "0");
  return `${ymd.y}-${mm}-${dd}`;
}

/** Monatsindex relativ zu einem Startdatum (0 = Startmonat). */
export function monatsIndex(start: Ymd, jahr: number, monat: number): number {
  return jahr * 12 + (monat - 1) - (start.y * 12 + (start.m - 1));
}

/** Volle Monate von `vonIso` bis `bisIso` (kann negativ sein). */
export function monateZwischen(vonIso: string, bisIso: string): number {
  const a = parseIso(vonIso);
  const b = parseIso(bisIso);
  return b.y * 12 + (b.m - 1) - (a.y * 12 + (a.m - 1));
}

/** Tage von `vonIso` bis `bisIso` (positiv, wenn bis in der Zukunft liegt). */
export function tageBis(vonIso: string, bisIso: string): number {
  const a = parseIso(vonIso);
  const b = parseIso(bisIso);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86_400_000);
}
