// Rücklage — was du für etwas zurücklegst, das noch kommt.
//
// Bis 2026-08-31 hieß das „Inventar" und meinte einen GEGENSTAND: Wiederbeschaffungswert
// ÷ Nutzungsdauer ergab die monatliche Rücklage. Die Rechnung ist geblieben, die
// Behauptung ist weg, dass am anderen Ende ein Ding steht — man legt auch für einen
// Urlaub zurück, und der hat keinen Wiederbeschaffungswert.
//
// ZWEI FORMEN, und genau eine davon ist ausgefüllt:
//
//   • MIT ZIEL UND FRIST — „6000 in 96 Monaten". Die Rate ergibt sich, der Soll-Stand
//     ist auf das Ziel gedeckelt, es gibt einen Fortschritt in Prozent, und nach dem
//     Ausbuchen fängt sie von vorn an: was einmal ersetzt werden musste, muss es wieder.
//   • MIT RATE — „50 im Monat, mal sehen". Kein Ziel, kein Deckel, kein Fortschritt —
//     und nach dem Ausbuchen ist sie erledigt.
//
// Die Unterscheidung trägt damit mehr als die Anzeige: an ihr hängt, was nach dem
// Ausbuchen passiert. Ein eigenes Feld „wiederkehrend" wäre daneben eine zweite
// Wahrheit, die der ersten widersprechen kann.
//
// REIN KALKULATORISCH (Entscheidung 2026-08-16, unverändert): Die Rücklage führt kein
// eigenes Sparvehikel. Was tatsächlich zurückgelegt ist, wird nicht gebucht, sondern
// ABGEGLICHEN: die Rücklage nennt das Konto, auf dem das Geld liegt, und der reale Stand
// dieses Kontos wird anteilig auf ALLE verteilt, die darauf Anspruch haben — Rücklagen
// wie aufbauende Budgets (`core/konten/kontobelegung`). Deckung = Wirklichkeit ÷
// Rechnung, ohne Buchungslogik.

import { monateZwischen } from "../basis/datum";
import type { Cent } from "../basis/geld";
import { kontobelegung, type Anspruch } from "../konten/kontobelegung";
import { istRuecklagenkonto, type Zahlungskonto } from "../konten/konto";

export interface Ruecklage {
  readonly id: string;
  readonly bezeichnung: string;
  /** Was am Ende beisammen sein soll. Fehlt bei einer freien Rücklage. */
  readonly ziel?: Cent;
  /** In wie vielen Monaten das Ziel erreicht sein soll. Fehlt bei einer freien Rücklage. */
  readonly fristMonate?: number;
  /** Die Monatsrate — nur bei einer freien Rücklage; sonst folgt sie aus Ziel ÷ Frist. */
  readonly rate?: Cent;
  /** Beginn des LAUFENDEN Zyklus, ISO. Ein Ausbuchen setzt ihn neu. */
  readonly beginn: string;
  readonly kategorieId?: string;
  /** Zahlungskonto, auf dem die Rücklage tatsächlich liegt. Ohne Zuordnung nur Soll. */
  readonly kontoId?: string;
  /**
   * Der Tag, an dem eine FREIE Rücklage ausgebucht wurde. Eine beendete Rücklage wird
   * nicht mehr gelöscht (bis Migration 76 war es so, und ihre Ausbuchung ging per
   * CASCADE mit): sie bleibt stehen, damit dasteht, wofür sie draufging. Das Repository
   * liefert sie in `alle()` nicht mehr aus — für jede laufende Rechnung gibt es sie nicht.
   */
  readonly beendetAm?: string;
}

/**
 * Hat die Rücklage ein Ziel mit Frist?
 *
 * Das ist die Fallunterscheidung dieser Datei, und sie steht als Funktion da, damit sie
 * überall dieselbe ist. Beide Felder werden geprüft und beide auf `> 0`: ein Ziel ohne
 * Frist ließe sich nicht in eine Rate umrechnen, eine Frist von 0 teilte durch null, und
 * aus `Infinity` wird an anderer Stelle stumm `NaN`.
 */
export function hatZiel(r: Ruecklage): boolean {
  return (r.ziel ?? 0) > 0 && (r.fristMonate ?? 0) > 0;
}

