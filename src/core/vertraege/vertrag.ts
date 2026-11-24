// Vertrag — eine wiederkehrende Zahlung (KONZEPT §3.3): Konditionen, Fristen UND die
// Zahlung selbst (`zahlung`). Bis Migration 84 lebte die Zahlungsseite in einer eigenen
// Tabelle `zahlungsregel`, verknüpft über vertragId — zwei Zeilen für eine Sache, und
// alles, was beide betraf (das Ende einer Kündigung), hätte an zwei Stellen stehen
// müssen. Die Planung liest weiter eine `Zahlungsregel`; sie wird aus dem Vertrag gebaut
// (`regelAusVertrag`). Umfasst auch Einnahmen (Charakter Ertrag) und Versicherungen.

import { addMonate, ord, parseIso, tageBis, toIso } from "../basis/datum";
import type { Cent } from "../basis/geld";
import { RHYTHMUS_MONATE, type Charakter, type Rhythmus, type Zahlungsregel } from "../basis/zahlungsregel";

export type Verlaengerungsart = "keine" | "automatisch";

/**
 * Wo ein Vertrag gerade steht — ABGELEITET, nicht gespeichert.
 *
 * Bis 2026-11-08 war das ein eigenes Feld, und keine Stelle im Programm hat es je auf
 * etwas anderes als `aktiv` gesetzt. Wer einen gekündigten Vertrag loswerden wollte,
 * konnte ihn nur löschen, und damit verlor er zweimal: die Zuordnungen seiner alten
 * Zahlungen gingen mit, und der Vorschlag kam wieder, weil nur ein bestehender Vertrag
 * ihn verdeckt (`vertragsvorschlaege`).
 *
 * Abgeleitet wird aus `ende` und dem Tag, an dem man fragt. Ein gespeicherter Status neben
 * einem gespeicherten Datum wären zwei Felder auf dieselbe Frage — „gekündigt zum März"
 * und „aktiv" zugleich wäre speicherbar, und niemand wüsste, welches gilt.
 */
export type Vertragsstatus = "aktiv" | "gekuendigt" | "beendet";

/**
 *   • kein `ende` → `aktiv`
 *   • `ende` heute oder später → `gekuendigt` (läuft noch, zahlt noch, ist aber erledigt)
 *   • `ende` vorbei → `beendet`
 */
export function vertragsstatus(v: Vertrag, heute: string): Vertragsstatus {
  if (!v.ende) return "aktiv";
  return v.ende >= heute ? "gekuendigt" : "beendet";
}

/**
 * Was für ein Vertrag das ist — und ob es Sinn ergibt, ihn kündigen zu wollen.
 *
 *   • `abo` — der Regelfall: Handy, Streaming, Fitnessstudio, Versicherung. Läuft
 *     weiter, bis man etwas dagegen tut, und genau deshalb warnt die App vor dem
 *     nächsten Kündigungstermin.
 *   • `dauervertrag` — Arbeitsvertrag, Mietvertrag, Kindergeld. Auch eine
 *     wiederkehrende Zahlung mit Fristen, aber niemand sucht hier nach der nächsten
 *     Gelegenheit auszusteigen. Bis 2026-08-19 bekam ein Arbeitsvertrag ohne
 *     Mindestlaufzeit dieselbe Behandlung wie ein Abo — „heute kündbar, bald!" — und
 *     stand damit in der Warnung, die den kündbaren Verträgen gehört.
 *
 * Die Frist bleibt in BEIDEN Fällen sichtbar: bei einem Mietvertrag ist sie eine
 * nützliche Auskunft, nur eben keine Aufforderung.
 */
/**
 * Was für eine Vereinbarung das ist.
 *
 * `umbuchung` ist der Sonderfall: kein Vertrag mit jemand anderem, sondern eine
 * Abmachung mit sich selbst — „jeden Monat 200 aufs Tagesgeldkonto". Sie steht hier und
 * nicht in einem eigenen Aggregat, weil sie alles teilt, was einen Vertrag ausmacht:
 * einen Rhythmus, einen Betrag, einen Plan im Monatsausblick und die Frage, ob sie
 * eingehalten wurde. Was sie NICHT teilt, ist die Erkennung — siehe
 * `umbuchungErkennung`.
 */
