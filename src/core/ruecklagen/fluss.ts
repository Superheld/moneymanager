// Der Rücklagenfluss — was von den liquiden Mitteln in die Rücklagen wandert.
//
// Die Frage klingt nach einer Zahl und ist drei, und darin liegt der ganze Nutzen:
//
//   BEDARF  was die Rücklagen VERLANGEN — Σ ihrer Monatsraten. Eine Rechnung, kein Plan.
//   PLAN    was du dafür EINGERICHTET hast — Σ der Umbuchungsverträge auf Rücklagenkonten.
//   IST     was tatsächlich EINGEGANGEN ist — jede Einzahlung auf ein Rücklagenkonto im
//           Zeitraum, Zinsen eingeschlossen; eine Umbuchung nur, wenn sie nicht von einem
//           anderen Rücklagenkonto kommt (das wäre ein Umräumen, kein Zugang).
//
// **Das Ist hiess bis 2026-11-08 „geflossen" und zählte nur das abgehende Bein einer
// Umbuchung vom liquiden Konto.** Was sonst auf dem Rücklagenkonto ankam — Zinsen, eine
// Überweisung vom Sparkonto, eine Gutschrift —, stand nirgends, und „geflossen" sagte
// nicht, was gemeint war. Jetzt zählt die Empfängerseite, und die Oberfläche zeigt die
// Buchungen dazu.
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
// WOHIN gerechnet wird, entscheidet `ruecklagenKonten`: ein Konto der Klasse RÜCKLAGE
// oder eines, dem eine Rücklage zugeordnet ist. Bis 2026-11-08 zählte jedes nicht
// liquide Ziel, auch Vorsorge, Sparen und Investment; danach einen Tag lang allein die
// Klasse Rücklage — und wer seine Rücklagen auf einem anders eingestuften Konto führte,
// sah hier keinen einzigen Eingang.

import type { IstBuchung } from "../buchung/istbuchung";
import type { Cent } from "../basis/geld";
import type { Zahlungskonto } from "../konten/konto";
import { istLiquide } from "../konten/konto";
import type { Zahlungsregel } from "../basis/zahlungsregel";
import { RHYTHMUS_MONATE } from "../basis/zahlungsregel";
import { istUmbuchungsregel } from "../vertraege/umbuchungErkennung";
import { monatsRuecklageGesamt, ruecklagenKonten, type Ruecklage } from "./ruecklage";

export interface Flussposten {
  readonly buchungId: string;
  readonly datum: string;
  /** POSITIV — was eingegangen ist. */
  readonly betrag: Cent;
  /** Woher, wenn es eine Umbuchung von einem eigenen Konto war; sonst leer (Zinsen, Gutschrift). */
  readonly vonKontoId?: string;
  /** Das Rücklagenkonto, auf dem es einging. */
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
  const ziele = ruecklagenKonten(konten, ruecklagen);
  const istZiel = (id: string | undefined): boolean => !!id && ziele.has(id);
  const istQuelle = (id: string | undefined): boolean => {
    const k = id ? klasse.get(id) : undefined;
    return !!k && istLiquide(k);
  };

  const posten: Flussposten[] = [];
  for (const b of buchungen) {
    // Die EMPFÄNGERSEITE: was auf einem Rücklagenkonto eingeht. Nur Zugänge — eine
    // Umbuchung liegt als Paar vor, und nur ihr ankommendes Bein steht hier, die Summe
    // zählt sie also einmal.
    if (b.betrag <= 0) continue;
    if (b.datum < von || b.datum >= bis) continue;
    if (!istZiel(b.kontoId)) continue;
    // Von einem anderen Rücklagenkonto ist es Umräumen innerhalb der Rücklagen.
    if (istZiel(b.gegenkontoId)) continue;
    posten.push({
      buchungId: b.id,
      datum: b.datum,
      betrag: b.betrag,
      ...(b.gegenkontoId ? { vonKontoId: b.gegenkontoId } : {}),
      nachKontoId: b.kontoId,
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
