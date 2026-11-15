// Rücklagen-Sicht — die Rücklagen samt Deckungsrechnung.
//
// Die Deckung ist der Grund, warum das hier steht und nicht im Screen: `ruecklagenDeckung`
// vergleicht den bis heute angesparten Bedarf mit dem, was auf den Konten liegt, und
// braucht dafür die realen Kontostände über den ganzen Buchungsbestand. Drei Auswahlen
// über zwei Aggregate — genau die Sorte Rechnung, die in einer Oberfläche irgendwann
// leicht anders noch einmal auftaucht.

import {
  kategorieUnterbaum,
  mindestRuecklage,
  monatsRuecklageGesamt,
  ruecklagenKonten,
  realerKontostand,
  ruecklagenDeckung,
  ruecklagenfluss,
  zielwertGesamt,
  type Cent,
  type Kategorie,
  type Ruecklage,
  type RuecklagenDeckung,
  type Ruecklagenfluss,
  type Zahlungskonto,
} from "../../core";
import type {
  LedgerPort,
  RuecklagenAusbuchung,
  RuecklagenRepository,
  UmsatzRepository,
  VertragRepository,
  ZahlungskontoRepository,
  ZahlungsregelRepository,
} from "../ports";
import { spurenAus } from "../buchung/zahlungsspuren";
import { budgetAnspruecheLaden, type BudgetanspruchDeps } from "../konten/kontobelegung";

/**
 * Die Budget-Seite gehört dazu, weil ein aufbauendes Budget auf demselben Konto denselben
 * Euro beanspruchen kann. Ohne sie verteilte die Deckung Geld, das schon dem Budget gehört.
 */
export interface RuecklagenDeps extends BudgetanspruchDeps {
  readonly ruecklagenRepo: RuecklagenRepository;
  readonly ledger: LedgerPort;
  readonly kontoRepo: ZahlungskontoRepository;
  readonly regelRepo: ZahlungsregelRepository;
  readonly vertragRepo: VertragRepository;
  readonly umsatzRepo: UmsatzRepository;
}

/** Eine Buchung, wie sie in der Auswahl beim Ausbuchen steht. */
export interface Buchungswahl {
  readonly id: string;
  readonly datum: string;
  readonly betrag: Cent;
  /** Empfänger, sonst die Notiz — das, woran man die Zahlung wiedererkennt. */
  readonly bezeichnung: string;
  /** Die Kategorie der Buchung; fehlt bei einer geteilten oder noch nicht eingeordneten. */
  readonly kategorieId?: string;
}

/** Eine Buchung in der Auswahl EINER Rücklage — mit der Auskunft, ob sie nahe liegt. */
export interface Buchungsvorschlag extends Buchungswahl {
  /** Liegt die Buchung in der Kategorie der Rücklage (oder darunter)? */
  readonly passt: boolean;
}

/**
 * Die Auswahl beim Ausbuchen EINER Rücklage: zuerst, was in ihrer Kategorie liegt, dann
 * die jüngsten Abflüsse.
 *
 * Die Kategorie einer Rücklage ist damit ein VORSCHLAG und keine Regel. Zugeordnet wird
 * weiterhin von Hand, eine Buchung je Ausbuchung: eine Rücklage ist ein Gegenstand mit
 * einem Kauf, und welcher Kauf es war, weiss nur, wer ihn getätigt hat. Wer viele
 * Ausgaben über eine Kategorie aus einem Topf bezahlen will, nimmt ein aufbauendes
 * Budget — dort zählt die Kategorie von selbst.
 *
 * Ohne Kategorie an der Rücklage ist die Liste dieselbe wie bisher.
 */
export function buchungswahlFuer(
  sicht: Pick<Ruecklagensicht, "buchungswahl" | "kategorien">,
  ruecklage: Pick<Ruecklage, "kategorieId">,
): Buchungsvorschlag[] {
  const baum = ruecklage.kategorieId ? kategorieUnterbaum(sicht.kategorien, ruecklage.kategorieId) : new Set<string>();
  const alle = sicht.buchungswahl.map((b) => ({ ...b, passt: !!b.kategorieId && baum.has(b.kategorieId) }));
  // `buchungswahl` ist schon nach Datum sortiert, neueste zuerst; die Teilung erhält das.
  return [...alle.filter((b) => b.passt), ...alle.filter((b) => !b.passt)].slice(0, WAHL_ANZAHL);
}

