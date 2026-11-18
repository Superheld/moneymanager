// Wo das Geld liegt — je Konto, welche Rücklagen dort Geld beanspruchen, was davon
// gedeckt ist und was frei bleibt; dazu die Rücklagen, die auf keinem Konto liegen.
//
// Die Frage hatte bis 2026-11-16 nur eine Antwort je Konto (im Kontoauszug, Karte
// „Gebunden auf …"). Wer wissen wollte, wo sein zurückgelegtes Geld insgesamt liegt,
// musste jedes Konto einzeln öffnen. Diese Sicht stellt dieselbe Belegung auf ein Blatt.
//
// Gerechnet wird hier NICHTS Neues: die Zahlen kommen aus der Kontobelegung
// (`core/konten/kontobelegung`, zusammengetragen von `belegungssicht`). Hier wird nur
// ausgewählt, welche Konten etwas tragen, und welche Rücklage auf keinem liegt.

import {
  anspruchAm,
  ruecklagenart,
  type Anspruchsbestand,
  type Cent,
  type Kontobelegung,
  type Ruecklage,
  type Ruecklagenart,
  type Zahlungskonto,
} from "../../core";
import { vertragsBuchungenLaden } from "../vertraege/vertragszuordnung";
import { anspruchsbestand, belegungssicht, zustaendigkeitssichtMit, type Belegungssicht, type KontobelegungDeps } from "../kontobelegung";
import { ruecklagenbestandLaden } from "./ruecklagenbestand";

/** Ein Konto, auf dem mindestens eine Rücklage Geld beansprucht. */
export interface GeldAufKonto {
  readonly kontoId: string;
  /** Bezeichnung des Kontos. */
  readonly konto: string;
  /** Die Belegung dieses Kontos, die Posten grösster zuerst. */
  readonly belegung: Kontobelegung;
}


/**
 * Eine Rücklage, deren Geld auf keinem Konto steht — sie ist reine Rechnung: kein Konto
 * eingetragen, oder das eingetragene gibt es nicht mehr.
 */
export interface RuecklageOhneKonto {
  readonly id: string;
  /**
   * Die Sorte. Bis Migration 81 stand hier die Form (`hand` für eine Rücklage, `kategorie`
   * für ein aufbauendes Budget); seither sind beide Rücklagen, und was sie unterscheidet,
   * ist, ob sie weiterläuft oder abgeschlossen wird.
   */
  readonly art: Ruecklagenart;
  readonly name: string;
  /** Was sie heute beansprucht, nie unter null — derselbe Betrag wie in der Kontobelegung. */
  readonly anspruch: Cent;
}

export interface GeldJeKonto {
  /** In der Reihenfolge der Kontenliste; nur Konten mit mindestens einem Anspruch. */
  readonly konten: readonly GeldAufKonto[];
  /** Wie ein Anspruch heisst: die Bezeichnung der Rücklage. */
  readonly namen: ReadonlyMap<string, string>;
  /** Rücklagen, die auf keinem Konto liegen, grösster Anspruch zuerst. */
  readonly ohneKonto: readonly RuecklageOhneKonto[];
}

/**
 * Die Sicht aus einer schon gerechneten Belegung.
 *
 * Ein Konto ohne Anspruch fehlt: eine Zeile „nichts gebunden" sagte nur, was die
 * Kontenliste schon sagt. Ein stillgelegtes Konto, auf dem noch etwas beansprucht wird,
 * steht dagegen da — das Geld liegt dort, ob das Konto noch geführt wird oder nicht.
 */
export function geldJeKonto(
  belegung: Belegungssicht,
  konten: readonly Zahlungskonto[],
  ruecklagen: readonly Ruecklage[],
  heute: string,
  /** Was die Rücklagen über ihre Kategorie gefunden haben (`anspruchsbestand`). */
  bestand: Anspruchsbestand = {},
): GeldJeKonto {
  const bekannt = new Set(konten.map((k) => k.id));

  const aufKonten: GeldAufKonto[] = [];
  for (const k of konten) {
    const b = belegung.jeKonto.get(k.id);
    if (!b || b.posten.length === 0) continue;
    aufKonten.push({
      kontoId: k.id,
      konto: k.bezeichnung,
      belegung: { ...b, posten: [...b.posten].sort((x, y) => y.betrag - x.betrag) },
    });
  }

  const ohneKonto = ruecklagen
    .filter((r) => !r.kontoId || !bekannt.has(r.kontoId))
    .map((r): RuecklageOhneKonto => ({
      id: r.id,
      art: ruecklagenart(r),
      name: r.bezeichnung,
      // Derselbe Anspruch wie auf einem Konto: der Stand, abzüglich dessen, was sie über
      // ihre Kategorie gefunden hat.
      anspruch: anspruchAm(r, heute, bestand),
    }))
    .sort((a, b) => b.anspruch - a.anspruch);

  return { konten: aufKonten, namen: belegung.namen, ohneKonto };
}

export async function geldJeKontoLaden(deps: KontobelegungDeps, heute: string): Promise<GeldJeKonto> {
  const [konten, buchungen, rb, kategorien, budgets, vertragsBuchungen] = await Promise.all([
    deps.kontoRepo.alle(),
    deps.ledger.alle(),
    ruecklagenbestandLaden(deps.ruecklagenRepo, deps.ruecklagenzuordnungRepo),
    deps.kategorieRepo.alle(),
    deps.budgetRepo.alle(),
    vertragsBuchungenLaden(deps.zuordnungRepo),
  ]);
  const ruecklagen = rb.ruecklagen;
  const sicht = zustaendigkeitssichtMit({ buchungen, kategorien, budgets, vertragsBuchungen }, rb);
  const belegung = belegungssicht({ konten, buchungen, ruecklagen, sicht }, heute);
  return geldJeKonto(belegung, konten, ruecklagen, heute, anspruchsbestand(sicht));
}
