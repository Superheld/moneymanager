// Konto-Register — die kontozentrische Sicht (wie ein Kontoauszug): gebuchte
// Ist-Buchungen mit laufendem Saldo plus die voraussichtlichen (geplanten) Buchungen
// der kommenden X Tage. Reine Funktion: nimmt Ist-Journal + Plan-Regeln, rechnet den
// laufenden Saldo aus dem Anfangsbestand. Kein IO.

import type { Cent } from "./geld";
import { addTage, ord, parseIso, toIso } from "./datum";
import type { Charakter, Zahlungsregel } from "./zahlungsregel";
import type { Zahlungskonto } from "./konto";
import { projiziereRegel } from "./projektion";
import { bezahlteSchluessel, type IstBuchung, type PlanRef } from "./istbuchung";

/** Eine Zeile im Konto-Register — entweder gebuchtes Ist oder geplante Vorschau. */
export interface RegisterZeile {
  readonly art: "ist" | "geplant";
  readonly datum: string; // ISO
  readonly bezeichnung: string;
  readonly betrag: Cent; // vorzeichenbehaftet
  readonly charakter: Charakter;
  readonly kategorieId?: string;
  /** Laufender Saldo NACH dieser Zeile. */
  readonly saldo: Cent;
  // nur bei art === "ist":
  readonly istId?: string;
  readonly quelle?: IstBuchung["quelle"];
  // bei art === "geplant" (zum Abhaken) bzw. bei aus Plan bestätigtem Ist:
  readonly planRef?: PlanRef;
}

export interface KontoRegister {
  readonly gebucht: RegisterZeile[]; // chronologisch; laufender Saldo ab Anfangsbestand
  readonly geplant: RegisterZeile[]; // kommende Fälligkeiten dieses Kontos, ab realem Stand
  /** Realer Stand jetzt = Anfangsbestand + Σ gebuchte Ist (= Start der Vorschau). */
  readonly standHeute: Cent;
}

/**
 * Baut das Register für EIN Konto:
 *  • gebucht  = alle Ist-Buchungen dieses Kontos, chronologisch, laufender Saldo ab `saldo`.
 *  • geplant  = Fälligkeiten der Zahlungsregeln dieses Kontos im Fenster (heute, heute+tage],
 *               bereits bezahlte ausgeschlossen, laufender Saldo ab `standHeute`.
 */
export function kontoRegister(
  konto: Zahlungskonto,
  ist: IstBuchung[],
  regeln: Zahlungsregel[],
  heute: string,
  tage: number,
): KontoRegister {
  const regelBez = new Map(regeln.map((r) => [r.id, r.bezeichnung]));

  // --- Gebuchtes Ist dieses Kontos, chronologisch ---
  const eigeneIst = ist
    .filter((b) => b.kontoId === konto.id)
    .sort((a, b) => a.datum.localeCompare(b.datum));

  let saldo = konto.saldo;
  const gebucht: RegisterZeile[] = eigeneIst.map((b) => {
    saldo += b.betrag;
    return {
      art: "ist",
      datum: b.datum,
      bezeichnung: b.notiz ?? (b.planRef ? regelBez.get(b.planRef.quelleId) ?? "Zahlung" : "Buchung"),
      betrag: b.betrag,
      charakter: b.charakter,
      kategorieId: b.kategorieId,
      saldo,
      istId: b.id,
      quelle: b.quelle,
      planRef: b.planRef,
    };
  });
  const standHeute = saldo;

  // --- Geplante Vorschau dieses Kontos im Tagesfenster ---
  const bezahlt = bezahlteSchluessel(ist);
  const cutoff = ord(addTage(parseIso(heute), tage));
  const monate = Math.ceil(tage / 28) + 1; // großzügig projizieren, dann auf Tage filtern

  const vorschau = regeln
    .filter((r) => r.kontoId === konto.id)
    .flatMap((r) =>
      projiziereRegel(r, heute, monate, bezahlt)
        .filter((p) => ord(parseIso(p.datum)) <= cutoff)
        .map((p) => ({ p, regelId: r.id })),
    )
    .sort((a, b) => a.p.datum.localeCompare(b.p.datum));

  let psaldo = standHeute;
  const geplant: RegisterZeile[] = vorschau.map(({ p, regelId }) => {
    psaldo += p.betrag;
    return {
      art: "geplant",
      datum: p.datum,
      bezeichnung: p.bezeichnung,
      betrag: p.betrag,
      charakter: p.charakter,
      saldo: psaldo,
      planRef: { quelleId: regelId, faelligkeit: p.datum },
    };
  });

  return { gebucht, geplant, standHeute };
}

/** Datum X Tage ab heute (ISO) — Helfer für die Fenster-Beschriftung in der UI. */
export function fensterEnde(heute: string, tage: number): string {
  return toIso(addTage(parseIso(heute), tage));
}
