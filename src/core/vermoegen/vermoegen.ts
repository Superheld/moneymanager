// Vermögen — was da ist und was davon schon jemand anderem gehört.
//
// Ein Haushalt besitzt mehr, als auf seinen Konten liegt, und er schuldet mehr, als ein
// Kontoauszug zeigt: ein Haus, ein Fahrzeug, der Rückkaufswert einer Versicherung, ein
// Kredit. Nichts davon hat Buchungen, aus denen sich ein Stand ergäbe. Es hat einen Wert,
// den jemand ab und zu nachsieht.
//
// Deshalb dasselbe Muster wie beim Depot (`../depot/depot.ts`): ein Stammsatz und die
// Reihe seiner BEOBACHTUNGEN zu Stichtagen. Eine Beobachtung wird eingetragen und nie
// neu gerechnet — an DIESEM Tag stand in der Mitteilung DIESER Betrag. Zwischen zwei
// Beobachtungen wird nicht interpoliert: eine Gerade zwischen zwei Jahresauszügen wäre
// eine Behauptung über elf Monate, zu denen niemand etwas gesagt hat.
//
// Die Bezeichner folgen dem Schema (`Vermoegensgegenstand`, `Verbindlichkeit`). In der
// Oberfläche heissen sie „Vermögenswert" und „Schuld" — das entscheidet `i18n.ts`.

import type { Cent } from "../basis/geld";
import { addMonate, parseIso, tageImMonat, toIso } from "../basis/datum";
import type { IstBuchung } from "../buchung/istbuchung";
import type { Depotwert } from "../depot/depot";
import { istSummeBis } from "../konten/kontostand";
import type { Zahlungskonto } from "../konten/konto";

export const VERMOEGENSARTEN = [
  "immobilie",
  "fahrzeug",
  "versicherung",
  "beteiligung",
  "sonstiges",
] as const;
export type Vermoegensart = (typeof VERMOEGENSARTEN)[number];

export const VERBINDLICHKEITSARTEN = [
  "immobilienkredit",
  "ratenkredit",
  "privat",
  "sonstiges",
] as const;
export type Verbindlichkeitsart = (typeof VERBINDLICHKEITSARTEN)[number];

/** Etwas von Wert, das auf keinem Konto liegt. Es hat keinen Saldo, nur Stichtage. */
export interface Vermoegensgegenstand {
  readonly id: string;
  readonly bezeichnung: string;
  readonly art: Vermoegensart;
  /**
   * Wird er noch geführt? **Fehlend heisst JA** — dieselbe Form wie am Konto, und aus
   * demselben Grund: ein fehlender Wert muss die harmlose Aussage sein. Gefragt wird über
   * `wirdGefuehrt`, nie über das Feld direkt.
   */
  readonly aktiv?: boolean;
  /**
   * Das Vorsorgeziel, zu dem er zählt (`../vorsorge/vorsorge.ts`). Fehlt es, zählt er nur
   * zum Nettovermögen: ein Fahrzeug ist Vermögen, aber niemand lebt im Ruhestand davon.
   */
  readonly vorsorgezielId?: string;
}

/** Der Wert eines Gegenstands zu einem Stichtag — eine Beobachtung. */
export interface Vermoegenswert {
  readonly gegenstandId: string;
  readonly stichtag: string;
  readonly wert: Cent;
}

/** Eine Schuld. Auch sie hat keinen Saldo, nur Stichtage. */
export interface Verbindlichkeit {
  readonly id: string;
  readonly bezeichnung: string;
  readonly art: Verbindlichkeitsart;
  /**
   * Der Vertrag, über den die Rate läuft. Gespeichert, aber NICHT verrechnet: die
   * Aufteilung einer Rate in Zins und Tilgung ist ein eigener Schritt.
   */
  readonly vertragId?: string;
  /** Der Vermögenswert, den die Schuld finanziert. Ebenfalls nur ein Verweis. */
  readonly gegenstandId?: string;
  readonly aktiv?: boolean;
}

/**
 * Was zu einem Stichtag noch offen war.
 *
 * `restschuld` ist POSITIV. Das Vorzeichen setzt `nettovermoegen`, an genau einer
 * Stelle — eine Schuld, die mal positiv und mal negativ gespeichert ist, wird irgendwo
 * einmal zu oft gedreht.
 */
