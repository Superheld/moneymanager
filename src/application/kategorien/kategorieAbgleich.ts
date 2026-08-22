// Rückwirkender Kategorie-Abgleich — den vorhandenen Bestand mit dem aktuellen Stand der
// Erkennung durchrechnen.
//
// Der Grund, warum es das geben muss: alles, was hier gebaut wurde, wirkt sonst nur nach
// vorn. Ein frisch trainiertes Modell, eine neue Festlegung, eine Kategorie am Vertrag —
// jede dieser Verbesserungen ließe die 5000 Zahlungen unberührt, die schon da sind. Ein
// Haushaltsbuch, dessen Auswertungen von der Reihenfolge abhängen, in der man Dinge
// gelernt hat, ist keins.
//
// Die eine Entscheidung, die diesen Ablauf von `zuordnungenAbgleichen` (Verträge)
// unterscheidet: **rechnen und schreiben sind getrennt.** Dort läuft der Abgleich still
// mit, weil er nur eine Kennzeichnung setzt. Hier ändert er die Zahl, die in jedem Budget
// und jeder Auswertung steht — und das darf nicht passieren, während jemand woanders auf
// einen Knopf drückt. `kategorieAbgleich` rechnet einen Plan; geschrieben wird er erst,
// wenn jemand ihn gesehen und bestätigt hat.
//
// Abweichung vom Plan, benannt: `kategorieAbgleich` steht hier und nicht in `core`. Sie
// ist rein (kein IO, keine Uhr), braucht aber den `Vorschlagskontext` der Kette, und der
// wohnt im Import-Kontext. Ihn nach `core` zu ziehen, hieße die halbe Kette umzuräumen,
// um eine Schichtgrenze zu bedienen, die niemand verletzt sieht.

import type { Cent, Charakter, Zahlungsspur } from "../../core";
import { vorschlagsbefundFuer, type Vorschlagskontext } from "../import/vorschlag";
import type { VorschlagQuelle } from "../import/umsatz";
import { kategorisierungsquellen, type QuellenDeps } from "./kategorisierungsquellen";
import { zahlungsspuren } from "../buchung/zahlungsspuren";
import type { LedgerPort, UmsatzRepository } from "../ports";

/** Was der Abgleich an EINER Buchung ändern will. */
export interface Kategoriewechsel {
  readonly istbuchungId: string;
  /** Kategorie vorher; fehlt, wenn die Buchung bisher keine hatte. */
  readonly vonKategorieId?: string;
  readonly nachKategorieId: string;
  /**
   * Der Charakter der Zielkategorie. Er wird MITGESCHRIEBEN: eine Kategorie sagt mit
   * ihrem Default-Charakter, ob Zahlungen darin Aufwand, Ertrag oder Umschichtung sind.
   * Die Kategorie zu ändern und den Charakter stehen zu lassen, ergäbe eine Buchung, die
   * ihrer eigenen Kategorie widerspricht.
   */
  readonly charakter: Charakter;
  /**
   * Der Charakter VORHER. Steht hier, damit die Vorschau die wenigen Fälle benennen kann,
   * in denen sich nicht nur das Etikett ändert: auf echten Daten eine Handvoll von
   * hunderten — meist Rückerstattungen, die in eine Aufwandskategorie wandern. Ein Kategoriewechsel
   * ist eine Sortierfrage, ein Charakterwechsel eine über Erfolgs- und
   * Liquiditätswirksamkeit. Die beiden ungetrennt zu zeigen, hieße die zweite zu
   * verstecken.
   */
  readonly vonCharakter: Charakter;
  readonly quelle: VorschlagQuelle;
  // Für die Vorschau: woran man die Zahlung in einer Beispielzeile wiedererkennt.
  readonly gegenpartei: string;
  readonly betrag: Cent;
  readonly datum: string;
}

/** Warum eine Buchung nicht angefasst wurde. */
export interface Uebersprungen {
  /** Kategorie von Hand gesetzt oder Buchung aufgeteilt — für die Automatik tabu. */
  readonly handverlesen: number;
  /** Umschichtung: eigenes Geld, das das Konto wechselt. Gehört in keine Kategorie. */
  readonly umschichtung: number;
  /** Die Kette hatte nichts anzubieten — meist zu wenig Text. */
  readonly ohneVorschlag: number;
}

export interface Abgleichsplan {
  readonly setzen: readonly Kategoriewechsel[];
  /** Buchungen, bei denen die Kette dieselbe Kategorie liefert, die schon dasteht. */
  readonly unveraendert: number;
  readonly uebersprungen: Uebersprungen;
}

/**
 * Rechnet, was ein rückwirkender Abgleich ändern würde. Rein — kein IO, kein Schreiben.
 *
 * Zwei Zusagen, an denen die Umkehrbarkeit hängt:
 *
 *   • **Handarbeit bleibt.** Wer eine Kategorie selbst gesetzt hat, hat entschieden;
 *     aufgeteilte Buchungen ebenso (siehe `kategorieIstHandverlesen`). Beides fasst der
 *     Lauf nie an — sonst wäre jede Korrektur nur bis zum nächsten Training haltbar.
 *   • **Nur Deltas.** Was gleich bleibt, steht nicht im Plan. Ein zweiter Lauf direkt
 *     danach muss leer ausgehen, sonst zeigt die Vorschau Arbeit an, die keine ist.
 */
