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
// **Seit 2026-11-22 auch ausserhalb der Kategorie** (Nachtrag zu ADR-0006): eine Ausgabe
// darf jeder laufenden Rücklage zugeordnet werden, die abgeschlossen wird
// (`fremdeRuecklagen`). Der Fernseher unter „Elektronik" gehört dann der Rücklage
// „Fernseher", nicht mehr dem, was an „Elektronik" hängt — das sagt `zustaendigkeit`,
// in der die Zuordnung schon immer vor allem anderen kam.
//
// Der Anteil wird über seine KATEGORIE benannt, auch bei einer ungeteilten Buchung: die
// Aufteilungen bekommen bei jedem Speichern neue IDs, die Kategorie bleibt. Ändert
// jemand sie, passt die Zuordnung zu keinem Anteil mehr, und die Buchung wird neu
// eingeordnet — eine neue Kategorie ist eine neue Frage.

import {
  FachlicherFehler,
  fremdeRuecklagen,
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
 * (`waehlbareRuecklagen`) — oder, seit 2026-11-22, zu denen gehört, die auch ausserhalb
 * ihrer Kategorie etwas tragen dürfen (`fremdeRuecklagen`). Dann muss die Buchung eine
 * Ausgabe ohne Gegenbein sein: eine Umbuchung ordnet die Einordnung vorher als Umbuchung
 * ein, der Stand der Rücklage zählte sie trotzdem — zwei Antworten auf dieselbe Buchung.
 * Eine Rücklage ohne Kategorie nimmt keine Zuordnung an: sie findet nur über ihre
 * Ausbuchung, wie vor der Umstellung.
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
      // Eine Rücklage, die weiterläuft (oder beendet ist), nimmt nichts von ausserhalb
      // ihrer Kategorie an; die Meldung von vorher stimmt für sie weiter.
      if (ruecklage.beendetAm || ruecklage.art === "fortlaufend") throw new FachlicherFehler("ruecklage.nichtAnKategorie");
      if (buchung.transferId || buchung.charakter !== "Aufwand") throw new FachlicherFehler("ruecklage.nurAusgaben");
      if (!fremdeRuecklagen(kategorien, ruecklagen, e.kategorieId, buchung.datum).some((r) => r.id === ruecklage.id)) {
        throw new FachlicherFehler("ruecklage.zuordnungVorBeginn");
      }
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
  /** Die Rücklagen an der Kategorie (oder darüber), die zur Wahl stehen, nächste Ebene zuerst. */
  readonly ruecklagen: readonly { readonly id: string; readonly bezeichnung: string }[];
  /**
   * Die Rücklagen, die auch ausserhalb ihrer Kategorie etwas tragen dürfen
   * (`fremdeRuecklagen`), nach Name — im Dialog eine eigene Gruppe. Steht die gewählte in
   * keiner der beiden Listen mehr (inzwischen beendet), steht sie hier mit, damit die
   * Wahl ihren Namen zeigt.
   */
  readonly weitere: readonly { readonly id: string; readonly bezeichnung: string }[];
  /**
   * Gibt es an der Kategorie selbst etwas zu entscheiden — mehrere Rücklagen, oder es ist
   * schon entschieden? Dann steht die Wahl offen da, wie vor 2026-11-22. Sonst hinter
   * einer Zeile, die aufklappt: eine Rücklage von ausserhalb ist die Ausnahme.
   */
  readonly noetig: boolean;
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
 * Je Buchung die Anteile, für die es etwas zu wählen gibt: eine Rücklage an der Kategorie
 * oder eine, die auch ausserhalb ihrer Kategorie etwas tragen darf. `noetig` sagt, ob an
 * der Kategorie selbst etwas zu entscheiden ist (mehrere Rücklagen, oder schon
 * entschieden). Hängt dort nur eine und gibt es keine andere, entfällt die Wahl — sie
 * findet von selbst.
 *
 * `ruecklagen` darf beendete enthalten: sie stehen nie zur Wahl, geben aber einer
 * Zuordnung, die auf sie zeigt, ihren Namen. Eine Buchung mit Vertrag
 * (`vertragsBuchungen`) bekommt keine Wahl — sie zählt als Fixkosten, und eine Zuordnung
 * änderte daran nichts; die Wahl versprach eine Wirkung, die es nicht gibt.
 */
export function ruecklagenwahlJeBuchung(
  buchungen: readonly IstBuchung[],
  kategorien: readonly Kategorie[],
  ruecklagen: readonly Ruecklage[],
  zuordnungen: readonly Ruecklagenzuordnung[],
  wartend: ReadonlySet<string>,
  vertragsBuchungen: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, readonly Ruecklagenwahl[]> {
  const entschieden = new Map(zuordnungen.map((z) => [`${z.istbuchungId}\u0000${z.kategorieId ?? ""}`, z]));
  const namen = new Map(ruecklagen.map((r) => [r.id, r.bezeichnung]));
  const kurz = (r: Ruecklage) => ({ id: r.id, bezeichnung: r.bezeichnung });
  const raus = new Map<string, Ruecklagenwahl[]>();
  for (const b of buchungen) {
    if (b.transferId || b.charakter !== "Aufwand" || vertragsBuchungen.has(b.id)) continue;
    const liste: Ruecklagenwahl[] = [];
    for (const a of kategorieAnteile(b)) {
      if (!a.kategorieId || liste.some((w) => w.kategorieId === a.kategorieId)) continue;
      const wahl = waehlbareRuecklagen(kategorien, ruecklagen, a.kategorieId);
      const weitere = fremdeRuecklagen(kategorien, ruecklagen, a.kategorieId, b.datum).map(kurz);
      const z = entschieden.get(`${b.id}\u0000${a.kategorieId}`) ?? entschieden.get(`${b.id}\u0000`);
      const noetig = wahl.length >= 2 || !!z;
      if (!noetig && weitere.length === 0) continue;
      const gewaehlt = z ? (z.ruecklageId ?? null) : undefined;
      const fehlt = gewaehlt != null && !wahl.some((r) => r.id === gewaehlt) && !weitere.some((r) => r.id === gewaehlt);
      const name = gewaehlt != null ? namen.get(gewaehlt) : undefined;
      liste.push({
        kategorieId: a.kategorieId,
        ruecklagen: wahl.map(kurz),
        weitere: fehlt && gewaehlt != null && name != null ? [...weitere, { id: gewaehlt, bezeichnung: name }] : weitere,
        noetig,
        gewaehlt,
        wartet: wartend.has(`${b.id}\u0000${a.kategorieId}`),
      });
    }
    if (liste.length > 0) raus.set(b.id, liste);
  }
  return raus;
}