/**
 * Monatliche Rücklage — was sie pro Monat kostet, auch wenn nichts fließt.
 *
 * Mit Ziel und Frist die Rechnung, sonst die eingetragene Rate. Die Rückfalllinie auf 0
 * ist kein Zierrat: eine Rücklage ohne beides ist an der Grenze abgewiesen worden, aber
 * eine 0 rechnet sich hier weiter, ein `undefined` fiele durch jede Summe.
 */
export function monatsRuecklage(r: Ruecklage): Cent {
  if (hatZiel(r)) return Math.round((r.ziel as Cent) / (r.fristMonate as number));
  return r.rate ?? 0;
}

/**
 * Soll-Rücklage am Datum `am`: linear ab `beginn`.
 *
 * Mit Ziel anteilig AUS DEM ZIEL gerechnet, nicht als (gerundete Rate × Monate): sonst
 * fehlte am Ende der Frist ein Rest, weil die Rate einmal gerundet und dann vervielfacht
 * wurde (1000 Cent auf 3 Monate → Rate 333 → nach 3 Monaten 999). Die fachliche Zusage
 * lautet, dass am Ende der Frist das Ziel beisammen ist — die hält nur diese Rechnung ein.
 *
 * Ohne Ziel gibt es nichts zu deckeln und nichts aufzuteilen: Rate × Monate, und der
 * Betrag wächst weiter, solange niemand ausbucht. Das ist die richtige Aussage — wer 50
 * im Monat für Ungewisses zurücklegt, hat nach drei Jahren 1800 zurückgelegt.
 */
export function sollRuecklage(r: Ruecklage, am: string): Cent {
  const monate = Math.max(0, monateZwischen(r.beginn, am));
  if (hatZiel(r)) {
    const ziel = r.ziel as Cent;
    return Math.min(Math.round((ziel * monate) / (r.fristMonate as number)), ziel);
  }
  return (r.rate ?? 0) * monate;
}

/**
 * Die Konten, auf denen zurückgelegt wird: jedes der Klasse Rücklage UND jedes, dem eine
 * Rücklage zugeordnet ist — gleich welcher Klasse.
 *
 * Bis 2026-11-09 zählte allein die Klasse. Wer seine Rücklagen auf einem Tagesgeldkonto
 * der Klasse „Sparen" führte, sah dann einen Tacho auf null und keinen einzigen
 * Eingang, obwohl die Zuordnung an jeder Rücklage dastand. Die Zuordnung ist die
 * genauere Aussage — sie ist je Rücklage getroffen, die Klasse nur einmal je Konto.
 */
export function ruecklagenKonten(
  konten: readonly Zahlungskonto[],
  items: readonly Pick<Ruecklage, "kontoId">[],
): Set<string> {
  const ids = new Set(konten.filter(istRuecklagenkonto).map((k) => k.id));
  for (const r of items) if (r.kontoId) ids.add(r.kontoId);
  return ids;
}

/** Summe der monatlichen Rücklagen — der Betrag, der jeden Monat gebunden ist. */
export function monatsRuecklageGesamt(items: readonly Ruecklage[]): Cent {
  return items.reduce((s, r) => s + monatsRuecklage(r), 0);
}

/**
 * Summe der Ziele — was am Ende aller Fristen beisammen sein soll.
 *
 * Freie Rücklagen zählen NICHT mit: sie haben kein Ende, und ihren bis heute
 * aufgelaufenen Soll-Stand hier hineinzurechnen mischte zwei Aussagen („was soll einmal
 * dasein" und „was ist bis jetzt fällig") zu einer Zahl, die keine von beiden ist.
 */
export function zielwertGesamt(items: readonly Ruecklage[]): Cent {
  return items.reduce((s, r) => s + (hatZiel(r) ? (r.ziel as Cent) : 0), 0);
}

export interface RuecklagenPosten {
  readonly ruecklage: Ruecklage;
  /** Was bis `am` zurückgelegt sein sollte. */
  readonly soll: Cent;
  /** Anteil am realen Kontostand; `null` ohne Kontozuordnung (dann nur Rechnung). */
  readonly tatsaechlich: Cent | null;
}

