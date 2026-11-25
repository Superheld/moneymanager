// Zuordnungsvorschlag — welche noch unentschiedenen Buchungen zu einem Vertrag gehören
// KÖNNTEN.
//
// Die Erkennung (`vertragZuordnung.ts`) hängt am Empfänger: greift ihre Regel nicht —
// der Name im Auszug weicht ab, die Betragsspanne ist zu eng, die Zahlung wurde von Hand
// erfasst und hat gar keinen Beleg —, bleibt die Zahlung ohne Vertrag. Seit die
// Ergebnisrechnung Fixkosten über die ZUORDNUNG findet (`core/ergebnis.ts`) und nicht
// mehr über Betragsnähe, hat das eine sichtbare Folge: der Vertrag steht dauerhaft als
// „offen" da und seine Zahlung daneben unter „Ungeplant".
//
// Diese Funktion schliesst die Lücke von der anderen Seite. Sie fragt nicht nach dem
// Empfänger, sondern nach dem, was die Zahlungsregel über die Zahlung weiss: Kategorie,
// Richtung, Höhe, Termin. Das ist dieselbe Messung, mit der die frühere Monatskarte Plan
// und Ist zusammenbrachte (`monatsausblick.ts`) — mit einem Unterschied, und der ist der
// Punkt: dort ENTSCHIED die Betragsnähe, hier schlägt sie nur VOR. Ein Betrag, der
// zufällig passt, ist keine Aussage; zur Aussage wird er erst, wenn jemand ihn
// bestätigt. Zugeordnet wird deshalb nie von hier aus, sondern von Hand (Herkunft
// `manuell`) — und damit wird der Treffer zugleich zum Beleg, aus dem die
// Merkmalsableitung die Erkennungsregel verbessern kann.

import type { Zahlungsregel } from "../basis/zahlungsregel";
import { naechstgelegeneFaelligkeit } from "./faelligkeit";
import { istUmbuchungsregel } from "./umbuchungErkennung";
import { kategorieAnteile, type IstBuchung } from "../buchung/istbuchung";
import type { Vertragszuordnung } from "./vertragZuordnung";

/**
 * Wie weit der Betrag einer Buchung von dem der Regel abweichen darf, relativ.
 *
 * Derselbe Wert und dieselbe Begründung wie `BETRAGS_TOLERANZ` im Monatsausblick:
 * geplante Beträge veralten — die Miete wird angehoben, die Regel bleibt stehen —, und
 * nach oben begrenzt die Toleranz die Verwechslung zweier Posten derselben Kategorie.
 * Eigene Konstante und kein Import: der Monatsausblick paart damit selbsttätig, hier
 * wird nur vorgeschlagen, und wer die eine Grenze verschiebt, hat über die andere damit
 * noch nichts entschieden.
 */
export const VORSCHLAG_BETRAGSTOLERANZ = 0.15;

/**
 * Wie viele Tage eine Buchung von der nächstgelegenen Fälligkeit entfernt sein darf.
 *
 * Fünfzehn, und das ist mit Absicht grosszügig: bei MONATLICHEM Takt liegt damit jeder
 * Tag in der Nähe einer Fälligkeit — der Termin schränkt dort nichts ein, Kategorie und
 * Betrag tragen allein. Das ist richtig so. Die erste Fälligkeit einer Regel ist oft
 * geschätzt („zum Ersten", abgebucht wird zur Monatsmitte), und ein enges Fenster liesse
 * genau die Zahlungen still verschwinden, für die es diese Liste gibt. Was hier zu viel
 * erscheint, sieht man und klickt es weg; was fehlt, sieht niemand.
 *
 * Bei längerem Takt trennt der Termin dagegen wirklich: ein Jahresbeitrag wird im Monat
 * seiner Fälligkeit gesucht und nicht in den elf anderen.
 */
export const VORSCHLAG_TAGE = 15;

/** Eine Buchung, die zu einem Vertrag gehören könnte — mit dem, woran man es prüft. */
export interface Zuordnungskandidat {
  readonly buchung: IstBuchung;
  /** Die Fälligkeit der Regel, der die Buchung am nächsten liegt (ISO). */
  readonly faelligkeit: string;
  /** Tage von der Fälligkeit zur Buchung; negativ = vor dem Termin gebucht. */
  readonly tage: number;
  /** Buchungsbetrag minus Regelbetrag, vorzeichenbehaftet. Null = genau getroffen. */
  readonly abweichung: number;
}

