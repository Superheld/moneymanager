// Kategorie-Vorschlag (rein) für einen RohUmsatz. Zwei Quellen, in dieser Reihenfolge:
//  1. Umbuchung (Quelle markiert) → Umschichtung, OHNE konkrete Kategorie (Bruce-Regel:
//     nicht die FG-Kategorie übernehmen). Die konkrete „Umbuchung"-Kategorie ist eine
//     Slice-4-Entscheidung; bis dahin trägt der Vorschlag nur den Charakter.
//  2. Remapping des FG-Hinweises → unsere Kategorie (Name → Katalog → id + Charakter).
// Trifft nichts, bleibt der Umsatz unkategorisiert (Review-Inbox).

import type { Kategorie } from "../../core";
import type { RohUmsatz } from "./rohUmsatz";
import { unsereKategorieFuer } from "./remapping";
import type { Kategorisierungsvorschlag } from "./umsatz";

export function vorschlagFuer(
  roh: Pick<RohUmsatz, "istUmbuchung" | "kategorieHinweis">,
  katalogNachName: ReadonlyMap<string, Kategorie>,
): Kategorisierungsvorschlag | undefined {
  if (roh.istUmbuchung) return { charakter: "Umschichtung", quelle: "umbuchung" };

  const name = unsereKategorieFuer(roh.kategorieHinweis);
  if (!name) return undefined;
  const kat = katalogNachName.get(name.toLowerCase());
  if (!kat) return undefined;
  return { kategorieId: kat.id, charakter: kat.defaultCharakter, quelle: "remapping" };
}

/** Hilfsindex: Kategorien nach kleingeschriebenem Namen. */
export function katalogNachName(kategorien: readonly Kategorie[]): Map<string, Kategorie> {
  return new Map(kategorien.map((k) => [k.name.toLowerCase(), k]));
}
