// Use-Case „Verbuchen": macht aus bestätigten Entwurfs-Umsätzen Ist-Buchungen im Ledger
// (wirkt auf Salden/Liquidität). Pro Umsatz eine einseitige Ist-Buchung auf seinem Konto —
// auch Umbuchungen (Charakter Umschichtung, ohne Kategorie): −500 Giro / +500 Tagesgeld
// stimmen pro Konto und zählen nicht in Budgets/Analysen. Der Roh-Hash wandert mit, damit
// ein späterer Bankimport gegen die verbuchte Zeile deduppen kann.
//
// Verbucht werden nur Umsätze im Status „neu" MIT Vorschlag (Kategorie oder Umbuchung);
// unkategorisierte werden übersprungen und bleiben in der Inbox.

import { tageBis, type IstBuchung } from "../../core";
import type { LedgerPort, UmsatzRepository } from "../ports";
import { verbuchen, type Umsatz } from "./umsatz";

/** Toleranz für die Datums-Differenz beim Paaren — die zwei Beine eines Übertrags zwischen
 *  zwei Banken werden oft an leicht verschiedenen Tagen gebucht. */
const MAX_PAAR_TAGE = 3;

export interface VerbuchenDeps {
  readonly ledgerRepo: LedgerPort;
  readonly umsatzRepo: UmsatzRepository;
  readonly id: () => string;
}

export interface VerbuchenErgebnis {
  readonly verbucht: number;
  readonly uebersprungen: number;
  /** Anzahl gepaarter Umbuchungen (verknüpfte Doppelbuchungen). */
  readonly umbuchungen: number;
}

/** Verbuchbar = im Status „neu" mit Vorschlag. */
function verbuchbar(u: Umsatz): boolean {
  return u.status === "neu" && !!u.vorschlag;
}

/**
 * Paart die zwei Beine importierter Umbuchungen (Finanzguru liefert keinen
 * Verknüpfungsschlüssel): exakt entgegengesetzter Betrag, zwei VERSCHIEDENE eigene Konten,
 * Buchungstag höchstens MAX_PAAR_TAGE auseinander (Beine werden oft versetzt gebucht), beide
 * als Umbuchung vorgeschlagen. Deterministisch (stabil sortiert, greedy, nächstes Datum
 * bevorzugt). Liefert die Paare (Abgang zuerst) und alle übrigen Umsätze einzeln.
 */
export function paareUmbuchungen(
  umsaetze: readonly Umsatz[],
): { paare: [Umsatz, Umsatz][]; einzeln: Umsatz[] } {
  const istUmbuchung = (u: Umsatz) => verbuchbar(u) && u.vorschlag!.quelle === "umbuchung";
  const kandidaten = [...umsaetze].filter(istUmbuchung).sort(
    (a, b) =>
      a.buchungstag.localeCompare(b.buchungstag) ||
      a.betrag - b.betrag ||
      a.zahlungskontoId.localeCompare(b.zahlungskontoId) ||
      a.id.localeCompare(b.id),
  );

  const verwendet = new Set<string>();
  const paare: [Umsatz, Umsatz][] = [];
  for (const a of kandidaten) {
    if (verwendet.has(a.id)) continue;
    // bestes Gegenbein: Gegenbetrag, anderes Konto, Tagesabstand ≤ MAX, kleinster Abstand zuerst.
    let best: Umsatz | undefined;
    let bestAbstand = Infinity;
    for (const b of kandidaten) {
      if (b.id === a.id || verwendet.has(b.id)) continue;
      if (b.betrag !== -a.betrag || b.zahlungskontoId === a.zahlungskontoId) continue;
      const abstand = Math.abs(tageBis(a.buchungstag, b.buchungstag));
      if (abstand <= MAX_PAAR_TAGE && abstand < bestAbstand) {
        best = b;
        bestAbstand = abstand;
      }
    }
    if (best) {
      verwendet.add(a.id);
      verwendet.add(best.id);
      paare.push(a.betrag < 0 ? [a, best] : [best, a]); // Abgang (−) zuerst
    }
  }

  const einzeln = umsaetze.filter((u) => !verwendet.has(u.id));
  return { paare, einzeln };
}

export async function umsaetzeVerbuchen(
  umsaetze: readonly Umsatz[],
  deps: VerbuchenDeps,
): Promise<VerbuchenErgebnis> {
  let verbucht = 0;
  let uebersprungen = 0;
  let umbuchungen = 0;

  const { paare, einzeln } = paareUmbuchungen(umsaetze);

  // 1. Gepaarte Umbuchungen → verknüpfte Doppelbuchung (transferId + Gegenkonto).
  for (const [ab, zu] of paare) {
    const transferId = deps.id();
    const istAb: IstBuchung = {
      id: deps.id(), datum: ab.buchungstag, betrag: ab.betrag, kontoId: ab.zahlungskontoId,
      charakter: "Umschichtung", quelle: "import", transferId, gegenkontoId: zu.zahlungskontoId, rohHash: ab.rohHash,
    };
    const istZu: IstBuchung = {
      id: deps.id(), datum: zu.buchungstag, betrag: zu.betrag, kontoId: zu.zahlungskontoId,
      charakter: "Umschichtung", quelle: "import", transferId, gegenkontoId: ab.zahlungskontoId, rohHash: zu.rohHash,
    };
    await deps.ledgerRepo.speichern(istAb);
    await deps.ledgerRepo.speichern(istZu);
    await deps.umsatzRepo.speichern(verbuchen(ab, istAb.id));
    await deps.umsatzRepo.speichern(verbuchen(zu, istZu.id));
    verbucht += 2;
    umbuchungen++;
  }

  // 2. Rest einzeln (inkl. ungepaarter Umbuchungen → einseitige Umschichtung als Fallback).
  for (const u of einzeln) {
    if (!verbuchbar(u)) {
      uebersprungen++;
      continue;
    }
    const ist: IstBuchung = {
      id: deps.id(),
      datum: u.buchungstag,
      betrag: u.betrag,
      kontoId: u.zahlungskontoId,
      kategorieId: u.vorschlag!.kategorieId,
      charakter: u.vorschlag!.charakter,
      quelle: "import",
      rohHash: u.rohHash,
    };
    await deps.ledgerRepo.speichern(ist);
    await deps.umsatzRepo.speichern(verbuchen(u, ist.id));
    verbucht++;
  }

  return { verbucht, uebersprungen, umbuchungen };
}
