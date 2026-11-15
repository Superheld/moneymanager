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
  sollRuecklage,
  type Budget,
  type Cent,
  type Kontobelegung,
  type Ruecklage,
  type Zahlungskonto,
} from "../../core";
import { vertragsBuchungenLaden } from "../budgets/budgetsichten";
import { belegungssicht, type Belegungssicht, type KontobelegungDeps } from "../konten/kontobelegung";

/** Ein Konto, auf dem mindestens eine Rücklage Geld beansprucht. */
export interface GeldAufKonto {
  readonly kontoId: string;
  /** Bezeichnung des Kontos. */
  readonly konto: string;
  /** Die Belegung dieses Kontos, die Posten grösster zuerst. */
  readonly belegung: Kontobelegung;
}

/**
 * Eine Rücklage, deren Geld auf keinem Konto steht — sie ist reine Rechnung.
 *
 * Von Hand: kein Konto eingetragen, oder das eingetragene gibt es nicht mehr. Über die
 * Kategorie: ihr Konto gibt es nicht mehr (eintragen muss man eines immer).
 */
export interface RuecklageOhneKonto {
  readonly id: string;
  /** `hand` ist eine Rücklage, `kategorie` ein aufbauendes Budget. */
  readonly form: "hand" | "kategorie";
  readonly name: string;
  /**
   * Was sie heute beansprucht: das Soll (von Hand) bzw. der Rest (über die Kategorie),
   * nie unter null. Dieselben Beträge wie in der Kontobelegung.
   */
  readonly anspruch: Cent;
}

export interface GeldJeKonto {
  /** In der Reihenfolge der Kontenliste; nur Konten mit mindestens einem Anspruch. */
  readonly konten: readonly GeldAufKonto[];
  /** Wie ein Anspruch heisst: Bezeichnung der Rücklage bzw. Kategorie des Budgets. */
  readonly namen: ReadonlyMap<string, string>;
  /** Rücklagen beider Formen, die auf keinem Konto liegen, grösster Anspruch zuerst. */
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
  budgets: readonly Budget[],
  heute: string,
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

  // Den Rest eines Budgets auf einem verschwundenen Konto liest die Belegung: sie führt
  // es mit Stand 0, „ungedeckt, nicht verschwunden" (`kontobelegung`).
  const restAufVerschwundenem = (b: Budget): Cent =>
    belegung.jeKonto.get(b.kontoId)?.posten.find((p) => p.art === "budget" && p.id === b.id)?.betrag ?? 0;

  const ohneKonto: RuecklageOhneKonto[] = [
    ...ruecklagen
      .filter((r) => !r.kontoId || !bekannt.has(r.kontoId))
      .map((r): RuecklageOhneKonto => ({
        id: r.id,
        form: "hand",
        name: r.bezeichnung,
        anspruch: Math.max(0, sollRuecklage(r, heute)),
      })),
    ...budgets
      .filter((b) => b.art === "aufbauend" && !bekannt.has(b.kontoId))
      .map((b): RuecklageOhneKonto => ({
        id: b.id,
        form: "kategorie",
        name: belegung.namen.get(b.id) ?? "?",
        anspruch: restAufVerschwundenem(b),
      })),
  ].sort((a, b) => b.anspruch - a.anspruch);

  return { konten: aufKonten, namen: belegung.namen, ohneKonto };
}

export async function geldJeKontoLaden(deps: KontobelegungDeps, heute: string): Promise<GeldJeKonto> {
  const [konten, buchungen, ruecklagen, kategorien, budgets, vertragsBuchungen] = await Promise.all([
    deps.kontoRepo.alle(),
    deps.ledger.alle(),
    deps.ruecklagenRepo.alle(),
    deps.kategorieRepo.alle(),
    deps.budgetRepo.alle(),
    vertragsBuchungenLaden(deps.zuordnungRepo),
  ]);
  const belegung = belegungssicht(
    { konten, buchungen, ruecklagen, sicht: { buchungen, kategorien, budgets, vertragsBuchungen } },
    heute,
  );
  return geldJeKonto(belegung, konten, ruecklagen, budgets, heute);
}