export interface Verbindlichkeitsstand {
  readonly verbindlichkeitId: string;
  readonly stichtag: string;
  readonly restschuld: Cent;
}

/** Wird noch geführt — für Gegenstand und Verbindlichkeit dieselbe Frage. */
export function wirdGefuehrt(etwas: { readonly aktiv?: boolean }): boolean {
  return etwas.aktiv !== false;
}

/**
 * Die jüngste Beobachtung, die nicht nach `stichtag` liegt.
 *
 * Über den Stichtag gesucht, nicht über die Reihenfolge der Liste — wie beim Depot. Vor
 * der ersten Beobachtung gibt es KEINEN Wert (`undefined`), auch keinen von null: „ich
 * weiss es nicht" und „es war nichts wert" sind verschiedene Aussagen, und nur die
 * Aufrufstelle kann entscheiden, was sie mit der ersten anfängt.
 *
 * Heisst nicht `wertAm`, obwohl es dasselbe tut: den Namen trägt schon die Depot-Fassung,
 * und die ist auf `Depotwert` festgelegt. Diese hier nimmt jede Reihe mit Stichtag.
 */
export function beobachtungAm<T extends { readonly stichtag: string }>(
  reihe: readonly T[],
  stichtag: string,
): T | undefined {
  let treffer: T | undefined;
  for (const b of reihe) {
    if (b.stichtag > stichtag) continue;
    if (treffer === undefined || b.stichtag > treffer.stichtag) treffer = b;
  }
  return treffer;
}

/** Die jüngste Beobachtung überhaupt. */
export function juengsteBeobachtung<T extends { readonly stichtag: string }>(
  reihe: readonly T[],
): T | undefined {
  let treffer: T | undefined;
  for (const b of reihe) {
    if (treffer === undefined || b.stichtag > treffer.stichtag) treffer = b;
  }
  return treffer;
}

/**
 * Was eine Reihe zum Stichtag beiträgt.
 *
 * Hier steht die Regel zu `aktiv`, und sie ist der Grund für diese Funktion: ein
 * stillgelegter Gegenstand (verkauft, abgezahlt) zählt NACH seiner letzten Beobachtung
 * nicht mehr — bis einschliesslich ihres Stichtags aber schon. Damit fällt er aus dem
 * heutigen Nettovermögen und bleibt im Verlauf stehen, wo er war. Anders als am Konto
 * braucht es dafür keine zweite Angabe: die letzte Beobachtung IST das Ende der
 * Geschichte.
 */
function beitragAm<T extends { readonly stichtag: string }>(
  reihe: readonly T[],
  gefuehrt: boolean,
  stichtag: string,
  betrag: (b: T) => Cent,
): Cent {
  const b = beobachtungAm(reihe, stichtag);
  if (!b) return 0;
  if (!gefuehrt) {
    const letzte = juengsteBeobachtung(reihe);
    if (letzte && stichtag > letzte.stichtag) return 0;
  }
  return betrag(b);
}

/** Alles, woraus sich das Nettovermögen ergibt. */
export interface VermoegensEingabe {
  /** Alle Konten, jede Klasse. Welche zählen, entscheidet der Aufrufer über die Liste. */
  readonly konten: readonly Zahlungskonto[];
  readonly buchungen: readonly IstBuchung[];
  /** Die Wertreihen aller Depots. */
  readonly depotwerte: readonly Depotwert[];
  readonly gegenstaende: readonly Vermoegensgegenstand[];
  readonly werte: readonly Vermoegenswert[];
  readonly verbindlichkeiten: readonly Verbindlichkeit[];
  readonly staende: readonly Verbindlichkeitsstand[];
}

/** Das Nettovermögen zu einem Stichtag, mit seinen vier Teilen. */
export interface Nettovermoegen {
  readonly stichtag: string;
  /** Anfangsbestand plus alle Buchungen bis zum Stichtag, über alle Kontoklassen. */
  readonly konten: Cent;
  /** Je Depot der jüngste Wert bis zum Stichtag. */
  readonly depots: Cent;
  readonly vermoegenswerte: Cent;
  /** Positiv: was noch offen ist. */
  readonly schulden: Cent;
  /** konten + depots + vermoegenswerte − schulden. */
  readonly netto: Cent;
}

