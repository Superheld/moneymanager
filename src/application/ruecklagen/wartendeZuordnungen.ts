// Was auf eine Zuordnung wartet — die Karte „Wartet auf Zuordnung" im Bereich Rücklagen.
//
// Hängen mehrere Rücklagen an derselben Kategorie, wartet eine Buchung dort, bis jemand
// sagt, welche sie trägt (ADR-0006, Entscheidung 5). Solange zählt sie als ungeplant, und
// sie soll bei den offenen Zuordnungen stehen — bis Paket 5 stand sie nur als Pille im
// Kontoauszug, und wer wissen wollte, was offen ist, musste ihn durchsehen.
//
// **Hier wird nicht entschieden, was wartet.** Das sagt die Einordnung (`wartetAuf`), aus
// derselben Funktion wie die Pille im Kontoauszug (`einordnungJeBuchung`) — eine zweite
// Regel stünde irgendwann neben der ersten und zählte anders. Was zur Wahl steht, kommt
// aus derselben Funktion wie im Buchungsdialog (`ruecklagenwahlJeBuchung`). Diese Datei
// sammelt nur die wartenden Anteile ein und hängt an, was die Zeile zeigt.

import { kategorieAnteile, type Cent } from "../../core";
import { belegZuBuchung } from "../buchung/belegZuBuchung";
import { buchungsname } from "../buchung/buchungszeile";
import { einordnungJeBuchung, type EinordnungssichtEingabe } from "../einordnungssicht";
import type { Umsatz } from "../import/umsatz";
import { ruecklagenwahlJeBuchung } from "./ruecklageZuordnen";

/** Ein Anteil, der auf eine Zuordnung wartet — eine Zeile der Karte. */
export interface WartendeZuordnung {
  readonly buchungId: string;
  /** Die Kategorie des Anteils — mit ihr wird zugeordnet (`ruecklageZuordnen`). */
  readonly kategorieId: string;
  readonly kategorieName?: string;
  readonly datum: string;
  /** Empfänger, sonst Notiz oder Verwendungszweck — woran man die Zahlung wiedererkennt. */
  readonly name: string;
  /** Der Betrag des Anteils, mit Vorzeichen wie die Buchung. */
  readonly betrag: Cent;
  /** Die Rücklagen, zwischen denen zu wählen ist, nächste Ebene zuerst. */
  readonly ruecklagen: readonly { readonly id: string; readonly bezeichnung: string }[];
}

/**
 * Jeder wartende Anteil, jüngster zuerst. Leer, wenn nichts wartet — die Karte steht dann
 * nicht da.
 */
export function wartendeZuordnungen(e: EinordnungssichtEingabe, umsaetze: readonly Umsatz[]): WartendeZuordnung[] {
  const einordnungen = einordnungJeBuchung(e);
  const wartend = new Set<string>();
  for (const [id, liste] of einordnungen) for (const x of liste) if (x.wartetAuf) wartend.add(`${id}\u0000${x.kategorieId ?? ""}`);
  if (wartend.size === 0) return [];

  const wahl = ruecklagenwahlJeBuchung(e.buchungen, e.kategorien, e.ruecklagen, e.ruecklagenzuordnungen, wartend);
  const kategorieNamen = new Map(e.kategorien.map((k) => [k.id, k.name]));
  const beleg = belegZuBuchung(umsaetze);
  const raus: WartendeZuordnung[] = [];
  for (const b of e.buchungen) {
    for (const w of wahl.get(b.id) ?? []) {
      if (!w.wartet) continue;
      raus.push({
        buchungId: b.id,
        kategorieId: w.kategorieId,
        kategorieName: kategorieNamen.get(w.kategorieId),
        datum: b.datum,
        name: buchungsname(b.notiz, beleg.get(b.id)),
        // Bei einer geteilten Buchung zählt nur der Anteil dieser Kategorie.
        betrag: kategorieAnteile(b).filter((a) => a.kategorieId === w.kategorieId).reduce((s, a) => s + a.betrag, 0),
        ruecklagen: w.ruecklagen,
      });
    }
  }
  return raus.sort((a, b) => b.datum.localeCompare(a.datum) || a.buchungId.localeCompare(b.buchungId));
}
