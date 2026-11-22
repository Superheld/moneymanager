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
// dieses Kontos wird anteilig auf ALLE Rücklagen verteilt, die darauf Anspruch haben
// (`core/konten/kontobelegung`). Deckung = Wirklichkeit ÷
// Rechnung, ohne Buchungslogik.

import { monateZwischen } from "../basis/datum";
import type { Cent } from "../basis/geld";
import { kontobelegung, type Anspruch } from "../konten/kontobelegung";
import { istLiquide, istRuecklagenkonto, type Zahlungskonto } from "../konten/konto";
import {
  abgeschlossenerZyklus,
  altabschlussUngedeckt,
  rateIm,
  ruecklagenart,
  ruecklagenstand,
  zyklen,
  type Ruecklagenentnahme,
} from "./topf";

/**
 * Wann eine Rücklage wieder bei null beginnt (ADR-0006, seit Migration 79):
 *
 *   • `fortlaufend` — nie. Reparaturen, der Fall des bisherigen aufbauenden Budgets.
 *   • `abschliessend` — wenn der Nutzer sie abschliesst. Urlaub, ein Gerät.
 *
 * Ein eigenes Feld und nicht aus der Form (Ziel oder Rate) abgeleitet: die Entscheidung
 * trennt genau diese beiden Fragen. Was nach dem Abschliessen folgt (neu beginnen oder
 * beenden), wählt der Nutzer beim Abschliessen — das ist eine dritte Frage.
 *
 * Seit Paket 3 liest die Rechnung das Feld über `topf.ts` und `zustaendigkeit.ts`.
 * Migration 81 hat die aufbauenden Budgets als `fortlaufend` in die Tabelle überführt.
 */
export type Ruecklagenart = "fortlaufend" | "abschliessend";

/**
 * Eine freie Rate und der Monat (`YYYY-MM`), ab dem sie gilt — dasselbe Muster wie
 * `Budgetbetrag` und aus demselben Grund: eine Änderung darf die Vergangenheit nicht
 * umschreiben. Mit Ziel gibt es keine Reihe, die Rate folgt aus Ziel ÷ Frist.
 */
export interface Ruecklagenrate {
  readonly abMonat: string;
  /** Positiv, in Cent. */
  readonly betrag: Cent;
}

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
  /**
   * Die Sorte (siehe `Ruecklagenart`). Fehlt sie, ist es `abschliessend` — so steht es
   * in jeder Zeile vor Migration 79, und so ist jede bisherige Rücklage gemeint: sie
   * wird ausgebucht. Optional, damit jeder Aufrufer, der eine Rücklage baut, ohne das
   * Feld dasselbe meint wie vorher; das Repository liefert es immer.
   */
  readonly art?: Ruecklagenart;
  /**
   * Ab welchem Tag (ISO) die Kategorie Ausgaben von selbst findet. Fehlt es, findet eine
   * `abschliessend`e Rücklage nichts über die Kategorie; eine `fortlaufend`e gilt dann
   * „ohne Anfang", wie heute ein aufbauendes Budget (`zustaendigkeit.ts`).
   */
  readonly findetAb?: string;
  /**
   * Die Reihe der freien Raten, aufsteigend nach `abMonat`. Migration 80 hat die freie
   * Rate aus `rate` hierher überführt; ist sie leer, gilt `rate` ab dem Monat von `beginn`
   * (ein Bestand vor der Migration rechnet so weiter wie zuvor).
   */
  readonly raten?: readonly Ruecklagenrate[];
  /**
   * Was die Rücklage ersetzen soll, wenn sie einen Gegenstand ersetzt (seit Migration 82):
   * wann er gekauft wurde, was er kostete, wie lange er hält. Nur für die ANZEIGE des
   * Wertverlusts (`wertverlustAm` in `wertverlust.ts`) — keine Rechnung über Stand, Raten
   * oder Kosten liest es. Fehlt es, ist nichts angegeben.
   */
  readonly kauf?: Kaufangabe;
}