function gruppiert<T>(liste: readonly T[], schluessel: (t: T) => string): Map<string, T[]> {
  const raus = new Map<string, T[]>();
  for (const t of liste) {
    const k = schluessel(t);
    const bisher = raus.get(k);
    if (bisher) bisher.push(t);
    else raus.set(k, [t]);
  }
  return raus;
}

/**
 * Das Nettovermögen zum Stichtag.
 *
 * Vier Teile, und jeder folgt der Regel seiner Herkunft:
 *
 *   • KONTEN rechnen sich aus Buchungen (`istSummeBis`, dieselbe Summe wie beim
 *     Kontostands-Anker) — über ALLE Klassen. Die Klasse sagt, wofür Geld da ist; hier
 *     ist die Frage nur, ob es da ist.
 *   • DEPOTS, VERMÖGENSWERTE und SCHULDEN sind Beobachtungen: es gilt die jüngste bis
 *     zum Stichtag. Was noch nie beobachtet wurde, trägt nichts bei.
 *
 * Ein Depot hat kein `aktiv`; es zählt, solange es eine Reihe hat.
 */
export function nettovermoegen(e: VermoegensEingabe, stichtag: string): Nettovermoegen {
  const konten = e.konten.reduce(
    (s, k) => s + k.saldo + istSummeBis(e.buchungen, k.id, stichtag),
    0,
  );

  let depots = 0;
  for (const reihe of gruppiert(e.depotwerte, (w) => w.depotId).values()) {
    depots += beobachtungAm(reihe, stichtag)?.gesamtwert ?? 0;
  }

  const werteJe = gruppiert(e.werte, (w) => w.gegenstandId);
  const vermoegenswerte = e.gegenstaende.reduce(
    (s, g) => s + beitragAm(werteJe.get(g.id) ?? [], wirdGefuehrt(g), stichtag, (w) => w.wert),
    0,
  );

  const staendeJe = gruppiert(e.staende, (s) => s.verbindlichkeitId);
  const schulden = e.verbindlichkeiten.reduce(
    (s, v) =>
      s + beitragAm(staendeJe.get(v.id) ?? [], wirdGefuehrt(v), stichtag, (st) => st.restschuld),
    0,
  );

  return {
    stichtag,
    konten,
    depots,
    vermoegenswerte,
    schulden,
    netto: konten + depots + vermoegenswerte - schulden,
  };
}

/**
 * Das Nettovermögen an jedem Monatsende von `vonIso` bis `bisIso`.
 *
 * Der letzte Punkt liegt auf `bisIso` selbst, wenn der Monat dort noch nicht zu Ende ist:
 * ein Monatsende, das noch kommt, wäre eine Vorhersage, und der Verlauf soll mit der
 * Zahl enden, die `nettovermoegen` für denselben Tag nennt.
 *
 * Jeder Punkt ist ein eigener Aufruf von `nettovermoegen` — keine zweite Rechnung, die
 * von der ersten weglaufen könnte.
 */
export function nettovermoegenVerlauf(
  e: VermoegensEingabe,
  vonIso: string,
  bisIso: string,
): Nettovermoegen[] {
  const von = parseIso(vonIso);
  parseIso(bisIso);
  const reihe: Nettovermoegen[] = [];
  let cursor = { y: von.y, m: von.m, d: 1 };
  for (;;) {
    const ende = toIso({ y: cursor.y, m: cursor.m, d: tageImMonat(cursor.y, cursor.m) });
    if (ende >= bisIso) {
      // Beginnt der Monat erst nach `bis`, gibt es keinen Zeitraum und keinen Punkt.
      if (toIso(cursor) <= bisIso) reihe.push(nettovermoegen(e, bisIso));
      break;
    }
    reihe.push(nettovermoegen(e, ende));
    cursor = addMonate(cursor, 1);
  }
  return reihe;
}

/** Der früheste Stichtag über alle eigenen Beobachtungen — dort beginnt der Verlauf. */
export function ersteBeobachtung(
  werte: readonly Vermoegenswert[],
  staende: readonly Verbindlichkeitsstand[],
): string | undefined {
  let frueh: string | undefined;
  for (const b of [...werte, ...staende]) {
    if (frueh === undefined || b.stichtag < frueh) frueh = b.stichtag;
  }
  return frueh;
}
