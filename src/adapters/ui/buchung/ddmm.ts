// Tag und Monat, mehr nicht — für Listen, in denen das Jahr aus dem Zusammenhang folgt.
//
// Eine eigene Datei für vier Zeilen, weil sie seit dem Entzerren von `BuchungDetail.tsx`
// (2026-08-25) an drei Stellen im Bereich gebraucht wird und keine davon der natürliche
// Besitzer ist. Der Weg über einen Import aus `BuchungDetail` wäre kürzer gewesen und
// hätte einen Ring gebaut: die Dialoge hängen an der Maske, die Maske an den Dialogen.
//
// KEIN Baustein: `bausteine/` ist für das, was zwei oder mehr BEREICHE benutzen (siehe
// `bausteine/CLAUDE.md`). Das hier benutzt einer.
//
// Nicht zu verwechseln mit `ddmmyyyy` im Import-Bereich: dort steht eine Zeile ohne
// Zusammenhang, aus dem sich das Jahr ergäbe, und ohne Jahr wäre sie zweideutig.

/** `2026-08-14` → `14.08.` */
export function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}