/** Kauf und Nutzungsdauer eines Gegenstands — alle drei oder keins (`ruecklagenPflege`). */
export interface Kaufangabe {
  /** ISO-Datum des Kaufs; darf vor dem Beginn der Rücklage liegen. */
  readonly datum: string;
  /** Kaufpreis, positiv, in Cent. */
  readonly preis: Cent;
  /** Wie viele Monate er hält; danach ist sein Wert null. */
  readonly nutzungsdauerMonate: number;
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
  return freieRate(r);
}

/**
 * Die freie Rate, die zuletzt gilt: der jüngste Eintrag der Reihe, ohne Reihe `rate`.
 * Seit Migration 80 steht die freie Rate in der Reihe und `rate` ist leer — vorher
 * stand sie nur in `rate`. Beide Bestände sagen hier dasselbe.
 */
export function freieRate(r: Pick<Ruecklage, "rate" | "raten">): Cent {
  const reihe = r.raten ?? [];
  return reihe.length > 0 ? reihe[reihe.length - 1].betrag : (r.rate ?? 0);
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
  const reihe = r.raten ?? [];
  if (reihe.length === 0) return (r.rate ?? 0) * monate;
  // Mit Reihe aufsummiert, Monat für Monat ab dem Beginn — dieselbe Zahl wie
  // `rate × Monate`, solange die Reihe nur den einen Eintrag trägt, den Migration 80 aus
  // `rate` gemacht hat; und eine spätere Änderung rechnet nicht rückwirkend.
  const [j, m] = r.beginn.split("-").map(Number);
  let summe = 0;
  for (let i = 0; i < monate; i++) {
    const n = j * 12 + (m - 1) + i;
    const monat = `${String(Math.floor(n / 12)).padStart(4, "0")}-${String((n % 12) + 1).padStart(2, "0")}`;
    let treffer = 0;
    for (const v of reihe) {
      if (v.abMonat > monat) break;
      treffer = v.betrag;
    }
    summe += treffer;
  }
  return summe;
}

/**
 * Die Konten, auf denen zurückgelegt wird: jedes der Klasse Rücklage, jedes, dem eine
 * abschliessende Rücklage zugeordnet ist — gleich welcher Klasse —, und jedes NICHT
 * liquide Konto einer fortlaufenden.
 *
 * Bis 2026-11-09 zählte allein die Klasse. Wer seine Rücklagen auf einem Tagesgeldkonto
 * der Klasse „Sparen" führte, sah dann einen Tacho auf null und keinen einzigen
 * Eingang, obwohl die Zuordnung an jeder Rücklage dastand. Die Zuordnung ist die
 * genauere Aussage — sie ist je Rücklage getroffen, die Klasse nur einmal je Konto.
 *
 * **Warum bei der fortlaufenden nur die nicht liquiden** (seit 2026-11-16, damals für das
 * aufbauende Budget, aus dem die fortlaufende Rücklage mit Migration 81 wurde): ein Budget
 * MUSSTE ein Konto nennen, und meist war es das Girokonto, von dem auch bezahlt wird.
 * Zählte das mit, wäre jedes Gehalt dort ein „Eingang" in die Rücklagen und der Tacho
 * mässe das Girokonto. Die Unterscheidung bleibt, damit kein Tacho nach der Umstellung
 * anders steht (Teil B des Entwurfs zu ADR-0006, Abschnitt 5).
 */
export function ruecklagenKonten(
  konten: readonly Zahlungskonto[],
  items: readonly Pick<Ruecklage, "kontoId" | "art">[],
): Set<string> {
  const ids = new Set(konten.filter(istRuecklagenkonto).map((k) => k.id));
  const jeId = new Map(konten.map((k) => [k.id, k]));
  for (const r of items) {
    if (!r.kontoId) continue;
    if (ruecklagenart(r) !== "fortlaufend") ids.add(r.kontoId);
    else {
      const k = jeId.get(r.kontoId);
      if (k && !istLiquide(k)) ids.add(k.id);
    }
  }
  return ids;
}

