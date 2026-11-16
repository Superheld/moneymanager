// Ausgabenvorschläge — lädt zusammen, was die reine Funktion `core/ausgabenvorschlaege`
// braucht, und liefert ihre beiden Listen: Budgets und Rücklagen.
//
// In der Wurzel und nicht in einem Bereich, aus demselben Grund wie im Kern: zwei
// Bereiche lesen hieraus (`budgets/budgetvorschlaege`, `ruecklagen/ruecklagenvorschlaege`),
// und beide müssen dieselbe Einstufung über dieselben Buchungen sehen. Läge das Laden
// zweimal da, könnte eine Kategorie in einem Bereich mit, im anderen ohne Vertragsanteil
// gerechnet werden — und stünde dann in beiden Listen oder in keiner. Was die Bereiche
// unterscheidet, ist allein ihr Merkzettel der verworfenen Vorschläge; der bleibt bei ihnen.
//
// Der interessante Teil ist, WELCHE Buchungen als vertraglich gebunden gelten. Hier ist
// es die VEREINIGUNG aus zwei Quellen, und das ist Absicht:
//
//   • `vertragskandidaten` — Wiederkehr-Erkennung über die Zahlungsspuren. Sie findet
//     auch regelmäßige Zahlungen, zu denen NIEMAND einen Vertrag erfasst hat. Genau die
//     braucht ein Vorschlag: er soll sagen, wieviel einer Kategorie überhaupt steuerbar
//     ist, und ein nicht erfasster Dauerauftrag ist genauso wenig steuerbar wie ein
//     erfasster.
//   • die erfassten Zuordnungen (`vertrag_id` an der Buchung) — die harte Verknüpfung
//     Buchung↔Vertrag, dieselbe, an der auch der VERBRAUCH hängt.
//
// Warum nicht eine Quelle für beides: die Fragen sind verschieden. Der Verbrauch fragt
// „ist diese Zahlung schon anderswo verplant?" — dafür ist die erfasste Verknüpfung
// richtig, eine Vermutung wäre zu wenig. Der Vorschlag fragt „wieviel hiervon kann ich
// überhaupt beeinflussen?" — dafür wäre nur die Verknüpfung zu wenig, weil sie das noch
// nicht Erfasste übersieht und der Rahmen dann zu hoch ausfiele.

import { ausgabenvorschlaege as berechnen, vertragskandidaten } from "../core";
import type { Ausgabenvorschlaege, Ruecklage } from "../core";
import { spurenAus } from "./buchung/zahlungsspuren";
import type {
  BudgetRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  VertragszuordnungRepository,
} from "./ports";

export interface AusgabenvorschlagDeps {
  readonly ledger: LedgerPort;
  readonly umsatzRepo: UmsatzRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly budgetRepo: BudgetRepository;
  /** Die erfassten Buchung↔Vertrag-Verknüpfungen; ohne sie zählen nur die Kandidaten. */
  readonly zuordnungRepo?: VertragszuordnungRepository;
}

/**
 * Beide Listen für Hauptkategorien, an denen noch nichts hängt.
 *
 * `bisMonat` ist „YYYY-MM" — der letzte Monat des Auswertungsfensters. `heute` braucht
 * nur die Vertragserkennung, um laufende von beendeten Verträgen zu trennen.
 */
export async function ausgabenvorschlaegeLaden(
  deps: AusgabenvorschlagDeps,
  bisMonat: string,
  heute: string,
  /**
   * Die Anteile, die eine Rücklage trägt oder die auf eine Zuordnung warten
   * (`ruecklagenAnteile`) — sie zählen in keinen Vorschlag.
   */
  vonRuecklagen: ReadonlySet<string> = new Set(),
  /**
   * Die laufenden Rücklagen: an ihrer Kategorie wird nichts vorgeschlagen — weder ein
   * Budget (dort lässt die App keines neu anlegen) noch eine zweite Rücklage.
   */
  ruecklagen: readonly Pick<Ruecklage, "kategorieId">[] = [],
): Promise<Ausgabenvorschlaege> {
  const [buchungen, umsaetze, kategorien, budgets] = await Promise.all([
    deps.ledger.alle(),
    deps.umsatzRepo.alle(),
    deps.kategorieRepo.alle(),
    deps.budgetRepo.alle(),
  ]);

  const vertraglich = new Set(
    vertragskandidaten(spurenAus(buchungen, umsaetze), heute).flatMap((k) => k.buchungIds),
  );
  // Dazu, was ausdrücklich an einem Vertrag hängt — auch wenn die Wiederkehr-Erkennung
  // es nicht als Kandidat sieht (zu wenige Zahlungen, zu unregelmäßig, von Hand gesetzt).
  for (const z of (await deps.zuordnungRepo?.alle()) ?? []) {
    if (z.vertragId) vertraglich.add(z.istbuchungId);
  }

  // Ein Budget auf einer UNTERkategorie deckt ihre Hauptkategorie mit ab: sonst schlüge
  // die Karte „Lebenshaltung" vor, während schon ein Budget auf „Lebensmittel" läuft,
  // und die beiden Rahmen zählten dieselben Buchungen doppelt. Für eine Rücklage gilt
  // dasselbe.
  const byId = new Map(kategorien.map((k) => [k.id, k]));
  const belegt = new Set<string>();
  for (const kategorieId of [...budgets.map((b) => b.kategorieId), ...ruecklagen.flatMap((r) => (r.kategorieId ? [r.kategorieId] : []))]) {
    const k = byId.get(kategorieId);
    belegt.add(k?.elternId ?? kategorieId);
  }

  return berechnen(buchungen, kategorien, bisMonat, vertraglich, belegt, {}, vonRuecklagen);
}

/** Nimmt aus einer Liste, was ein Bereich verworfen hat. */
export function ohneVerworfene<T extends { readonly kategorieId: string }>(
  liste: readonly T[],
  verworfen: ReadonlySet<string>,
): T[] {
  return liste.filter((v) => !verworfen.has(v.kategorieId));
}