/**
 * So viele Abflüsse stehen beim Ausbuchen zur Auswahl.
 *
 * Eine Auswahl über den ganzen Bestand wäre eine Liste, die niemand durchsieht; die
 * gesuchte Zahlung liegt in aller Regel wenige Tage zurück — oder in der Kategorie der
 * Rücklage, und die steht dann vorn (`buchungswahlFuer`).
 */
const WAHL_ANZAHL = 50;

export interface Ruecklagensicht {
  readonly ruecklagen: readonly Ruecklage[];
  readonly konten: readonly Zahlungskonto[];
  /** Für die Kategoriewahl im Dialog und für `buchungswahlFuer`. */
  readonly kategorien: readonly Kategorie[];
  readonly kontoNamen: ReadonlyMap<string, string>;
  /** Reicht das Ersparte für den bis heute aufgelaufenen Bedarf? */
  readonly deckung: RuecklagenDeckung;
  /** Summe der monatlichen Raten aller Rücklagen. */
  readonly proMonat: Cent;
  /** Summe der Ziele — freie Rücklagen zählen nicht mit, sie haben keins. */
  readonly zielwert: Cent;
  /** Faustformel: drei Monats-Vertragseinnahmen. Ein Massstab, keine Regel. */
  readonly mindest: Cent;
  /**
   * Was auf den Rücklagenkonten heute liegt (`ruecklagenKonten`: Klasse Rücklage oder
   * einer Rücklage zugeordnet) — die Zahl, die der Tacho gegen `mindest` stellt. Der
   * KONTOSTAND, nicht die Deckung: die Faustformel fragt nach dem Notgroschen insgesamt,
   * nicht danach, was davon schon einzelnen Zwecken oder Budgets gehört.
   */
  readonly ruecklagenStand: Cent;
  /** Die monatlichen Vertragseinnahmen, aus denen `mindest` folgt. */
  readonly vertragseinnahmen: Cent;
  /** Was bisher ausgebucht wurde, jüngste zuerst. */
  readonly ausbuchungen: readonly RuecklagenAusbuchung[];
  /** Abflüsse, die sich beim Ausbuchen verknüpfen lassen — jüngste zuerst. */
  readonly buchungswahl: readonly Buchungswahl[];
  /** Was von den liquiden Mitteln in die Rücklagen wandert — Bedarf, Plan und Ist. */
  readonly fluss: Ruecklagenfluss;
}

/**
 * Die monatlichen Einnahmen aus Verträgen, auf den Monat normalisiert.
 *
 * Nur laufende Verträge und nur Zuflüsse. Ein jährlicher Vertrag wird durch zwölf
 * geteilt: sonst hinge die Faustformel am Kalender — im Monat der Jahreszahlung
 * spränge die Mindestrücklage, in den elf anderen fehlte sie.
 */
function vertragseinnahmenProMonat(
  regeln: readonly { betrag: Cent; rhythmus: string; charakter: string; vertragId?: string }[],
): Cent {
  let summe = 0;
  for (const r of regeln) {
    if (!r.vertragId) continue;
    // Nur Erträge. Der Charakter entscheidet und nicht das Vorzeichen des Betrags: eine
    // Zahlungsregel ist eine PLANGRÖSSE, und dort trägt die Einordnung die Richtung
    // (siehe „Für eine PLANGRÖSSE bleibt die Ableitung" in `src/core/buchung/CLAUDE.md`).
    if (r.charakter !== "Ertrag") continue;
    const monate = RHYTHMUS_IN_MONATEN[r.rhythmus] ?? 1;
    summe += Math.abs(r.betrag) / monate;
  }
  return Math.round(summe);
}