export type Vertragsart = "abo" | "dauervertrag" | "umbuchung";

/**
 * Die Zahlungsseite eines Vertrags: was wann von welchem Konto geht (oder kommt).
 *
 * Ein eigenes Objekt und keine sechs losen Felder am Vertrag, weil es sie nur ZUSAMMEN
 * gibt: ein Betrag ohne Rhythmus plant nichts. Fehlt `zahlung` am Vertrag, hat er keine
 * Planseite — das gibt es nur im Altbestand (ein Vertrag, dessen Regel fehlte); die
 * Oberfläche legt keinen Vertrag ohne Zahlung an.
 */
export interface Vertragszahlung {
  /** Betrag je Fälligkeit in Cent, vorzeichenbehaftet (negativ = Abfluss). */
  readonly betrag: Cent;
  readonly rhythmus: Rhythmus;
  /** Erste Fälligkeit, ISO „YYYY-MM-DD" — nicht notwendig der Vertragsbeginn. */
  readonly ersteZahlung: string;
  readonly charakter: Charakter;
  /** Das Konto, von dem gezahlt wird (bzw. auf dem die Einnahme eingeht). */
  readonly kontoId?: string;
  /**
   * Das ZIELKONTO einer geplanten Umbuchung — nur sinnvoll mit `charakter:
   * "Umschichtung"` (siehe `Zahlungsregel.gegenkontoId`).
   */
  readonly gegenkontoId?: string;
}

export interface Vertrag {
  readonly id: string;
  readonly anbieter: string;
  readonly vertragsnummer?: string;
  readonly inhaberId?: string;
  readonly beginn: string; // ISO „YYYY-MM-DD"
  readonly mindestlaufzeitMonate?: number;
  readonly verlaengerung: Verlaengerungsart;
  /** Fehlend zählt als `abo` — Bestandsdaten und frisch gebaute Objekte bleiben so gültig. */
  readonly art?: Vertragsart;
  /** Verlängerungsschritt in Monaten, wenn verlaengerung = „automatisch". */
  readonly verlaengerungMonate?: number;
  readonly kuendigungsfristMonate?: number;
  /**
   * Der LETZTE Tag, an dem der Vertrag gilt — „gekündigt zum". Fehlend heisst: läuft.
   *
   * Ein Datum und kein Schalter, weil eine Kündigung fast immer in der Zukunft wirkt:
   * gekündigt im Januar zum 31. März heisst, Februar und März wird noch gezahlt. Ein
   * Schalter „gekündigt" hätte den Monatsausblick sofort leer gemacht oder nie.
   *
   * Der Vertrag BLEIBT danach stehen, und mit ihm die Zuordnungen seiner Zahlungen. Er
   * verdeckt weiter den Vorschlag desselben Anbieters, und die Erkennung ordnet ihm auch
   * nach dem Ende noch zu: eine Schlusserstattung gehört dazu, und eine Abbuchung nach
   * der Kündigung soll gerade auffallen, statt als neuer Vorschlag aufzutauchen.
   *
   * Gespeichert wird es NUR hier. Die Planung folgt über `Zahlungsregel.vertragsende`, das
   * `regelAusVertrag` aus diesem Feld nimmt.
   */
  readonly ende?: string;
  /**
   * Kategorie der Zahlungen dieses Vertrags.
   *
   * Sie sitzt hier und nicht (nur) an der Zahlungsregel, weil die Vertragszuordnung auf
   * den VERTRAG zeigt: eine Buchung, die zu diesem Vertrag gehört, erbt genau diese
   * Kategorie. Der Weg über die Zahlungsregel wäre eine Ableitung, die es nicht für jeden
   * Vertrag gibt — und damit eine Lücke in der Kategorisierung.
   */
  readonly kategorieId?: string;
  readonly notizen?: string;
  /** Die Zahlungsseite. Fehlend: der Vertrag plant nichts (nur im Altbestand). */
  readonly zahlung?: Vertragszahlung;
}