export interface RuecklagenDeckung {
  readonly posten: readonly RuecklagenPosten[];
  readonly soll: Cent;
  /** Nur die Rücklagen MIT Konto — sonst stünde ein Soll ohne Gegenstück im Nenner. */
  readonly sollMitKonto: Cent;
  readonly tatsaechlich: Cent;
  /** 0–100, gedeckelt. 100, wenn nichts zu decken ist. */
  readonly grad: number;
}

/**
 * Die Ansprüche der Rücklagen auf ihre Konten — je Rücklage ihr Soll bis `am`.
 *
 * Eine Rücklage ohne Konto hat keinen: sie ist reine Rechnung, und es gibt keinen Stand,
 * gegen den sie etwas beanspruchen könnte.
 */
export function ruecklagenAnsprueche(items: readonly Ruecklage[], am: string): Anspruch[] {
  return items
    .filter((r) => r.kontoId)
    .map((r) => ({ art: "ruecklage", id: r.id, kontoId: r.kontoId as string, betrag: sollRuecklage(r, am) }));
}

/**
 * Gleicht die Rechnung gegen die Wirklichkeit ab — über die Kontobelegung
 * (`core/konten/kontobelegung`), nicht mit einer eigenen Verteilung.
 *
 * `weitere` sind die Ansprüche, die KEINE Rücklage sind und trotzdem auf denselben Konten
 * liegen — heute die Reste aufbauender Budgets. Ohne sie verteilte die Deckung Geld, das
 * schon jemand anderem gehört, und sähe besser aus, als sie ist.
 *
 * Bewusst KEINE Allokation nach Priorität: liegen auf dem Konto 60 % dessen, was alle
 * Ansprüche zusammen verlangen, dann ist jede Rücklage darauf zu 60 % gedeckt. Alles
 * andere würde eine Reihenfolge behaupten, die es nicht gibt.
 *
 * Überschuss wird gekappt (Grad ≤ 100 %): mehr als ihren Soll-Stand trägt eine Rücklage
 * nicht, auch wenn auf dem Konto mehr liegt.
 */
export function ruecklagenDeckung(
  items: readonly Ruecklage[],
  am: string,
  kontostaende: ReadonlyMap<string, Cent>,
  weitere: readonly Anspruch[] = [],
): RuecklagenDeckung {
  const belegung = kontobelegung(kontostaende, [...ruecklagenAnsprueche(items, am), ...weitere]);
  const gedeckt = new Map<string, Cent>();
  for (const b of belegung.values()) {
    for (const p of b.posten) if (p.art === "ruecklage") gedeckt.set(p.id, p.gedeckt);
  }

  const posten = items.map((r): RuecklagenPosten => ({
    ruecklage: r,
    soll: sollRuecklage(r, am),
    // Ein Soll von 0 ist kein Anspruch und steht deshalb in keiner Belegung — gedeckt ist
    // dann eben 0, nicht „unbekannt".
    tatsaechlich: r.kontoId ? (gedeckt.get(r.id) ?? 0) : null,
  }));

  const sollGesamt = posten.reduce((s, p) => s + p.soll, 0);
  const sollMitKonto = posten.reduce((s, p) => s + (p.tatsaechlich == null ? 0 : p.soll), 0);
  const tatsaechlich = posten.reduce((s, p) => s + (p.tatsaechlich ?? 0), 0);

  return {
    posten,
    soll: sollGesamt,
    sollMitKonto,
    tatsaechlich,
    grad: sollMitKonto > 0 ? Math.round((tatsaechlich / sollMitKonto) * 100) : 100,
  };
}

/**
 * Die Mindestrücklage nach der Faustformel: drei Monatseinnahmen.
 *
 * Keine Regel, aber seit 2026-11-08 ein MASSSTAB: der Bereich Rücklagen zeigt, wie weit
 * der Stand der Rücklagenkonten an sie heranreicht. Bis dahin stand hier „nichts im
 * Programm misst etwas daran". Sie entscheidet trotzdem nichts — keine Warnung, keine
 * Rechnung hängt an ihr; der Tacho zeigt nur, wo man steht. Die Formel
 * ist eine verbreitete Faustregel für den Notgroschen, kein Rechenweg mit einer
 * Herleitung; deshalb steht der Faktor als Argument da und nicht als Konstante im Code.
 *
 * Grundlage sind die VERTRAGSEINNAHMEN und nicht die Ist-Einnahmen: was regelmäßig
 * hereinkommt, ist planbar, ein guter Monat ist es nicht. Wer seine Rücklage an einem
 * Bonus bemisst, hat sie im Jahr darauf zu klein.
 */