/**
 * Wie viele Monate ein Rhythmus überspannt.
 *
 * Bewusst hier und nicht aus `RHYTHMUS_MONATE` des Kerns übernommen: dort steht die
 * Projektion für den Zahlungskalender, hier eine Normalisierung auf den Monat. Sollten
 * die beiden je auseinanderlaufen, ist das ein Fehler in genau einer von ihnen — und mit
 * einer geteilten Konstante fiele er in beiden zugleich falsch aus.
 */
const RHYTHMUS_IN_MONATEN: Record<string, number> = {
  monatlich: 1,
  vierteljaehrlich: 3,
  halbjaehrlich: 6,
  jaehrlich: 12,
};

/** Erster Tag des Folgemonats — die obere, ausschliessende Grenze des laufenden Monats. */
function monatDanach(heute: string): string {
  const [j, m] = heute.split("-").map(Number);
  const gesamt = j * 12 + m; // m ist 1-basiert, also schon der Folgemonat
  return `${String(Math.floor(gesamt / 12)).padStart(4, "0")}-${String((gesamt % 12) + 1).padStart(2, "0")}-01`;
}

export async function ruecklagenLaden(
  deps: RuecklagenDeps,
  heute: string,
): Promise<Ruecklagensicht> {
  const [ruecklagen, buchungen, konten, regeln, vertraege, ausbuchungen, umsaetze, budget, kategorien] =
    await Promise.all([
      deps.ruecklagenRepo.alle(),
      deps.ledger.alle(),
      deps.kontoRepo.alle(),
      deps.regelRepo.alle(),
      deps.vertragRepo.alle(),
      deps.ruecklagenRepo.ausbuchungen(),
      deps.umsatzRepo.alle(),
      budgetAnspruecheLaden(deps, heute),
      deps.kategorieRepo.alle(),
    ]);
  const kontostaende = new Map(konten.map((k) => [k.id, realerKontostand(k, buchungen)]));
  // Nur laufende Verträge: ein gekündigter zahlt nicht mehr ein, und eine Mindestrücklage
  // auf Einnahmen zu stützen, die es nicht mehr gibt, wäre die falsche Beruhigung.
  const laufend = new Set(vertraege.filter((v) => v.status === "aktiv").map((v) => v.id));
  const einnahmen = vertragseinnahmenProMonat(
    regeln.filter((r) => r.vertragId && laufend.has(r.vertragId)),
  );

  return {
    ruecklagen,
    konten,
    kategorien,
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    deckung: ruecklagenDeckung(ruecklagen, heute, kontostaende, budget.ansprueche),
    proMonat: monatsRuecklageGesamt(ruecklagen),
    zielwert: zielwertGesamt(ruecklagen),
    mindest: mindestRuecklage(einnahmen),
    ruecklagenStand: [...ruecklagenKonten(konten, ruecklagen)].reduce((s, id) => s + (kontostaende.get(id) ?? 0), 0),
    vertragseinnahmen: einnahmen,
    ausbuchungen: [...ausbuchungen].sort((a, b) => b.datum.localeCompare(a.datum)),
    // Das Ist über den LAUFENDEN Monat, weil Bedarf und Plan Monatsgrössen sind. Ein
    // Fenster über den ganzen Bestand daneben verglichen Jahre mit einem Monat.
    fluss: ruecklagenfluss(
      buchungen,
      konten,
      ruecklagen,
      regeln,
      `${heute.slice(0, 7)}-01`,
      monatDanach(heute),
    ),
    buchungswahl: spurenAus(buchungen, umsaetze)
      // Nur Abflüsse: eine Rücklage wird ausgegeben, nicht eingenommen.
      .filter((sp) => sp.betrag < 0)
      // ALLE Abflüsse, neueste zuerst — gekürzt wird in `buchungswahlFuer`, nachdem die
      // zur Rücklage passenden nach vorn geholt sind. Vorher gekürzt fiele die gesuchte
      // Zahlung heraus, sobald sie älter ist als die fünfzig jüngsten.
      .sort((a, b) => b.datum.localeCompare(a.datum))
      .map((sp) => ({
        id: sp.id,
        datum: sp.datum,
        betrag: sp.betrag,
        bezeichnung: sp.gegenpartei || sp.verwendungszweck || "",
        kategorieId: sp.kategorieId,
      })),
  };
}