/**
 * Die Zahlungsregel eines Vertrags — die Form, in der die PLANUNG ihn liest (Projektion,
 * Monatsausblick, Liquidität, Ergebnisrechnung).
 *
 * Gebaut und nicht gespeichert: bis Migration 84 war die Regel eine eigene Zeile, seither
 * ist sie eine Sicht auf den Vertrag. Der Typ bleibt, damit kein Leser der Planung den
 * Vertrag kennen muss. Ihre `id` ist die des Vertrags — eine Regel je Vertrag, also
 * braucht sie keine eigene.
 */
export function regelAusVertrag(v: Vertrag): Zahlungsregel | undefined {
  const z = v.zahlung;
  if (!z) return undefined;
  return {
    id: v.id,
    bezeichnung: v.anbieter,
    betrag: z.betrag,
    rhythmus: z.rhythmus,
    startdatum: z.ersteZahlung,
    vertragsende: v.ende,
    charakter: z.charakter,
    kontoId: z.kontoId,
    gegenkontoId: z.gegenkontoId,
    kategorieId: v.kategorieId,
    vertragId: v.id,
  };
}

/** Die Zahlungsregeln aller Verträge, die eine Zahlung tragen — nach erster Fälligkeit. */
export function regelnAusVertraegen(vertraege: readonly Vertrag[]): Zahlungsregel[] {
  const regeln: Zahlungsregel[] = [];
  for (const v of vertraege) {
    const r = regelAusVertrag(v);
    if (r) regeln.push(r);
  }
  return regeln.sort((a, b) => (a.startdatum < b.startdatum ? -1 : a.startdatum > b.startdatum ? 1 : a.id < b.id ? -1 : 1));
}

export interface Kuendigungstermin {
  /** Termin, zu dem der Vertrag endet. */
  readonly endeDatum: string;
  /** Spätester Tag, an dem die Kündigung raus sein muss. */
  readonly kuendigenBis: string;
}

/**
 * Nächster zulässiger Kündigungstermin ab `heute`. Aus Beginn, Mindestlaufzeit,
 * Verlängerungsregel und Frist. Liefert den frühesten Endtermin, für den die
 * Kündigung noch rechtzeitig (kuendigenBis ≥ heute) raus kann. null, wenn der
 * Vertrag schon gekündigt ist oder kein künftiger Termin mehr erreichbar ist.
 *
 * Gefragt wird nach `ende`, nicht nach dem Status zu `heute`: ein gekündigter Vertrag,
 * dessen Ende noch aussteht, hat keinen Kündigungstermin mehr — das ist erledigt.
 */
export function naechsterKuendigungstermin(v: Vertrag, heute: string): Kuendigungstermin | null {
  if (v.ende) return null;
  const beginn = parseIso(v.beginn);
  const heuteDatum = parseIso(heute);
  const heuteO = ord(heuteDatum);
  // Monatsangaben stammen aus Freitextfeldern der UI; nicht-ganzzahlige Werte erzeugten
  // sonst Datumsstrings wie „2026-2.5-15", NaN-Werte liessen den Termin still verschwinden.
  const frist = ganzeMonate(v.kuendigungsfristMonate);
  const min = ganzeMonate(v.mindestlaufzeitMonate);
  const verl = v.verlaengerung === "automatisch" ? ganzeMonate(v.verlaengerungMonate) : 0;

  for (let k = 0; k < 1200; k++) {
    // Jeden Termin aus dem ORIGINALDATUM rechnen, nicht aus dem vorigen Ergebnis.
    // Iteratives addMonate(ende, verl) driftete dauerhaft weg: ein Vertrag ab dem 31.
    // wurde im Februar auf den 28. geklemmt und blieb danach am 28. kleben, statt zum
    // 31./30. zurückzukehren. projektion.ts rechnet aus demselben Grund k·Schritt.
    const ende = addMonate(beginn, min + k * verl);
    const kuendigenBis = addMonate(ende, -frist);
    if (ord(kuendigenBis) >= heuteO) {
      return { endeDatum: toIso(ende), kuendigenBis: toIso(kuendigenBis) };
    }
    if (verl <= 0) {
      // OHNE Mindestlaufzeit und ohne automatische Verlängerung ist der Vertrag jederzeit
      // kündbar — der häufigste Typ überhaupt (monatliches Abo). Vorher bekam genau der
      // NIE einen Termin und wurde von der Kündigungswarnung nie erfasst. Frühestmöglich
      // ist dann: heute kündigen, Ende nach Ablauf der Frist.
      if (min === 0) {
        return { endeDatum: toIso(addMonate(heuteDatum, frist)), kuendigenBis: toIso(heuteDatum) };
      }
      // MIT Mindestlaufzeit, aber verpasster Frist: der Vertrag läuft bis zum Mindestende
      // und endet dort — es gibt keinen weiteren Kündigungstermin.
      return null;
    }
  }
  return null;
}