export function mindestRuecklage(monatsEinnahmen: Cent, monate = 3): Cent {
  return Math.max(0, Math.round(monatsEinnahmen * monate));
}

// ---------------------------------------------------------------- vergangene Zyklen
//
// Eine Rücklage kennt nur ihren laufenden Zyklus: das Ausbuchen setzt `beginn` neu (mit
// Ziel) oder beendet sie (frei). Was davor galt, wäre damit verloren — und mit ihm die
// Antwort auf zwei Fragen: was hat die Rücklage in einem vergangenen Monat gekostet, und
// war der Kauf vom Angesparten gedeckt? Seit Migration 76 hält die Ausbuchung deshalb
// fest, wie der Zyklus aussah, den sie beendet hat.

/**
 * Ein beendeter Zyklus, so wie die Ausbuchung ihn festgehalten hat.
 *
 * Die `zyklus*`-Felder fehlen bei Ausbuchungen von vor Migration 76. Das heisst
 * „Geschichte unbekannt" und nicht „nichts angespart": gerechnet wird dann wie zuvor —
 * keine Rate für die Monate davor, und der Kauf gilt als gedeckt. Erfunden wird nichts.
 */
export interface Ruecklagenzyklus {
  /** Die ID der Ausbuchung. */
  readonly id: string;
  readonly ruecklageId: string;
  /** Aus der Rücklage mitgelesen; fehlt nur, wenn sie inzwischen gelöscht wäre. */
  readonly bezeichnung?: string;
  readonly kategorieId?: string;
  /** Der Tag des Ausbuchens — das Ende des Zyklus. */
  readonly datum: string;
  /** Die Buchung, mit der gekauft wurde. */
  readonly istbuchungId?: string;
  readonly zyklusBeginn?: string;
  readonly zyklusZiel?: Cent;
  readonly zyklusFrist?: number;
  readonly zyklusRate?: Cent;
}

/** Kennt die Ausbuchung den Zyklus, den sie beendet hat? */
export function hatGeschichte(z: Ruecklagenzyklus): boolean {
  return !!z.zyklusBeginn;
}

/**
 * Was im Zyklus bis `am` angespart sein sollte — nach dem Ausbuchen wächst es nicht mehr.
 *
 * Dieselbe Rechnung wie `sollRuecklage`, auf den festgehaltenen Werten: zwei Formeln für
 * denselben Stand liefen bei der ersten Änderung auseinander.
 */
export function zyklusSoll(z: Ruecklagenzyklus, am: string): Cent {
  if (!z.zyklusBeginn) return 0;
  return sollRuecklage(
    { id: z.ruecklageId, bezeichnung: "", beginn: z.zyklusBeginn, ziel: z.zyklusZiel, fristMonate: z.zyklusFrist, rate: z.zyklusRate },
    am < z.datum ? am : z.datum,
  );
}

/**
 * Was von einer Ausgabe aus der Rücklage NICHT vom Angesparten gedeckt war.
 *
 * Bis zur Höhe des Zyklus-Solls am Tag des Ausbuchens trägt die Rücklage die Ausgabe,
 * was darüber liegt, ist ungedeckt. Ohne festgehaltenen Zyklus ist die Geschichte
 * unbekannt, und dann gilt — wie in der Ergebnisrechnung — der Kauf als gedeckt: `null`
 * heisst hier „weiss man nicht", nicht „null Cent".
 *
 * `ausgabe` ist positiv (was ausgegeben wurde). Eine Rückbuchung deckt nichts auf.
 *
 * Dieselbe Regel steht in `ergebnis.ts` noch einmal inline (`zyklusPosten`); wer eine
 * der beiden ändert, ändert beide — oder zieht die dortige auf diese Funktion um.
 */
export function zyklusUngedeckt(z: Ruecklagenzyklus, ausgabe: Cent): Cent | null {
  if (!hatGeschichte(z)) return null;
  return Math.max(0, Math.max(0, ausgabe) - zyklusSoll(z, z.datum));
}