export function kategorieAbgleich(
  spuren: readonly Zahlungsspur[],
  kontext: Vorschlagskontext,
): Abgleichsplan {
  const setzen: Kategoriewechsel[] = [];
  let unveraendert = 0;
  let handverlesen = 0;
  let umschichtung = 0;
  let ohneVorschlag = 0;

  for (const s of spuren) {
    // Dieselben zwei Fälle wie `kategorieIstHandverlesen` im Kern — hier an der Spur
    // geprüft, die `geteilt` als Flag trägt statt der Aufteilungsliste selbst.
    if (s.kategorieHerkunft === "manuell" || s.geteilt) {
      handverlesen++;
      continue;
    }
    if (s.charakter === "Umschichtung") {
      umschichtung++;
      continue;
    }

    const befund = vorschlagsbefundFuer(
      {
        buchungstag: s.datum,
        betrag: s.betrag,
        gegenpartei: s.gegenpartei,
        verwendungszweck: s.verwendungszweck ?? "",
        glaeubigerId: s.glaeubigerId,
      },
      kontext,
      s.kontoId,
    );
    const v = befund.vorschlag;
    if (!v?.kategorieId) {
      ohneVorschlag++;
      continue;
    }
    if (v.kategorieId === s.kategorieId) {
      unveraendert++;
      continue;
    }
    setzen.push({
      istbuchungId: s.id,
      vonKategorieId: s.kategorieId,
      nachKategorieId: v.kategorieId,
      charakter: v.charakter,
      vonCharakter: s.charakter,
      quelle: v.quelle,
      gegenpartei: s.gegenpartei,
      betrag: s.betrag,
      datum: s.datum,
    });
  }

  return { setzen, unveraendert, uebersprungen: { handverlesen, umschichtung, ohneVorschlag } };
}

/**
 * Lädt Bestand und Quellen und rechnet den Plan — der Weg, den die Oberfläche geht.
 *
 * Bewusst dieselben Quellen wie beim Import (`kategorisierungsquellen`): der Abgleich soll
 * genau das ergeben, was ein Neuimport ergäbe. Zwei Ladewege wären zwei Gelegenheiten,
 * eine Quelle zu vergessen — und die Abweichung fiele erst auf, wenn jemand die Zahlen
 * vergleicht.
 */
export async function abgleichVorschau(
  ledger: LedgerPort,
  umsatzRepo: UmsatzRepository,
  quellen: QuellenDeps,
): Promise<Abgleichsplan> {
  const [spuren, kontext] = await Promise.all([
    zahlungsspuren(ledger, umsatzRepo),
    kategorisierungsquellen(quellen),
  ]);
  return kategorieAbgleich(spuren, kontext);
}

/** Die Wechsel, bei denen sich auch der Charakter ändert. */
export function charakterWechsel(plan: Abgleichsplan): Kategoriewechsel[] {
  return plan.setzen.filter((w) => w.charakter !== w.vonCharakter);
}

/** Ein Übergang „von Kategorie A nach Kategorie B" samt seiner Fälle. */
export interface Uebergang {
  readonly vonKategorieId?: string;
  readonly nachKategorieId: string;
  readonly anzahl: number;
  /** Die ersten Fälle — genug, um zu beurteilen, ob der Übergang stimmt. */
  readonly beispiele: readonly Kategoriewechsel[];
}

/**
 * Fasst den Plan zu Übergängen zusammen — „118 × Sonstiges → Drogerie".
 *
 * Eine Liste aus tausend Zeilen ist keine Vorschau: niemand liest sie, und wer sie
 * bestätigt, hat nichts geprüft. Die Übergänge sind dagegen zählbar, und ein falscher
 * fällt sofort auf. Absteigend nach Anzahl, weil der größte Block das größte Risiko ist.
 */
export function uebergaenge(plan: Abgleichsplan, beispieleJe = 3): Uebergang[] {
  const nach = new Map<string, Kategoriewechsel[]>();
  for (const w of plan.setzen) {
    const schluessel = `${w.vonKategorieId ?? ""}→${w.nachKategorieId}`;
    const liste = nach.get(schluessel);
    if (liste) liste.push(w);
    else nach.set(schluessel, [w]);
  }
  return [...nach.values()]
    .map((liste) => ({
      vonKategorieId: liste[0].vonKategorieId,
      nachKategorieId: liste[0].nachKategorieId,
      anzahl: liste.length,
      beispiele: liste.slice(0, beispieleJe),
    }))
    .sort((a, b) => b.anzahl - a.anzahl);
}

/**
 * Schreibt einen bestätigten Plan.
 *
 * Bewusst am Ledger-Port vorbei an `buchungBearbeiten`: der setzt die Herkunft auf
 * `manuell`, und das ist hier genau falsch. Was die Automatik schreibt, bleibt für die
 * Automatik offen — sonst wäre der erste Abgleich zugleich der letzte, weil er seinen
 * eigenen Bestand zu Handarbeit erklärte.
 *
 * Liefert die Zahl der tatsächlich geschriebenen Buchungen. Ein Wechsel, dessen Buchung
 * inzwischen weg ist, fällt still durch — der Plan kann älter sein als der Bestand.
 */
export async function planAnwenden(
  ledger: LedgerPort,
  plan: Abgleichsplan,
): Promise<number> {
  const buchungen = new Map((await ledger.alle()).map((b) => [b.id, b]));
  let geschrieben = 0;
  for (const w of plan.setzen) {
    const b = buchungen.get(w.istbuchungId);
    if (!b) continue;
    await ledger.speichern({
      ...b,
      kategorieId: w.nachKategorieId,
      charakter: w.charakter,
      kategorieHerkunft: "automatisch",
    });
    geschrieben++;
  }
  return geschrieben;
}
