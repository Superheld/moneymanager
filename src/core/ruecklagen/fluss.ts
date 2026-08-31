// Der Rücklagenfluss — was von den liquiden Mitteln in die Rücklagen wandert.
//
// Die Frage klingt nach einer Zahl und ist drei, und darin liegt der ganze Nutzen:
//
//   BEDARF  was die Rücklagen VERLANGEN — Σ ihrer Monatsraten. Eine Rechnung, kein Plan.
//   PLAN    was du dafür EINGERICHTET hast — Σ der Umbuchungsverträge auf Rücklagenkonten.
//   IST     was tatsächlich GEFLOSSEN ist — die gebuchten Umschichtungen im Zeitraum.
//
// Sie stimmen selten überein, und jede Abweichung sagt etwas anderes. Bedarf über Plan
// heisst: du legst zu wenig zurück, die Deckung wird schlechter, ohne dass irgendwo etwas
// schiefgeht. Plan über Ist heisst: die Überweisung ist ausgefallen. Ist über Plan heisst
// meist, dass jemand von Hand etwas hinübergeschoben hat.
//
// Eine der drei Zahlen wegzulassen, hiesse, eine dieser Aussagen unbeantwortbar zu
// machen. Deshalb rechnet diese Datei alle drei und lässt die Oberfläche entscheiden,
// welche sie nebeneinander stellt.
//
// WOHIN gerechnet wird, entscheidet die KONTOKLASSE und nicht die Kontogruppe: die Klasse
// trägt Rechenregeln, die Gruppe ist eine Sicht (siehe CLAUDE.md). Ein Zufluss auf ein
// Konto der Klasse `ruecklage` oder `vorsorge` ist zurückgelegt; auf ein liquides ist er
// nur umgeschichtet.

import type { IstBuchung } from "../buchung/istbuchung";
import type { Cent } from "../basis/geld";
import type { Zahlungskonto } from "../konten/konto";
import { istLiquide } from "../konten/konto";
import type { Zahlungsregel } from "../basis/zahlungsregel";
import { RHYTHMUS_MONATE } from "../basis/zahlungsregel";
import { istUmbuchungsregel } from "../vertraege/umbuchungErkennung";
import { monatsRuecklageGesamt, type Ruecklage } from "./ruecklage";

export interface Flussposten {
  readonly buchungId: string;
  readonly datum: string;
  /** POSITIV — was zurückgelegt wurde. */
  readonly betrag: Cent;
  readonly vonKontoId: string;
  readonly nachKontoId: string;
}

export interface Ruecklagenfluss {
  /** Σ der Monatsraten aller Rücklagen — was die Rechnung verlangt. */
  readonly bedarf: Cent;
  /** Σ der eingerichteten Umbuchungen auf Rücklagenkonten, auf den Monat normalisiert. */
  readonly plan: Cent;
  /** Was im Zeitraum tatsächlich geflossen ist, positiv. */
  readonly ist: Cent;
  readonly posten: readonly Flussposten[];
}

/**
 * Die Monatsrate einer Zahlungsregel — ihr Betrag auf einen Monat heruntergerechnet.
 *
 * Ohne die Normalisierung hinge die Zahl am Kalender: im Monat einer vierteljährlichen
 * Umbuchung stünde ihr voller Betrag, in den zwei anderen nichts, und der Vergleich mit
 * dem Bedarf (der immer monatlich ist) ergäbe abwechselnd Über- und Unterdeckung.
 */
function monatsanteil(r: Zahlungsregel): Cent {
  const monate = RHYTHMUS_MONATE[r.rhythmus] ?? 1;
  return Math.round(Math.abs(r.betrag) / Math.max(1, monate));
}

/**
 * Rücklagenfluss im Fenster [von, bis).
 *
 * `bedarf` und `plan` sind MONATSGRÖSSEN und hängen nicht am Fenster — sie beschreiben
 * einen Zustand, keinen Zeitraum. `ist` ist die Summe über das Fenster. Wer die drei
 * über mehrere Monate vergleicht, muss die ersten beiden entsprechend hochrechnen; das
 * hier zu tun hiesse zu raten, wie viele Monate gemeint sind.
 */
export function ruecklagenfluss(
  buchungen: readonly IstBuchung[],
  konten: readonly Zahlungskonto[],
  ruecklagen: readonly Ruecklage[],
  regeln: readonly Zahlungsregel[],
  von: string,
  bis: string,
): Ruecklagenfluss {
  const klasse = new Map(konten.map((k) => [k.id, k]));
  const istZiel = (id: string | undefined): boolean => {
    const k = id ? klasse.get(id) : undefined;
    return !!k && !istLiquide(k);
  };
  const istQuelle = (id: string | undefined): boolean => {
    const k = id ? klasse.get(id) : undefined;
    return !!k && istLiquide(k);
  };

  const posten: Flussposten[] = [];
  for (const b of buchungen) {
    if (b.charakter !== "Umschichtung") continue;
    // Nur das abgehende Bein — sonst zählte dieselbe Verschiebung zweimal, einmal
    // negativ und einmal positiv, und die Summe wäre null.
    if (b.betrag >= 0) continue;
    if (b.datum < von || b.datum >= bis) continue;
    if (!istQuelle(b.kontoId) || !istZiel(b.gegenkontoId)) continue;
    posten.push({
      buchungId: b.id,
      datum: b.datum,
      betrag: -b.betrag,
      vonKontoId: b.kontoId,
      nachKontoId: b.gegenkontoId as string,
    });
  }

  const plan = regeln
    .filter((r) => istUmbuchungsregel(r) && istQuelle(r.kontoId) && istZiel(r.gegenkontoId))
    .reduce((s, r) => s + monatsanteil(r), 0);

  return {
    bedarf: monatsRuecklageGesamt(ruecklagen),
    plan,
    ist: posten.reduce((s, p) => s + p.betrag, 0),
    posten: posten.sort((a, b) => a.datum.localeCompare(b.datum)),
  };
}
