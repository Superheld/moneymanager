// Eine Zahlung, mehrere Belege — und die Regeln, welcher davon je Feld gilt.
//
// **Warum es das gibt.** Bis zum 06.09.2026 wurde eine wiedererkannte Zahlung nicht
// gespeichert: `ergaenzen` trug fehlende Felder in die vorhandene Zeile nach, die
// eingehende verschwand. Wer erst aus einer Fremdsoftware importiert und danach dieselben
// Monate bei der Bank abruft, verlor damit die Bankfassung — unwiederbringlich, denn ein
// Institut haelt Umsaetze nur begrenzt vor.
//
// Der Wechsel dahinter ist ein Satz: **der Vorrang wandert vom Schreiben zum Lesen.**
// Niemand ueberschreibt mehr etwas, jeder Beleg bleibt so stehen, wie seine Quelle ihn
// geliefert hat. Welcher Wert gilt, entscheidet sich hier — bei jedem Lesen neu, aus
// Regeln, die man an einer Stelle aendern kann.
//
// Der Nebengewinn ist die Zusicherung aus dem GoBD-Abschnitt der CLAUDE.md: „`umsatz_roh`
// wird nach dem Anlegen nicht mehr beschrieben." Sie wird damit STRENGER als vorher — die
// Ausnahme `ergaenzen` faellt ersatzlos weg.
//
// Etablierte Begriffe fuer das, was hier passiert: `umsatz_roh` ist eine Staging-Tabelle,
// das Ergebnis dieser Datei ein Golden Record, die Regeln unten sind Survivorship-Regeln.

import { ABRUF_QUELLEN } from "./importLauf";
import type { Umsatz } from "./umsatz";

/**
 * Was am BELEG steht — alles ohne Verarbeitungsstand.
 *
 * `zahlungskontoId`, `status`, `vorschlag` und `istbuchungId` gehoeren der Verarbeitung
 * und damit der Zahlung, nicht dem einzelnen Beleg: sie stehen in `umsatz_verarbeitung`
 * und werden hier nie zusammengefuehrt.
 */
export type Belegfelder = Omit<
  Umsatz,
  "zahlungskontoId" | "status" | "vorschlag" | "istbuchungId" | "belege"
>;

/** Ein Beleg samt der Herkunft, aus der sich sein Rang ergibt. */
export interface Beleg extends Belegfelder {
  /** Die Quelle des Laufs — `fints`, `finanzguru`, … */
  readonly quelle: string;
  /** Das Umsatzformat des Laufs, sofern es eines gab: `CAMT` oder `MT940`. */
  readonly format?: string;
  /** Zeitpunkt des Laufs, ISO. Entscheidet bei Gleichrang. */
  readonly zeitpunkt: string;
}

/**
 * Der Rang einer Quelle — kleiner ist staerker.
 *
 * Die Ordnung ist keine Geschmacksfrage: die Bank ist die QUELLE einer Zahlung, eine
 * Fremdsoftware erzaehlt sie nach. Sie normalisiert, kuerzt, haengt Eigenes an und laesst
 * weg, was sie nicht braucht — `zweckCode`, `endempfaenger`, `sammelposten` und die
 * uebrigen strukturierten Angaben hat sie schlicht nicht.
 *
 * CAMT vor MT940, weil CAMT den Empfaengernamen VOLLSTAENDIG traegt: MT940 gibt ihn in
 * Teilfeldern zu 27 Zeichen und schneidet dort ab.
 */
export function rang(b: Pick<Beleg, "quelle" | "format">): number {
  if (!ABRUF_QUELLEN.has(b.quelle)) return 2;
  return b.format === "MT940" ? 1 : 0;
}

/**
 * Die Belege einer Zahlung in der Reihenfolge, in der ihnen geglaubt wird.
 *
 * Bei Gleichrang gewinnt der JUENGERE Lauf — er hat den spaeteren Stand der Quelle
 * gesehen. Bei gleichem Zeitpunkt entscheidet die Id, damit dieselbe Eingabe morgen
 * dieselbe Ausgabe ergibt; welche gewinnt, ist dann beliebig, aber nicht zufaellig.
 */
