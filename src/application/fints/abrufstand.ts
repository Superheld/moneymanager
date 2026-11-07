// Wie frisch ist, was die Bank uns zuletzt gesagt hat — je Zugang.
//
// Die Übersicht rechnet mit dem Kontostand, und der ist nur so aktuell wie der letzte
// Abruf. Wer nach Wochen hereinkommt, sieht dort Zahlen, die plausibel aussehen und es
// nicht sind: die Karte „Da ist etwas zu tun" meldet dann nichts, weil sie die Zahlungen
// der letzten Wochen nicht kennt — und ihr Schweigen liest sich als Freigabe.
//
// Zwei Entscheidungen, die man kennen muss:
//
//  • **Das ÄLTESTE Konto eines Zugangs bestimmt seinen Stand**, nicht das jüngste. Ein
//    Abruf holt alle Konten eines Zugangs zusammen; bleibt eines zurück (Fehler bei
//    genau diesem Konto), ist der Zugang eben nicht aktuell.
//  • **Stillgelegte Konten zählen nicht.** Sie werden ohnehin nicht abgerufen; ein
//    Zugang, an dem nur noch ein stillgelegtes Konto hängt, würde sonst für immer als
//    veraltet gemeldet — eine Warnung, die man nicht abstellen kann.

import { istAktiv, tageBis } from "../../core";
import type { ZahlungskontoRepository } from "../ports";
import type { BankzugangRepository, KontozuordnungRepository } from "./bankzugangPort";

/**
 * Ab wie vielen Tagen ohne Abruf der Zugang als veraltet gilt.
 *
 * Kurz genug, dass er nach einer Pause sicher auftaucht; lang genug, dass er bei
 * gewöhnlicher Nutzung nicht dauernd dasteht — eine Warnung, die immer leuchtet, liest
 * niemand mehr.
 */
export const ABRUF_VERALTET_TAGE = 7;

export interface Zugangsstand {
  readonly zugangId: string;
  readonly bezeichnung: string;
  /** Bis wohin das am weitesten zurückliegende aktive Konto abgerufen ist; fehlt, wenn nie. */
  readonly letzterAbrufBis?: string;
  readonly veraltet: boolean;
}

export interface Abrufstand {
  /** Ob es überhaupt einen Zugang gibt — davon hängt ab, ob ein Abrufen-Knopf Sinn hat. */
  readonly hatZugang: boolean;
  /** Je Zugang mit mindestens einem aktiven Konto. */
  readonly zugaenge: readonly Zugangsstand[];
}

export interface AbrufstandDeps {
  readonly zugangRepo: BankzugangRepository;
  readonly zuordnungRepo: KontozuordnungRepository;
  readonly kontoRepo: ZahlungskontoRepository;
}

export async function abrufstandLaden(heute: string, deps: AbrufstandDeps): Promise<Abrufstand> {
  const [zugaenge, zuordnungen, konten] = await Promise.all([
    deps.zugangRepo.alle(),
    deps.zuordnungRepo.alle(),
    deps.kontoRepo.alle(),
  ]);
  const aktiv = new Set(konten.filter(istAktiv).map((k) => k.id));

  const staende: Zugangsstand[] = [];
  for (const zugang of zugaenge) {
    const eigene = zuordnungen.filter((z) => z.zugangId === zugang.id && aktiv.has(z.zahlungskontoId));
    // Ohne aktives Konto gibt es nichts, was veralten könnte — etwa ein Zugang, der nur
    // ein Depot führt. Abrufen lässt er sich trotzdem, deshalb zählt er bei `hatZugang`.
    if (eigene.length === 0) continue;

    // Ein Konto ohne Datum wurde noch nie abgerufen; es ist älter als jedes andere.
    const nieAbgerufen = eigene.some((z) => !z.letzterAbrufBis);
    const aeltester = nieAbgerufen
      ? undefined
      : eigene.map((z) => z.letzterAbrufBis as string).sort()[0];

    staende.push({
      zugangId: zugang.id,
      bezeichnung: zugang.bezeichnung,
      letzterAbrufBis: aeltester,
      veraltet: aeltester === undefined || tageBis(aeltester, heute) >= ABRUF_VERALTET_TAGE,
    });
  }
  return { hatZugang: zugaenge.length > 0, zugaenge: staende };
}
