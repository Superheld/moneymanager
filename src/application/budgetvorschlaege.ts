// Budgetvorschläge — lädt zusammen, was die reine Funktion `core/budgetVorschlag`
// braucht, und hält den Merkzettel der weggeklickten Vorschläge.
//
// Der interessante Teil ist, WELCHE Buchungen als vertraglich gebunden gelten. Genommen
// werden die Kandidaten der Vertragserkennung — und zwar ALLE, auch die, zu denen längst
// ein Vertrag erfasst ist. Der Vertrag selbst zeigt nämlich auf keine Buchung; er kennt
// nur Anbieter und Betrag. Die Verbindung zwischen „diese 38 Abbuchungen sind die
// Targobank-Rate" und dem Vertrag stellt allein die Erkennung her.

import { budgetvorschlaege as berechnen, vertragskandidaten } from "../core";
import type { Budgetvorschlag, Zahlungsspur } from "../core";
import type {
  BudgetRepository,
  EinstellungenRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
} from "./ports";

const SCHLUESSEL_IGNORIERT = "budgetvorschlag.ignoriert";

export async function ignorierteBudgetvorschlaege(
  repo: EinstellungenRepository,
): Promise<Set<string>> {
  const roh = (await repo.lesen())[SCHLUESSEL_IGNORIERT];
  if (!roh) return new Set();
  try {
    const gelesen: unknown = JSON.parse(roh);
    return new Set(Array.isArray(gelesen) ? gelesen.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export async function budgetvorschlagIgnorieren(
  repo: EinstellungenRepository,
  kategorieId: string,
): Promise<void> {
  const menge = await ignorierteBudgetvorschlaege(repo);
  menge.add(kategorieId);
  await repo.schreiben(SCHLUESSEL_IGNORIERT, JSON.stringify([...menge]));
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
): Promise<Budgetvorschlag[]> {
  const [buchungen, umsaetze, kategorien, budgets] = await Promise.all([
    ledger.alle(),
    umsatzRepo.alle(),
    kategorieRepo.alle(),
    budgetRepo.alle(),
  ]);

  const umsatzZuBuchung = new Map<string, (typeof umsaetze)[number]>();
  for (const u of umsaetze) {
    if (u.istbuchungId && !umsatzZuBuchung.has(u.istbuchungId)) umsatzZuBuchung.set(u.istbuchungId, u);
  }
  const spuren: Zahlungsspur[] = buchungen.map((b) => {
    const u = umsatzZuBuchung.get(b.id);
    return {
      id: b.id,
      datum: b.datum,
      betrag: b.betrag,
      gegenpartei: u?.gegenpartei ?? "",
      glaeubigerId: u?.glaeubigerId,
      kategorieId: b.kategorieId,
      charakter: b.charakter,
    };
  });
  const vertraglich = new Set(vertragskandidaten(spuren, heute).flatMap((k) => k.buchungIds));

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
