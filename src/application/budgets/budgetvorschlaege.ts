// Budgetvorschläge — lädt zusammen, was die reine Funktion `core/budgetVorschlag`
// braucht, und hält den Merkzettel der weggeklickten Vorschläge.
//
// Der interessante Teil ist, WELCHE Buchungen als vertraglich gebunden gelten. Hier ist
// es die VEREINIGUNG aus zwei Quellen, und das ist Absicht:
//
//   • `vertragskandidaten` — Wiederkehr-Erkennung über die Zahlungsspuren. Sie findet
//     auch regelmäßige Zahlungen, zu denen NIEMAND einen Vertrag erfasst hat. Genau die
//     braucht ein Vorschlag: er soll sagen, wieviel einer Kategorie überhaupt steuerbar
//     ist, und ein nicht erfasster Dauerauftrag ist genauso wenig steuerbar wie ein
//     erfasster.
//   • die erfassten Zuordnungen (`vertrag_zuordnung`) — die harte Verknüpfung
//     Buchung↔Vertrag, dieselbe, an der auch der VERBRAUCH hängt.
//
// Warum nicht eine Quelle für beides: die Fragen sind verschieden. Der Verbrauch fragt
// „ist diese Zahlung schon anderswo verplant?" — dafür ist die erfasste Verknüpfung
// richtig, eine Vermutung wäre zu wenig. Der Vorschlag fragt „wieviel hiervon kann ich
// überhaupt beeinflussen?" — dafür wäre nur die Verknüpfung zu wenig, weil sie das noch
// nicht Erfasste übersieht und der Rahmen dann zu hoch ausfiele.

import { ignorierenVermerken, ignorierteLesen } from "../einstellungen";
import { budgetvorschlaege as berechnen, vertragskandidaten } from "../../core";
import type { Budgetvorschlag } from "../../core";
import { spurenAus } from "../buchung/zahlungsspuren";
import type {
  BudgetRepository,
  EinstellungenRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  VertragszuordnungRepository,
} from "../ports";

const SCHLUESSEL_IGNORIERT = "budgetvorschlag.ignoriert";

export async function ignorierteBudgetvorschlaege(
  repo: EinstellungenRepository,
): Promise<Set<string>> {
  return ignorierteLesen(repo, SCHLUESSEL_IGNORIERT);
}

export async function budgetvorschlagIgnorieren(
  repo: EinstellungenRepository,
  kategorieId: string,
): Promise<void> {
  await ignorierenVermerken(repo, SCHLUESSEL_IGNORIERT, kategorieId);
}

/**
 * Vorschläge für Hauptkategorien ohne Budget.
 *
 * `bisMonat` ist „YYYY-MM" — der letzte Monat des Auswertungsfensters. `heute` braucht
 * nur die Vertragserkennung, um laufende von beendeten Verträgen zu trennen.
 */
export async function budgetvorschlaegeLaden(
  ledger: LedgerPort,
  umsatzRepo: UmsatzRepository,
  kategorieRepo: KategorieRepository,
  budgetRepo: BudgetRepository,
  bisMonat: string,
  heute: string,
  ignoriert: ReadonlySet<string> = new Set(),
  /** Die erfassten Buchung↔Vertrag-Verknüpfungen; ohne sie zählen nur die Kandidaten. */
  zuordnungRepo?: VertragszuordnungRepository,
): Promise<Budgetvorschlag[]> {
  const [buchungen, umsaetze, kategorien, budgets] = await Promise.all([
    ledger.alle(),
    umsatzRepo.alle(),
    kategorieRepo.alle(),
    budgetRepo.alle(),
  ]);

  const vertraglich = new Set(
    vertragskandidaten(spurenAus(buchungen, umsaetze), heute).flatMap((k) => k.buchungIds),
  );
  // Dazu, was ausdrücklich an einem Vertrag hängt — auch wenn die Wiederkehr-Erkennung
  // es nicht als Kandidat sieht (zu wenige Zahlungen, zu unregelmäßig, von Hand gesetzt).
  for (const z of (await zuordnungRepo?.alle()) ?? []) {
    if (z.vertragId) vertraglich.add(z.istbuchungId);
  }

  // Ein Budget auf einer UNTERkategorie deckt ihre Hauptkategorie mit ab: sonst schlüge
  // die Karte „Lebenshaltung" vor, während schon ein Budget auf „Lebensmittel" läuft,
  // und die beiden Rahmen zählten dieselben Buchungen doppelt.
  const byId = new Map(kategorien.map((k) => [k.id, k]));
  const belegt = new Set<string>();
  for (const b of budgets) {
    const k = byId.get(b.kategorieId);
    belegt.add(k?.elternId ?? b.kategorieId);
  }
  for (const id of ignoriert) belegt.add(id);

  return berechnen(buchungen, kategorien, bisMonat, vertraglich, belegt);
}
