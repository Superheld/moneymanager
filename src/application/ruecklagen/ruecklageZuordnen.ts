// Einen Anteil einer Buchung einer Rücklage zuordnen — nur dort nötig, wo die Kategorie
// allein nicht entscheidet: hängen mehrere Rücklagen an ihr, wartet die Buchung, bis
// jemand sagt, welche es war (ADR-0006, Entscheidung 5). Die Kategorie bleibt der
// Normalweg; die Zuordnung klärt nur die Mehrdeutigkeit.
//
// Drei Handgriffe, ein Use-Case:
//
//   • setzen oder ändern — `ruecklageId` nennt die Rücklage;
//   • ausdrücklich keine — `ruecklageId: null`: der Anteil gehört keiner Rücklage, und es
//     gilt, was ohne Rücklagen gälte (das Budget darüber oder „ungeplant");
//   • lösen — `loesen: true`: die Entscheidung fällt weg, und die Kategorie entscheidet
//     wieder.
//
// Der Anteil wird über seine KATEGORIE benannt, auch bei einer ungeteilten Buchung: die
// Aufteilungen bekommen bei jedem Speichern neue IDs, die Kategorie bleibt. Ändert
// jemand sie, passt die Zuordnung zu keinem Anteil mehr, und die Buchung wird neu
// eingeordnet — eine neue Kategorie ist eine neue Frage.

import {
  FachlicherFehler,
  kategorieAnteile,
  waehlbareRuecklagen,
  type IstBuchung,
  type Kategorie,
  type Ruecklage,
  type Ruecklagenzuordnung,
} from "../../core";
import type { KategorieRepository, LedgerPort, RuecklagenRepository, RuecklagenzuordnungRepository } from "../ports";

export interface RuecklagenzuordnenDeps {
  readonly ledger: LedgerPort;
  readonly kategorieRepo: KategorieRepository;
  readonly ruecklagenRepo: RuecklagenRepository;
  readonly ruecklagenzuordnungRepo: RuecklagenzuordnungRepository;
}

export type RuecklagenzuordnenEingabe =
  | { readonly istbuchungId: string; readonly kategorieId: string; readonly ruecklageId: string | null; readonly loesen?: false }
  | { readonly istbuchungId: string; readonly kategorieId: string; readonly loesen: true };

/**
 * Prüft an der Anwendungsgrenze und schreibt.
 *
 * Geprüft wird, dass die Buchung einen Anteil mit dieser Kategorie hat und dass die
 * Rücklage an genau dieser Kategorie oder einem ihrer Vorfahren hängt
 * (`waehlbareRuecklagen`). Eine Rücklage ohne Kategorie nimmt keine Zuordnung an: sie
 * findet nur über ihre Ausbuchung, wie vor der Umstellung.
 */
export async function ruecklageZuordnen(deps: RuecklagenzuordnenDeps, e: RuecklagenzuordnenEingabe): Promise<void> {
  const [buchungen, kategorien, ruecklagen] = await Promise.all([
    deps.ledger.alle(),
    deps.kategorieRepo.alle(),
    deps.ruecklagenRepo.alle(),
  ]);
  const buchung = buchungen.find((b) => b.id === e.istbuchungId);
  if (!buchung) throw new FachlicherFehler("buchung.fehlt");
  if (!kategorieAnteile(buchung).some((a) => a.kategorieId === e.kategorieId)) {
    throw new FachlicherFehler("ruecklage.anteilFehlt");
  }

  if (e.loesen) {
    await deps.ruecklagenzuordnungRepo.entfernen(e.istbuchungId, e.kategorieId);
    return;
  }
  if (e.ruecklageId != null) {
    const ruecklage = ruecklagen.find((r) => r.id === e.ruecklageId);
    if (!ruecklage) throw new FachlicherFehler("ruecklage.unbekannt");
    if (!ruecklage.kategorieId) throw new FachlicherFehler("ruecklage.ohneKategorie");
    if (!waehlbareRuecklagen(kategorien, ruecklagen, e.kategorieId).some((r) => r.id === ruecklage.id)) {
      throw new FachlicherFehler("ruecklage.nichtAnKategorie");
    }
  }
  const zuordnung: Ruecklagenzuordnung = {
    istbuchungId: e.istbuchungId,
    kategorieId: e.kategorieId,
    ruecklageId: e.ruecklageId ?? undefined,
  };
  await deps.ruecklagenzuordnungRepo.setzen(zuordnung);
}

/** Die Wahl EINES Anteils im Buchungsdialog. */
export interface Ruecklagenwahl {
  /** Die Kategorie des Anteils — mit ihr wird zugeordnet. */
  readonly kategorieId: string;
  /** Die Rücklagen, die zur Wahl stehen, nächste Ebene zuerst. */
  readonly ruecklagen: readonly { readonly id: string; readonly bezeichnung: string }[];
  /**
   * Was entschieden ist: eine Rücklage, `null` für „ausdrücklich keine", fehlt, solange
   * nichts entschieden ist. Vorbelegt wird nichts — eine Vorbelegung sähe aus wie eine
   * Entscheidung, die niemand getroffen hat.
   */
  readonly gewaehlt?: string | null;
  /** Wartet der Anteil gerade auf diese Wahl? */
  readonly wartet: boolean;
}

/**
 * Je Buchung die Anteile, für die es etwas zu wählen gibt: mehr als eine Rücklage kommt
 * in Frage, oder es ist schon etwas entschieden (dann lässt es sich ändern oder lösen).
 * Hängt nur eine Rücklage an der Kategorie, entfällt der Klick — sie findet von selbst.
 */
export function ruecklagenwahlJeBuchung(
  buchungen: readonly IstBuchung[],
  kategorien: readonly Kategorie[],
  ruecklagen: readonly Ruecklage[],
  zuordnungen: readonly Ruecklagenzuordnung[],
  wartend: ReadonlySet<string>,
): ReadonlyMap<string, readonly Ruecklagenwahl[]> {
  const entschieden = new Map(zuordnungen.map((z) => [`${z.istbuchungId}\u0000${z.kategorieId ?? ""}`, z]));
  const raus = new Map<string, Ruecklagenwahl[]>();
  for (const b of buchungen) {
    if (b.transferId || b.charakter !== "Aufwand") continue;
    const liste: Ruecklagenwahl[] = [];
    for (const a of kategorieAnteile(b)) {
      if (!a.kategorieId || liste.some((w) => w.kategorieId === a.kategorieId)) continue;
      const wahl = waehlbareRuecklagen(kategorien, ruecklagen, a.kategorieId);
      const z = entschieden.get(`${b.id}\u0000${a.kategorieId}`) ?? entschieden.get(`${b.id}\u0000`);
      if (wahl.length < 2 && !z) continue;
      liste.push({
        kategorieId: a.kategorieId,
        ruecklagen: wahl.map((r) => ({ id: r.id, bezeichnung: r.bezeichnung })),
        gewaehlt: z ? (z.ruecklageId ?? null) : undefined,
        wartet: wartend.has(`${b.id}\u0000${a.kategorieId}`),
      });
    }
    if (liste.length > 0) raus.set(b.id, liste);
  }
  return raus;
}
