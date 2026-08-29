// Konto-Register — die kontozentrische Sicht (wie ein Kontoauszug): gebuchte
// Ist-Buchungen mit laufendem Saldo plus die voraussichtlichen (geplanten) Buchungen
// der kommenden X Tage. Reine Funktion: nimmt Ist-Journal + Plan-Regeln, rechnet den
// laufenden Saldo aus dem Anfangsbestand. Kein IO.

import type { Cent } from "../basis/geld";
import { addTage, ord, parseIso, toIso } from "../basis/datum";
import type { Charakter, Zahlungsregel } from "../basis/zahlungsregel";
import type { Zahlungskonto } from "./konto";
import { projiziereRegel } from "../buchung/projektion";
import type { IstBuchung, PlanRef } from "../buchung/istbuchung";

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
  /**
   * Nur bei `art: "ist"`: die Buchung ist gebucht, ihr Buchungstag liegt aber NACH
   * `heute`. Das gibt es wirklich — manche Banken vergeben den Buchungstag von morgen
   * fuer eine heute veranlasste Ueberweisung und fuehren sie schon im Saldo. Solche
   * Zeilen stehen deshalb bei `gebucht` und nicht bei `geplant`: sie sind keine
   * Vorhersage, sie sind passiert.
   *
   * Ohne dieses Merkmal sehen sie im Auszug aus wie jede andere gebuchte Zeile und
   * stehen oberhalb des „heute"-Trenners, obwohl ihr Datum dahinter liegt.
   */
  readonly zukuenftig?: boolean;
  // nur bei art === "ist":
  readonly istId?: string;
  readonly quelle?: IstBuchung["quelle"];
  /** Bei Umbuchung: die beiden Beine verknüpfende ID bzw. das Gegenkonto. */
  readonly transferId?: string;
  readonly gegenkontoId?: string;
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

  // --- Gebuchtes Ist dieses Kontos, chronologisch ---
  const eigeneIst = ist
    .filter((b) => b.kontoId === konto.id)
    .sort((a, b) => a.datum.localeCompare(b.datum));

  let saldo = konto.saldo;
  const gebucht: RegisterZeile[] = eigeneIst.map((b) => {
    // Rückfalllinie gegen Float-Kontamination aus Altbeständen: der eigentliche
    // Schutz sitzt an der Anwendungsgrenze (istCent). Bei sauberen Minor Units
    // ist das Runden wirkungslos, bei kaputten hält es die Summe wenigstens
    // in Cent statt in Binär-Gleitkomma abzudriften.
    saldo = Math.round(saldo + b.betrag);
    const standardBez = b.gegenkontoId ? "Umbuchung" : "Buchung";
    return {
      art: "ist",
      datum: b.datum,
      zukuenftig: b.datum > heute,
      bezeichnung: b.notiz ?? standardBez,
      betrag: b.betrag,
      charakter: b.charakter,
      kategorieId: b.kategorieId,
      saldo,
      istId: b.id,
      quelle: b.quelle,
      transferId: b.transferId,
      gegenkontoId: b.gegenkontoId,
    };
  });
  const standHeute = saldo;

  // --- Geplante Vorschau dieses Kontos im Tagesfenster ---
  const cutoff = ord(addTage(parseIso(heute), tage));
  const monate = Math.ceil(tage / 28) + 1; // großzügig projizieren, dann auf Tage filtern

  const vorschau = regeln
    .filter((r) => r.kontoId === konto.id)
    .flatMap((r) =>
      projiziereRegel(r, heute, monate)
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

/** Eine Fälligkeit in der kontoübergreifenden Vorschau — mit dem Konto, auf dem sie liegt. */
export interface Vorschauzeile {
  readonly datum: string;
  readonly bezeichnung: string;
  readonly betrag: Cent;
  readonly charakter: Charakter;
  readonly kontoId: string;
  readonly planRef: PlanRef;
}

/**
 * Was in den nächsten `tage` Tagen fällig wird — über ALLE Konten, chronologisch.
 *
 * Warum das nicht mehr im Kontoauszug steht: der Auszug beantwortet „was ist passiert",
 * und dort stand die Vorschau als zweite Liste daneben, je Konto einzeln. Die Frage, die
 * man aber wirklich stellt, ist „was kommt noch auf mich zu" — und die ist nicht die
 * Frage eines Kontos. Wer sie im Auszug beantwortet bekommt, muss vier Konten
 * nacheinander aufmachen und im Kopf zusammenzählen.
 *
 * Gerechnet wird je Konto über `kontoRegister` und nicht neu: die Regel, welche
 * Fälligkeiten ins Fenster fallen, soll es genau einmal geben. Der
 * laufende Saldo fällt dabei weg, und zwar nicht aus Bequemlichkeit — über mehrere
 * Konten hinweg gibt es keinen, den man fortschreiben könnte. Wer den Verlauf EINES
 * Kontos sehen will, hat ihn weiterhin in `kontoRegister`.
 */
export function vorschauAlleKonten(
  konten: readonly Zahlungskonto[],
  ist: IstBuchung[],
  regeln: Zahlungsregel[],
  heute: string,
  tage: number,
): Vorschauzeile[] {
  const zeilen: Vorschauzeile[] = [];
  for (const konto of konten) {
    for (const z of kontoRegister(konto, ist, regeln, heute, tage).geplant) {
      // `geplant` trägt immer einen planRef — ohne ihn gäbe es die Zeile nicht.
      if (!z.planRef) continue;
      zeilen.push({
        datum: z.datum,
        bezeichnung: z.bezeichnung,
        betrag: z.betrag,
        charakter: z.charakter,
        kontoId: konto.id,
        planRef: z.planRef,
      });
    }
  }
  // Nach Datum, bei Gleichstand nach Konto — damit zwei Läufe dieselbe Reihenfolge
  // liefern und nicht die der Kontenliste, die sich beim Umbenennen ändert.
  return zeilen.sort((a, b) => a.datum.localeCompare(b.datum) || a.kontoId.localeCompare(b.kontoId));
}

/** Datum X Tage ab heute (ISO) — Helfer für die Fenster-Beschriftung in der UI. */
export function fensterEnde(heute: string, tage: number): string {
  return toIso(addTage(parseIso(heute), tage));
}
