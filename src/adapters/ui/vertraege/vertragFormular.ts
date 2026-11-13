// Das Formular eines Vertrags als Datenform, und die Wege hinein: leer, aus einem
// bestehenden Vertrag, aus einem erkannten Kandidaten, aus einer Buchung.
//
// Bis 2026-11-10 stand das am Anfang von `VertragModal.tsx` (K3 der Oberflächenliste) —
// reine Umrechnungen ohne Oberfläche, die auch der Vertragsbereich selbst aufruft.

import {
  minorZuMajor,
  type Charakter,
  type Rhythmus,
  type Verlaengerungsart,
  type Vertragsart,
  type Vertrag,
  type Regelvorlage,
  type Vertragskandidat,
  type Zahlungsregel,
} from "../../../application";
import {  type Geld } from "../bausteine/einstellungenKontext";

/**
 * Der Formularzustand als eigener Typ. Die Beträge und Monatszahlen stehen als TEXT
 * darin, nicht als Zahl: solange getippt wird, ist „1,2" ein legitimer Zwischenstand,
 * den kein Cent-Integer abbilden kann. Umgerechnet wird beim Speichern.
 */
export interface VertragFormular {
  anbieter: string;
  inhaberId: string;
  beginn: string;
  ersteZahlung: string;
  mindestlaufzeit: string;
  verlaengerung: Verlaengerungsart;
  verlaengerungMonate: string;
  art: Vertragsart;
  kuendigungsfrist: string;
  betragText: string;
  rhythmus: Rhythmus;
  charakter: Charakter;
  kategorieId: string;
  kontoId: string;
  /**
   * Zielkonto einer Umbuchung. Steht nur zur Wahl, wenn der Charakter „Umschichtung"
   * ist — bei Aufwand oder Ertrag verlässt das Geld den erfassten Bereich, und ein
   * Zielkonto behauptete etwas anderes.
   */
  gegenkontoId: string;
  /**
   * SEPA-Gläubiger-ID aus einem übernommenen Vorschlag. Kein Eingabefeld — sie wird
   * durchgereicht, nicht getippt. Sie landet in der Erkennungsregel des Vertrags, wo sie
   * der präziseste Schlüssel ist, den es gibt (siehe core/vertragZuordnung).
   */
  glaeubigerId: string;
  /**
   * Was an der erkannten Zahlungsreihe gemessen wurde — Betragsgrenzen und
   * Fälligkeitsfenster für die Erkennungsregel (siehe `core/regelvorlage`). Wie die
   * Gläubiger-ID kein Eingabefeld, sondern etwas, das ein übernommener Vorschlag
   * mitbringt und die Maske nur durchreicht.
   */
  vorlage?: Regelvorlage;
}


/** Leere Maske; `heute` belegt Beginn und erste Zahlung vor. */
export function leeresFormular(heute: string): VertragFormular {
  return {
    anbieter: "",
    inhaberId: "",
    beginn: heute,
    ersteZahlung: heute,
    mindestlaufzeit: "",
    verlaengerung: "automatisch",
    verlaengerungMonate: "12",
    art: "abo",
    kuendigungsfrist: "",
    betragText: "",
    rhythmus: "monatlich",
    charakter: "Aufwand",
    kategorieId: "",
    kontoId: "",
    gegenkontoId: "",
    glaeubigerId: "",
  };
}

/**
 * Bestehender Vertrag + seine Regel → Maske. Der Betrag kommt POSITIV in die Maske;
 * die Richtung trägt der Charakter, und `vertragAnlegen` setzt das Vorzeichen daraus.
 */

export function formularAusVertrag(v: Vertrag, r: Zahlungsregel | undefined, geld: Geld): VertragFormular {
  return {
    anbieter: v.anbieter,
    inhaberId: v.inhaberId ?? "",
    beginn: v.beginn,
    // Die erste Fälligkeit steht an der Regel, nicht am Vertrag: der Beginn trägt die
    // Fristen, die erste Zahlung den Takt der Planung.
    ersteZahlung: r?.startdatum ?? v.beginn,
    mindestlaufzeit: v.mindestlaufzeitMonate != null ? String(v.mindestlaufzeitMonate) : "",
    verlaengerung: v.verlaengerung,
    verlaengerungMonate: v.verlaengerungMonate != null ? String(v.verlaengerungMonate) : "12",
    art: v.art ?? "abo",
    kuendigungsfrist: v.kuendigungsfristMonate != null ? String(v.kuendigungsfristMonate) : "",
    betragText: r ? String(minorZuMajor(Math.abs(r.betrag), geld.waehrung)) : "",
    rhythmus: r?.rhythmus ?? "monatlich",
    charakter: r?.charakter ?? "Aufwand",
    kategorieId: r?.kategorieId ?? "",
    kontoId: r?.kontoId ?? "",
    gegenkontoId: r?.gegenkontoId ?? "",
    // Beim Bearbeiten steht die Erkennungsregel nicht zur Debatte — sie hat ihre eigene
    // Maske und darf hier nicht überschrieben werden.
    glaeubigerId: "",
  };
}