/**
 * Die Buchungen, die zu `regel` gehören könnten — jüngste zuerst.
 *
 * Kandidat ist, was ALLE vier Fragen besteht:
 *
 *   • **Kategorie** — ein Anteil der Buchung trägt die Kategorie der Regel. Über
 *     `kategorieAnteile`, damit ein Split mitzählt, dessen Kopf keine Kategorie hat.
 *   • **Richtung** — gleiches Vorzeichen und gleicher Charakter. Eine Erstattung in der
 *     Kategorie der Miete ist keine Mietzahlung.
 *   • **Höhe** — innerhalb von `VORSCHLAG_BETRAGSTOLERANZ` um den Regelbetrag. Verglichen
 *     wird der Betrag der GANZEN Buchung, auch bei einem Split: zugeordnet wird die
 *     Buchung und nicht ihr Anteil.
 *   • **Termin** — höchstens `VORSCHLAG_TAGE` von einer Fälligkeit entfernt.
 *
 * Und was NIE Kandidat ist, gleich wie gut es passt:
 *
 *   • **Eine Buchung, über die schon entschieden ist.** Das sind zwei Fälle, und der
 *     zweite ist der wichtige: sie ist einem Vertrag zugeordnet — oder jemand hat von
 *     Hand gesagt „gehört zu KEINEM Vertrag" (`vertragId` leer bei gesetzter Herkunft,
 *     siehe `src/core/vertraege/CLAUDE.md`). Dieses Nein ist die einzige Stelle im
 *     Bestand, an der „gehört nicht dazu" wirklich dasteht; ein Vorschlag, der es
 *     übergeht, stellt dieselbe Frage bei jedem Öffnen wieder. Beides steht in
 *     `zuordnungen` als Eintrag, deshalb genügt die Frage, ob es einen gibt.
 *
 * **Ein Umbuchungsvertrag sucht am WEG statt an der Kategorie** (seit 2026-11-25). Bis
 * dahin gab es für ihn keine Vorschläge, weil der Weg allein ihn schon zuordnete; seit
 * die Erkennung auch Betrag und Termin verlangt (`umbuchungErkennung`), bleibt übrig,
 * was auf dem Weg liegt und nur ungefähr passt — die erhöhte Sparrate, der verschobene
 * Termin. Höhe und Termin gelten dafür wie für jeden Vertrag. Eine Umschichtung OHNE
 * Gegenkonto an der Regel bekommt weiterhin keine Vorschläge.
 *
 * `kategorieId` kommt als eigener Parameter, weil die Kategorie an zwei Stellen stehen
 * kann (Regel und Vertrag) und der Aufrufer weiss, welche gilt. Ohne Kategorie gibt es
 * keine Kandidaten: Betrag und Termin allein träfen bei einem runden Betrag am
 * Monatsersten alles Mögliche.
 */
export function zuordnungskandidaten(
  regel: Zahlungsregel,
  buchungen: readonly IstBuchung[],
  zuordnungen: readonly Vertragszuordnung[],
  kategorieId: string | undefined = regel.kategorieId,
): Zuordnungskandidat[] {
  if (regel.betrag === 0) return [];
  // Ein Umbuchungsvertrag hat keine Kategorie, an der man suchen könnte — bei ihm trägt
  // der WEG, und der ist die schärfere Angabe von beiden.
  const umbuchung = istUmbuchungsregel(regel);
  if (!umbuchung && (!kategorieId || regel.charakter === "Umschichtung")) return [];
  const entschieden = new Set(zuordnungen.map((z) => z.istbuchungId));
  const hoehe = Math.abs(regel.betrag);

  const kandidaten: Zuordnungskandidat[] = [];
  for (const b of buchungen) {
    if (entschieden.has(b.id)) continue;
    if (b.charakter !== regel.charakter) continue;
    if (Math.sign(b.betrag) !== Math.sign(regel.betrag)) continue;
    if (umbuchung) {
      // Nur das abgehende Bein (das Vorzeichen oben) und nur derselbe Weg.
      if (b.kontoId !== regel.kontoId || b.gegenkontoId !== regel.gegenkontoId) continue;
    } else if (!kategorieAnteile(b).some((a) => a.kategorieId === kategorieId)) continue;
    const abweichung = b.betrag - regel.betrag;
    if (Math.abs(abweichung) / hoehe > VORSCHLAG_BETRAGSTOLERANZ) continue;
    const { faelligkeit, tage } = naechstgelegeneFaelligkeit(regel, b.datum, umbuchung);
    if (Math.abs(tage) > VORSCHLAG_TAGE) continue;
    kandidaten.push({ buchung: b, faelligkeit, tage, abweichung });
  }
  return kandidaten.sort((a, b) => b.buchung.datum.localeCompare(a.buchung.datum));
}