/**
 * Was alle laufenden Rücklagen zusammen in `monat` (`YYYY-MM`) verlangen.
 *
 * Je Sorte wie vor Migration 81: eine abschliessende ihre Monatsrate (`monatsRuecklage`,
 * Ziel ÷ Frist auch am Ziel), eine fortlaufende die Rate ihres laufenden Zyklus in DIESEM
 * Monat — 0 vor ihrem Beginn, wie damals `zufuehrungIm` beim aufbauenden Budget.
 */
export function ruecklagenBedarf(items: readonly Ruecklage[], monat: string): Cent {
  let summe = 0;
  for (const r of items) {
    if (ruecklagenart(r) !== "fortlaufend") summe += monatsRuecklage(r);
    else {
      const z = zyklen(r, []).find((x) => !x.ende);
      summe += z ? rateIm(z, monat) : 0;
    }
  }
  return summe;
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
  /** Was bis `am` auf dem Konto liegen sollte: der Stand über null (`anspruchAm`). */
  readonly soll: Cent;
  /** Anteil am realen Kontostand; `null` ohne Kontozuordnung (dann nur Rechnung). */
  readonly tatsaechlich: Cent | null;
}

/**
 * Die Deckung über alle laufenden Rücklagen, beide Sorten — seit Migration 81 in EINER
 * Liste. Bis dahin standen die aufbauenden Budgets daneben (`ueberKategorie`); in den
 * Summen zählten sie schon seit 2026-11-16 mit, und an den Summen ändert sich nichts.
 */
export interface RuecklagenDeckung {
  /** Je Rücklage eine. */
  readonly posten: readonly RuecklagenPosten[];
  /** Σ Soll. */
  readonly soll: Cent;
  /** Nur, was einem Konto gegenübersteht — sonst stünde ein Soll ohne Gegenstück im Nenner. */
  readonly sollMitKonto: Cent;
  readonly tatsaechlich: Cent;
  /** 0–100, gedeckelt. 100, wenn nichts zu decken ist. */
  readonly grad: number;
  /**
   * Nennt keine Rücklage ein Konto? Dann ist alles reine Rechnung, und das sagt der
   * Bereich einmal statt an jeder Zahl.
   */
  readonly nurRechnung: boolean;
}

/**
 * Die Ansprüche der Rücklagen auf ihre Konten — je Rücklage ihr Stand über null bis `am`.
 *
 * Eine Rücklage ohne Konto hat keinen: sie ist reine Rechnung, und es gibt keinen Stand,
 * gegen den sie etwas beanspruchen könnte.
 *
 * Die abschliessenden zuerst, dann die fortlaufenden: in dieser Reihenfolge standen sie
 * vor Migration 81 auf jedem Konto (Rücklagen, dann die Reste der aufbauenden Budgets).
 */
export function ruecklagenAnsprueche(
  items: readonly Ruecklage[],
  am: string,
  bestand: Anspruchsbestand = {},
): Anspruch[] {
  const fortlaufend = (r: Ruecklage) => ruecklagenart(r) === "fortlaufend";
  return [...items.filter((r) => !fortlaufend(r)), ...items.filter(fortlaufend)]
    .filter((r) => r.kontoId)
    .map((r) => ({ id: r.id, kontoId: r.kontoId as string, betrag: anspruchAm(r, am, bestand) }));
}

/**
 * Was über die Rücklagen hinaus bekannt sein muss, um ihren Anspruch zu rechnen: die
 * Ausgaben, die jede über ihre Kategorie gefunden hat, und die Abschlüsse (für das
 * Fenster des laufenden Zyklus). Fehlt beides, ist der Anspruch das Soll wie vor der
 * Umstellung.
 */
