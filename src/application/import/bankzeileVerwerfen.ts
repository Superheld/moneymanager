// Use-Case „Bankzeile verwerfen" — der Löschweg für das, was die Bank geliefert hat.
//
// Eine Zeile aus einer DATEI wird gelöscht: die Datei ist ein Stapel, den jemand
// ausgewählt hat, und was daraus falsch im Konto landete, gehört zurück in die Inbox
// (`zuruecksetzen`) oder ganz weg. Eine Zeile aus einem ABRUF hat diese Umkehrung nicht:
// die Bank kennt sie, und der nächste Abruf holt sie zurück, sobald nichts mehr
// festhält, dass sie nicht ins Konto soll.
//
// Deshalb ist Verwerfen kein Löschen mit anderem Wort, sondern zwei Schritte:
//
//  1. Die Ist-Buchung fällt aus dem Ledger — der Saldo stimmt wieder.
//  2. Der Umsatz bleibt stehen und geht auf `verworfen` — die Entscheidung bleibt
//     gespeichert. `bestandsSchluessel` liest die Umsätze OHNE Statusfilter, also blockt
//     der Roh-Hash der verworfenen Zeile den Reimport von allein. Ein eigenes Register
//     „schon einmal abgelehnt" braucht es dafür nicht.
//
// Was das kostet, gehört an die Oberfläche und nicht in eine stille Regel: nach dem
// Verwerfen weicht der Kontostand um genau diesen Betrag von dem ab, was die Bank meldet.
// Richtig ist das nur, wenn die Zeile wirklich nicht gehört — eine Geisterbuchung aus
// einem Parserfehler etwa. Wer eine echte Buchung verwirft, verliert sie aus dem Saldo.
//
// Die Löschsperre, die dieser Weg ablöst, kam aus dem Umbau auf Direktbuchen: sie
// verwies auf ein „Verwerfen im Abruf", also auf die Warteliste, die es seit dem Umbau
// nicht mehr gibt. Die Sperre war richtig, ihr Ausweg war verschwunden.

import { FachlicherFehler } from "../../core";
import type { LedgerPort, UmsatzRepository } from "../ports";
import { verwerfen, zuruecksetzen, type Umsatz } from "./umsatz";

export interface BankzeileVerwerfenDeps {
  readonly ledger: LedgerPort;
  readonly umsatzRepo: UmsatzRepository;
}

/**
 * Verwirft die Bankzeile hinter einer Ist-Buchung.
 *
 * Eine GEPAARTE Zeile wird vorher aus ihrer Umbuchung gelöst statt beide Beine
 * mitzunehmen: das Gegenstück kann aus einer Datei stammen oder von einem anderen Konto
 * kommen und ist von dieser Entscheidung nicht betroffen. Es bleibt als eigenständige
 * Buchung stehen — sichtbar, prüfbar, notfalls einzeln zu behandeln. Beide zu löschen
 * hiesse, aus einem Urteil über eine Zeile ein Urteil über zwei zu machen.
 */
export async function bankzeileVerwerfen(
  deps: BankzeileVerwerfenDeps,
  istbuchungId: string,
): Promise<void> {
  const { ledger, umsatzRepo } = deps;

  const buchungen = await ledger.alle();
  const buchung = buchungen.find((b) => b.id === istbuchungId);
  if (!buchung) throw new FachlicherFehler("import.bankzeile.fehlt", { id: istbuchungId });

  const umsaetze = await umsatzRepo.alle();
  const umsatz = umsaetze.find((u) => u.istbuchungId === istbuchungId);
  // Ohne Umsatz gibt es nichts, was den Reimport blocken könnte — dann wäre „verwerfen"
  // ein Löschen, das beim nächsten Abruf zurückkommt. Lieber ein lauter Fehler.
  if (!umsatz) throw new FachlicherFehler("import.bankzeile.ohneUmsatz", { id: istbuchungId });

  if (buchung.transferId) {
    const beine = buchungen.filter((b) => b.transferId === buchung.transferId);
    for (const b of beine) {
      await ledger.speichern({ ...b, transferId: undefined, gegenkontoId: undefined });
    }
  }

  await ledger.loeschen(istbuchungId);
  await umsatzRepo.speichern(alsVerworfen(umsatz));
}

/**
 * verbucht → neu → verworfen.
 *
 * Der Umweg über `neu` ist kein Schönheitsfehler, sondern die Zustandsmaschine aus
 * `umsatz.ts`: `verwerfen` gilt nur für offene Zeilen, und `zuruecksetzen` ist die
 * einzige Kante, die eine verbuchte wieder öffnet. Sie räumt dabei die Referenz auf die
 * gelöschte Ist-Buchung mit ab — genau das, was hier gebraucht wird.
 */
function alsVerworfen(u: Umsatz): Umsatz {
  return verwerfen(u.status === "verbucht" ? zuruecksetzen(u) : u);
}