export function nachRang(belege: readonly Beleg[]): Beleg[] {
  return [...belege].sort(
    (a, b) => rang(a) - rang(b) || b.zeitpunkt.localeCompare(a.zeitpunkt) || a.id.localeCompare(b.id),
  );
}

/**
 * Die formatabhaengige Gruppe — sie wird NIE gemischt.
 *
 * Was in diesen drei Feldern steht, ist nur zusammen mit dem Format des Laufs deutbar:
 * MT940 legt in `umsatzart` den Kurztext aus Teilfeld ?00 ab und in `buchungsschluessel`
 * den numerischen Geschaeftsvorfallcode, CAMT einen Freitext und einen alphabetischen
 * Code, und eine Fremdsoftware ihre eigene Einordnung (Finanzguru schreibt dort seine
 * „Analyse-Umsatzart").
 *
 * Feldweise gefuellt staenden in einer Zahlung drei Vokabulare nebeneinander, ohne dass
 * man ihnen ansieht, welches — und `lauf_id` beantwortete die Frage falsch. Als Gruppe
 * aus EINEM Beleg ist die Deutung wieder eindeutig.
 */
export const FORMATGRUPPE = ["umsatzart", "buchungsschluessel", "bankBuchungscode"] as const;

/** Die Felder, die der namengebende Beleg stellt — siehe `zusammenfuehren`. */
const VOM_ERSTEN = ["id", "laufId", "rohHash"] as const;

/**
 * Was NIE aus einem Beleg kommt, auch wenn es zufaellig an ihm steht.
 *
 * `Belegfelder` schliesst diese Felder auf TYP-Ebene aus, aber `zusammenfuehren` liest
 * zur Laufzeit, was wirklich auf dem Objekt liegt — und wer einen ganzen `Umsatz` als
 * Beleg hereinreicht (die naheliegende Abkuerzung), brachte damit Status, Vorschlag und
 * Verbuchung mit. Ein Beleg mit hoeherem Rang setzte dann den Status der Zahlung zurueck:
 * eine verworfene Zeile stand nach dem naechsten Abruf wieder auf „neu" und kam damit
 * zurueck, obwohl jemand sie ausdruecklich weggeschickt hatte.
 *
 * Die Liste ist die ausfuehrbare Haelfte von `Belegfelder`. Beide gehoeren zusammen
 * geaendert.
 */
const NIE_VOM_BELEG = [
  "zahlungskontoId",
  "status",
  "vorschlag",
  "istbuchungId",
  "belege",
  "quelle",
  "format",
  "zeitpunkt",
] as const;

function hatWert(w: unknown): boolean {
  return w !== undefined && w !== null;
}

/**
 * Aus den Belegen einer Zahlung wird ein Satz Felder.
 *
 * Drei Regeln, mehr braucht es nicht:
 *
 *  1. **Der erste Wert in der Rangfolge gewinnt.** Das deckt alles ab, was die Spec in
 *     drei Gruppen trennt — ob nur eine Quelle das Feld ueberhaupt liefert (`zweckCode`)
 *     oder beide es verschieden vollstaendig tun (`gegenpartei`), laeuft auf dieselbe
 *     Operation hinaus.
 *  2. **Die Formatgruppe kommt geschlossen aus einem Beleg** — siehe `FORMATGRUPPE`.
 *  3. **Id, Lauf und Roh-Hash stellt der NAMENGEBENDE Beleg**, nicht der staerkste. Sie
 *     sagen, woher die Zahlung STAMMT, nicht was in ihr steht: `laufId` gruppiert die
 *     Dublettenanzeige nach Laeufen, und der Hash ist der Schluessel, unter dem die Zeile
 *     seinerzeit gebucht wurde. Wanderten sie mit dem Rang, aenderte ein spaeterer Abruf
 *     rueckwirkend die Herkunft einer Zahlung.
 *
 * Eine LAENGENREGEL fuer den Verwendungszweck gibt es bewusst nicht. Sie ist die
 * naheliegende und die falsche: Finanzguru haengt einen Kartennummern-Block an und waere
 * damit oft der laengste, ohne der genaueste zu sein.
 */