/** Erkannter Kandidat → Maske. Bestätigt wird in der Maske, nicht in der Vorschlagsliste. */

export function formularAusKandidat(k: Vertragskandidat, heute: string, geld: Geld): VertragFormular {
  return {
    ...leeresFormular(heute),
    anbieter: k.anbieter,
    beginn: k.ersteZahlung,
    ersteZahlung: k.ersteZahlung,
    betragText: String(minorZuMajor(k.betrag, geld.waehrung)),
    rhythmus: k.rhythmus,
    charakter: k.charakter,
    kategorieId: k.kategorieId ?? "",
    // Das Konto, über das die erkannten Zahlungen tatsächlich liefen — steht in den
    // Buchungen und muss nicht noch einmal gesucht werden.
    kontoId: k.kontoId ?? "",
    glaeubigerId: k.glaeubigerId ?? "",
    // Was die Lupe am Vorschlag ANZEIGT, soll in der Regel auch ANKOMMEN. Ohne diese
    // Zeile entstand die Erkennung allein aus Name und Median-Betrag, und die gemessenen
    // Termine und Betragsgrenzen waren nach dem Übernehmen nirgends mehr zu finden.
    vorlage: k.vorlage,
  };
}

/**
 * Gebuchte Zahlung → Maske. Der Weg dahin ist die Buchungsansicht: man stößt beim
 * Durchsehen auf eine Zahlung, die offensichtlich wiederkehrt, und will sie in die
 * Planung heben, ohne Empfänger und Betrag abzutippen.
 *
 * Was die Buchung NICHT weiß, ist der Rhythmus — eine einzelne Zahlung hat keinen. Er
 * bleibt auf „monatlich" und gehört in der Maske geprüft. Wer den Takt aus dem Bestand
 * hergeleitet haben will, nimmt den Vorschlag im Vertrags-Screen; der rechnet über alle
 * Zahlungen derselben Gegenpartei.
 *
 * `datum` wird Beginn UND erste Fälligkeit: eine schon erfolgte Zahlung ist der beste
 * Anker für den Takt, und die Fristen lassen sich in der Maske nachtragen.
 */

export function formularAusBuchung(
  e: { datum: string; betrag: number; charakter: Charakter; kategorieId?: string; kontoId: string },
  anbieter: string,
  geld: Geld,
  glaeubigerId?: string,
): VertragFormular {
  return {
    ...leeresFormular(e.datum),
    anbieter,
    // Die Gläubiger-ID vom BELEG, wenn es eine gibt. Sie ist das einzige Merkmal, das den
    // Einzieher eindeutig benennt — der Empfängername ist Text mit Unschärfe. Sie hier
    // wegzulassen hiess: der Beleg trug die belastbare Angabe, und die Regel, die aus ihm
    // entsteht, verliess sich trotzdem allein auf den Namen.
    glaeubigerId: glaeubigerId ?? "",
    betragText: String(minorZuMajor(Math.abs(e.betrag), geld.waehrung)),
    charakter: e.charakter,
    kategorieId: e.kategorieId ?? "",
    kontoId: e.kontoId,
  };
}

/**
 * Ein abgesetzter Block in der Maske. Die Felder eines Vertrags zerfallen in zwei
 * Gruppen, die verschieden viel wiegen: was in die Planung rechnet (Betrag, Rhythmus,
 * Fälligkeit, Konto) und was nur die Konditionen beschreibt (Laufzeit, Fristen). Als
 * eine durchgehende Wand aus Eingabefeldern sah beides gleich wichtig aus.
 *
 * `einklappbar` geht noch einen Schritt weiter: die Konditionen sind beim Anlegen fast
 * immer leer und werden selten angefasst — ausgeklappt kosten sie die halbe Maske für
 * Felder, die niemand ausfüllt. Zugeklappt bleiben sie EINE Zeile, die sagt, dass es
 * sie gibt. Aufgeklappt wird bewusst, nicht beim Scrollen.
 *
 * Auch beim Bearbeiten bleibt der Block zu: was drinsteht, sagt der `hinweis` in der
 * zugeklappten Zeile. Aufklappen muss nur, wer ÄNDERN will.
 *
 * Bewusst kein `<details>`: dessen Marker und Bündigkeit lassen sich über Browser
 * hinweg nicht verlässlich an die übrigen Abschnittsköpfe angleichen. Base UI
 * `Collapsible` (seit 2026-11-10) verbindet Kopf und Inhalt über `aria-controls`, ohne
 * Vorgaben fürs Aussehen.
 */