export interface Anspruchsbestand {
  readonly entnahmen?: ReadonlyMap<string, readonly Ruecklagenentnahme[]>;
  readonly abschluesse?: readonly Ruecklagenzyklus[];
}

/**
 * Was eine Rücklage am Tag `am` auf ihrem Konto beansprucht: ihr Stand, über null —
 * eine im Minus beansprucht nichts (ADR-0006, Entscheidung 6).
 *
 * Der Stand rechnet je Sorte wie vor der Umstellung (`ruecklagenstand`): bei einer
 * abschliessenden die Raten bis zum Vormonat, also genau das Soll — und davon gehen die
 * Ausgaben ab, die die Rücklage seit ihrem Fundfenster gefunden hat. Vor `findet_ab`
 * findet sie nichts, und der Anspruch ist das Soll wie bisher. Vor dem Beginn ihres
 * laufenden Zyklus beansprucht eine abschliessende nichts, wie `sollRuecklage` es sagt.
 *
 * Eine fortlaufende rechnet wie das aufbauende Budget, das sie bis Migration 81 war: im
 * Monat ihres Beginns hat sie die Rate auch an den Tagen davor (`budgetStand` tat das).
 */
export function anspruchAm(r: Ruecklage, am: string, bestand: Anspruchsbestand = {}): Cent {
  if (ruecklagenart(r) !== "fortlaufend" && am < r.beginn) return 0;
  const stand = ruecklagenstand(r, bestand.abschluesse ?? [], bestand.entnahmen?.get(r.id) ?? [], am).stand;
  return Math.max(0, stand);
}

/**
 * Gleicht die Rechnung gegen die Wirklichkeit ab — über die Kontobelegung
 * (`core/konten/kontobelegung`), nicht mit einer eigenen Verteilung.
 *
 * Bewusst KEINE Allokation nach Priorität: liegen auf dem Konto 60 % dessen, was alle
 * Ansprüche zusammen verlangen, dann ist jede Rücklage darauf zu 60 % gedeckt. Alles
 * andere würde eine Reihenfolge behaupten, die es nicht gibt.
 *
 * Überschuss wird gekappt (Grad ≤ 100 %): mehr als ihren Soll-Stand trägt eine Rücklage
 * nicht, auch wenn auf dem Konto mehr liegt.
 *
 * Bis Migration 81 kamen die Reste der aufbauenden Budgets als „weitere Ansprüche" von
 * aussen herein. Seither sind sie Rücklagen und stehen in `items`; einen Anspruch, der
 * keine Rücklage ist, gibt es nicht mehr.
 */
export function ruecklagenDeckung(
  items: readonly Ruecklage[],
  am: string,
  kontostaende: ReadonlyMap<string, Cent>,
  bestand: Anspruchsbestand = {},
): RuecklagenDeckung {
  const belegung = kontobelegung(kontostaende, ruecklagenAnsprueche(items, am, bestand));
  const gedeckt = new Map<string, Cent>();
  for (const b of belegung.values()) for (const p of b.posten) gedeckt.set(p.id, p.gedeckt);

  const posten = items.map((r): RuecklagenPosten => ({
    ruecklage: r,
    // Das Soll ist der Anspruch: was auf dem Konto liegen sollte. Vor dem Fundfenster ist
    // das `sollRuecklage`; danach gehen die gefundenen Ausgaben ab.
    soll: anspruchAm(r, am, bestand),
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
    nurRechnung: items.length > 0 && items.every((r) => !r.kontoId),
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
 * Gerechnet in `topf.ts` (`altabschlussUngedeckt`), derselben Stelle, an der die
 * Ergebnisrechnung das Ungedeckte im Kaufmonat kostet — bis Paket 3 stand die Regel dort
 * ein zweites Mal inline.
 */
export function zyklusUngedeckt(z: Ruecklagenzyklus, ausgabe: Cent): Cent | null {
  if (!hatGeschichte(z)) return null;
  return altabschlussUngedeckt(abgeschlossenerZyklus(z), ausgabe);
}