export function zusammenfuehren(belege: readonly Beleg[], zahlungId: string): Belegfelder {
  if (belege.length === 0) throw new Error("Eine Zahlung ohne Beleg gibt es nicht");
  const geordnet = nachRang(belege);
  // Der Beleg, dessen Id die Zahlung traegt. Der Rueckfall greift nur, wenn er fehlt —
  // vorgesehen ist das nicht (er wird nie allein geloescht), aber eine Zahlung ohne
  // Herkunftsangabe waere schlimmer als eine mit einer ersatzweise gewaehlten.
  const namengebend = belege.find((b) => b.id === zahlungId) ?? geordnet[0];

  // Der Beleg, der die Formatgruppe stellt: der staerkste, der ueberhaupt etwas davon
  // traegt. Traegt keiner etwas, bleibt sie leer — nicht zusammengesucht.
  const formatBeleg = geordnet.find((b) => FORMATGRUPPE.some((f) => hatWert(b[f])));

  const raus: Record<string, unknown> = {};
  for (const beleg of geordnet) {
    for (const [feld, wert] of Object.entries(beleg)) {
      if (!hatWert(wert)) continue;
      if ((FORMATGRUPPE as readonly string[]).includes(feld)) continue;
      if ((VOM_ERSTEN as readonly string[]).includes(feld)) continue;
      if ((NIE_VOM_BELEG as readonly string[]).includes(feld)) continue;
      if (feld in raus) continue;
      raus[feld] = wert;
    }
  }
  for (const feld of FORMATGRUPPE) {
    if (formatBeleg && hatWert(formatBeleg[feld])) raus[feld] = formatBeleg[feld];
  }
  for (const feld of VOM_ERSTEN) raus[feld] = namengebend[feld];

  return raus as unknown as Belegfelder;
}

/**
 * Der Inhalt eines Belegs als vergleichbare Zeichenkette — ohne Id, Lauf und Herkunft.
 *
 * Verglichen wird, was die QUELLE gesagt hat. Dass zwei Lieferungen verschiedene Ids und
 * verschiedene Laeufe haben, ist keine Aussage ueber ihren Inhalt.
 */
function inhalt(b: Partial<Beleg>): string {
  const raus: [string, unknown][] = [];
  for (const [feld, wert] of Object.entries(b)) {
    if (wert === undefined || wert === null) continue;
    if ((NIE_VOM_BELEG as readonly string[]).includes(feld)) continue;
    if (feld === "id" || feld === "laufId" || feld === "rohHash") continue;
    raus.push([feld, wert]);
  }
  raus.sort(([a], [c]) => a.localeCompare(c));
  return JSON.stringify(raus);
}

/**
 * Traegt dieser Beleg etwas, das von seiner Quelle noch nicht dasteht?
 *
 * Das ist die Speichergrenze, und sie fragt nach dem INHALT und nicht nach einem
 * Schluessel. Der Umweg ist noetig, weil `rohHash` nur fuenf Felder abdeckt: wer eine
 * Datei nochmal einliest, nachdem er eine Spalte ergaenzt hat, liefert denselben Hash und
 * trotzdem mehr. Genau dieser Fall — Tabelle erweitern, Datei erneut einlesen — ist der
 * Grund, aus dem es das Ergaenzen ueberhaupt einmal gab.
 *
 * Gegen die Belege DERSELBEN Quelle: dieselbe Zeile von der Bank neben derselben aus einer
 * Fremdsoftware ist zwei Aussagen, nicht eine. Ohne die Einschraenkung fiele die
 * Bankfassung weg, sobald sie zufaellig wortgleich waere — und genau ihretwegen gibt es
 * mehrere Belege.
 */
export function traegtNeues(
  vorhandene: readonly Beleg[] | undefined,
  kandidat: Partial<Beleg>,
  quelle: string,
): boolean {
  const meins = inhalt(kandidat);
  return !(vorhandene ?? []).some((b) => b.quelle === quelle && inhalt(b) === meins);
}
