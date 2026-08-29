/**
 * Kontogruppen anlegen, ändern, löschen — und die Sicht darauf.
 *
 * Die Gruppe selbst ist im Kern beschrieben (`core/konten/gruppe.ts`), samt der Abgrenzung
 * zur `Kontoklasse`: die Klasse entscheidet mit (nur `liquide` zählt zu den liquiden
 * Mitteln), die Gruppe bündelt nur. Hier steht, was beim Speichern geprüft wird.
 */

import {
  FachlicherFehler,
  kontenDerGruppe,
  type Cent,
  type Kontogruppe,
  type Zahlungskonto,
} from "../../core";
import type { KontogruppeRepository, ZahlungskontoRepository } from "../ports";

export interface KontogruppeEingabe {
  readonly bezeichnung: string;
  readonly kontoIds: readonly string[];
}

/**
 * Anlegen oder Ändern — derselbe Weg, unterschieden allein durch die mitgegebene Id.
 *
 * Zwei Prüfungen, und beide haben einen Grund:
 *
 * - **Die Bezeichnung trägt die Gruppe.** Eine Gruppe ohne Namen ist in einer Liste von
 *   Gruppen nicht wiederzufinden — sie hat kein anderes Merkmal.
 * - **Doppelte Mitglieder fallen weg.** Sonst zählte ein Konto zweimal in jede Summe, die
 *   über die Mitglieder läuft, und die Gruppe zeigte einen Stand, den es nicht gibt.
 *
 * Ausdrücklich NICHT geprüft: ob der Name schon vergeben ist. Zwei Gruppen dürfen gleich
 * heißen — es ist die Ordnung des Nutzers, nicht unsere, und ein Zwang zur Eindeutigkeit
 * wäre eine Regel ohne Schaden, den sie verhindert.
 */
export async function kontogruppeSpeichern(
  repo: KontogruppeRepository,
  eingabe: KontogruppeEingabe,
  id?: string,
): Promise<Kontogruppe> {
  const bezeichnung = eingabe.bezeichnung.trim();
  if (!bezeichnung) throw new FachlicherFehler("bezeichnung.fehlt");

  const gruppe: Kontogruppe = {
    id: id ?? crypto.randomUUID(),
    bezeichnung,
    kontoIds: [...new Set(eingabe.kontoIds)],
  };
  await repo.speichern(gruppe);
  return gruppe;
}

export function kontogruppeLoeschen(
  repo: KontogruppeRepository,
  id: string,
): Promise<void> {
  return repo.loeschen(id);
}

/** Eine Gruppe mit ihren aufgelösten Konten und deren Anfangsbeständen. */
export interface Gruppensicht {
  readonly gruppe: Kontogruppe;
  readonly konten: readonly Zahlungskonto[];
  /**
   * Die Summe der ANFANGSBESTÄNDE der Mitglieder — nicht der reale Stand.
   *
   * Der reale Stand braucht die Buchungen, und die lädt diese Sicht bewusst nicht: sie
   * ist die Verwaltungssicht („welche Konten sind drin"), nicht die Auswertung. Wer den
   * Stand will, rechnet ihn dort, wo er auch die Buchungen hat — sonst hätten wir zwei
   * Stellen, die denselben Stand verschieden ausrechnen.
   */
  readonly anfangsbestand: Cent;
}

export interface GruppenDeps {
  readonly gruppeRepo: KontogruppeRepository;
  readonly kontoRepo: ZahlungskontoRepository;
}

export async function gruppensichten(deps: GruppenDeps): Promise<Gruppensicht[]> {
  const [gruppen, konten] = await Promise.all([
    deps.gruppeRepo.alle(),
    deps.kontoRepo.alle(),
  ]);
  return gruppen.map((gruppe) => {
    const mitglieder = kontenDerGruppe(gruppe, konten);
    return {
      gruppe,
      konten: mitglieder,
      anfangsbestand: mitglieder.reduce((s, k) => s + k.saldo, 0),
    };
  });
}