/** Monatsangabe aus einem Freitextfeld → ganze, nicht-negative Monate. */
function ganzeMonate(wert: number | undefined): number {
  const n = Math.round(Number(wert));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Was eine Zahlung im Monat kostet, obwohl sie nicht monatlich abgeht — der Betrag,
 * den man zurücklegen muss, um bei Fälligkeit nicht ins Minus zu rutschen.
 *
 * Fachlich eine Rückstellung (Oberfläche: „Puffer"): eine bekannte künftige Zahlung,
 * die schon feststeht, aber erst später abfließt. Nur Abflüsse zählen — eine jährliche
 * Einnahme braucht keine Rücklage — und monatliche Zahlungen ebenfalls nicht: die
 * kommen aus dem laufenden Monat.
 *
 * Bewusst der schlichte Anteil (Betrag ÷ Monate im Rhythmus), nicht „Restbetrag bis
 * zur nächsten Fälligkeit": das wäre nur richtig, wenn der Topf bei null anfängt, und
 * schwankte jeden Monat. Gefragt ist die Dauerrate.
 */
export function ruecklageProMonat(regel: Zahlungsregel): number {
  if (regel.betrag >= 0) return 0;
  const monate = RHYTHMUS_MONATE[regel.rhythmus];
  if (monate <= 1) return 0;
  return Math.round(Math.abs(regel.betrag) / monate);
}

/** Summe der monatlichen Rücklagen über mehrere Zahlungsregeln. */
export function ruecklagenbedarf(regeln: readonly Zahlungsregel[]): number {
  return regeln.reduce((s, r) => s + ruecklageProMonat(r), 0);
}

/**
 * Was eine Zahlungsregel den Monat KOSTET (bzw. einbringt), vorzeichenbehaftet wie ihr
 * Betrag: der Betrag je Fälligkeit, verteilt auf die Monate ihres Rhythmus.
 *
 * Das ist die Sicht „Kosten" aus `core/CLAUDE.md` („Auszahlung und Kosten") für den
 * Bereich Verträge: der Betrag in der Liste sagt, was bei Fälligkeit vom Konto geht,
 * diese Zahl, was der Vertrag das Leben kostet. Erst sie macht einen Jahresbeitrag mit
 * einem Monatsabo vergleichbar.
 *
 * GERUNDET und nicht wie `monatsanteil` mit dem Rest im ersten Monat: dort wird eine
 * einzelne Zahlung auf ihre Monate verteilt und muss exakt aufgehen, weil die
 * Überleitung sonst nicht gegen die Bank stimmt. Hier ist die Dauerrate gefragt — eine
 * Zahl, die für jeden Monat gilt und sich mit keinem Kontoauszug messen muss.
 *
 * Anders als `ruecklageProMonat` darunter gilt sie für JEDE Regel: auch für die
 * monatliche und für die Einnahme. Die beiden beantworten verschiedene Fragen („was
 * kostet es" gegen „was muss ich beiseitelegen") und stimmen nur beim nicht-monatlichen
 * Abfluss überein.
 */
export function kostenJeMonat(regel: Zahlungsregel): number {
  const monate = RHYTHMUS_MONATE[regel.rhythmus];
  // Über den Betrag ohne Vorzeichen runden: `Math.round` rundet die Hälfte nach OBEN,
  // ein halber Cent fiele bei einem Abfluss also anders als bei einer Einnahme.
  return Math.sign(regel.betrag) * Math.round(Math.abs(regel.betrag) / monate) || 0;
}

/**
 * Läuft der Vertrag noch — kostet er also weiter?
 *
 * Nur `beendet` nimmt ihn heraus. Ein GEKÜNDIGTER Vertrag läuft bis zu seinem Ende
 * weiter und kostet bis dahin; ihn schon mit der Kündigung aus den Fixkosten zu nehmen,
 * zeigte Geld als frei, das noch monatelang abgeht.
 */
export function vertragLaeuft(v: Vertrag, heute: string): boolean {
  return vertragsstatus(v, heute) !== "beendet";
}

/** Was die Verträge zusammen den Monat bedeuten — die erste Stufe der Ergebnisrechnung. */
export interface Pflichten {
  /** Σ Kosten je Monat aller laufenden Aufwands-Verträge, negativ. */
  readonly fixkosten: number;
  /** Σ je Monat aller laufenden Ertrags-Verträge, positiv. */
  readonly einnahmen: number;
  /** `einnahmen + fixkosten` — was bleibt, bevor man etwas entscheidet. */
  readonly nachPflichten: number;
}

/**
 * Fixkosten, geplante Einnahmen und was danach bleibt, je Monat.
 *
 * Sortiert wird nach dem CHARAKTER der Regel, wie in `monatsErgebnis`: Aufwand sind
 * Fixkosten, Ertrag Einnahmen. Eine **Umschichtung zählt in keine der beiden** — ein
 * Umbuchungsvertrag bewegt eigenes Geld, er kostet nichts. In der Übersicht steht er
 * deshalb in keiner Zeile der ersten Stufe (als Vorsorge allenfalls weiter unten), und
 * hier muss dieselbe Zahl herauskommen, sonst zeigen zwei Bereiche unter demselben Wort
 * („nach den Pflichten") Verschiedenes.
 *
 * Summiert werden die GERUNDETEN Werte je Vertrag: die Kennzahl ist damit die Summe der
 * Spalte, die darunter steht, auf den Cent.
 */
export function pflichtenJeMonat(
  posten: readonly { readonly vertrag: Vertrag; readonly regel?: Zahlungsregel }[],
  heute: string,
): Pflichten {
  let fixkosten = 0;
  let einnahmen = 0;
  for (const { vertrag, regel } of posten) {
    if (!regel || !vertragLaeuft(vertrag, heute)) continue;
    if (regel.charakter === "Aufwand") fixkosten += kostenJeMonat(regel);
    else if (regel.charakter === "Ertrag") einnahmen += kostenJeMonat(regel);
  }
  return { fixkosten, einnahmen, nachPflichten: einnahmen + fixkosten };
}

/** Naht der nächste Kündigungstermin (kuendigenBis innerhalb `warnTage` ab heute)? */
export function kuendigungsterminNaht(v: Vertrag, heute: string, warnTage = 45): boolean {
  // Ein Dauervertrag wird nicht „bald kündbar" — die Warnung gehört den Abos. Der Termin
  // selbst bleibt abrufbar (naechsterKuendigungstermin), er ist nur keine Aufforderung.
  // Eine Umbuchung erst recht nicht: sie ist eine Abmachung mit sich selbst, und niemand
  // muss an eine Frist erinnert werden, die er sich selbst gesetzt hat. Beenden lässt sie
  // sich trotzdem — über `ende`, wie jeden anderen Vertrag.
  if (v.art === "dauervertrag" || v.art === "umbuchung") return false;
  const t = naechsterKuendigungstermin(v, heute);
  if (!t) return false;
  const diff = tageBis(heute, t.kuendigenBis);
  return diff >= 0 && diff <= warnTage;
}
